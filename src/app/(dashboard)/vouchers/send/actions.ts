"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  buildBatchCode,
  buildHotspotLoginUrl,
  buildVoucherComment,
  formatQuotaLabelMb,
  formatUptimeLabel,
  generateQrPngBuffer,
  generateUniqueVouchers,
  mbToBytes,
} from "@/lib/voucher-generator";
import {
  escapeHtml,
  getBotTokenFromSettings,
  sendLongTelegramMessage,
  sendTelegramPhotoBuffer,
} from "@/lib/telegram/api";

export interface GeneratedVoucherSummary {
  username: string;
  password: string;
  loginType: "vc" | "up";
  profile: string;
  price: number;
}

export type VoucherSendResult = {
  ok: boolean;
  message: string;
  batchCode?: string;
  vouchers?: GeneratedVoucherSummary[];
};

const batchSchema = z.object({
  reseller_id: z.string().uuid("Pilih reseller penerima."),
  package_id: z.string().uuid("Pilih paket voucher."),
  quantity: z.coerce
    .number()
    .int()
    .min(1, "Jumlah minimal 1 voucher.")
    .max(100, "Jumlah maksimal 100 voucher per batch."),
  deduct_balance: z.boolean().default(false),
  send_telegram: z.boolean().default(true),
  prefix: z.string().trim().max(6).optional(),
});

