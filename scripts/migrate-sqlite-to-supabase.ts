#!/usr/bin/env tsx
/**
 * SalikurVouch ETL Migration Script: SQLite (mibotam.db) + JSON Batches -> Supabase PostgreSQL
 * Supports Multi-Server (v2.0) via --server-slug, --server-name, --exclude-telegram-ids.
 *
 * Usage:
 *   npm run migrate:sqlite -- --inspect --db /path/to/mibotam.db
 *   npm run migrate:sqlite -- --dry-run --server-slug server2 --server-name "SalikurNet 2" --db /path/to/mibotam.db
 *   npm run migrate:sqlite -- --server-slug server2 --server-name "SalikurNet 2" --exclude-telegram-ids 979761904 --skip-admin-seed --db /path/to/mibotam.db --batches-dir /path/to/voucher_batches
 *   npm run migrate:sqlite -- --verify-only --server-slug server2 --exclude-telegram-ids 979761904 --db /path/to/mibotam.db --batches-dir /path/to/voucher_batches
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database as SupabaseDatabase } from "../src/lib/supabase/types";
import { encryptSecret } from "../src/lib/crypto";
import {
  decryptLegacyMikbotamUrl,
  mapBatchJsonFile,
  mapOperatingRowToWalletTx,
  mapPpobRow,
  mapResellerRow,
  mapVoucherPackagesJson,
  parseBigIntId,
  pickField,
  pickString,
  type LegacyRow,
} from "./lib/legacy-transform";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

interface CliOptions {
  dbPath: string;
  batchesDir: string;
  legacyKey: string;
  serverSlug: string;
  serverName: string | null;
  excludeTelegramIds: Set<number>;
  dryRun: boolean;
  inspectOnly: boolean;
  verifyOnly: boolean;
  skipAdminSeed: boolean;
  chunkSize: number;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const backupRoot =
    process.env.LEGACY_BACKUP_DIR || "/Users/agusmac/Nextjs/backup_mikbotam";

  const opts: CliOptions = {
    dbPath: path.join(backupRoot, "config", "mibotam.db"),
    batchesDir: path.join(backupRoot, "config", "voucher_batches"),
    legacyKey: process.env.LEGACY_DECRYPT_KEY || "4ku4ll",
    serverSlug: "server1",
    serverName: null,
    excludeTelegramIds: new Set<number>(),
    dryRun: false,
    inspectOnly: false,
    verifyOnly: false,
    skipAdminSeed: false,
    chunkSize: 500,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--inspect") opts.inspectOnly = true;
    else if (arg === "--verify-only") opts.verifyOnly = true;
    else if (arg === "--skip-admin-seed") opts.skipAdminSeed = true;
    else if (arg === "--db" && args[i + 1]) opts.dbPath = args[++i];
    else if (arg === "--batches-dir" && args[i + 1])
      opts.batchesDir = args[++i];
    else if (arg === "--legacy-key" && args[i + 1]) opts.legacyKey = args[++i];
    else if (arg === "--server-slug" && args[i + 1])
      opts.serverSlug = args[++i].trim().toLowerCase();
    else if (arg === "--server-name" && args[i + 1])
      opts.serverName = args[++i].trim();
    else if (arg === "--exclude-telegram-ids" && args[i + 1]) {
      for (const part of args[++i].split(",")) {
        const n = Number(part.trim());
        if (Number.isSafeInteger(n) && n !== 0) {
          opts.excludeTelegramIds.add(n);
        }
      }
    } else if (arg === "--chunk-size" && args[i + 1])
      opts.chunkSize = Math.max(50, Number(args[++i]) || 500);
  }

  return opts;
}

function readTableIfExists(db: Database.Database, table: string): LegacyRow[] {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
  if (!exists) return [];
  return db.prepare(`SELECT * FROM "${table}"`).all() as LegacyRow[];
}

function inspectSqliteDatabase(db: Database.Database, batchesDir: string) {
  console.log("\n=== SQLite Schema & Inventory Inspection ===");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[];

  for (const { name } of tables) {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM "${name}"`)
      .get() as { cnt: number };
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as {
      name: string;
      type: string;
    }[];
    console.log(
      `- ${name} (${countRow.cnt} rows): ${cols.map((c) => `${c.name}:${c.type || "ANY"}`).join(", ")}`
    );
  }

  if (fs.existsSync(batchesDir)) {
    const files = fs
      .readdirSync(batchesDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    console.log(`\nJSON Voucher Batches (${files.length} files):`, files);
  } else {
    console.log(`\nJSON Voucher Batches dir not found: ${batchesDir}`);
  }
}

function createServiceClient(): SupabaseClient<SupabaseDatabase> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient<SupabaseDatabase>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedInitialAdmin(
  supabase: SupabaseClient<SupabaseDatabase>,
  ownerTelegramId: number | null
) {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  const username = process.env.SEED_ADMIN_USERNAME?.trim() || "admin";

  if (!email || !password) {
    console.log(
      "ℹ️  Skipping admin Auth seed (set SEED_ADMIN_EMAIL & SEED_ADMIN_PASSWORD in .env.local to seed)."
    );
    return;
  }

  console.log(`→ Seeding initial Supabase Auth super_admin (${email})...`);

  const { data: usersList, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;

  let authUser = usersList.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!authUser) {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      throw createErr ?? new Error("Failed to create Supabase Auth admin user");
    }
    authUser = created.user;
    console.log(`  ✓ Created Auth user: ${authUser.id}`);
  } else {
    console.log(`  ✓ Reusing existing Auth user: ${authUser.id}`);
  }

  const { error: profileErr } = await supabase.from("admin_profiles").upsert(
    {
      id: authUser.id,
      username,
      full_name: "Owner SalikurVouch",
      role: "super_admin",
      telegram_id: ownerTelegramId,
    },
    { onConflict: "id" }
  );
  if (profileErr) throw profileErr;
  console.log("  ✓ Upserted admin_profiles (role: super_admin)");
}

async function runReconciliation(
  supabase: SupabaseClient<SupabaseDatabase>,
  serverId: string,
  serverLabel: string,
  expected: {
    resellerCount: number;
    resellerBalanceSum: number;
    walletTxCount: number;
    topupSum: number;
    voucherSuccessSum: number;
    ppobCount: number;
    ppobProfitSum: number;
    batchCount: number;
  }
) {
  console.log(
    `\n=== Verifikasi & Rekonsiliasi SQLite vs Supabase [${serverLabel}] ===`
  );

  const [resellersRes, walletCountRes, ppobRes, batchCountRes] =
    await Promise.all([
      supabase.from("resellers").select("balance").eq("server_id", serverId),
      supabase
        .from("wallet_transactions")
        .select("*", { count: "exact", head: true })
        .eq("server_id", serverId),
      supabase
        .from("ppob_transactions")
        .select("profit")
        .eq("server_id", serverId),
      supabase
        .from("voucher_batches")
        .select("*", { count: "exact", head: true })
        .eq("server_id", serverId),
    ]);

  if (resellersRes.error) throw resellersRes.error;
  if (walletCountRes.error) throw walletCountRes.error;
  if (ppobRes.error) throw ppobRes.error;
  if (batchCountRes.error) throw batchCountRes.error;

  const pgResellerCount = resellersRes.data.length;
  const pgResellerBalanceSum = resellersRes.data.reduce(
    (s, r) => s + Number(r.balance),
    0
  );
  const pgWalletCount = walletCountRes.count ?? 0;
  const pgPpobCount = ppobRes.data.length;
  const pgPpobProfitSum = ppobRes.data.reduce(
    (s, p) => s + Number(p.profit),
    0
  );
  const pgBatchCount = batchCountRes.count ?? 0;

  // Paginated sum for wallet_transactions (30k+ rows)
  let pgTopupSum = 0;
  let pgVoucherSuccessSum = 0;
  const pageSize = 1000;
  for (let from = 0; from < pgWalletCount; from += pageSize) {
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("tx_type, amount, voucher_price, status")
      .eq("server_id", serverId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      if (row.tx_type === "topup") {
        pgTopupSum += Number(row.amount ?? 0);
      } else if (
        row.tx_type === "voucher_purchase" &&
        row.status === "success"
      ) {
        pgVoucherSuccessSum += Number(row.voucher_price ?? 0);
      }
    }
  }

  const checks = [
    {
      metric: "Jumlah Reseller",
      sqlite: expected.resellerCount,
      supabase: pgResellerCount,
    },
    {
      metric: "SUM(resellers.balance)",
      sqlite: Math.round(expected.resellerBalanceSum * 100) / 100,
      supabase: Math.round(pgResellerBalanceSum * 100) / 100,
    },
    {
      metric: "Jumlah wallet_transactions",
      sqlite: expected.walletTxCount,
      supabase: pgWalletCount,
    },
    {
      metric: "SUM(topup)",
      sqlite: Math.round(expected.topupSum * 100) / 100,
      supabase: Math.round(pgTopupSum * 100) / 100,
    },
    {
      metric: "SUM(beli_voucher Success)",
      sqlite: Math.round(expected.voucherSuccessSum * 100) / 100,
      supabase: Math.round(pgVoucherSuccessSum * 100) / 100,
    },
    {
      metric: "Jumlah ppob_transactions",
      sqlite: expected.ppobCount,
      supabase: pgPpobCount,
    },
    {
      metric: "SUM(ppob.profit)",
      sqlite: Math.round(expected.ppobProfitSum * 100) / 100,
      supabase: Math.round(pgPpobProfitSum * 100) / 100,
    },
    {
      metric: "Jumlah voucher_batches",
      sqlite: expected.batchCount,
      supabase: pgBatchCount,
    },
  ];

  console.table(
    checks.map((c) => ({
      Metric: c.metric,
      SQLite: c.sqlite,
      Supabase: c.supabase,
      Diff: Number((c.supabase - c.sqlite).toFixed(2)),
      Status: Math.abs(c.supabase - c.sqlite) < 0.01 ? "OK" : "MISMATCH",
    }))
  );

  const mismatches = checks.filter(
    (c) => Math.abs(c.supabase - c.sqlite) >= 0.01
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Reconciliation failed with ${mismatches.length} mismatch(es)!`
    );
  }

  console.log(
    `✅ Rekonsiliasi [${serverLabel}] 100% cocok (selisih Rp 0)!`
  );
}

async function main() {
  const opts = parseCliArgs();
  const isDefaultServer = opts.serverSlug === "server1";
  const legacyIdSign = isDefaultServer ? 1 : -1;

  if (!fs.existsSync(opts.dbPath)) {
    console.error(`❌ SQLite database not found: ${opts.dbPath}`);
    console.error(
      "   Pass --db /path/to/mibotam.db or set LEGACY_BACKUP_DIR in .env.local"
    );
    process.exit(1);
  }

  const db = new Database(opts.dbPath, { readonly: true });

  try {
    if (opts.inspectOnly) {
      inspectSqliteDatabase(db, opts.batchesDir);
      return;
    }

    console.log(`📂 Source SQLite : ${opts.dbPath}`);
    console.log(`📂 Source Batches: ${opts.batchesDir}`);
    console.log(
      `🏷  Target Server : slug=${opts.serverSlug} (name=${opts.serverName ?? "(auto)"}, default=${isDefaultServer})`
    );
    if (opts.excludeTelegramIds.size > 0) {
      console.log(
        `🚫 Excluded Resellers (telegram_id): ${Array.from(opts.excludeTelegramIds).join(", ")}`
      );
    }
    if (opts.dryRun) console.log("🧪 DRY-RUN MODE: no writes to Supabase.");

    // 1. Extract from SQLite
    const stRows = readTableIfExists(db, "st_mikbotam");
    const resellerRows = readTableIfExists(db, "re_settings");
    const operatingRows = readTableIfExists(db, "re_operating");
    const ppobRows = readTableIfExists(db, "log_trans_pulsa");

    const batchFiles = fs.existsSync(opts.batchesDir)
      ? fs
          .readdirSync(opts.batchesDir)
          .filter((f) => f.endsWith(".json"))
          .sort()
      : [];

    // Transform resellers first (filtering out excluded telegram_ids)
    const allResellers = resellerRows
      .map(mapResellerRow)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const resellers = allResellers.filter(
      (r) => !opts.excludeTelegramIds.has(Number(r.telegram_id))
    );
    const skippedResellers = allResellers.filter((r) =>
      opts.excludeTelegramIds.has(Number(r.telegram_id))
    );

    const expectedResellerBalanceSum = resellers.reduce(
      (sum, r) => sum + Number(r.balance ?? 0),
      0
    );

    // Transform operating rows with temporary map for dry-run stats
    const tempMap = new Map<number, string>();
    const previewWalletTxs = operatingRows
      .map((r) => mapOperatingRowToWalletTx(r, tempMap))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const expectedTopupSum = previewWalletTxs
      .filter((t) => t.tx_type === "topup")
      .reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const expectedVoucherSuccessSum = previewWalletTxs
      .filter((t) => t.tx_type === "voucher_purchase" && t.status === "success")
      .reduce((s, t) => s + Number(t.voucher_price ?? 0), 0);

    const previewPpobTxs = ppobRows
      .map((r) => mapPpobRow(r, tempMap))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const expectedPpobProfitSum = previewPpobTxs.reduce(
      (s, p) => s + Number(p.profit ?? 0),
      0
    );

    const stRow = stRows[0];
    const saldoPackagesPreview = stRow
      ? mapVoucherPackagesJson(
          pickString(stRow, ["Voucher_1", "voucher_1"]),
          "saldo",
          null
        )
      : [];
    const nonsaldoPackagesPreview = stRow
      ? mapVoucherPackagesJson(
          pickString(stRow, ["Voucher_nonsaldo", "voucher_nonsaldo"]),
          "nonsaldo",
          null
        )
      : [];

    console.log("\n=== Extraction Summary ===");
    console.log(`- st_mikbotam rows       : ${stRows.length}`);
    if (stRow) {
      console.log(
        `  router                 : ${pickString(stRow, ["Nama_router", "nama_router"])} @ ${pickString(stRow, ["IP_router", "ip_router"])}:${pickString(stRow, ["Port", "Port_router", "port_router", "port"])} (dns: ${pickString(stRow, ["dnsname", "Dns_name"])})`
      );
      console.log(
        `  bot / owner            : @${pickString(stRow, ["Username_bot", "username_bot"]).replace(/^@/, "")} / @${pickString(stRow, ["Owner", "Username_owner", "username_owner"]).replace(/^@/, "")} (${pickString(stRow, ["Id_owner", "id_owner"])})`
      );
    }
    console.log(
      `- voucher_packages       : ${saldoPackagesPreview.length} saldo + ${nonsaldoPackagesPreview.length} nonsaldo`
    );
    console.log(
      `- resellers              : ${resellers.length} included (${skippedResellers.length} excluded: ${skippedResellers.map((r) => `@${r.username}:${r.telegram_id}`).join(", ") || "none"}) | SUM balance = Rp ${expectedResellerBalanceSum.toLocaleString("id-ID")}`
    );
    for (const r of resellers) {
      console.log(
        `    • @${r.username} (${r.telegram_id}) — saldo Rp ${Number(r.balance ?? 0).toLocaleString("id-ID")}, sold=${r.vouchers_sold}`
      );
    }
    console.log(
      `- wallet_transactions    : ${previewWalletTxs.length} (SUM topup = Rp ${expectedTopupSum.toLocaleString("id-ID")}, SUM voucher Success = Rp ${expectedVoucherSuccessSum.toLocaleString("id-ID")})`
    );
    console.log(
      `- ppob_transactions      : ${previewPpobTxs.length} (SUM profit = Rp ${expectedPpobProfitSum.toLocaleString("id-ID")})`
    );
    console.log(`- voucher_batches JSON   : ${batchFiles.length} files`);

    if (opts.dryRun) {
      console.log("\n✅ Dry-run extraction & transform completed cleanly.");
      return;
    }

    const supabase = createServiceClient();

    if (opts.verifyOnly) {
      const { data: srv } = await supabase
        .from("servers")
        .select("id, name, slug")
        .eq("slug", opts.serverSlug)
        .maybeSingle();
      if (!srv) {
        throw new Error(`Server with slug "${opts.serverSlug}" not found in Supabase.`);
      }
      await runReconciliation(supabase, srv.id, `${srv.name} (${srv.slug})`, {
        resellerCount: resellers.length,
        resellerBalanceSum: expectedResellerBalanceSum,
        walletTxCount: previewWalletTxs.length,
        topupSum: expectedTopupSum,
        voucherSuccessSum: expectedVoucherSuccessSum,
        ppobCount: previewPpobTxs.length,
        ppobProfitSum: expectedPpobProfitSum,
        batchCount: batchFiles.length,
      });
      return;
    }

    // 2. Migrate st_mikbotam -> routers, servers (+ app_settings for default), voucher_packages
    let routerId: string | null = null;
    let serverId: string | null = null;
    let ownerTelegramId: number | null = null;
    let displayServerName = opts.serverName || opts.serverSlug;

    if (stRow) {
      console.log(
        `\n→ Migrating st_mikbotam -> routers, servers (${opts.serverSlug}), voucher_packages...`
      );

      const rawRouterHost = pickString(
        stRow,
        ["IP_router", "ip_router", "host"],
        "127.0.0.1"
      );
      const [hostPart, portFromHost] = rawRouterHost.split(":");
      const routerPort =
        Number(
          pickString(stRow, ["Port", "Port_router", "port_router", "port"]) ||
            portFromHost
        ) || 8728;

      const rawRouterPass = pickString(stRow, [
        "Pass_router",
        "pass_router",
        "password",
      ]);
      const plainRouterPass = rawRouterPass
        ? decryptLegacyMikbotamUrl(rawRouterPass, opts.legacyKey)
        : "";
      const encryptedRouterPass = encryptSecret(plainRouterPass);

      const routerName =
        pickString(stRow, ["Nama_router", "nama_router", "router_name"]) ||
        opts.serverName ||
        "SalikurNet Router";
      displayServerName = opts.serverName || routerName;

      const routerUser =
        pickString(stRow, [
          "Username_router",
          "User_router",
          "user_router",
          "username",
        ]) || "admin";
      const dnsName =
        pickString(stRow, ["dnsname", "Dns_name", "dns_name", "dns"]) ||
        "wifi.salikur.net";

      // Check if server row already exists for this slug
      const { data: existingServer } = await supabase
        .from("servers")
        .select("id, router_id, webhook_secret, ppob_proxy_url")
        .eq("slug", opts.serverSlug)
        .maybeSingle();

      if (existingServer?.router_id) {
        routerId = existingServer.router_id;
        const { error: updErr } = await supabase
          .from("routers")
          .update({
            name: routerName,
            host: hostPart || rawRouterHost,
            port: routerPort,
            username: routerUser,
            password_encrypted: encryptedRouterPass,
            dns_name: dnsName,
          })
          .eq("id", routerId);
        if (updErr) throw updErr;
        console.log(`  ✓ Updated existing router: ${routerName} (${hostPart || rawRouterHost}:${routerPort})`);
      } else if (isDefaultServer) {
        const { data: defRouter } = await supabase
          .from("routers")
          .select("id")
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        if (defRouter) {
          routerId = defRouter.id;
          const { error: updErr } = await supabase
            .from("routers")
            .update({
              name: routerName,
              host: hostPart || rawRouterHost,
              port: routerPort,
              username: routerUser,
              password_encrypted: encryptedRouterPass,
              dns_name: dnsName,
            })
            .eq("id", routerId);
          if (updErr) throw updErr;
        }
      }

      if (!routerId) {
        const { data: insertedRouter, error: insErr } = await supabase
          .from("routers")
          .insert({
            name: routerName,
            host: hostPart || rawRouterHost,
            port: routerPort,
            ros_version: "v6",
            connection_mode: "api_tcp",
            username: routerUser,
            password_encrypted: encryptedRouterPass,
            dns_name: dnsName,
            is_default: isDefaultServer,
            is_active: true,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        routerId = insertedRouter.id;
        console.log(`  ✓ Created router: ${routerName} (${hostPart || rawRouterHost}:${routerPort})`);
      }

      const rawBotToken = pickString(stRow, ["Token_bot", "token_bot"]);
      const encryptedBotToken = rawBotToken ? encryptSecret(rawBotToken) : null;
      const botUsername =
        pickString(stRow, ["Username_bot", "username_bot"]).replace(/^@/, "") ||
        null;
      const ownerUsername =
        pickString(stRow, [
          "Owner",
          "Username_owner",
          "username_owner",
          "owner",
        ]).replace(/^@/, "") || null;
      ownerTelegramId = parseBigIntId(
        pickField(stRow, ["Id_owner", "id_owner", "owner_telegram_id"])
      );

      // Share ppob_proxy_url from default server so bprku.com relay works immediately
      let sharedProxyUrl: string | null =
        existingServer?.ppob_proxy_url ?? null;
      if (!sharedProxyUrl) {
        const { data: defSrv } = await supabase
          .from("servers")
          .select("ppob_proxy_url")
          .eq("is_default", true)
          .maybeSingle();
        sharedProxyUrl = defSrv?.ppob_proxy_url ?? null;
      }

      const webhookSecret =
        existingServer?.webhook_secret ||
        crypto.randomBytes(24).toString("hex");

      const { data: upsertedServer, error: srvErr } = await supabase
        .from("servers")
        .upsert(
          {
            slug: opts.serverSlug,
            name: displayServerName,
            router_id: routerId,
            bot_token_encrypted: encryptedBotToken,
            bot_username: botUsername,
            owner_username: ownerUsername,
            owner_telegram_id: ownerTelegramId,
            webhook_secret: webhookSecret,
            ppob_proxy_url: sharedProxyUrl,
            ppob_enabled: true,
            is_default: isDefaultServer,
            is_active: true,
          },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (srvErr || !upsertedServer) throw srvErr ?? new Error("Failed to upsert server");
      serverId = upsertedServer.id;
      console.log(`  ✓ Upserted server: ${displayServerName} (slug=${opts.serverSlug}, id=${serverId})`);

      // Seed default bot templates for this server
      await supabase.rpc("seed_server_default_templates", {
        p_server_id: serverId,
      });

      // Keep legacy app_settings synced only for default server
      if (isDefaultServer) {
        await supabase.from("app_settings").upsert(
          {
            id: 1,
            bot_token_encrypted: encryptedBotToken,
            bot_username: botUsername,
            owner_username: ownerUsername,
            owner_telegram_id: ownerTelegramId,
            webhook_secret: webhookSecret,
          },
          { onConflict: "id" }
        );
      }

      // Voucher packages (idempotent per server_id)
      const { count: existingPkgCount } = await supabase
        .from("voucher_packages")
        .select("*", { count: "exact", head: true })
        .eq("server_id", serverId);

      if ((existingPkgCount ?? 0) === 0) {
        const allPackages = [
          ...mapVoucherPackagesJson(
            pickString(stRow, ["Voucher_1", "voucher_1"]),
            "saldo",
            routerId
          ),
          ...mapVoucherPackagesJson(
            pickString(stRow, ["Voucher_nonsaldo", "voucher_nonsaldo"]),
            "nonsaldo",
            routerId
          ),
        ].map((p) => ({ ...p, server_id: serverId! }));

        if (allPackages.length > 0) {
          const { error: pkgErr } = await supabase
            .from("voucher_packages")
            .insert(allPackages);
          if (pkgErr) throw pkgErr;
          console.log(`  ✓ Inserted ${allPackages.length} voucher_packages`);
        }
      } else {
        console.log(
          `  ℹ️  voucher_packages already has ${existingPkgCount} rows for ${opts.serverSlug}, skipping duplicate insert.`
        );
      }
    }

    if (!serverId) {
      throw new Error("Could not resolve target server_id.");
    }

    // 3. Migrate resellers (upsert by server_id, telegram_id)
    console.log(`\n→ Migrating ${resellers.length} resellers for ${opts.serverSlug}...`);
    if (resellers.length > 0) {
      const scopedResellers = resellers.map((r) => ({
        ...r,
        server_id: serverId!,
      }));
      const { error: resErr } = await supabase
        .from("resellers")
        .upsert(scopedResellers, { onConflict: "server_id,telegram_id" });
      if (resErr) throw resErr;
    }

    const { data: savedResellers, error: fetchResErr } = await supabase
      .from("resellers")
      .select("id, telegram_id")
      .eq("server_id", serverId);
    if (fetchResErr) throw fetchResErr;

    const resellerIdByTelegramId = new Map<number, string>();
    for (const r of savedResellers ?? []) {
      resellerIdByTelegramId.set(Number(r.telegram_id), r.id);
    }
    console.log(`  ✓ Upserted ${resellerIdByTelegramId.size} resellers`);

    // 4. Migrate re_operating -> wallet_transactions in chunks
    const walletTxs = operatingRows
      .map((r) => mapOperatingRowToWalletTx(r, resellerIdByTelegramId))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((tx) => ({
        ...tx,
        server_id: serverId!,
        legacy_no:
          tx.legacy_no !== null
            ? legacyIdSign * Math.abs(Number(tx.legacy_no))
            : null,
      }));

    console.log(
      `\n→ Migrating ${walletTxs.length} wallet_transactions (chunk size: ${opts.chunkSize}, legacy_no sign=${legacyIdSign})...`
    );
    for (let i = 0; i < walletTxs.length; i += opts.chunkSize) {
      const chunk = walletTxs.slice(i, i + opts.chunkSize);
      const { error: txErr } = await supabase
        .from("wallet_transactions")
        .upsert(chunk, { onConflict: "legacy_no" });
      if (txErr) {
        throw new Error(
          `Failed wallet_transactions batch ${i}-${i + chunk.length}: ${txErr.message}`
        );
      }
      const done = Math.min(i + chunk.length, walletTxs.length);
      if (done % 5000 === 0 || done === walletTxs.length) {
        console.log(`  ... ${done}/${walletTxs.length} rows`);
      }
    }

    // 5. Migrate log_trans_pulsa -> ppob_transactions
    const { data: otherServerTrxIds } = await supabase
      .from("ppob_transactions")
      .select("trx_id")
      .neq("server_id", serverId);
    const usedTrxIds = new Set(
      (otherServerTrxIds ?? []).map((row) => row.trx_id)
    );

    const ppobTxs = ppobRows
      .map((r) => mapPpobRow(r, resellerIdByTelegramId))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((tx) => {
        const safeTrxId = usedTrxIds.has(tx.trx_id)
          ? `${opts.serverSlug.toUpperCase()}-${tx.trx_id}`
          : tx.trx_id;
        return {
          ...tx,
          server_id: serverId!,
          trx_id: safeTrxId,
          legacy_id:
            tx.legacy_id !== null
              ? legacyIdSign * Math.abs(Number(tx.legacy_id))
              : null,
        };
      });

    console.log(`\n→ Migrating ${ppobTxs.length} ppob_transactions...`);
    if (ppobTxs.length > 0) {
      for (let i = 0; i < ppobTxs.length; i += opts.chunkSize) {
        const chunk = ppobTxs.slice(i, i + opts.chunkSize);
        const { error: ppobErr } = await supabase
          .from("ppob_transactions")
          .upsert(chunk, { onConflict: "trx_id" });
        if (ppobErr) throw ppobErr;
      }
      console.log(`  ✓ Upserted ${ppobTxs.length} ppob_transactions`);
    }

    // 6. Migrate config/voucher_batches/*.json -> voucher_batches & vouchers
    console.log(`\n→ Migrating ${batchFiles.length} JSON voucher batches...`);
    let importedVouchers = 0;
    for (const fileName of batchFiles) {
      const fullPath = path.join(opts.batchesDir, fileName);
      const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown;
      const transformed = mapBatchJsonFile(
        fileName,
        raw,
        resellerIdByTelegramId,
        routerId
      );
      if (!transformed) continue;

      const scopedBatchCode = isDefaultServer
        ? transformed.batch.batch_code
        : `${opts.serverSlug.toUpperCase()}-${transformed.batch.batch_code}`;

      const { data: existingBatch } = await supabase
        .from("voucher_batches")
        .select("id")
        .eq("batch_code", scopedBatchCode)
        .maybeSingle();

      if (existingBatch) {
        continue;
      }

      const { data: insertedBatch, error: batchErr } = await supabase
        .from("voucher_batches")
        .insert({
          ...transformed.batch,
          server_id: serverId,
          batch_code: scopedBatchCode,
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      if (transformed.vouchers.length > 0) {
        const voucherRows = transformed.vouchers.map((v) => ({
          ...v,
          server_id: serverId,
          batch_id: insertedBatch.id,
        }));
        const { error: vErr } = await supabase
          .from("vouchers")
          .insert(voucherRows);
        if (vErr) throw vErr;
        importedVouchers += voucherRows.length;
      }
    }
    console.log(
      `  ✓ Processed ${batchFiles.length} batches (${importedVouchers} vouchers inserted)`
    );

    // 7. Seed initial admin user in Supabase Auth (only if requested)
    if (!opts.skipAdminSeed) {
      await seedInitialAdmin(supabase, ownerTelegramId);
    }

    // 8. Reconcile & verify counts + financial sums for this server
    await runReconciliation(
      supabase,
      serverId,
      `${displayServerName} (${opts.serverSlug})`,
      {
        resellerCount: resellers.length,
        resellerBalanceSum: expectedResellerBalanceSum,
        walletTxCount: walletTxs.length,
        topupSum: expectedTopupSum,
        voucherSuccessSum: expectedVoucherSuccessSum,
        ppobCount: ppobTxs.length,
        ppobProfitSum: expectedPpobProfitSum,
        batchCount: batchFiles.length,
      }
    );
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Migration error:", err);
  process.exit(1);
});
