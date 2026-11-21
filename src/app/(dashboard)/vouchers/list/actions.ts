"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  buildHotspotLoginUrl,
  formatUptimeLabel,
  generateQrPngBuffer,
} from "@/lib/voucher-generator";
import {
  escapeHtml,
  getBotTokenFromSettings,
  sendTelegramPhotoBuffer,
} from "@/lib/telegram/api";

export type VoucherListActionResult = {
  ok: boolean;
  message: string;
};

function parseDataLimitBytes(
  rawValue: string,
  unit: string
): number | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) return 0;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (unit === "GB") return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num * 1024 * 1024);
}

function formatDataLimitText(bytes: number): string {
  if (!bytes || bytes <= 0) return "Unlimited";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Number.isInteger(gb) ? gb : gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export async function saveVoucherItemAction(
  formData: FormData
): Promise<VoucherListActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();

    const id = String(formData.get("id") ?? "").trim();
    const enabled = String(formData.get("enabled") ?? "yes") === "yes";
    const server = String(formData.get("server") ?? "all").trim() || "all";
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const profile = String(formData.get("profile") ?? "default").trim();
    const macAddress = String(formData.get("mac_address") ?? "").trim();
    const prevMacAddress = String(formData.get("prev_mac_address") ?? "").trim();
    const limitUptime = String(formData.get("limit_uptime") ?? "").trim();
    const dataLimitVal = String(formData.get("data_limit_value") ?? "").trim();
    const dataLimitUnit = String(formData.get("data_limit_unit") ?? "GB").trim();
    const comment = String(formData.get("comment") ?? "").trim();

    if (!name) {
      return { ok: false, message: "Name / kode voucher wajib diisi." };
    }

    const limitBytesTotal = parseDataLimitBytes(dataLimitVal, dataLimitUnit);

    if (id) {
      // Only send mac-address when provided or explicitly clearing an existing MAC
      const resolvedMac = macAddress
        ? macAddress
        : prevMacAddress
          ? "00:00:00:00:00:00"
          : undefined;

      await adapter.updateHotspotUser(id, {
        name,
        password: password || undefined,
        profile,
        server,
        macAddress: resolvedMac,
        limitUptime: limitUptime || "0s",
        limitBytesTotal,
        comment,
        disabled: !enabled,
      });
    } else {
      await adapter.addHotspotUser({
        name,
        password: password || name,
        profile,
        server,
        macAddress: macAddress || undefined,
        limitUptime: limitUptime || undefined,
        limitBytesTotal: limitBytesTotal || undefined,
        comment: comment || undefined,
        disabled: !enabled,
      });
    }

    revalidatePath("/vouchers/list");
    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: true,
      message: id
        ? `Voucher "${name}" berhasil diperbarui.`
        : `Voucher "${name}" berhasil ditambahkan ke MikroTik.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menyimpan data voucher.",
    };
  }
}

export async function resetVoucherCountersAction(
  id: string,
  voucherName?: string
): Promise<VoucherListActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.resetHotspotUserCounters(id);
    revalidatePath("/vouchers/list");
    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: true,
      message: voucherName
        ? `Counter uptime & bytes voucher "${voucherName}" berhasil direset ke 0.`
        : "Counter voucher berhasil direset ke 0.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal mereset counter voucher.",
    };
  }
}

export async function sendExistingVoucherToTelegramAction(input: {
  resellerId: string;
  name: string;
  password: string;
  profile: string;
  limitUptime: string;
  limitBytesTotal: number;
  comment?: string;
}): Promise<VoucherListActionResult> {
  try {
    await requireStaff();

    if (!input.resellerId) {
      return { ok: false, message: "Pilih reseller penerima Telegram dulu." };
    }
    if (!input.name.trim()) {
      return { ok: false, message: "Nama voucher tidak boleh kosong." };
    }

    const supabase = await createClient();
    const { data: reseller } = await supabase
      .from("resellers")
      .select("id, telegram_id, username")
      .eq("id", input.resellerId)
      .maybeSingle();

    if (!reseller) {
      return { ok: false, message: "Reseller tidak ditemukan." };
    }

    const bot = await getBotTokenFromSettings();
    if (!bot) {
      return {
        ok: false,
        message: "Bot Telegram belum dikonfigurasi di Pengaturan.",
      };
    }

    let dnsName = "wifi.salikur.net";
    try {
      const adapter = await getDefaultMikroTikAdapter();
      dnsName = adapter.config.dnsName || dnsName;
    } catch {
      // Fallback to default dnsName
    }

    const username = input.name.trim();
    const password = (input.password || username).trim();
    const isCodeOnly = password === username;
    const loginUrl = buildHotspotLoginUrl(dnsName, username, password);
    const qrBuf = await generateQrPngBuffer(loginUrl, "#20a8d8");

    const captionLines = [
      `🎫 <b>Voucher Hotspot</b>`,
      `<code>========================</code>`,
      isCodeOnly
        ? `Kode   : <code>${escapeHtml(username)}</code>`
        : `User   : <code>${escapeHtml(username)}</code>\nPass   : <code>${escapeHtml(password)}</code>`,
      `Profile: ${escapeHtml(input.profile || "-")}`,
      `Aktif  : ${escapeHtml(formatUptimeLabel(input.limitUptime || ""))}`,
      `Kuota  : ${escapeHtml(formatDataLimitText(input.limitBytesTotal || 0))}`,
    ];
    if (input.comment?.trim()) {
      captionLines.push(`Comment: ${escapeHtml(input.comment.trim())}`);
    }
    captionLines.push(`Login  : ${escapeHtml(dnsName)}`);

    const res = await sendTelegramPhotoBuffer({
      token: bot.token,
      chatId: reseller.telegram_id,
      buffer: qrBuf,
      filename: `voucher-${username}.png`,
      caption: captionLines.join("\n"),
      inlineKeyboard: [[{ text: "🌐 Go to Login", url: loginUrl }]],
    });

    if (!res.ok) {
      return {
        ok: false,
        message: `Gagal kirim Telegram ke @${reseller.username}: ${res.description ?? "Telegram API error"}`,
      };
    }

    return {
      ok: true,
      message: `Voucher "${username}" berhasil dikirim ke Telegram @${reseller.username}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Gagal mengirim voucher ke Telegram.",
    };
  }
}

export async function toggleVoucherStatusAction(
  id: string,
  disabled: boolean
): Promise<VoucherListActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.updateHotspotUser(id, { disabled });
    revalidatePath("/vouchers/list");
    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: true,
      message: disabled ? "Voucher dinonaktifkan." : "Voucher diaktifkan.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal mengubah status voucher.",
    };
  }
}

export async function deleteVoucherItemAction(
  id: string
): Promise<VoucherListActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removeHotspotUser(id);
    revalidatePath("/vouchers/list");
    revalidatePath("/mikrotik/hotspot/users");
    return { ok: true, message: "Voucher berhasil dihapus dari MikroTik." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menghapus voucher.",
    };
  }
}

export async function bulkDeleteVouchersAction(
  ids: string[]
): Promise<VoucherListActionResult> {
  try {
    await requireStaff();
    if (!ids.length) {
      return { ok: false, message: "Pilih minimal 1 voucher untuk dihapus." };
    }
    const adapter = await getDefaultMikroTikAdapter();
    let deleted = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await adapter.removeHotspotUser(id);
        deleted++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/vouchers/list");
    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: failed === 0,
      message:
        failed === 0
          ? `${deleted} voucher berhasil dihapus dari MikroTik.`
          : `${deleted} voucher dihapus, ${failed} gagal dihapus.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menghapus massal voucher.",
    };
  }
}
