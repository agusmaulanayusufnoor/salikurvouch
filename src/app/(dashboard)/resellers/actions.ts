"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import {
  getBotTokenFromSettings,
  sendTelegramMessage,
} from "@/lib/telegram/api";

export type ResellerActionResult<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const createResellerSchema = z.object({
  telegram_id: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0 && Number.isSafeInteger(n), "Telegram ID wajib berupa angka valid."),
  username: z.string().trim().min(2, "Nama reseller minimal 2 karakter."),
  phone: z.string().trim().optional(),
  reseller_type: z.enum(["agent", "vip", "internal"]).default("agent"),
  status: z.enum(["active", "suspended"]).default("active"),
  initial_balance: z.coerce.number().min(0, "Saldo awal tidak boleh negatif.").default(0),
});

export async function createResellerAction(
  formData: FormData
): Promise<ResellerActionResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Sesi login tidak valid." };
  }

  const parsed = createResellerSchema.safeParse({
    telegram_id: formData.get("telegram_id"),
    username: formData.get("username"),
    phone: formData.get("phone") || "",
    reseller_type: formData.get("reseller_type") || "agent",
    status: formData.get("status") || "active",
    initial_balance: formData.get("initial_balance") || 0,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Data reseller tidak valid.",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("resellers").insert({
    telegram_id: v.telegram_id,
    username: v.username.replace(/^@/, ""),
    phone: v.phone || null,
    reseller_type: v.reseller_type,
    status: v.status,
    balance: 0,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Telegram ID ${v.telegram_id} sudah terdaftar sebagai reseller.`,
      };
    }
    return { ok: false, message: error.message };
  }

  if (v.initial_balance > 0) {
    const { error: rpcErr } = await supabase.rpc("rpc_adjust_balance", {
      p_telegram_id: v.telegram_id,
      p_delta: v.initial_balance,
      p_tx_type: "topup",
      p_actor: staff.username,
      p_notes: "Saldo awal pendaftaran reseller",
    });
    if (rpcErr) {
      return {
        ok: false,
        message: `Reseller dibuat, namun gagal mengisi saldo awal: ${rpcErr.message}`,
      };
    }
  }

  revalidatePath("/resellers");
  revalidatePath("/resellers/topup");
  revalidatePath("/");
  return {
    ok: true,
    message: `Reseller @${v.username.replace(/^@/, "")} berhasil ditambahkan.`,
  };
}

const updateResellerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().trim().min(2, "Nama reseller minimal 2 karakter."),
  phone: z.string().trim().optional(),
  reseller_type: z.enum(["agent", "vip", "internal"]),
  status: z.enum(["active", "suspended"]),
});

export async function updateResellerAction(
  formData: FormData
): Promise<ResellerActionResult> {
  try {
    await requireStaff();
  } catch {
    return { ok: false, message: "Sesi login tidak valid." };
  }

  const parsed = updateResellerSchema.safeParse({
    id: formData.get("id"),
    username: formData.get("username"),
    phone: formData.get("phone") || "",
    reseller_type: formData.get("reseller_type") || "agent",
    status: formData.get("status") || "active",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Data update tidak valid.",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("resellers")
    .update({
      username: v.username.replace(/^@/, ""),
      phone: v.phone || null,
      reseller_type: v.reseller_type,
      status: v.status,
    })
    .eq("id", v.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/resellers");
  revalidatePath(`/resellers/${v.id}`);
  return { ok: true, message: "Profil reseller berhasil diperbarui." };
}

export async function toggleResellerStatusAction(
  id: string,
  nextStatus: "active" | "suspended"
): Promise<ResellerActionResult> {
  try {
    await requireStaff();
  } catch {
    return { ok: false, message: "Unauthorized" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("resellers")
    .update({ status: nextStatus })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/resellers");
  revalidatePath(`/resellers/${id}`);
  return {
    ok: true,
    message:
      nextStatus === "suspended"
        ? "Reseller dinonaktifkan (suspend). Riwayat transaksi tetap terjaga."
        : "Reseller berhasil diaktifkan kembali.",
  };
}

export async function deleteResellerAction(
  id: string
): Promise<ResellerActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Hanya admin yang dapat menghapus reseller." };
  }

  const supabase = await createClient();

  const [walletCount, ppobCount] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("*", { count: "exact", head: true })
      .eq("reseller_id", id),
    supabase
      .from("ppob_transactions")
      .select("*", { count: "exact", head: true })
      .eq("reseller_id", id),
  ]);

  const txTotal = (walletCount.count ?? 0) + (ppobCount.count ?? 0);
  if (txTotal > 0) {
    return {
      ok: false,
      message: `Reseller memiliki ${txTotal.toLocaleString("id-ID")} transaksi historis. Gunakan aksi Suspend agar data akuntansi tetap utuh.`,
    };
  }

  const { error } = await supabase.from("resellers").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/resellers");
  return { ok: true, message: "Reseller berhasil dihapus permanen." };
}

const adjustBalanceSchema = z.object({
  telegram_id: z.coerce.number().int(),
  tx_type: z.enum(["topup", "topdown"]),
  amount: z.coerce.number().positive("Nominal harus lebih dari 0."),
  notes: z.string().trim().max(300).optional(),
  notify_telegram: z.boolean().default(true),
});

export async function adjustBalanceAction(
  formData: FormData
): Promise<
  ResellerActionResult<{ balanceBefore: number; balanceAfter: number }>
> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Unauthorized" };
  }

  const parsed = adjustBalanceSchema.safeParse({
    telegram_id: formData.get("telegram_id"),
    tx_type: formData.get("tx_type"),
    amount: formData.get("amount"),
    notes: formData.get("notes") || "",
    notify_telegram: formData.get("notify_telegram") === "true",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Input mutasi saldo tidak valid.",
    };
  }

  const v = parsed.data;
  const delta = v.tx_type === "topup" ? v.amount : -v.amount;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("rpc_adjust_balance", {
    p_telegram_id: v.telegram_id,
    p_delta: delta,
    p_tx_type: v.tx_type,
    p_actor: staff.username,
    p_notes:
      v.notes ||
      (v.tx_type === "topup" ? "Top Up saldo via Web Panel" : "Top Down saldo via Web Panel"),
  });

  if (error) {
    const msg = error.message.includes("INSUFFICIENT_BALANCE")
      ? "Saldo reseller tidak mencukupi untuk dilakukan Top Down."
      : error.message;
    return { ok: false, message: msg };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const balanceBefore = Number(row?.balance_before ?? 0);
  const balanceAfter = Number(row?.balance_after ?? 0);

  let telegramNotice = "";
  if (v.notify_telegram) {
    const bot = await getBotTokenFromSettings();
    if (bot) {
      try {
        const title =
          v.tx_type === "topup" ? "💰 Informasi TOP UP Saldo" : "🔻 Informasi TOP DOWN Saldo";
        const text = [
          `<b>${title}</b>`,
          `<code>========================</code>`,
          `ID User     : <code>${v.telegram_id}</code>`,
          `Nominal     : <b>${formatIDR(v.amount)}</b>`,
          `Saldo Awal  : ${formatIDR(balanceBefore)}`,
          `Saldo Akhir : <b>${formatIDR(balanceAfter)}</b>`,
          v.notes ? `Catatan     : ${v.notes}` : null,
          `Admin       : ${staff.username}`,
          `<code>========================</code>`,
        ]
          .filter(Boolean)
          .join("\n");

        const sent = await sendTelegramMessage({
          token: bot.token,
          chatId: v.telegram_id,
          text,
          inlineKeyboard:
            v.tx_type === "topup"
              ? [[{ text: "🎫 Beli Voucher", callback_data: "menu:saldo" }]]
              : undefined,
        });
        if (!sent.ok) {
          telegramNotice = ` (notifikasi Telegram gagal: ${sent.description ?? "unknown"})`;
        }
      } catch {
        telegramNotice = " (notifikasi Telegram gagal terkirim)";
      }
    }
  }

  revalidatePath("/resellers");
  revalidatePath("/resellers/topup");
  revalidatePath("/vouchers/history");
  revalidatePath("/");

  return {
    ok: true,
    message: `${v.tx_type === "topup" ? "Top Up" : "Top Down"} ${formatIDR(v.amount)} berhasil. Saldo baru: ${formatIDR(balanceAfter)}.${telegramNotice}`,
    data: { balanceBefore, balanceAfter },
  };
}

export async function processDepositRequestAction(params: {
  requestId: string;
  decision: "approved" | "rejected";
  approvedAmount?: number;
  notes?: string;
}): Promise<ResellerActionResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Unauthorized" };
  }

  const supabase = await createClient();
  const { data: reqRow, error: fetchErr } = await supabase
    .from("deposit_requests")
    .select(
      "id, amount, status, reseller_id, resellers(id, telegram_id, username)"
    )
    .eq("id", params.requestId)
    .maybeSingle();

  if (fetchErr || !reqRow) {
    return { ok: false, message: "Request deposit tidak ditemukan." };
  }
  if (reqRow.status !== "pending") {
    return {
      ok: false,
      message: `Request deposit sudah berstatus ${reqRow.status}.`,
    };
  }

  const reseller = Array.isArray(reqRow.resellers)
    ? reqRow.resellers[0]
    : reqRow.resellers;
  if (!reseller) {
    return { ok: false, message: "Data reseller tidak ditemukan." };
  }

  const finalAmount =
    params.decision === "approved"
      ? Number(params.approvedAmount ?? reqRow.amount)
      : 0;

  if (params.decision === "approved" && (!finalAmount || finalAmount <= 0)) {
    return { ok: false, message: "Nominal approve harus lebih dari 0." };
  }

  let balanceAfter: number | null = null;
  if (params.decision === "approved") {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "rpc_adjust_balance",
      {
        p_telegram_id: reseller.telegram_id,
        p_delta: finalAmount,
        p_tx_type: "topup",
        p_actor: staff.username,
        p_notes: params.notes || `Approve deposit request #${reqRow.id.slice(0, 8)}`,
      }
    );
    if (rpcErr) return { ok: false, message: rpcErr.message };
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    balanceAfter = Number(row?.balance_after ?? 0);
  }

  const { error: updErr } = await supabase
    .from("deposit_requests")
    .update({
      status: params.decision,
      approved_amount: params.decision === "approved" ? finalAmount : null,
      processed_by: staff.username,
      processed_at: new Date().toISOString(),
    })
    .eq("id", reqRow.id)
    .eq("status", "pending");

  if (updErr) return { ok: false, message: updErr.message };

  // Best-effort Telegram notification
  const bot = await getBotTokenFromSettings();
  if (bot) {
    try {
      const text =
        params.decision === "approved"
          ? `✅ <b>Deposit Disetujui</b>\nNominal: <b>${formatIDR(finalAmount)}</b>\nSaldo Akhir: <b>${formatIDR(balanceAfter ?? 0)}</b>\nDiproses oleh: ${staff.username}`
          : `❌ <b>Request Deposit Ditolak</b>\nNominal diajukan: ${formatIDR(Number(reqRow.amount))}\n${params.notes ? `Alasan: ${params.notes}\n` : ""}Silakan hubungi admin untuk informasi lebih lanjut.`;

      await sendTelegramMessage({
        token: bot.token,
        chatId: reseller.telegram_id,
        text,
        inlineKeyboard:
          params.decision === "approved"
            ? [[{ text: "🎫 Beli Voucher", callback_data: "menu:saldo" }]]
            : undefined,
      });
    } catch {
      // non-fatal
    }
  }

  revalidatePath("/resellers/deposits");
  revalidatePath("/resellers");
  revalidatePath("/");
  return {
    ok: true,
    message:
      params.decision === "approved"
        ? `Deposit @${reseller.username} sebesar ${formatIDR(finalAmount)} berhasil disetujui.`
        : `Deposit @${reseller.username} ditolak.`,
  };
}

export async function createManualDepositRequestAction(
  formData: FormData
): Promise<ResellerActionResult> {
  try {
    await requireStaff();
  } catch {
    return { ok: false, message: "Unauthorized" };
  }

  const resellerId = String(formData.get("reseller_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);

  if (!resellerId || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Pilih reseller dan isi nominal deposit > 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("deposit_requests").insert({
    reseller_id: resellerId,
    amount,
    status: "pending",
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/resellers/deposits");
  return { ok: true, message: "Antrean request deposit berhasil dicatat." };
}