export async function generateBatchVoucherAction(
  formData: FormData
): Promise<VoucherSendResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Sesi login tidak valid." };
  }

  const parsed = batchSchema.safeParse({
    reseller_id: formData.get("reseller_id"),
    package_id: formData.get("package_id"),
    quantity: formData.get("quantity"),
    deduct_balance: formData.get("deduct_balance") === "true",
    send_telegram: formData.get("send_telegram") !== "false",
    prefix: formData.get("prefix") || "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Input batch tidak valid.",
    };
  }

  const v = parsed.data;
  const activeServer = await getActiveServer();
  if (!activeServer) {
    return { ok: false, message: "Server aktif tidak ditemukan." };
  }
  const supabase = await createClient();

  const [resellerRes, pkgRes] = await Promise.all([
    supabase
      .from("resellers")
      .select("id, server_id, telegram_id, username, balance, status")
      .eq("id", v.reseller_id)
      .maybeSingle(),
    supabase
      .from("voucher_packages")
      .select("*")
      .eq("id", v.package_id)
      .maybeSingle(),
  ]);

  const reseller = resellerRes.data;
  const pkg = pkgRes.data;

  if (!reseller) return { ok: false, message: "Reseller tidak ditemukan." };
  if (!pkg) return { ok: false, message: "Paket voucher tidak ditemukan." };

  const serverId = activeServer.id;
  const unitPrice = Number(pkg.price);
  const unitMarkup = Number(pkg.markup);
  const unitNetCost = Math.max(unitPrice - unitMarkup, 0);
  const totalNetCost = unitNetCost * v.quantity;

  // 1. Optional atomic balance reservation
  let reservedTxId: number | null = null;
  if (v.deduct_balance && totalNetCost > 0) {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "rpc_reserve_balance_v2",
      {
        p_server_id: serverId,
        p_telegram_id: reseller.telegram_id,
        p_amount: totalNetCost,
        p_tx_type: "voucher_purchase",
        p_meta: {
          voucher_price: unitPrice * v.quantity,
          markup_amount: unitMarkup * v.quantity,
          voucher_profile: pkg.mikrotik_profile,
          quantity: v.quantity,
          notes: `Web Batch (${v.quantity}x ${pkg.name}) oleh ${staff.username}`,
        },
      }
    );
    if (rpcErr) {
      return {
        ok: false,
        message: rpcErr.message.includes("INSUFFICIENT_BALANCE")
          ? `Saldo @${reseller.username} tidak mencukupi. Butuh ${formatIDR(totalNetCost)}, saldo saat ini ${formatIDR(Number(reseller.balance))}.`
          : rpcErr.message,
      };
    }
    const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
    reservedTxId = Number(row?.transaction_id ?? 0) || null;
  }

  // 2. Generate credentials & create users on MikroTik
  const batchCode = buildBatchCode();
  const credentials = generateUniqueVouchers({
    quantity: v.quantity,
    length: pkg.code_length,
    charType: pkg.char_type,
    loginType: pkg.login_type === "up" ? "up" : "vc",
    prefix: v.prefix,
  });

  const comment = buildVoucherComment({
    seller: reseller.username,
    price: unitPrice,
    batchCode,
  });

  const createdOnRouter: Array<{
    apiId: string;
    username: string;
    password: string;
  }> = [];

  let dnsName = "wifi.salikur.net";
  let routerId: string | null = pkg.router_id;

  try {
    const adapter = await getDefaultMikroTikAdapter(pkg.router_id ?? undefined);
    dnsName = adapter.config.dnsName;
    routerId = adapter.config.id ?? pkg.router_id;

    for (const cred of credentials) {
      const apiId = await adapter.addHotspotUser({
        server: pkg.mikrotik_server || "all",
        name: cred.username,
        password: cred.password,
        profile: pkg.mikrotik_profile,
        limitUptime: pkg.limit_uptime || undefined,
        limitBytesIn: mbToBytes(pkg.limit_download_mb),
        limitBytesOut: mbToBytes(pkg.limit_upload_mb),
        limitBytesTotal: mbToBytes(pkg.limit_total_mb),
        comment,
      });
      createdOnRouter.push({
        apiId,
        username: cred.username,
        password: cred.password,
      });
    }
  } catch (err) {
    // Rollback partially created users on MikroTik
    if (createdOnRouter.length > 0) {
      try {
        const adapter = await getDefaultMikroTikAdapter(pkg.router_id ?? undefined);
        for (const item of createdOnRouter) {
          if (item.apiId) await adapter.removeHotspotUser(item.apiId);
        }
      } catch {
        // best-effort rollback
      }
    }
    if (reservedTxId) {
      await supabase.rpc("rpc_refund_balance", {
        p_tx_id: reservedTxId,
        p_reason: `Rollback web batch MikroTik error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
    return {
      ok: false,
      message: `Gagal membuat voucher di MikroTik: ${err instanceof Error ? err.message : "Router error"}. ${v.deduct_balance ? "Saldo reseller telah dikembalikan otomatis." : ""}`,
    };
  }

  // 3. Persist batch & voucher rows to Supabase
  const { data: batchRow, error: batchErr } = await supabase
    .from("voucher_batches")
    .insert({
      server_id: serverId,
      batch_code: batchCode,
      reseller_id: reseller.id,
      package_id: pkg.id,
      router_id: routerId,
      source: "web_batch",
      package_name: pkg.name,
      unit_price: unitPrice,
      quantity: createdOnRouter.length,
      deducted_balance: v.deduct_balance,
      telegram_sent: false,
      created_by: staff.userId,
    })
    .select("id")
    .single();

  if (batchErr || !batchRow) {
    return {
      ok: false,
      message: `Voucher dibuat di MikroTik namun gagal simpan batch DB: ${batchErr?.message ?? "unknown"}`,
    };
  }

  const quotaLabel = formatQuotaLabelMb(pkg.limit_total_mb);
  await supabase.from("vouchers").insert(
    createdOnRouter.map((item) => ({
      server_id: serverId,
      batch_id: batchRow.id,
      reseller_id: reseller.id,
      package_id: pkg.id,
      mikrotik_api_id: item.apiId || null,
      username: item.username,
      password: item.password,
      login_type: pkg.login_type,
      profile: pkg.mikrotik_profile,
      time_limit: pkg.limit_uptime,
      data_limit_label: quotaLabel,
      price: unitPrice,
      markup: unitMarkup,
      net_cost: unitNetCost,
      dns_name: dnsName,
      card_color: pkg.card_color,
      status: "success",
    }))
  );

  // 4. Optional Telegram delivery
  let telegramStatusMsg = "";
  if (v.send_telegram) {
    const bot = await getBotTokenFromSettings(serverId);
    if (!bot) {
      telegramStatusMsg = " (Bot Telegram belum diatur — pengiriman dilewati)";
    } else {
      try {
        let sentOk = false;
        let sendError = "";

        if (createdOnRouter.length === 1) {
          const only = createdOnRouter[0];
          const loginUrl = buildHotspotLoginUrl(
            dnsName,
            only.username,
            only.password
          );
          const qrBuf = await generateQrPngBuffer(loginUrl, pkg.card_color);
          const caption = [
            `🎫 <b>Voucher Hotspot (${escapeHtml(pkg.name)})</b>`,
            `<code>========================</code>`,
            pkg.login_type === "vc"
              ? `Kode   : <code>${escapeHtml(only.username)}</code>`
              : `User   : <code>${escapeHtml(only.username)}</code>\nPass   : <code>${escapeHtml(only.password)}</code>`,
            `Aktif  : ${escapeHtml(formatUptimeLabel(pkg.limit_uptime))}`,
            `Kuota  : ${escapeHtml(quotaLabel)}`,
            `Harga  : ${formatIDR(unitPrice)}`,
            `Batch  : <code>${batchCode}</code>`,
            `Login  : ${escapeHtml(dnsName)}`,
          ].join("\n");

          const res = await sendTelegramPhotoBuffer({
            token: bot.token,
            chatId: reseller.telegram_id,
            buffer: qrBuf,
            filename: `voucher-${only.username}.png`,
            caption,
            inlineKeyboard: [[{ text: "🌐 Go to Login", url: loginUrl }]],
          });
          sentOk = res.ok;
          sendError = res.description ?? "";
        } else {
          // Chunk per 25 vouchers so Telegram stays well below 4096 chars
          const chunkSize = 25;
          sentOk = true;
          for (let i = 0; i < createdOnRouter.length; i += chunkSize) {
            const slice = createdOnRouter.slice(i, i + chunkSize);
            const lines = [
              `📦 <b>Batch Voucher ${escapeHtml(pkg.name)} (${i + 1}–${i + slice.length} / ${createdOnRouter.length})</b>`,
              `Batch: <code>${batchCode}</code> | Aktif: ${escapeHtml(formatUptimeLabel(pkg.limit_uptime))} | Kuota: ${escapeHtml(quotaLabel)}`,
              `<code>========================</code>`,
              ...slice.map((item, idx) =>
                pkg.login_type === "vc"
                  ? `${i + idx + 1}. <code>${escapeHtml(item.username)}</code>`
                  : `${i + idx + 1}. U: <code>${escapeHtml(item.username)}</code> | P: <code>${escapeHtml(item.password)}</code>`
              ),
              `<code>========================</code>`,
              `Login: ${escapeHtml(dnsName)}`,
            ];
            const responses = await sendLongTelegramMessage({
              token: bot.token,
              chatId: reseller.telegram_id,
              text: lines.join("\n"),
            });
            const failed = responses.find((r) => !r.ok);
            if (failed) {
              sentOk = false;
              sendError = failed.description ?? "sendMessage failed";
              break;
            }
          }
        }

        await supabase
          .from("voucher_batches")
          .update({
            telegram_sent: sentOk,
            telegram_error: sentOk ? null : sendError,
          })
          .eq("id", batchRow.id);

        telegramStatusMsg = sentOk
          ? " dan terkirim ke Telegram reseller."
          : ` namun gagal kirim Telegram (${sendError}).`;
      } catch (err) {
        telegramStatusMsg = ` namun error kirim Telegram (${err instanceof Error ? err.message : "unknown"}).`;
      }
    }
  }

  revalidatePath("/vouchers/batches");
  revalidatePath("/vouchers/history");
  revalidatePath("/resellers");
  revalidatePath("/");

  return {
    ok: true,
    message: `Berhasil membuat ${createdOnRouter.length} voucher (${batchCode})${telegramStatusMsg}`,
    batchCode,
    vouchers: createdOnRouter.map((item) => ({
      username: item.username,
      password: item.password,
      loginType: pkg.login_type === "up" ? "up" : "vc",
      profile: pkg.mikrotik_profile,
      price: unitPrice,
    })),
  };
}

const customSingleSchema = z.object({
  reseller_id: z.string().uuid("Pilih reseller penerima."),
  username: z.string().trim().min(2, "Username voucher minimal 2 karakter."),
  password: z.string().trim().optional(),
  profile: z.string().trim().min(1, "Profile MikroTik wajib diisi."),
  server: z.string().trim().default("all"),
  limit_uptime: z.string().trim().default("1d"),
  limit_total_mb: z.coerce.number().int().min(0).default(0),
  price: z.coerce.number().min(0).default(0),
  card_color: z.string().trim().default("#20a8d8"),
  send_telegram: z.boolean().default(true),
  rollback_on_telegram_fail: z.boolean().default(true),
});

export async function generateCustomSingleVoucherAction(
  formData: FormData
): Promise<VoucherSendResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Unauthorized" };
  }

  const parsed = customSingleSchema.safeParse({
    reseller_id: formData.get("reseller_id"),
    username: formData.get("username"),
    password: formData.get("password") || "",
    profile: formData.get("profile"),
    server: formData.get("server") || "all",
    limit_uptime: formData.get("limit_uptime") || "1d",
    limit_total_mb: formData.get("limit_total_mb") || 0,
    price: formData.get("price") || 0,
    card_color: formData.get("card_color") || "#20a8d8",
    send_telegram: formData.get("send_telegram") !== "false",
    rollback_on_telegram_fail:
      formData.get("rollback_on_telegram_fail") !== "false",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Input voucher tidak valid.",
    };
  }

  const v = parsed.data;
  const activeServer = await getActiveServer();
  if (!activeServer) {
    return { ok: false, message: "Server aktif tidak ditemukan." };
  }
  const finalPassword = v.password || v.username;
  const loginType: "vc" | "up" = finalPassword === v.username ? "vc" : "up";
  const supabase = await createClient();

  const { data: reseller } = await supabase
    .from("resellers")
    .select("id, telegram_id, username")
    .eq("id", v.reseller_id)
    .maybeSingle();

  if (!reseller) return { ok: false, message: "Reseller tidak ditemukan." };

  const batchCode = buildBatchCode();
  let apiId = "";
  let dnsName = "wifi.salikur.net";
  let routerId: string | null = activeServer.router_id;

  try {
    const adapter = await getDefaultMikroTikAdapter(activeServer.router_id ?? undefined);
    dnsName = adapter.config.dnsName;
    routerId = adapter.config.id ?? activeServer.router_id;

    apiId = await adapter.addHotspotUser({
      server: v.server,
      name: v.username,
      password: finalPassword,
      profile: v.profile,
      limitUptime: v.limit_uptime,
      limitBytesTotal: mbToBytes(v.limit_total_mb),
      comment: buildVoucherComment({
        seller: reseller.username,
        price: v.price,
        batchCode,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      message: `Gagal membuat user di MikroTik: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  let telegramSent = false;
  let telegramError: string | null = null;

  if (v.send_telegram) {
    const bot = await getBotTokenFromSettings(activeServer.id);
    if (bot) {
      const loginUrl = buildHotspotLoginUrl(dnsName, v.username, finalPassword);
      const qrBuf = await generateQrPngBuffer(loginUrl, v.card_color);
      const res = await sendTelegramPhotoBuffer({
        token: bot.token,
        chatId: reseller.telegram_id,
        buffer: qrBuf,
        filename: `voucher-${v.username}.png`,
        caption: [
          `🎫 <b>Voucher Custom Hotspot</b>`,
          `<code>========================</code>`,
          loginType === "vc"
            ? `Kode   : <code>${escapeHtml(v.username)}</code>`
            : `User   : <code>${escapeHtml(v.username)}</code>\nPass   : <code>${escapeHtml(finalPassword)}</code>`,
          `Profile: ${escapeHtml(v.profile)}`,
          `Aktif  : ${escapeHtml(formatUptimeLabel(v.limit_uptime))}`,
          `Kuota  : ${escapeHtml(formatQuotaLabelMb(v.limit_total_mb))}`,
          `Login  : ${escapeHtml(dnsName)}`,
        ].join("\n"),
        inlineKeyboard: [[{ text: "🌐 Go to Login", url: loginUrl }]],
      });

      if (res.ok) {
        telegramSent = true;
      } else {
        telegramError = res.description ?? "Gagal kirim Telegram";
        if (v.rollback_on_telegram_fail && apiId) {
          try {
            const adapter = await getDefaultMikroTikAdapter(activeServer.router_id ?? undefined);
            await adapter.removeHotspotUser(apiId);
          } catch {
            // ignore
          }
          return {
            ok: false,
            message: `Gagal kirim Telegram (${telegramError}). User MikroTik telah di-rollback (dihapus).`,
          };
        }
      }
    }
  }

  const { data: batchRow } = await supabase
    .from("voucher_batches")
    .insert({
      server_id: activeServer.id,
      batch_code: batchCode,
      reseller_id: reseller.id,
      router_id: routerId,
      source: "web_custom",
      package_name: v.profile,
      unit_price: v.price,
      quantity: 1,
      deducted_balance: false,
      telegram_sent: telegramSent,
      telegram_error: telegramError,
      created_by: staff.userId,
    })
    .select("id")
    .single();

  if (batchRow) {
    await supabase.from("vouchers").insert({
      server_id: activeServer.id,
      batch_id: batchRow.id,
      reseller_id: reseller.id,
      mikrotik_api_id: apiId || null,
      username: v.username,
      password: finalPassword,
      login_type: loginType,
      profile: v.profile,
      time_limit: v.limit_uptime,
      data_limit_label: formatQuotaLabelMb(v.limit_total_mb),
      price: v.price,
      markup: 0,
      net_cost: v.price,
      dns_name: dnsName,
      card_color: v.card_color,
      status: telegramError ? "failed_telegram" : "success",
    });
  }

  revalidatePath("/vouchers/batches");
  return {
    ok: true,
    message: `Voucher custom ${v.username} berhasil dibuat${telegramSent ? " & dikirim ke Telegram" : ""}.`,
    batchCode,
    vouchers: [
      {
        username: v.username,
        password: finalPassword,
        loginType,
        profile: v.profile,
        price: v.price,
      },
    ],
  };
}
