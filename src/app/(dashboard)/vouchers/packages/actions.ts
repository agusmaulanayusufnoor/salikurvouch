"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PackageActionResult = {
  ok: boolean;
  message: string;
};

const packageSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  router_id: z.string().uuid().optional().or(z.literal("")),
  mode: z.enum(["saldo", "nonsaldo"]),
  name: z.string().trim().min(1, "Nama paket wajib diisi."),
  menu_label: z.string().trim().min(1, "Label menu bot wajib diisi."),
  price: z.coerce.number().min(0, "Harga jual minimal 0."),
  markup: z.coerce.number().min(0, "Markup minimal 0."),
  mikrotik_server: z.string().trim().min(1).default("all"),
  mikrotik_profile: z.string().trim().min(1, "Profile MikroTik wajib diisi."),
  limit_uptime: z.string().trim().default("00:00:00"),
  limit_download_mb: z.coerce.number().int().min(0).default(0),
  limit_upload_mb: z.coerce.number().int().min(0).default(0),
  limit_total_mb: z.coerce.number().int().min(0).default(0),
  login_type: z.enum(["vc", "up"]).default("vc"),
  char_type: z.enum(["1", "2", "3", "4", "5", "6", "7"]).default("6"),
  code_length: z.coerce.number().int().min(3).max(16).default(5),
  card_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex (#RRGGBB)")
    .default("#20a8d8"),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export async function saveVoucherPackageAction(
  formData: FormData
): Promise<PackageActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat mengelola paket voucher.",
    };
  }

  const rawColor = String(formData.get("card_color") ?? "#20a8d8").trim();
  const normalizedColor = /^[0-9a-fA-F]{6}$/.test(rawColor)
    ? `#${rawColor}`
    : rawColor;

  const parsed = packageSchema.safeParse({
    id: formData.get("id") || "",
    router_id: formData.get("router_id") || "",
    mode: formData.get("mode") || "saldo",
    name: formData.get("name"),
    menu_label: formData.get("menu_label"),
    price: formData.get("price"),
    markup: formData.get("markup"),
    mikrotik_server: formData.get("mikrotik_server") || "all",
    mikrotik_profile: formData.get("mikrotik_profile"),
    limit_uptime: formData.get("limit_uptime") || "00:00:00",
    limit_download_mb: formData.get("limit_download_mb") || 0,
    limit_upload_mb: formData.get("limit_upload_mb") || 0,
    limit_total_mb: formData.get("limit_total_mb") || 0,
    login_type: formData.get("login_type") || "vc",
    char_type: formData.get("char_type") || "6",
    code_length: formData.get("code_length") || 5,
    card_color: normalizedColor,
    sort_order: formData.get("sort_order") || 0,
    is_active: formData.get("is_active") !== "false",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Data paket voucher tidak valid.",
    };
  }

  const v = parsed.data;
  if (v.mode === "saldo" && v.markup > v.price) {
    return {
      ok: false,
      message: "Markup tidak boleh lebih besar dari harga jual paket.",
    };
  }

  const supabase = await createClient();
  const payload = {
    router_id: v.router_id || null,
    mode: v.mode,
    name: v.name,
    menu_label: v.menu_label,
    price: v.price,
    markup: v.markup,
    mikrotik_server: v.mikrotik_server,
    mikrotik_profile: v.mikrotik_profile,
    limit_uptime: v.limit_uptime,
    limit_download_mb: v.limit_download_mb,
    limit_upload_mb: v.limit_upload_mb,
    limit_total_mb: v.limit_total_mb,
    login_type: v.login_type,
    char_type: v.char_type,
    code_length: v.code_length,
    card_color: v.card_color,
    sort_order: v.sort_order,
    is_active: v.is_active,
  };

  if (v.id) {
    const { error } = await supabase
      .from("voucher_packages")
      .update(payload)
      .eq("id", v.id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from("voucher_packages").insert(payload);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/vouchers/packages");
  revalidatePath("/vouchers/send");
  return {
    ok: true,
    message: v.id
      ? `Paket voucher "${v.name}" berhasil diperbarui.`
      : `Paket voucher "${v.name}" berhasil ditambahkan.`,
  };
}

export async function toggleVoucherPackageAction(
  id: string,
  isActive: boolean
): Promise<PackageActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Forbidden" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("voucher_packages")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/vouchers/packages");
  return {
    ok: true,
    message: isActive ? "Paket diaktifkan." : "Paket dinonaktifkan.",
  };
}

export async function deleteVoucherPackageAction(
  id: string
): Promise<PackageActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Forbidden" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("voucher_packages")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/vouchers/packages");
  return { ok: true, message: "Paket voucher berhasil dihapus." };
}
