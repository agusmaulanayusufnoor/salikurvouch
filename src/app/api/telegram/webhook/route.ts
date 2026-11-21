import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram/bot-engine";

export const runtime = "nodejs";

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const incomingSecret =
    request.headers.get("x-telegram-bot-api-secret-token") ?? "";

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("webhook_secret")
    .eq("id", 1)
    .maybeSingle();

  const expectedSecret = settings?.webhook_secret ?? "";
  if (!expectedSecret || !timingSafeCompare(incomingSecret, expectedSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const result = await handleTelegramUpdate(update, (bgTask) => {
      after(async () => {
        try {
          await bgTask();
        } catch (err) {
          console.error("[telegram-webhook] background task error:", err);
        }
      });
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[telegram-webhook] error:", err);
    // Return 200 to prevent Telegram retry storm while logging server-side
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
