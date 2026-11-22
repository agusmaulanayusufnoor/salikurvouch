"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import {
  getBotTokenFromSettings,
  sendTelegramMessage,
  sendTelegramPhotoBuffer,
} from "@/lib/telegram/api";

export interface BroadcastActionResult {
  ok: boolean;
  message: string;
  sentCount?: number;
  failedCount?: number;
  failures?: Array<{ username: string; error: string }>;
}

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBroadcastAction(
  formData: FormData
): Promise<BroadcastActionResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: "Sesi login tidak valid." };
  }

  const targetType =
    formData.get("target_type") === "single" ? "single" : "all";
  const targetResellerId = String(formData.get("target_reseller_id") ?? "");
  const messageText = String(formData.get("message_text") ?? "").trim();
  const photoEntry = formData.get("photo");
  const photoFile =
    photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;

  if (!messageText && !photoFile) {
    return {
      ok: false,
      message: "Isi pesan atau pilih gambar untuk dikirim.",
    };
  }

  if (photoFile) {
    if (!ALLOWED_IMAGE_TYPES.includes(photoFile.type)) {
      return {
        ok: false,
        message: "Format gambar wajib PNG, JPG, atau WEBP.",
      };
    }
    if (photoFile.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Ukuran gambar maksimal 5 MB." };
    }
    if (messageText.length > 1024) {
      return {
        ok: false,
        message: "Caption foto Telegram maksimal 1024 karakter.",
      };
    }
  } else if (messageText.length > 4096) {
    return { ok: false, message: "Pesan teks Telegram maksimal 4096 karakter." };
  }

  const activeServer = await getActiveServer();
  if (!activeServer) {
    return { ok: false, message: "Server aktif tidak ditemukan." };
  }

  const bot = await getBotTokenFromSettings(activeServer.id);
  if (!bot) {
    return {
      ok: false,
      message: "Token Bot Telegram belum diatur di Pengaturan.",
    };
  }

  const supabase = await createClient();

  let targetQuery = supabase
    .from("resellers")
    .select("id, telegram_id, username")
    .eq("server_id", activeServer.id)
    .eq("status", "active");

  if (targetType === "single") {
    if (!targetResellerId) {
      return { ok: false, message: "Pilih reseller tujuan." };
    }
    targetQuery = targetQuery.eq("id", targetResellerId);
  }

  const { data: recipients, error: recErr } = await targetQuery;
  if (recErr) return { ok: false, message: recErr.message };

  const list = recipients ?? [];
  if (list.length === 0) {
    return { ok: false, message: "Tidak ada reseller aktif untuk dikirimi pesan." };
  }

  // Upload photo to private Supabase Storage bucket if provided
  let mediaPath: string | null = null;
  let photoBuffer: Buffer | null = null;
  if (photoFile) {
    const arrBuf = await photoFile.arrayBuffer();
    photoBuffer = Buffer.from(arrBuf);
    const ext =
      photoFile.type === "image/png"
        ? "png"
        : photoFile.type === "image/webp"
          ? "webp"
          : "jpg";
    mediaPath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${staff.username}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("broadcast-media")
      .upload(mediaPath, photoBuffer, {
        contentType: photoFile.type,
        upsert: false,
      });
    if (upErr) {
      // Non-fatal: still allow sending photo buffer directly to Telegram
      mediaPath = null;
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  const failures: Array<{ username: string; error: string }> = [];

  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    try {
      const res = photoBuffer
        ? await sendTelegramPhotoBuffer({
            token: bot.token,
            chatId: r.telegram_id,
            buffer: photoBuffer,
            filename: photoFile?.name || "broadcast.jpg",
            mimeType: photoFile?.type || "image/jpeg",
            caption: messageText || undefined,
          })
        : await sendTelegramMessage({
            token: bot.token,
            chatId: r.telegram_id,
            text: messageText,
          });

      if (res.ok) {
        sentCount++;
      } else {
        failedCount++;
        failures.push({
          username: r.username,
          error: res.description ?? "Telegram rejected",
        });
      }
    } catch (err) {
      failedCount++;
      failures.push({
        username: r.username,
        error: err instanceof Error ? err.message : "Network error",
      });
    }

    // Throttle ~20 messages/sec to stay safely below Telegram 30 msg/s limit
    if (i < list.length - 1) {
      await sleep(50);
    }
  }

  await supabase.from("broadcast_logs").insert({
    server_id: activeServer.id,
    target_scope:
      targetType === "single"
        ? `single:${list[0]?.telegram_id ?? ""}`
        : "all",
    message_type: photoBuffer ? "photo" : "text",
    content: messageText || null,
    media_path: mediaPath,
    total_targets: list.length,
    success_count: sentCount,
    failed_count: failedCount,
    created_by: staff.userId,
  });

  revalidatePath("/broadcast");
  return {
    ok: true,
    message: `Broadcast selesai: ${sentCount} berhasil, ${failedCount} gagal dari ${list.length} penerima.`,
    sentCount,
    failedCount,
    failures,
  };
}
