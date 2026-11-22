import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { getServerBySlug } from "@/lib/server-context";
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

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const server = await getServerBySlug(slug);
  if (!server || !server.is_active) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const incomingSecret =
    request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expectedSecret = server.webhook_secret ?? "";
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
    const result = await handleTelegramUpdate(
      update,
      (bgTask) => {
        after(async () => {
          try {
            await bgTask();
          } catch (err) {
            console.error(
              `[telegram-webhook:${server.slug}] background task error:`,
              err
            );
          }
        });
      },
      server.id
    );

    return NextResponse.json({ ok: true, server: server.slug, ...result });
  } catch (err) {
    console.error(`[telegram-webhook:${server.slug}] error:`, err);
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
