import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatIDR } from "@/lib/utils";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  buildBatchCode,
  buildHotspotLoginUrl,
  buildVoucherComment,
  formatQuotaLabelMb,
  formatUptimeLabel,
  generateUniqueVouchers,
  generateQrPngBuffer,
  mbToBytes,
} from "@/lib/voucher-generator";
import {
  executePortalPulsaOrder,
  findPortalPulsaProduct,
  getPortalPulsaBalance,
  getPortalPulsaCatalog,
} from "@/lib/portalpulsa/client";
import {
  answerTelegramCallback,
  escapeHtml,
  getBotTokenFromSettings,
  sendLongTelegramMessage,
  sendTelegramChatAction,
  sendTelegramMessage,
  sendTelegramPhotoBuffer,
  sendTelegramPhotoByFileIdOrUrl,
  type BotSettingsRuntime,
  type TelegramInlineButton,
} from "./api";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function isBotAdmin(
  admin: AdminClient,
  bot: BotSettingsRuntime,
  telegramId: number
): Promise<boolean> {
  if (bot.ownerTelegramId && Number(bot.ownerTelegramId) === telegramId) {
    return true;
  }
  const { data } = await admin
    .from("admin_profiles")
    .select("id")
    .eq("telegram_id", telegramId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function getReseller(
  admin: AdminClient,
  serverId: string,
  telegramId: number
) {
  const { data } = await admin
    .from("resellers")
    .select("id, telegram_id, username, phone, balance, vouchers_sold, status")
    .eq("server_id", serverId)
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}

async function getTemplate(
  admin: AdminClient,
  serverId: string,
  key: string,
  vars: Record<string, string>
): Promise<string | null> {
  const { data } = await admin
    .from("bot_message_templates")
    .select("content")
    .eq("server_id", serverId)
    .eq("key", key)
    .maybeSingle();
  if (!data?.content) return null;
  let out = data.content;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

async function sendVoucherMenu(params: {
  admin: AdminClient;
  bot: BotSettingsRuntime;
  chatId: number;
  mode: "saldo" | "nonsaldo";
  resellerBalance?: number;
}) {
  const { data: packages } = await params.admin
    .from("voucher_packages")
    .select("id, name, menu_label, price, markup, limit_uptime")
    .eq("server_id", params.bot.serverId)
    .eq("mode", params.mode)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  const list = packages ?? [];
  if (list.length === 0) {
    await sendTelegramMessage({
      token: params.bot.token,
      chatId: params.chatId,
      text: `Belum ada paket voucher aktif untuk mode <b>${params.mode}</b>.`,
    });
    return;
  }

  const keyboard: TelegramInlineButton[][] = [];
  const cbPrefix = params.mode === "saldo" ? "vcr" : "vcrns";
  for (let i = 0; i < list.length; i += 2) {
    const row: TelegramInlineButton[] = [];
    for (const pkg of list.slice(i, i + 2)) {
      const net = Math.max(Number(pkg.price) - Number(pkg.markup), 0);
      const label =
        params.mode === "saldo"
          ? `🎫 ${pkg.menu_label} (${formatIDR(net)})`
          : `🎫 ${pkg.menu_label}`;
      row.push({ text: label, callback_data: `${cbPrefix}:${pkg.id}` });
    }
    keyboard.push(row);
  }

  if (params.mode === "saldo") {
    keyboard.push([
      { text: "💰 Cek Saldo", callback_data: "cek_saldo" },
      { text: "ℹ️ Informasi", callback_data: "info" },
    ]);
  }

  const header =
    params.mode === "saldo"
      ? `<b>🎫 Menu Voucher Hotspot</b>\nSaldo Anda: <b>${formatIDR(params.resellerBalance ?? 0)}</b>\nSilakan pilih paket voucher:`
      : `<b>🎫 Menu Voucher Non-Saldo (Admin)</b>\nSilakan pilih paket voucher:`;

  await sendTelegramMessage({
    token: params.bot.token,
    chatId: params.chatId,
    text: header,
    inlineKeyboard: keyboard,
  });
}

async function handleVoucherPurchaseCallback(params: {
  admin: AdminClient;
  bot: BotSettingsRuntime;
  chatId: number;
  telegramId: number;
  packageId: string;
  mode: "saldo" | "nonsaldo";
  callbackQueryId: string;
}) {
  const { admin, bot, chatId, telegramId, packageId, mode, callbackQueryId } =
    params;

  const [pkgRes, reseller] = await Promise.all([
    admin
      .from("voucher_packages")
      .select("*")
      .eq("id", packageId)
      .eq("server_id", bot.serverId)
      .eq("mode", mode)
      .eq("is_active", true)
      .maybeSingle(),
    getReseller(admin, bot.serverId, telegramId),
  ]);

  const pkg = pkgRes.data;
  if (!pkg) {
    await answerTelegramCallback({
      token: bot.token,
      callbackQueryId,
      text: "Paket voucher tidak ditemukan atau nonaktif.",
      showAlert: true,
    });
    return;
  }

  if (mode === "saldo") {
    if (!reseller) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId,
        text: "Akun belum terdaftar. Ketik /daftar terlebih dahulu.",
        showAlert: true,
      });
      return;
    }
    if (reseller.status !== "active") {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId,
        text: "Akun reseller sedang dinonaktifkan.",
        showAlert: true,
      });
      return;
    }
  } else {
    const adminOk = await isBotAdmin(admin, bot, telegramId);
    if (!adminOk) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId,
        text: "Hanya admin yang dapat membuat voucher non-saldo.",
        showAlert: true,
      });
      return;
    }
  }

  const price = Number(pkg.price);
  const markup = Number(pkg.markup);
  const netCost = mode === "saldo" ? Math.max(price - markup, 0) : 0;

  // Generate credentials before reserving
  const [cred] = generateUniqueVouchers({
    quantity: 1,
    length: pkg.code_length,
    charType: pkg.char_type,
    loginType: pkg.login_type === "up" ? "up" : "vc",
  });

  // 1. Atomic balance reservation (for saldo mode)
  let reservedTxId: number | null = null;
  let balanceAfter = Number(reseller?.balance ?? 0);

  if (mode === "saldo") {
    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "rpc_reserve_balance_v2",
      {
        p_server_id: bot.serverId,
        p_telegram_id: telegramId,
        p_amount: netCost,
        p_tx_type: "voucher_purchase",
        p_meta: {
          voucher_price: price,
          markup_amount: markup,
          voucher_username: cred.username,
          voucher_password: cred.password,
          voucher_profile: pkg.mikrotik_profile,
          quantity: 1,
          notes: `Bot Telegram (${bot.serverName}): ${pkg.name}`,
        },
      }
    );

    if (rpcErr) {
      const friendly = rpcErr.message.includes("INSUFFICIENT_BALANCE")
        ? `Saldo tidak cukup! Harga potong ${formatIDR(netCost)}, saldo Anda ${formatIDR(Number(reseller?.balance ?? 0))}.`
        : `Gagal memproses saldo: ${rpcErr.message}`;
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId,
        text: friendly,
        showAlert: true,
      });
      return;
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    reservedTxId = Number(row?.transaction_id ?? 0) || null;
    balanceAfter = Number(row?.balance_after ?? balanceAfter);
  }

  await answerTelegramCallback({
    token: bot.token,
    callbackQueryId,
    text: "Membuat voucher di MikroTik...",
  });
  await sendTelegramChatAction({ token: bot.token, chatId, action: "upload_photo" });

  // 2. Create user on MikroTik (dual ROS v6/v7)
  let mikrotikApiId = "";
  let dnsName = "wifi.salikur.net";
  let routerId: string | null = pkg.router_id ?? bot.routerId;
  const batchCode = buildBatchCode();

  try {
    const adapter = await getDefaultMikroTikAdapter(routerId ?? undefined);
    dnsName = adapter.config.dnsName;
    routerId = adapter.config.id ?? routerId;

    mikrotikApiId = await adapter.addHotspotUser({
      server: pkg.mikrotik_server || "all",
      name: cred.username,
      password: cred.password,
      profile: pkg.mikrotik_profile,
      limitUptime: pkg.limit_uptime || undefined,
      limitBytesIn: mbToBytes(pkg.limit_download_mb),
      limitBytesOut: mbToBytes(pkg.limit_upload_mb),
      limitBytesTotal: mbToBytes(pkg.limit_total_mb),
      comment: buildVoucherComment({
        seller: reseller?.username ?? "admin",
        price,
        batchCode,
      }),
    });
  } catch (err) {
    // Auto-rollback balance!
    if (reservedTxId) {
      await admin.rpc("rpc_refund_balance", {
        p_tx_id: reservedTxId,
        p_reason: `Auto-rollback MikroTik error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `❌ <b>Gagal membuat voucher di MikroTik.</b>\n${mode === "saldo" ? "Saldo Anda telah dikembalikan otomatis.\n" : ""}Error: <code>${escapeHtml(err instanceof Error ? err.message : "Router timeout")}</code>`,
    });
    return;
  }

  // 3. Persist batch & voucher
  const { data: batchRow } = await admin
    .from("voucher_batches")
    .insert({
      server_id: bot.serverId,
      batch_code: batchCode,
      reseller_id: reseller?.id ?? null,
      package_id: pkg.id,
      router_id: routerId,
      source: mode === "saldo" ? "bot_saldo" : "bot_nonsaldo",
      package_name: pkg.name,
      unit_price: price,
      quantity: 1,
      deducted_balance: mode === "saldo",
      telegram_sent: false,
    })
    .select("id")
    .single();

  if (batchRow) {
    await admin.from("vouchers").insert({
      server_id: bot.serverId,
      batch_id: batchRow.id,
      reseller_id: reseller?.id ?? null,
      package_id: pkg.id,
      mikrotik_api_id: mikrotikApiId || null,
      username: cred.username,
      password: cred.password,
      login_type: pkg.login_type,
      profile: pkg.mikrotik_profile,
      time_limit: pkg.limit_uptime,
      data_limit_label: formatQuotaLabelMb(pkg.limit_total_mb),
      price,
      markup,
      net_cost: netCost,
      dns_name: dnsName,
      card_color: pkg.card_color,
      status: "success",
    });
  }

  // 4. Send QR Code photo & voucher details to Telegram
  const loginUrl = buildHotspotLoginUrl(dnsName, cred.username, cred.password);
  const qrBuffer = await generateQrPngBuffer(loginUrl, pkg.card_color);
  const footerTpl = await getTemplate(admin, bot.serverId, "voucher_footer", {
    dns_name: dnsName,
    voucher_code: cred.username,
    profile: pkg.mikrotik_profile,
  });

  const captionLines = [
    `✅ <b>Voucher Hotspot Berhasil Dibuat</b>`,
    `<code>========================</code>`,
    `Paket    : <b>${escapeHtml(pkg.name)}</b>`,
    pkg.login_type === "vc"
      ? `Kode     : <code>${escapeHtml(cred.username)}</code>`
      : `Username : <code>${escapeHtml(cred.username)}</code>\nPassword : <code>${escapeHtml(cred.password)}</code>`,
    `Aktif    : ${escapeHtml(formatUptimeLabel(pkg.limit_uptime))}`,
    `Kuota    : ${escapeHtml(formatQuotaLabelMb(pkg.limit_total_mb))}`,
    `Harga    : ${formatIDR(price)}`,
    mode === "saldo"
      ? `Potong   : ${formatIDR(netCost)} (Markup ${formatIDR(markup)})`
      : `Mode     : Non-Saldo (Admin)`,
    mode === "saldo" ? `Sisa Saldo: <b>${formatIDR(balanceAfter)}</b>` : null,
    `<code>========================</code>`,
    footerTpl || `Login: ${escapeHtml(dnsName)}`,
  ].filter(Boolean);

  const sent = await sendTelegramPhotoBuffer({
    token: bot.token,
    chatId,
    buffer: qrBuffer,
    filename: `voucher-${cred.username}.png`,
    caption: captionLines.join("\n"),
    inlineKeyboard: [
      [{ text: "🌐 Go to Login", url: loginUrl }],
      [
        { text: "💰 Cek Saldo", callback_data: "cek_saldo" },
        { text: "🎫 Beli Lagi", callback_data: mode === "saldo" ? "menu:saldo" : "menu:nonsaldo" },
      ],
    ],
  });

  if (!sent.ok) {
    // Rollback MikroTik user & refund balance if Telegram delivery failed
    try {
      const adapter = await getDefaultMikroTikAdapter(routerId ?? undefined);
      if (mikrotikApiId) await adapter.removeHotspotUser(mikrotikApiId);
    } catch {
      // ignore cleanup error
    }
    if (reservedTxId) {
      await admin.rpc("rpc_refund_balance", {
        p_tx_id: reservedTxId,
        p_reason: `Auto-rollback Telegram sendPhoto failed: ${sent.description ?? "unknown"}`,
      });
    }
    if (batchRow) {
      await admin
        .from("voucher_batches")
        .update({ telegram_error: sent.description ?? "sendPhoto failed" })
        .eq("id", batchRow.id);
    }
    return;
  }

  if (batchRow) {
    await admin
      .from("voucher_batches")
      .update({ telegram_sent: true })
      .eq("id", batchRow.id);
  }
}

async function handleDepositRequestFlow(params: {
  admin: AdminClient;
  bot: BotSettingsRuntime;
  chatId: number;
  telegramId: number;
  amount: number;
  proofFileId?: string;
}) {
  const { admin, bot, chatId, telegramId, amount, proofFileId } = params;
  const reseller = await getReseller(admin, bot.serverId, telegramId);
  if (!reseller) {
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: "Anda belum terdaftar. Ketik /daftar terlebih dahulu.",
    });
    return;
  }

  if (!Number.isFinite(amount) || amount < 10000 || amount > bot.maxDepositAmount) {
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `Nominal deposit harus antara <b>Rp 10.000</b> sampai <b>${formatIDR(bot.maxDepositAmount)}</b>.`,
    });
    return;
  }

  const { data: reqRow, error } = await admin
    .from("deposit_requests")
    .insert({
      server_id: bot.serverId,
      reseller_id: reseller.id,
      amount,
      status: "pending",
      proof_file_path: proofFileId ? `tg:${proofFileId}` : null,
    })
    .select("id")
    .single();

  if (error || !reqRow) {
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: "Gagal mencatat permintaan deposit. Coba lagi.",
    });
    return;
  }

  await sendTelegramMessage({
    token: bot.token,
    chatId,
    text: `✅ <b>Permintaan Deposit Terkirim</b>\nNominal: <b>${formatIDR(amount)}</b>\nMenunggu verifikasi admin.`,
  });

  if (bot.ownerTelegramId) {
    const adminText = [
      `🔔 <b>Permintaan Deposit Baru (${escapeHtml(bot.serverName)})</b>`,
      `Reseller : @${escapeHtml(reseller.username)} (<code>${reseller.telegram_id}</code>)`,
      `Nominal  : <b>${formatIDR(amount)}</b>`,
      `Saldo Saat Ini: ${formatIDR(Number(reseller.balance))}`,
      proofFileId ? `Bukti    : Terlampir di foto` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const kb: TelegramInlineButton[][] = [
      [
        {
          text: `✅ Approve ${formatIDR(amount)}`,
          callback_data: `tp:approve:${reqRow.id}`,
        },
        {
          text: "❌ Tolak",
          callback_data: `tp:reject:${reqRow.id}`,
        },
      ],
    ];

    if (proofFileId) {
      await sendTelegramPhotoByFileIdOrUrl({
        token: bot.token,
        chatId: bot.ownerTelegramId,
        photo: proofFileId,
        caption: adminText,
        inlineKeyboard: kb,
      });
    } else {
      await sendTelegramMessage({
        token: bot.token,
        chatId: bot.ownerTelegramId,
        text: adminText,
        inlineKeyboard: kb,
      });
    }
  }
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  scheduleBackground?: (fn: () => Promise<void>) => void,
  serverId?: string
): Promise<{ handled: boolean; reason?: string }> {
  const admin = createAdminClient();
  const bot = await getBotTokenFromSettings(serverId);
  if (!bot) {
    return { handled: false, reason: "bot_not_configured" };
  }

  // Idempotency check via telegram_processed_updates (per server)
  const { error: dedupErr } = await admin
    .from("telegram_processed_updates")
    .insert({ server_id: bot.serverId, update_id: update.update_id });

  if (dedupErr) {
    if (dedupErr.code === "23505") {
      return { handled: false, reason: "duplicate_update" };
    }
  }

  if (update.callback_query) {
    await handleCallbackQuery(admin, bot, update.callback_query, scheduleBackground);
    return { handled: true };
  }

  if (update.message) {
    await handleMessage(admin, bot, update.message);
    return { handled: true };
  }

  return { handled: false, reason: "unsupported_update" };
}

async function handleCallbackQuery(
  admin: AdminClient,
  bot: BotSettingsRuntime,
  cb: TelegramCallbackQuery,
  scheduleBackground?: (fn: () => Promise<void>) => void
) {
  const data = cb.data ?? "";
  const telegramId = cb.from.id;
  const chatId = cb.message?.chat.id ?? telegramId;

  if (data === "cek_saldo") {
    const r = await getReseller(admin, bot.serverId, telegramId);
    await answerTelegramCallback({
      token: bot.token,
      callbackQueryId: cb.id,
      text: r
        ? `Saldo Anda: ${formatIDR(Number(r.balance))} (${r.vouchers_sold} voucher terjual)`
        : "Akun belum terdaftar (/daftar).",
      showAlert: true,
    });
    return;
  }

  if (data === "info") {
    const tpl = await getTemplate(admin, bot.serverId, "info_menu", {
      owner_username: bot.ownerUsername ?? "admin",
      max_deposit: formatIDR(bot.maxDepositAmount),
    });
    await answerTelegramCallback({ token: bot.token, callbackQueryId: cb.id });
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text:
        tpl ||
        `ℹ️ Hubungi admin @${escapeHtml(bot.ownerUsername ?? "admin")} untuk bantuan deposit & transaksi.`,
    });
    return;
  }

  if (data === "menu:saldo" || data === "menu:nonsaldo") {
    await answerTelegramCallback({ token: bot.token, callbackQueryId: cb.id });
    const r = await getReseller(admin, bot.serverId, telegramId);
    await sendVoucherMenu({
      admin,
      bot,
      chatId,
      mode: data === "menu:saldo" ? "saldo" : "nonsaldo",
      resellerBalance: Number(r?.balance ?? 0),
    });
    return;
  }

  if (data.startsWith("vcr:")) {
    await handleVoucherPurchaseCallback({
      admin,
      bot,
      chatId,
      telegramId,
      packageId: data.slice(4),
      mode: "saldo",
      callbackQueryId: cb.id,
    });
    return;
  }

  if (data.startsWith("vcrns:")) {
    await handleVoucherPurchaseCallback({
      admin,
      bot,
      chatId,
      telegramId,
      packageId: data.slice(6),
      mode: "nonsaldo",
      callbackQueryId: cb.id,
    });
    return;
  }

  if (data.startsWith("dep:")) {
    const amount = Number(data.slice(4));
    await answerTelegramCallback({ token: bot.token, callbackQueryId: cb.id });
    await handleDepositRequestFlow({ admin, bot, chatId, telegramId, amount });
    return;
  }

  if (data.startsWith("tp:approve:") || data.startsWith("tp:reject:")) {
    const isAdmin = await isBotAdmin(admin, bot, telegramId);
    if (!isAdmin) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: "Hanya admin yang berwenang.",
        showAlert: true,
      });
      return;
    }

    const decision = data.startsWith("tp:approve:") ? "approved" : "rejected";
    const reqId = data.split(":")[2];
    const { data: reqRow } = await admin
      .from("deposit_requests")
      .select("id, server_id, amount, status, resellers(telegram_id, username)")
      .eq("id", reqId)
      .maybeSingle();

    if (!reqRow || reqRow.status !== "pending") {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: "Request deposit sudah diproses sebelumnya.",
        showAlert: true,
      });
      return;
    }

    const r = Array.isArray(reqRow.resellers)
      ? reqRow.resellers[0]
      : reqRow.resellers;
    const amount = Number(reqRow.amount);

    let balanceAfter = 0;
    if (decision === "approved" && r) {
      const { data: rpcRes, error: rpcErr } = await admin.rpc(
        "rpc_adjust_balance_v2",
        {
          p_server_id: reqRow.server_id,
          p_telegram_id: r.telegram_id,
          p_delta: amount,
          p_tx_type: "topup",
          p_actor: cb.from.username ?? `tg:${telegramId}`,
          p_notes: `Approve deposit Telegram #${reqRow.id.slice(0, 8)}`,
        }
      );
      if (rpcErr) {
        await answerTelegramCallback({
          token: bot.token,
          callbackQueryId: cb.id,
          text: `Error: ${rpcErr.message}`,
          showAlert: true,
        });
        return;
      }
      const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
      balanceAfter = Number(row?.balance_after ?? 0);
    }

    await admin
      .from("deposit_requests")
      .update({
        status: decision,
        approved_amount: decision === "approved" ? amount : null,
        processed_by: cb.from.username ?? `tg:${telegramId}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id);

    await answerTelegramCallback({
      token: bot.token,
      callbackQueryId: cb.id,
      text:
        decision === "approved"
          ? `Deposit ${formatIDR(amount)} disetujui!`
          : "Deposit ditolak.",
    });

    if (r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId: r.telegram_id,
        text:
          decision === "approved"
            ? `✅ <b>Deposit Disetujui!</b>\nNominal: <b>${formatIDR(amount)}</b>\nSaldo Akhir: <b>${formatIDR(balanceAfter)}</b>`
            : `❌ <b>Request Deposit ${formatIDR(amount)} Ditolak.</b>\nHubungi admin jika ada pertanyaan.`,
        inlineKeyboard:
          decision === "approved"
            ? [[{ text: "🎫 Beli Voucher", callback_data: "menu:saldo" }]]
            : undefined,
      });
    }
    return;
  }

  if (data.startsWith("show_op|")) {
    const operator = data.slice(8);
    await answerTelegramCallback({ token: bot.token, callbackQueryId: cb.id });
    const catalog = await getPortalPulsaCatalog("PULSA", {
      serverId: bot.serverId,
    });
    if (!catalog.ok) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Gagal memuat katalog: ${escapeHtml(catalog.error ?? "API error")}`,
      });
      return;
    }

    const items = catalog.products
      .filter(
        (p) =>
          p.operator.toLowerCase() === operator.toLowerCase() &&
          p.status.toLowerCase() === "normal"
      )
      .sort((a, b) => a.sellPrice - b.sellPrice);

    if (items.length === 0) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Tidak ada produk aktif untuk operator <b>${escapeHtml(operator)}</b>.`,
      });
      return;
    }

    const lines = [
      `<b>📱 Harga Pulsa ${escapeHtml(operator)}</b>`,
      `<code>========================</code>`,
      ...items.map(
        (p) =>
          `• <b>${escapeHtml(p.code)}</b> — ${escapeHtml(p.description)}\n  Harga: <b>${formatIDR(p.sellPrice)}</b>`
      ),
      `\nKetik /isipulsa untuk melakukan pengisian.`,
    ];
    await sendLongTelegramMessage({
      token: bot.token,
      chatId,
      text: lines.join("\n"),
    });
    return;
  }

  if (data === "cancel_pulsa") {
    await admin
      .from("bot_user_states")
      .delete()
      .eq("server_id", bot.serverId)
      .eq("telegram_id", telegramId);
    await answerTelegramCallback({
      token: bot.token,
      callbackQueryId: cb.id,
      text: "Transaksi dibatalkan.",
    });
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: "❌ Transaksi isi pulsa dibatalkan.",
    });
    return;
  }

  if (data.startsWith("process_pulsa|")) {
    const [, phone, code, priceStr] = data.split("|");
    const sellPrice = Number(priceStr) || 0;

    if (!bot.ppobEnabled) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: "Layanan PPOB sedang dinonaktifkan.",
        showAlert: true,
      });
      return;
    }

    const product = await findPortalPulsaProduct(code, bot.serverId);
    if (!product) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: `Kode produk ${code} tidak ditemukan.`,
        showAlert: true,
      });
      return;
    }

    const finalSell = sellPrice > 0 ? sellPrice : product.sellPrice;
    const costPrice = product.costPrice;
    const profit = Math.max(finalSell - costPrice, 0);

    // Pre-check Portal Pulsa API balance
    const apiBal = await getPortalPulsaBalance(bot.serverId);
    if (!apiBal.ok || apiBal.balance < costPrice) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: "Saldo server PPOB sedang tidak mencukupi. Hubungi admin.",
        showAlert: true,
      });
      return;
    }

    // Reserve reseller balance atomically
    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "rpc_reserve_balance_v2",
      {
        p_server_id: bot.serverId,
        p_telegram_id: telegramId,
        p_amount: finalSell,
        p_tx_type: "ppob_purchase",
        p_meta: {
          voucher_price: finalSell,
          markup_amount: profit,
          notes: `PPOB ${product.code} ke ${phone}`,
        },
      }
    );

    if (rpcErr) {
      await answerTelegramCallback({
        token: bot.token,
        callbackQueryId: cb.id,
        text: rpcErr.message.includes("INSUFFICIENT_BALANCE")
          ? "Saldo Anda tidak mencukupi."
          : rpcErr.message,
        showAlert: true,
      });
      return;
    }

    const resRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const txId = Number(resRow?.transaction_id ?? 0);
    const resellerId = resRow?.reseller_id ?? null;
    const balanceAfter = Number(resRow?.balance_after ?? 0);

    await admin
      .from("bot_user_states")
      .delete()
      .eq("server_id", bot.serverId)
      .eq("telegram_id", telegramId);
    await answerTelegramCallback({
      token: bot.token,
      callbackQueryId: cb.id,
      text: "Memproses transaksi ke Portal Pulsa...",
    });

    const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: counterNo } = await admin.rpc("rpc_next_ppob_counter_v2", {
      p_server_id: bot.serverId,
      p_tx_date: todayWib,
      p_telegram_id: telegramId,
      p_product_code: product.code,
      p_target_number: phone,
    });

    const trxId = `TRX-${bot.serverSlug.toUpperCase()}-${todayWib.replaceAll("-", "")}-${telegramId}-${crypto.randomBytes(4).toString("hex")}`;
    const order = await executePortalPulsaOrder({
      code: product.code,
      phone,
      trxId,
      counterNo: Number(counterNo ?? 1),
      serverId: bot.serverId,
    });

    if (!order.ok) {
      if (txId) {
        await admin.rpc("rpc_refund_balance", {
          p_tx_id: txId,
          p_reason: `Auto-rollback PPOB gagal: ${order.message}`,
        });
      }
      await admin.from("ppob_transactions").insert({
        server_id: bot.serverId,
        trx_id: trxId,
        reseller_id: resellerId,
        telegram_id: telegramId,
        product_code: product.code,
        target_number: phone,
        cost_price: costPrice,
        sell_price: finalSell,
        profit: 0,
        status: "FAILED",
        description: order.message,
        source: "telegram_bot",
        raw_response: (order.raw ?? null) as never,
      });
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `❌ <b>Transaksi PPOB Gagal</b>\nProduk: ${escapeHtml(product.code)}\nTujuan: <code>${escapeHtml(phone)}</code>\nPesan: ${escapeHtml(order.message)}\nSaldo Anda telah dikembalikan otomatis.`,
      });
      return;
    }

    await admin.from("ppob_transactions").insert({
      server_id: bot.serverId,
      trx_id: trxId,
      reseller_id: resellerId,
      telegram_id: telegramId,
      product_code: product.code,
      target_number: phone,
      cost_price: costPrice,
      sell_price: finalSell,
      profit,
      status: order.status,
      serial_number: order.serialNumber,
      description: `${product.description} (${order.message})`,
      source: "telegram_bot",
      raw_response: (order.raw ?? null) as never,
    });

    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: [
        `✅ <b>Transaksi PPOB Berhasil Diproses</b>`,
        `<code>========================</code>`,
        `TRX ID : <code>${escapeHtml(trxId)}</code>`,
        `Produk : <b>${escapeHtml(product.description)}</b> (${escapeHtml(product.code)})`,
        `Tujuan : <code>${escapeHtml(phone)}</code>`,
        `Harga  : <b>${formatIDR(finalSell)}</b>`,
        order.serialNumber ? `SN     : <code>${escapeHtml(order.serialNumber)}</code>` : null,
        `Sisa Saldo: <b>${formatIDR(balanceAfter)}</b>`,
        `<code>========================</code>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    // Non-blocking owner notification (replaces legacy sleep(20) blocking call)
    const notifyOwner = async () => {
      if (!bot.ownerTelegramId) return;
      const latestBal = await getPortalPulsaBalance(bot.serverId);
      await sendTelegramMessage({
        token: bot.token,
        chatId: bot.ownerTelegramId,
        text: `📲 <b>Laporan PPOB (${escapeHtml(bot.serverName)})</b>\nReseller: <code>${telegramId}</code>\nProduk: ${escapeHtml(product.code)} → <code>${escapeHtml(phone)}</code>\nJual: ${formatIDR(finalSell)} | Laba: ${formatIDR(profit)}\nSaldo API PortalPulsa: ${latestBal.ok ? formatIDR(latestBal.balance) : "N/A"}`,
      });
    };

    if (scheduleBackground) {
      scheduleBackground(notifyOwner);
    } else {
      void notifyOwner();
    }
    return;
  }

  await answerTelegramCallback({ token: bot.token, callbackQueryId: cb.id });
}

