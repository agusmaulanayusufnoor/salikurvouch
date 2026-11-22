"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/types";
import {
  deleteTelegramWebhook,
  getBotTokenFromSettings,
  setTelegramWebhook,
} from "@/lib/telegram/api";

export type ActionResult<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const routerSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Nama router minimal 2 karakter."),
  host: z.string().trim().min(3, "Host / IP MikroTik wajib diisi."),
  port: z.coerce.number().int().min(1).max(65535),
  ros_version: z.enum(["v6", "v7"]),
  connection_mode: z.enum(["api_tcp", "api_ssl", "rest_api"]),
  allow_self_signed_tls: z.boolean(),
  username: z.string().trim().min(1, "Username MikroTik wajib diisi."),
  password: z.string().optional(),
  dns_name: z.string().trim().min(1, "DNS Hotspot wajib diisi."),
});

export async function saveRouterSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat mengubah pengaturan router.",
    };
  }

  const parsed = routerSchema.safeParse({
    id: formData.get("id") || "",
    name: formData.get("name"),
    host: formData.get("host"),
    port: formData.get("port"),
    ros_version: formData.get("ros_version"),
    connection_mode: formData.get("connection_mode"),
    allow_self_signed_tls: formData.get("allow_self_signed_tls") === "true",
    username: formData.get("username"),
    password: formData.get("password") || "",
    dns_name: formData.get("dns_name"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Input router tidak valid.",
    };
  }

  const v = parsed.data;
  if (v.ros_version === "v6" && v.connection_mode === "rest_api") {
    return {
      ok: false,
      message:
        "REST API hanya didukung oleh RouterOS v7. Pilih api_tcp atau api_ssl untuk ROS v6.",
    };
  }

  const activeServer = await getActiveServer();
  const supabase = await createClient();

  try {
    const targetRouterId = v.id || activeServer.router_id || "";
    if (targetRouterId) {
      const updatePayload: TablesUpdate<"routers"> = {
        name: v.name,
        host: v.host,
        port: v.port,
        ros_version: v.ros_version,
        connection_mode: v.connection_mode,
        allow_self_signed_tls: v.allow_self_signed_tls,
        username: v.username,
        dns_name: v.dns_name,
      };
      if (v.password && v.password.length > 0) {
        updatePayload.password_encrypted = encryptSecret(v.password);
      }

      const { error } = await supabase
        .from("routers")
        .update(updatePayload)
        .eq("id", targetRouterId);
      if (error) throw error;
    } else {
      if (!v.password) {
        return {
          ok: false,
          message: "Password MikroTik wajib diisi untuk router baru.",
        };
      }
      const { data: inserted, error } = await supabase
        .from("routers")
        .insert({
          name: v.name,
          host: v.host,
          port: v.port,
          ros_version: v.ros_version,
          connection_mode: v.connection_mode,
          allow_self_signed_tls: v.allow_self_signed_tls,
          username: v.username,
          password_encrypted: encryptSecret(v.password),
          dns_name: v.dns_name,
          is_default: activeServer.is_default,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase
        .from("servers")
        .update({ router_id: inserted.id })
        .eq("id", activeServer.id);
    }

    revalidatePath("/settings");
    revalidatePath("/settings/servers");
    revalidatePath("/");
    return {
      ok: true,
      message: `Pengaturan Router MikroTik (${activeServer.name}) berhasil disimpan (password terenkripsi AES-256-GCM).`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menyimpan router.",
    };
  }
}

const appSettingsSchema = z.object({
  bot_token: z.string().trim().optional(),
  bot_username: z.string().trim().optional(),
  bot_mode: z.enum(["saldo_only", "nonsaldo_only", "hybrid"]),
  owner_username: z.string().trim().optional(),
  owner_telegram_id: z.string().trim().optional(),
  max_deposit_amount: z.coerce.number().min(10000),
  low_balance_threshold: z.coerce.number().min(0),
  ppob_enabled: z.boolean(),
  ppob_markup_small_pct: z.coerce.number().min(0).max(100),
  ppob_markup_large_pct: z.coerce.number().min(0).max(100),
  ppob_markup_threshold: z.coerce.number().min(0),
  ppob_proxy_url: z.string().trim().optional(),
});

export async function saveAppSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat mengubah pengaturan.",
    };
  }

  const parsed = appSettingsSchema.safeParse({
    bot_token: formData.get("bot_token") || "",
    bot_username: formData.get("bot_username") || "",
    bot_mode: formData.get("bot_mode") || "saldo_only",
    owner_username: formData.get("owner_username") || "",
    owner_telegram_id: formData.get("owner_telegram_id") || "",
    max_deposit_amount: formData.get("max_deposit_amount"),
    low_balance_threshold: formData.get("low_balance_threshold"),
    ppob_enabled: formData.get("ppob_enabled") === "true",
    ppob_markup_small_pct: formData.get("ppob_markup_small_pct"),
    ppob_markup_large_pct: formData.get("ppob_markup_large_pct"),
    ppob_markup_threshold: formData.get("ppob_markup_threshold"),
    ppob_proxy_url: formData.get("ppob_proxy_url") || "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Input pengaturan tidak valid.",
    };
  }

  const v = parsed.data;
  const ownerIdNum = v.owner_telegram_id
    ? Number(v.owner_telegram_id.replace(/[^\d-]/g, ""))
    : null;

  if (
    v.owner_telegram_id &&
    (!ownerIdNum || !Number.isSafeInteger(ownerIdNum))
  ) {
    return {
      ok: false,
      message: "Owner Telegram ID harus berupa angka valid.",
    };
  }

  if (v.ppob_proxy_url && !/^https?:\/\//i.test(v.ppob_proxy_url)) {
    return {
      ok: false,
      message: "Proxy URL harus diawali dengan http:// atau https://.",
    };
  }

  const activeServer = await getActiveServer();
  const supabase = await createClient();

  const secret =
    activeServer.webhook_secret || crypto.randomBytes(24).toString("hex");

  const serverPatch: TablesUpdate<"servers"> = {
    bot_username: v.bot_username ? v.bot_username.replace(/^@/, "") : null,
    bot_mode: v.bot_mode,
    owner_username: v.owner_username
      ? v.owner_username.replace(/^@/, "")
      : null,
    owner_telegram_id: ownerIdNum,
    max_deposit_amount: v.max_deposit_amount,
    low_balance_threshold: v.low_balance_threshold,
    ppob_enabled: v.ppob_enabled,
    ppob_markup_small_pct: v.ppob_markup_small_pct,
    ppob_markup_large_pct: v.ppob_markup_large_pct,
    ppob_markup_threshold: v.ppob_markup_threshold,
    ppob_proxy_url: v.ppob_proxy_url || null,
    webhook_secret: secret,
  };

  if (v.bot_token && v.bot_token.length > 0) {
    serverPatch.bot_token_encrypted = encryptSecret(v.bot_token);
  }

  const { error } = await supabase
    .from("servers")
    .update(serverPatch)
    .eq("id", activeServer.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  // Keep legacy app_settings id=1 synced for Server 1 backward compatibility
  if (activeServer.is_default) {
    await supabase
      .from("app_settings")
      .upsert(
        {
          id: 1,
          bot_username: serverPatch.bot_username,
          bot_mode: v.bot_mode,
          owner_username: serverPatch.owner_username,
          owner_telegram_id: ownerIdNum,
          max_deposit_amount: v.max_deposit_amount,
          low_balance_threshold: v.low_balance_threshold,
          ppob_enabled: v.ppob_enabled,
          ppob_markup_small_pct: v.ppob_markup_small_pct,
          ppob_markup_large_pct: v.ppob_markup_large_pct,
          ppob_markup_threshold: v.ppob_markup_threshold,
          ppob_proxy_url: v.ppob_proxy_url || null,
          webhook_secret: secret,
          ...(serverPatch.bot_token_encrypted
            ? { bot_token_encrypted: serverPatch.bot_token_encrypted }
            : {}),
        },
        { onConflict: "id" }
      );
  }

  revalidatePath("/settings");
  revalidatePath("/settings/servers");
  revalidatePath("/settings/webhook");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Pengaturan Bot Telegram & PPOB (${activeServer.name}) berhasil disimpan.`,
  };
}

const templateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .regex(
      /^[a-z0-9_]+$/,
      "Key hanya boleh huruf kecil, angka, dan underscore."
    ),
  label: z.string().trim().min(2, "Judul template wajib diisi."),
  content: z.string().trim().min(1, "Isi pesan tidak boleh kosong.").max(4096),
});

export async function upsertTemplateAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat mengelola template pesan.",
    };
  }

  const parsed = templateSchema.safeParse({
    key: formData.get("key"),
    label: formData.get("label"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Input template tidak valid.",
    };
  }

  const activeServer = await getActiveServer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bot_message_templates")
    .upsert(
      { ...parsed.data, server_id: activeServer.id },
      { onConflict: "server_id,key" }
    );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings/templates");
  return {
    ok: true,
    message: `Template "${parsed.data.label}" berhasil disimpan.`,
  };
}

export async function deleteTemplateAction(key: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat menghapus template.",
    };
  }

  const activeServer = await getActiveServer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bot_message_templates")
    .delete()
    .eq("server_id", activeServer.id)
    .eq("key", key);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings/templates");
  return { ok: true, message: "Template pesan berhasil dihapus." };
}

export async function setWebhookAction(
  webhookUrl: string,
  dropPendingUpdates = false
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Hanya admin yang dapat mengatur webhook." };
  }

  const trimmed = webhookUrl.trim();
  if (!/^https:\/\/.+/i.test(trimmed)) {
    return {
      ok: false,
      message: "URL Webhook Telegram wajib menggunakan HTTPS.",
    };
  }

  const activeServer = await getActiveServer();
  const botConfig = await getBotTokenFromSettings(activeServer.id);
  if (!botConfig) {
    return {
      ok: false,
      message: `Bot Token Telegram untuk ${activeServer.name} belum diatur di Pengaturan.`,
    };
  }

  let secret = botConfig.webhookSecret;
  if (!secret) {
    secret = crypto.randomBytes(24).toString("hex");
    const supabase = await createClient();
    await supabase
      .from("servers")
      .update({ webhook_secret: secret })
      .eq("id", activeServer.id);
    if (activeServer.is_default) {
      await supabase
        .from("app_settings")
        .update({ webhook_secret: secret })
        .eq("id", 1);
    }
  }

  try {
    const res = await setTelegramWebhook({
      token: botConfig.token,
      url: trimmed,
      secretToken: secret,
      dropPendingUpdates,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `Telegram menolak setWebhook: ${res.description ?? "Unknown error"}`,
      };
    }
    revalidatePath("/settings/webhook");
    return {
      ok: true,
      message: `Webhook Telegram (@${botConfig.botUsername ?? activeServer.slug}) berhasil didaftarkan.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menghubungi Telegram API.",
    };
  }
}

