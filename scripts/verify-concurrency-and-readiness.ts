#!/usr/bin/env tsx
/**
 * Milestone 5 Verification Suite:
 * 1. Atomic RPC exact-balance (saldo == harga) & rollback verification
 * 2. True Concurrency test (5 simultaneous rpc_reserve_balance calls)
 * 3. Atomic PPOB daily counter concurrency test
 * 4. Telegram update_id idempotency check
 * 5. Server-side pagination latency benchmark on 31,390+ wallet_transactions
 * 6. Live RouterOS connection check & PortalPulsa API check (non-fatal if IP not whitelisted)
 */

import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { getDefaultMikroTikAdapter } from "../src/lib/mikrotik/adapter";
import { getPortalPulsaBalance } from "../src/lib/portalpulsa/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const TEST_TID = 9999888877;
const TEST_UPDATE_ID = 999988887701;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=== 1. Preparing Temporary Concurrency Test Reseller ===");
  await supabase.from("wallet_transactions").delete().eq("telegram_id", TEST_TID);
  await supabase.from("ppob_daily_counters").delete().eq("telegram_id", TEST_TID);
  await supabase.from("resellers").delete().eq("telegram_id", TEST_TID);
  await supabase
    .from("telegram_processed_updates")
    .delete()
    .eq("update_id", TEST_UPDATE_ID);

  const { error: insErr } = await supabase.from("resellers").insert({
    telegram_id: TEST_TID,
    username: "_m5_concurrency_test",
    balance: 3000,
    status: "active",
  });
  if (insErr) throw insErr;

  try {
    // --- TEST A: Exact balance == price (legacy bug fix) + refund ---
    console.log("\n=== 2. Testing Exact Balance (saldo == harga) & Refund Rollback ===");
    const exactRes = await supabase.rpc("rpc_reserve_balance", {
      p_telegram_id: TEST_TID,
      p_amount: 3000,
      p_tx_type: "voucher_purchase",
      p_meta: { voucher_price: 4000, markup_amount: 1000, notes: "M5 exact test" },
    });
    if (exactRes.error) throw new Error(`Exact balance test failed: ${exactRes.error.message}`);
    const exactRow = Array.isArray(exactRes.data) ? exactRes.data[0] : exactRes.data;
    if (Number(exactRow?.balance_after) !== 0) {
      throw new Error(`Expected balance_after=0, got ${exactRow?.balance_after}`);
    }
    console.log(`  ✓ Exact balance (3000 - 3000 = 0) SUCCEEDED (tx_id=${exactRow?.transaction_id})`);

    const refundRes = await supabase.rpc("rpc_refund_balance", {
      p_tx_id: Number(exactRow?.transaction_id),
      p_reason: "M5 rollback test",
    });
    if (refundRes.error) throw new Error(`Refund failed: ${refundRes.error.message}`);
    const refRow = Array.isArray(refundRes.data) ? refundRes.data[0] : refundRes.data;
    if (Number(refRow?.balance_after) !== 3000) {
      throw new Error(`Expected refunded balance=3000, got ${refRow?.balance_after}`);
    }
    console.log("  ✓ Auto-refund rollback restored balance to Rp 3.000");

    // --- TEST B: True Concurrency (5 parallel debits of 2000 from 3000 balance) ---
    console.log("\n=== 3. Testing True Concurrency (5 parallel debits of Rp 2.000 from Rp 3.000) ===");
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        supabase.rpc("rpc_reserve_balance", {
          p_telegram_id: TEST_TID,
          p_amount: 2000,
          p_tx_type: "voucher_purchase",
          p_meta: { voucher_price: 3000, markup_amount: 1000, notes: `Race #${idx + 1}` },
        })
      )
    );

    const succeeded = attempts.filter((a) => !a.error);
    const failed = attempts.filter((a) => a.error);
    const { data: afterRace } = await supabase
      .from("resellers")
      .select("balance")
      .eq("telegram_id", TEST_TID)
      .single();

    if (succeeded.length !== 1 || failed.length !== 4 || Number(afterRace?.balance) !== 1000) {
      throw new Error(
        `CONCURRENCY FAILURE: succeeded=${succeeded.length}, failed=${failed.length}, finalBalance=${afterRace?.balance}`
      );
    }
    console.log(
      `  ✓ Exactly 1/5 succeeded, 4/5 rejected (INSUFFICIENT_BALANCE), final balance = Rp ${afterRace?.balance} (ZERO double-spend!)`
    );

    // --- TEST C: PPOB Daily Counter Concurrency ---
    console.log("\n=== 4. Testing Concurrent PPOB Daily Counter (3 parallel increments) ===");
    const today = new Date().toISOString().slice(0, 10);
    const counters = await Promise.all(
      Array.from({ length: 3 }, () =>
        supabase.rpc("rpc_next_ppob_counter", {
          p_tx_date: today,
          p_telegram_id: TEST_TID,
          p_product_code: "S10",
          p_target_number: "081200009999",
        })
      )
    );
    const values = counters.map((c) => Number(c.data)).sort((a, b) => a - b);
    if (JSON.stringify(values) !== JSON.stringify([1, 2, 3])) {
      throw new Error(`Counter race failed: got ${JSON.stringify(values)}`);
    }
    console.log(`  ✓ Concurrent counter produced unique sequence: ${JSON.stringify(values)}`);

    // --- TEST D: Telegram Update Idempotency ---
    console.log("\n=== 5. Testing Telegram update_id Idempotency ===");
    const u1 = await supabase
      .from("telegram_processed_updates")
      .insert({ update_id: TEST_UPDATE_ID });
    const u2 = await supabase
      .from("telegram_processed_updates")
      .insert({ update_id: TEST_UPDATE_ID });
    if (u1.error || u2.error?.code !== "23505") {
      throw new Error(`Idempotency check failed: u1=${u1.error?.message}, u2=${u2.error?.code}`);
    }
    console.log("  ✓ Duplicate Telegram update_id blocked by PK constraint (23505)");

    // --- TEST E: Pagination Latency on 31,390+ rows ---
    console.log("\n=== 6. Benchmarking Server-Side Pagination (31,390+ wallet_transactions) ===");
    const t0 = Date.now();
    const { data: page1, count } = await supabase
      .from("wallet_transactions")
      .select("id, seller_name, tx_type, amount, balance_after, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(0, 49);
    const p1Ms = Date.now() - t0;
    console.log(
      `  ✓ Page 1 (50 of ${count} rows) fetched in ${p1Ms} ms (returned ${page1?.length} rows)`
    );
  } finally {
    // Cleanup ALL temporary test rows
    await supabase.from("wallet_transactions").delete().eq("telegram_id", TEST_TID);
    await supabase.from("ppob_daily_counters").delete().eq("telegram_id", TEST_TID);
    await supabase.from("resellers").delete().eq("telegram_id", TEST_TID);
    await supabase
      .from("telegram_processed_updates")
      .delete()
      .eq("update_id", TEST_UPDATE_ID);
    console.log("\n✓ Cleaned up all temporary verification records.");
  }

  // --- TEST F: Live External Connectivity (RouterOS & PortalPulsa) ---
  console.log("\n=== 7. Live Connectivity Diagnostics ===");
  try {
    const adapter = await getDefaultMikroTikAdapter();
    const rTest = await adapter.testConnection();
    console.log("  MikroTik RouterOS:", rTest.ok ? `ONLINE (${rTest.identity} / ROS ${rTest.version}, ${rTest.latencyMs}ms)` : `OFFLINE (${rTest.error})`);
  } catch (err) {
    console.log("  MikroTik RouterOS:", err instanceof Error ? err.message : String(err));
  }

  const ppBal = await getPortalPulsaBalance();
  console.log(
    "  PortalPulsa API  :",
    ppBal.ok
      ? `ONLINE (Saldo Rp ${ppBal.balance.toLocaleString("id-ID")})`
      : `UNAVAILABLE (${ppBal.error})`
  );

  console.log("\n✅ All Milestone 5 database, concurrency & security assertions PASSED!");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