async function handleMessage(
  admin: AdminClient,
  bot: BotSettingsRuntime,
  msg: TelegramMessage
) {
  const from = msg.from;
  if (!from) return;
  const telegramId = from.id;
  const chatId = msg.chat.id;
  const tgUsername = from.username || from.first_name || `user_${telegramId}`;

  // Handle deposit confirmation photo: `#konfirmasi deposit <nominal>`
  if (msg.photo && msg.photo.length > 0 && msg.caption) {
    const capMatch = msg.caption
      .trim()
      .match(/^#konfirmasi\s+deposit\s+([\d.,]+)/i);
    if (capMatch) {
      const amount = Number(capMatch[1].replace(/[.,]/g, ""));
      const bestPhoto = msg.photo[msg.photo.length - 1];
      await handleDepositRequestFlow({
        admin,
        bot,
        chatId,
        telegramId,
        amount,
        proofFileId: bestPhoto.file_id,
      });
      return;
    }
  }

  const rawText = (msg.text ?? "").trim();
  if (!rawText) return;

  const [rawCmd, ...args] = rawText.split(/\s+/);
  const cmd = rawCmd.split("@")[0].toLowerCase();

  // --- PUBLIC & RESELLER COMMANDS ---
  if (cmd === "/start") {
    const r = await getReseller(admin, bot.serverId, telegramId);
    const tpl = await getTemplate(
      admin,
      bot.serverId,
      r ? "welcome_registered" : "welcome_unregistered",
      {
        username: `@${r?.username ?? tgUsername}`,
        saldo: formatIDR(Number(r?.balance ?? 0)),
        owner_username: bot.ownerUsername ?? "admin",
      }
    );
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text:
        tpl ||
        (r
          ? `Halo <b>@${escapeHtml(r.username)}</b>!\nSaldo Anda: <b>${formatIDR(Number(r.balance))}</b>\nKetik /menu untuk membeli voucher atau /help untuk daftar perintah.`
          : `Selamat datang di <b>SalikurVouch</b>!\nAnda belum terdaftar. Ketik /daftar untuk mendaftar sebagai reseller.`),
    });
    return;
  }

  if (cmd === "/help") {
    const adminOk = await isBotAdmin(admin, bot, telegramId);
    const lines = [
      `<b>📖 Daftar Perintah Bot SalikurVouch</b>`,
      `• /menu — Beli voucher Hotspot`,
      `• /ceksaldo — Cek saldo aktif`,
      `• /deposit [nominal] — Ajukan deposit saldo`,
      `• /daftar — Daftar sebagai reseller`,
      `• /cekid — Cek Telegram ID Anda`,
      bot.ppobEnabled ? `• /isipulsa — Transaksi Pulsa / PLN / Game` : null,
      bot.ppobEnabled ? `• /pulsa, /pln [cari], /game [cari] — Cek harga PPOB` : null,
    ];
    if (adminOk) {
      lines.push(
        `\n<b>🔐 Perintah Admin</b>`,
        `• /menus — Menu voucher Non-Saldo`,
        `• /topup &lt;id&gt; &lt;nominal&gt; — Top up saldo reseller`,
        `• /topdown &lt;id&gt; &lt;nominal&gt; — Tarik saldo reseller`,
        `• /daftarid &lt;id&gt; &lt;nama&gt; &lt;telp&gt; &lt;saldo&gt;`,
        `• /resource — Info CPU/RAM/Uptime MikroTik`,
        `• /hotspot [aktif|user] — Monitor Hotspot`,
        `• ?user &lt;username&gt; — Cari user Hotspot`,
        `• /netwatch — Status Netwatch MikroTik`,
        `• /report — Ringkasan omset bulan ini`,
        `• /saldoportal — Cek saldo API Portal Pulsa`,
        `• /dbg — Debug payload JSON`
      );
    }
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: lines.filter(Boolean).join("\n"),
    });
    return;
  }

  if (cmd === "/cekid") {
    const r = await getReseller(admin, bot.serverId, telegramId);
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `🆔 <b>Info Akun Telegram</b>\nID: <code>${telegramId}</code>\nUsername: @${escapeHtml(tgUsername)}\nStatus Reseller: <b>${r ? `Terdaftar (${r.status})` : "Belum Terdaftar"}</b>`,
    });
    return;
  }

  if (cmd === "/daftar") {
    const existing = await getReseller(admin, bot.serverId, telegramId);
    if (existing) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Anda sudah terdaftar sebagai <b>@${escapeHtml(existing.username)}</b> dengan saldo <b>${formatIDR(Number(existing.balance))}</b>.`,
      });
      return;
    }
    const { error } = await admin.from("resellers").insert({
      server_id: bot.serverId,
      telegram_id: telegramId,
      username: tgUsername,
      balance: 0,
      status: "active",
    });
    if (error) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Gagal mendaftar: ${escapeHtml(error.message)}`,
      });
      return;
    }
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `✅ Pendaftaran berhasil!\nID: <code>${telegramId}</code>\nUsername: @${escapeHtml(tgUsername)}\nSilakan /deposit untuk mengisi saldo.`,
    });
    return;
  }

  if (cmd === "/ceksaldo" || cmd === "/lihatsaldo") {
    const r = await getReseller(admin, bot.serverId, telegramId);
    if (!r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Anda belum terdaftar. Ketik /daftar untuk mendaftar.",
      });
      return;
    }
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `💰 <b>Informasi Saldo</b>\nReseller: @${escapeHtml(r.username)}\nSaldo Aktif: <b>${formatIDR(Number(r.balance))}</b>\nTotal Voucher Terjual: ${r.vouchers_sold.toLocaleString("id-ID")}`,
    });
    return;
  }

  if (cmd === "/menu") {
    if (bot.botMode === "nonsaldo_only") {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Bot sedang dalam mode Non-Saldo. Gunakan /menus (khusus admin).",
      });
      return;
    }
    const r = await getReseller(admin, bot.serverId, telegramId);
    if (!r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Anda belum terdaftar. Ketik /daftar terlebih dahulu.",
      });
      return;
    }
    await sendVoucherMenu({
      admin,
      bot,
      chatId,
      mode: "saldo",
      resellerBalance: Number(r.balance),
    });
    return;
  }

  if (cmd === "/deposit") {
    const r = await getReseller(admin, bot.serverId, telegramId);
    if (!r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Anda belum terdaftar. Ketik /daftar terlebih dahulu.",
      });
      return;
    }
    if (args[0]) {
      const amount = Number(args[0].replace(/[^\d]/g, ""));
      await handleDepositRequestFlow({ admin, bot, chatId, telegramId, amount });
      return;
    }
    // Preset deposit buttons (fixes legacy 300.000 -> 350000 bug!)
    const presets = [100000, 200000, 300000, 500000, 750000, 1000000].filter(
      (n) => n <= bot.maxDepositAmount
    );
    const kb: TelegramInlineButton[][] = [];
    for (let i = 0; i < presets.length; i += 2) {
      kb.push(
        presets.slice(i, i + 2).map((n) => ({
          text: `💵 ${formatIDR(n)}`,
          callback_data: `dep:${n}`,
        }))
      );
    }
    const tpl = await getTemplate(admin, bot.serverId, "deposit_instructions", {
      max_deposit: formatIDR(bot.maxDepositAmount),
    });
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text:
        tpl ||
        `<b>💳 Request Deposit Saldo</b>\nPilih nominal di bawah atau ketik <code>/deposit 150000</code>.\nUntuk kirim bukti transfer, kirim foto dengan caption <code>#konfirmasi deposit 150000</code>.`,
      inlineKeyboard: kb,
    });
    return;
  }

  // --- PPOB COMMANDS ---
  if (cmd === "/pulsa" || cmd === "/pln" || cmd === "/game") {
    if (!bot.ppobEnabled) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Layanan PPOB sedang dinonaktifkan oleh admin.",
      });
      return;
    }
    const r = await getReseller(admin, bot.serverId, telegramId);
    if (!r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Anda belum terdaftar. Ketik /daftar terlebih dahulu.",
      });
      return;
    }
    await sendTelegramChatAction({ token: bot.token, chatId });

    if (cmd === "/pulsa" && args.length === 0) {
      const cat = await getPortalPulsaCatalog("PULSA", {
        serverId: bot.serverId,
      });
      if (!cat.ok) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `Gagal memuat katalog: ${escapeHtml(cat.error ?? "API error")}`,
        });
        return;
      }
      const operators = Array.from(
        new Set(
          cat.products
            .filter((p) => p.status.toLowerCase() === "normal")
            .map((p) => p.operator)
        )
      ).sort();
      const kb: TelegramInlineButton[][] = [];
      for (let i = 0; i < operators.length; i += 2) {
        kb.push(
          operators.slice(i, i + 2).map((op) => ({
            text: op,
            callback_data: `show_op|${op}`,
          }))
        );
      }
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "📱 <b>Daftar Harga Pulsa</b>\nSilakan pilih operator:",
        inlineKeyboard: kb,
      });
      return;
    }

    const category =
      cmd === "/pln" ? "PLN" : cmd === "/game" ? "GAME" : "PULSA";
    const keyword = args.join(" ");
    const cat = await getPortalPulsaCatalog(category, {
      keyword,
      serverId: bot.serverId,
    });
    if (!cat.ok) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Gagal memuat katalog ${category}: ${escapeHtml(cat.error ?? "API error")}`,
      });
      return;
    }
    const items = cat.products.slice(0, 60);
    if (items.length === 0) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Tidak ditemukan produk ${category} untuk kata kunci "${escapeHtml(keyword)}".`,
      });
      return;
    }
    const text = [
      `<b>Daftar Harga ${category}${keyword ? ` (${escapeHtml(keyword)})` : ""}</b>`,
      `<code>========================</code>`,
      ...items.map(
        (p) =>
          `• <b>${escapeHtml(p.code)}</b> — ${escapeHtml(p.description)}\n  Harga: ${formatIDR(p.sellPrice)} (${escapeHtml(p.status)})`
      ),
    ].join("\n");
    await sendLongTelegramMessage({ token: bot.token, chatId, text });
    return;
  }

  if (cmd === "/isipulsa") {
    if (!bot.ppobEnabled) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Layanan PPOB sedang dinonaktifkan oleh admin.",
      });
      return;
    }
    const r = await getReseller(admin, bot.serverId, telegramId);
    if (!r) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Anda belum terdaftar. Ketik /daftar terlebih dahulu.",
      });
      return;
    }
    await admin.from("bot_user_states").upsert(
      {
        server_id: bot.serverId,
        telegram_id: telegramId,
        step: "waiting_phone",
        payload: {},
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      { onConflict: "server_id,telegram_id" }
    );
    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: "📱 <b>Transaksi Isi Pulsa / PPOB</b>\nSilakan masukkan <b>Nomor HP / ID Pelanggan</b> tujuan (10–14 digit):",
    });
    return;
  }

  // --- ADMIN COMMANDS ---
  const adminCommands = [
    "/menus",
    "/daftarid",
    "/topup",
    "/topdown",
    "/resource",
    "/hotspot",
    "/netwatch",
    "/report",
    "/saldoportal",
    "/dbg",
    "?user",
    "!user",
  ];

  if (adminCommands.includes(cmd)) {
    const adminOk = await isBotAdmin(admin, bot, telegramId);
    if (!adminOk) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "⛔ Perintah ini khusus Admin.",
      });
      return;
    }

    if (cmd === "/menus") {
      await sendVoucherMenu({ admin, bot, chatId, mode: "nonsaldo" });
      return;
    }

    if (cmd === "/dbg") {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `<pre>${escapeHtml(JSON.stringify(msg, null, 2).slice(0, 3800))}</pre>`,
      });
      return;
    }

    if (cmd === "/daftarid") {
      const [idStr, name, phone, saldoStr] = args;
      const targetId = Number(idStr);
      const saldo = Number(saldoStr ?? 0) || 0;
      if (!targetId || !name) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: "Format: <code>/daftarid &lt;telegram_id&gt; &lt;username&gt; &lt;telp&gt; &lt;saldo&gt;</code>",
        });
        return;
      }
      const { error } = await admin.from("resellers").upsert(
        {
          server_id: bot.serverId,
          telegram_id: targetId,
          username: name.replace(/^@/, ""),
          phone: phone || null,
          status: "active",
        },
        { onConflict: "server_id,telegram_id" }
      );
      if (error) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `Gagal: ${escapeHtml(error.message)}`,
        });
        return;
      }
      if (saldo > 0) {
        await admin.rpc("rpc_adjust_balance_v2", {
          p_server_id: bot.serverId,
          p_telegram_id: targetId,
          p_delta: saldo,
          p_tx_type: "topup",
          p_actor: tgUsername,
          p_notes: "Saldo awal /daftarid",
        });
      }
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `✅ Reseller <b>@${escapeHtml(name)}</b> (<code>${targetId}</code>) berhasil didaftarkan dengan saldo ${formatIDR(saldo)}.`,
      });
      return;
    }

    if (cmd === "/topup" || cmd === "/topdown") {
      const targetId = Number(args[0]);
      const nominal = Number((args[1] ?? "").replace(/[^\d]/g, ""));
      if (!targetId || !nominal || nominal <= 0) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `Format: <code>${cmd} &lt;telegram_id&gt; &lt;nominal&gt;</code>`,
        });
        return;
      }
      const isTopup = cmd === "/topup";
      const { data: rpcRes, error } = await admin.rpc("rpc_adjust_balance_v2", {
        p_server_id: bot.serverId,
        p_telegram_id: targetId,
        p_delta: isTopup ? nominal : -nominal,
        p_tx_type: isTopup ? "topup" : "topdown",
        p_actor: tgUsername,
        p_notes: `${cmd} via Telegram Admin`,
      });
      if (error) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `❌ Gagal ${cmd}: ${escapeHtml(error.message)}`,
        });
        return;
      }
      const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
      const balAfter = Number(row?.balance_after ?? 0);
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `✅ <b>${isTopup ? "Top Up" : "Top Down"} Berhasil</b>\nTarget: <code>${targetId}</code>\nNominal: <b>${formatIDR(nominal)}</b>\nSaldo Akhir: <b>${formatIDR(balAfter)}</b>`,
      });
      await sendTelegramMessage({
        token: bot.token,
        chatId: targetId,
        text: `${isTopup ? "💰" : "🔻"} <b>${isTopup ? "Top Up" : "Top Down"} Saldo</b>\nNominal: <b>${formatIDR(nominal)}</b>\nSaldo Akhir: <b>${formatIDR(balAfter)}</b>`,
      });
      return;
    }

    if (cmd === "/resource") {
      try {
        const adapter = await getDefaultMikroTikAdapter(bot.routerId ?? undefined);
        const st = await adapter.getSystemStatus();
        const freeRamMb = Math.round(st.resource.freeMemoryBytes / 1048576);
        const totalRamMb = Math.round(st.resource.totalMemoryBytes / 1048576);
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: [
            `<b>🖥 Resource MikroTik (${escapeHtml(st.resource.identity)})</b>`,
            `<code>========================</code>`,
            `RouterOS : ${escapeHtml(st.resource.version)}`,
            `Board    : ${escapeHtml(st.resource.boardName)}`,
            `Uptime   : ${escapeHtml(st.resource.uptime)}`,
            `CPU Load : ${st.resource.cpuLoadPct}% (${st.resource.cpuCount} core)`,
            `Memory   : ${freeRamMb} MB / ${totalRamMb} MB free`,
            `Suhu     : ${st.health.temperatureC ?? st.health.cpuTemperatureC ?? "-"} °C`,
            `Hotspot Aktif : <b>${st.hotspotActiveCount}</b>`,
            `AP Neighbor   : ${st.neighborCount}`,
            `<code>========================</code>`,
          ].join("\n"),
        });
      } catch (err) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `❌ Gagal membaca resource MikroTik: <code>${escapeHtml(err instanceof Error ? err.message : "unknown")}</code>`,
        });
      }
      return;
    }

    if (cmd === "/hotspot") {
      try {
        const adapter = await getDefaultMikroTikAdapter(bot.routerId ?? undefined);
        const sub = (args[0] ?? "aktif").toLowerCase();
        if (sub === "user") {
          const users = await adapter.listHotspotUsers();
          const lines = [
            `<b>👥 Hotspot Users (${users.length})</b>`,
            ...users.slice(0, 40).map(
              (u) =>
                `• <code>${escapeHtml(u.name)}</code> [${escapeHtml(u.profile)}] ${u.disabled ? "(disabled)" : ""}`
            ),
          ];
          await sendLongTelegramMessage({
            token: bot.token,
            chatId,
            text: lines.join("\n"),
          });
        } else {
          const active = await adapter.listHotspotActive();
          const lines = [
            `<b>🟢 Hotspot Active (${active.length})</b>`,
            ...active.slice(0, 40).map(
              (a) =>
                `• <code>${escapeHtml(a.user)}</code> — ${escapeHtml(a.address)} (${escapeHtml(a.uptime)})`
            ),
          ];
          await sendLongTelegramMessage({
            token: bot.token,
            chatId,
            text: lines.join("\n"),
          });
        }
      } catch (err) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `❌ Error Hotspot: ${escapeHtml(err instanceof Error ? err.message : "unknown")}`,
        });
      }
      return;
    }

    if (cmd === "?user" || cmd === "!user") {
      const targetUser = args[0];
      if (!targetUser) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: "Format: <code>?user &lt;username&gt;</code>",
        });
        return;
      }
      try {
        const adapter = await getDefaultMikroTikAdapter(bot.routerId ?? undefined);
        const users = await adapter.listHotspotUsers();
        const u = users.find((x) => x.name === targetUser);
        if (!u) {
          await sendTelegramMessage({
            token: bot.token,
            chatId,
            text: `User hotspot <code>${escapeHtml(targetUser)}</code> tidak ditemukan.`,
          });
          return;
        }
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `<b>🔎 Detail Hotspot User</b>\nUser: <code>${escapeHtml(u.name)}</code>\nPass: <code>${escapeHtml(u.password)}</code>\nProfile: ${escapeHtml(u.profile)}\nLimit: ${escapeHtml(u.limitUptime || "-")}\nUptime: ${escapeHtml(u.uptime)}\nComment: ${escapeHtml(u.comment || "-")}`,
        });
      } catch (err) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `❌ Error: ${escapeHtml(err instanceof Error ? err.message : "unknown")}`,
        });
      }
      return;
    }

    if (cmd === "/netwatch") {
      try {
        const adapter = await getDefaultMikroTikAdapter(bot.routerId ?? undefined);
        const hosts = await adapter.listNetwatch();
        const lines = [
          `<b>📡 Status Netwatch (${hosts.length})</b>`,
          ...hosts.map(
            (h) =>
              `${h.status === "up" ? "🟢" : "🔴"} <b>${escapeHtml(h.comment || h.host)}</b> (<code>${escapeHtml(h.host)}</code>) — ${escapeHtml(h.status.toUpperCase())} (${escapeHtml(h.since)})`
          ),
        ];
        await sendLongTelegramMessage({
          token: bot.token,
          chatId,
          text: lines.join("\n"),
        });
      } catch (err) {
        await sendTelegramMessage({
          token: bot.token,
          chatId,
          text: `❌ Error Netwatch: ${escapeHtml(err instanceof Error ? err.message : "unknown")}`,
        });
      }
      return;
    }

    if (cmd === "/report") {
      const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const monthStart = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+07:00`;

      const [txRes, ppobRes, newResellersRes] = await Promise.all([
        admin
          .from("wallet_transactions")
          .select("tx_type, amount, voucher_price, status")
          .eq("server_id", bot.serverId)
          .gte("created_at", monthStart),
        admin
          .from("ppob_transactions")
          .select("sell_price, profit, status")
          .eq("server_id", bot.serverId)
          .gte("created_at", monthStart),
        admin
          .from("resellers")
          .select("*", { count: "exact", head: true })
          .eq("server_id", bot.serverId)
          .gte("joined_at", monthStart),
      ]);

      const txs = txRes.data ?? [];
      const voucherTxs = txs.filter(
        (t) => t.tx_type === "voucher_purchase" && t.status === "success"
      );
      const topupSum = txs
        .filter((t) => t.tx_type === "topup")
        .reduce((s, t) => s + Number(t.amount), 0);
      const voucherRevenue = voucherTxs.reduce(
        (s, t) => s + Number(t.voucher_price ?? 0),
        0
      );
      const ppobOk = (ppobRes.data ?? []).filter(
        (p) => p.status === "SUCCESS" || p.status === "PROCESSED"
      );
      const ppobSales = ppobOk.reduce((s, p) => s + Number(p.sell_price), 0);
      const ppobProfit = ppobOk.reduce((s, p) => s + Number(p.profit), 0);

      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: [
          `<b>📊 Laporan Bulan Ini (${escapeHtml(bot.serverName)})</b>`,
          `<code>========================</code>`,
          `Voucher Terjual : <b>${voucherTxs.length.toLocaleString("id-ID")}</b>`,
          `Omset Voucher   : <b>${formatIDR(voucherRevenue)}</b>`,
          `Total Top Up    : <b>${formatIDR(topupSum)}</b>`,
          `Transaksi PPOB  : ${ppobOk.length} (${formatIDR(ppobSales)})`,
          `Laba PPOB       : <b>${formatIDR(ppobProfit)}</b>`,
          `Reseller Baru   : ${newResellersRes.count ?? 0}`,
          `<code>========================</code>`,
        ].join("\n"),
      });
      return;
    }

    if (cmd === "/saldoportal") {
      const bal = await getPortalPulsaBalance(bot.serverId);
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: bal.ok
          ? `💳 <b>Saldo API Portal Pulsa</b>\nSaldo: <b>${formatIDR(bal.balance)}</b>\nInfo: ${escapeHtml(bal.rawMessage)}`
          : `❌ Gagal cek saldo Portal Pulsa: ${escapeHtml(bal.error ?? "unknown")}`,
      });
      return;
    }
  }

  // --- STATEFUL TEXT CONVERSATION (/isipulsa state machine) ---
  const { data: stateRow } = await admin
    .from("bot_user_states")
    .select("step, payload, expires_at")
    .eq("server_id", bot.serverId)
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return;
  }

  if (stateRow.step === "waiting_phone") {
    const phone = rawText.replace(/\s+/g, "");
    if (!/^[0-9]{10,14}$/.test(phone)) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: "Format nomor tujuan tidak valid (10–14 digit angka). Masukkan ulang atau klik batal:",
      });
      return;
    }

    await admin
      .from("bot_user_states")
      .update({
        step: "waiting_code",
        payload: { phone },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq("server_id", bot.serverId)
      .eq("telegram_id", telegramId);

    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: `Nomor tujuan: <code>${escapeHtml(phone)}</code>\nSekarang masukkan <b>Kode Produk</b> (contoh: <code>S5</code>, <code>S10</code>, <code>PLN20</code>):`,
    });
    return;
  }

  if (stateRow.step === "waiting_code") {
    const code = rawText.toUpperCase();
    const payload = (stateRow.payload ?? {}) as { phone?: string };
    const phone = payload.phone ?? "";
    const product = await findPortalPulsaProduct(code, bot.serverId);

    if (!product) {
      await sendTelegramMessage({
        token: bot.token,
        chatId,
        text: `Kode produk <code>${escapeHtml(code)}</code> tidak ditemukan. Ketik /pulsa, /pln, atau /game untuk melihat daftar kode.`,
      });
      return;
    }

    const r = await getReseller(admin, bot.serverId, telegramId);
    await admin
      .from("bot_user_states")
      .update({
        step: "confirming_pulsa",
        payload: { phone, code: product.code, sellPrice: product.sellPrice },
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .eq("server_id", bot.serverId)
      .eq("telegram_id", telegramId);

    await sendTelegramMessage({
      token: bot.token,
      chatId,
      text: [
        `<b>Konfirmasi Transaksi PPOB</b>`,
        `Tujuan : <code>${escapeHtml(phone)}</code>`,
        `Produk : <b>${escapeHtml(product.description)}</b> (${escapeHtml(product.code)})`,
        `Harga  : <b>${formatIDR(product.sellPrice)}</b>`,
        `Saldo Anda: ${formatIDR(Number(r?.balance ?? 0))}`,
        `\nLanjutkan transaksi?`,
      ].join("\n"),
      inlineKeyboard: [
        [
          {
            text: "✅ Lanjutkan",
            callback_data: `process_pulsa|${phone}|${product.code}|${product.sellPrice}`,
          },
          { text: "❌ Batal", callback_data: "cancel_pulsa" },
        ],
      ],
    });
  }
}
