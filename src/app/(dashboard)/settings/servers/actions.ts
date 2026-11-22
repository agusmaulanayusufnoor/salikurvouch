"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { ACTIVE_SERVER_COOKIE } from "@/lib/server-context";
import { createAdminClient } from "@/lib/supabase/admin";

export type ServerManageResult = {
  ok: boolean;
  message: string;
  serverId?: string;
};

const createServerSchema = z.object({
  name: z.string().trim().min(2, "Nama server minimal 2 karakter."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]{1,31}$/,
      "Slug hanya boleh huruf kecil, angka, dan tanda hubung (2–32 karakter), misal: server3."
    ),
  router_host: z.string().trim().min(3, "IP / Host MikroTik wajib diisi."),
  router_port: z.coerce.number().int().min(1).max(65535).default(8728),
  ros_version: z.enum(["v6", "v7"]).default("v6"),
  connection_mode: z
    .enum(["api_tcp", "api_ssl", "rest_api"])
    .default("api_tcp"),
  router_username: z.string().trim().min(1, "Username MikroTik wajib diisi."),
  router_password: z.string().min(1, "Password MikroTik wajib diisi."),
  dns_name: z.string().trim().min(1, "DNS Hotspot wajib diisi."),
  bot_token: z.string().trim().optional(),
  bot_username: z.string().trim().optional(),
  owner_username: z.string().trim().optional(),
  owner_telegram_id: z.string().trim().optional(),
});

export async function createServerAction(
  formData: FormData
): Promise<ServerManageResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat menambahkan server baru.",
    };
  }

  const parsed = createServerSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    router_host: formData.get("router_host"),
    router_port: formData.get("router_port"),
    ros_version: formData.get("ros_version") || "v6",
    connection_mode: formData.get("connection_mode") || "api_tcp",
    router_username: formData.get("router_username"),
    router_password: formData.get("router_password"),
    dns_name: formData.get("dns_name"),
    bot_token: formData.get("bot_token") || "",
    bot_username: formData.get("bot_username") || "",
    owner_username: formData.get("owner_username") || "",
    owner_telegram_id: formData.get("owner_telegram_id") || "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Data server tidak valid.",
    };
  }

  const v = parsed.data;
  if (v.ros_version === "v6" && v.connection_mode === "rest_api") {
    return {
      ok: false,
      message: "REST API hanya tersedia untuk RouterOS v7.",
    };
  }

  const ownerIdNum = v.owner_telegram_id
    ? Number(v.owner_telegram_id.replace(/[^\d-]/g, ""))
    : null;
  if (
    v.owner_telegram_id &&
    (!ownerIdNum || !Number.isSafeInteger(ownerIdNum))
  ) {
    return { ok: false, message: "ID Telegram Owner harus berupa angka." };
  }

  const admin = createAdminClient();

  try {
    // Check unique slug
    const { data: existingSlug } = await admin
      .from("servers")
      .select("id")
      .eq("slug", v.slug)
      .maybeSingle();
    if (existingSlug) {
      return {
        ok: false,
        message: `Slug "${v.slug}" sudah digunakan. Pilih slug lain (misal: server3).`,
      };
    }

    // Inherit shared PortalPulsa proxy URL from default server
    const { data: defSrv } = await admin
      .from("servers")
      .select("ppob_proxy_url")
      .eq("is_default", true)
      .maybeSingle();

    // 1. Insert MikroTik router row
    const { data: routerRow, error: routerErr } = await admin
      .from("routers")
      .insert({
        name: v.name,
        host: v.router_host,
        port: v.router_port,
        ros_version: v.ros_version,
        connection_mode: v.connection_mode,
        allow_self_signed_tls: true,
        username: v.router_username,
        password_encrypted: encryptSecret(v.router_password),
        dns_name: v.dns_name,
        is_default: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (routerErr || !routerRow) {
      throw new Error(routerErr?.message ?? "Gagal menyimpan data router.");
    }

    // 2. Insert server tenant row
    const webhookSecret = crypto.randomBytes(24).toString("hex");
    const { data: serverRow, error: srvErr } = await admin
      .from("servers")
      .insert({
        slug: v.slug,
        name: v.name,
        router_id: routerRow.id,
        bot_token_encrypted: v.bot_token ? encryptSecret(v.bot_token) : null,
        bot_username: v.bot_username
          ? v.bot_username.replace(/^@/, "")
          : null,
        bot_mode: "saldo_only",
        webhook_secret: webhookSecret,
        owner_username: v.owner_username
          ? v.owner_username.replace(/^@/, "")
          : null,
        owner_telegram_id: ownerIdNum,
        ppob_enabled: true,
        ppob_proxy_url: defSrv?.ppob_proxy_url ?? null,
        is_default: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (srvErr || !serverRow) {
      await admin.from("routers").delete().eq("id", routerRow.id);
      throw new Error(srvErr?.message ?? "Gagal membuat server baru.");
    }

    // 3. Seed default bot message templates for the new server
    await admin.rpc("seed_server_default_templates", {
      p_server_id: serverRow.id,
    });

    // 4. Switch active server cookie immediately to the newly created server
    const store = await cookies();
    store.set(ACTIVE_SERVER_COOKIE, serverRow.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Server "${v.name}" (${v.slug}) berhasil ditambahkan dan diaktifkan.`,
      serverId: serverRow.id,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menambahkan server baru.",
    };
  }
}

export async function renameServerAction(
  serverId: string,
  name: string
): Promise<ServerManageResult> {
  try {
    await requireAdmin();
    const cleaned = name.trim();
    if (cleaned.length < 2) {
      return { ok: false, message: "Nama server minimal 2 karakter." };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("servers")
      .update({ name: cleaned })
      .eq("id", serverId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/", "layout");
    return { ok: true, message: `Nama server diubah menjadi "${cleaned}".` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal mengubah nama.",
    };
  }
}

export async function deleteServerAction(
  serverId: string
): Promise<ServerManageResult> {
  try {
    const staff = await requireAdmin();
    if (staff.role !== "super_admin") {
      return {
        ok: false,
        message: "Hanya Super Admin yang dapat menghapus server.",
      };
    }

    const admin = createAdminClient();
    const { data: srv } = await admin
      .from("servers")
      .select("id, name, is_default, router_id")
      .eq("id", serverId)
      .maybeSingle();

    if (!srv) return { ok: false, message: "Server tidak ditemukan." };
    if (srv.is_default) {
      return {
        ok: false,
        message: "Server utama (default) tidak dapat dihapus.",
      };
    }

    const { error } = await admin
      .from("servers")
      .update({ is_active: false })
      .eq("id", serverId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Server "${srv.name}" dinonaktifkan (riwayat data tetap aman di database).`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menonaktifkan server.",
    };
  }
}