export async function unsetWebhookAction(
  dropPendingUpdates = false
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      message: "Hanya admin yang dapat menonaktifkan webhook.",
    };
  }

  const activeServer = await getActiveServer();
  const botConfig = await getBotTokenFromSettings(activeServer.id);
  if (!botConfig) {
    return { ok: false, message: "Bot Token Telegram belum diatur." };
  }

  try {
    const res = await deleteTelegramWebhook({
      token: botConfig.token,
      dropPendingUpdates,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `Gagal unset webhook: ${res.description ?? "Unknown error"}`,
      };
    }
    revalidatePath("/settings/webhook");
    return { ok: true, message: "Webhook Telegram berhasil dinonaktifkan." };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menghubungi Telegram API.",
    };
  }
}

export async function regenerateWebhookSecretAction(): Promise<
  ActionResult<string>
> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Forbidden" };
  }

  const activeServer = await getActiveServer();
  const newSecret = crypto.randomBytes(24).toString("hex");
  const supabase = await createClient();
  const { error } = await supabase
    .from("servers")
    .update({ webhook_secret: newSecret })
    .eq("id", activeServer.id);

  if (error) return { ok: false, message: error.message };

  if (activeServer.is_default) {
    await supabase
      .from("app_settings")
      .update({ webhook_secret: newSecret })
      .eq("id", 1);
  }

  revalidatePath("/settings/webhook");
  return {
    ok: true,
    message:
      "Webhook secret baru dibuat. Klik 'Set Webhook' agar Telegram memakai secret terbaru.",
    data: newSecret,
  };
}
