"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PpobActionResult = {
  ok: boolean;
  message: string;
};

const ppobTxSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  trx_id: z.string().trim().optional(),
  reseller_id: z.string().uuid().optional().or(z.literal("")),
  telegram_id: z.coerce.number().int().default(0),
  product_code: z.string().trim().min(1, "Kode produk wajib diisi."),
  target_number: z.string().trim().min(4, "Nomor tujuan wajib diisi."),
  customer_id: z.string().trim().optional(),
  cost_price: z.coerce.number().min(0, "Harga modal tidak boleh negatif."),
  sell_price: z.coerce.number().min(0, "Harga jual tidak boleh negatif."),
  status: z.enum(["SUCCESS", "PROCESSED", "PENDING", "FAILED"]),
  serial_number: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export async function savePpobTransactionAction(
  formData: FormData
): Promise<PpobActionResult> {
  try {
    await requireStaff();
  } catch {
    return { ok: false, message: "Sesi login tidak valid." };
  }

  const rawId = formData.get("id");
  const parsed = ppobTxSchema.safeParse({
    id: rawId ? Number(rawId) : undefined,
    trx_id: formData.get("trx_id") || "",
    reseller_id: formData.get("reseller_id") || "",
    telegram_id: formData.get("telegram_id") || 0,
    product_code: formData.get("product_code"),
    target_number: formData.get("target_number"),
    customer_id: formData.get("customer_id") || "",
    cost_price: formData.get("cost_price"),
    sell_price: formData.get("sell_price"),
    status: formData.get("status") || "SUCCESS",
    serial_number: formData.get("serial_number") || "",
    description: formData.get("description") || "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Data transaksi tidak valid.",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  let telegramId = v.telegram_id;
  if (v.reseller_id && !telegramId) {
    const { data: r } = await supabase
      .from("resellers")
      .select("telegram_id")
      .eq("id", v.reseller_id)
      .maybeSingle();
    if (r) telegramId = r.telegram_id;
  }

  const profit = v.status === "FAILED" ? 0 : v.sell_price - v.cost_price;

  if (v.id) {
    const { error } = await supabase
      .from("ppob_transactions")
      .update({
        reseller_id: v.reseller_id || null,
        telegram_id: telegramId,
        product_code: v.product_code.toUpperCase(),
        target_number: v.target_number,
        customer_id: v.customer_id || null,
        cost_price: v.cost_price,
        sell_price: v.sell_price,
        profit,
        status: v.status,
        serial_number: v.serial_number || "",
        description: v.description || null,
      })
      .eq("id", v.id);

    if (error) return { ok: false, message: error.message };
  } else {
    const trxId =
      v.trx_id ||
      `MAN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const { error } = await supabase.from("ppob_transactions").insert({
      trx_id: trxId,
      reseller_id: v.reseller_id || null,
      telegram_id: telegramId,
      product_code: v.product_code.toUpperCase(),
      target_number: v.target_number,
      customer_id: v.customer_id || null,
      cost_price: v.cost_price,
      sell_price: v.sell_price,
      profit,
      status: v.status,
      serial_number: v.serial_number || "",
      description: v.description || null,
      source: "manual_web",
    });

    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/ppob/transactions");
  revalidatePath("/ppob/reports");
  revalidatePath("/");
  return {
    ok: true,
    message: v.id
      ? "Transaksi PPOB berhasil diperbarui."
      : "Transaksi PPOB manual berhasil dicatat.",
  };
}

export async function deletePpobTransactionAction(
  id: number
): Promise<PpobActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Hanya admin yang dapat menghapus transaksi." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ppob_transactions")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/ppob/transactions");
  revalidatePath("/ppob/reports");
  revalidatePath("/");
  return { ok: true, message: "Transaksi PPOB berhasil dihapus." };
}
