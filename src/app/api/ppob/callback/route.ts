import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  escapeHtml,
  getBotTokenFromSettings,
  sendTelegramMessage,
} from "@/lib/telegram/api";

export const runtime = "nodejs";

interface PortalPulsaCallbackPayload {
  trxid_api?: string;
  trxid?: string;
  code?: string;
  phone?: string;
  status?: string | number;
  note?: string;
  message?: string;
  sn?: string;
  price?: string | number;
}

function mapPortalPulsaStatus(
  rawStatus: string | number | undefined
): "SUCCESS" | "FAILED" | "PENDING" {
  const s = String(rawStatus ?? "").trim().toLowerCase();
  if (s === "4" || s === "success" || s === "sukses") return "SUCCESS";
  if (s === "2" || s === "failed" || s === "gagal" || s === "refund") {
    return "FAILED";
  }
  return "PENDING";
}

async function parsePayload(
  request: Request
): Promise<PortalPulsaCallbackPayload | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await request.json().catch(() => null)) as
      | (PortalPulsaCallbackPayload & { content?: string | PortalPulsaCallbackPayload })
      | null;
    if (!json) return null;
    if (typeof json.content === "string") {
      try {
        return JSON.parse(json.content) as PortalPulsaCallbackPayload;
      } catch {
        return json;
      }
    }
    if (json.content && typeof json.content === "object") {
      return json.content;
    }
    return json;
  }

  // PortalPulsa default POST sends form-urlencoded `content={...json...}` or flat fields
  const rawText = await request.text();
  const params = new URLSearchParams(rawText);
  const contentStr = params.get("content");
  if (contentStr) {
    try {
      return JSON.parse(contentStr) as PortalPulsaCallbackPayload;
    } catch {
      // fall through
    }
  }

  if (params.has("trxid_api") || params.has("trxid")) {
    return {
      trxid_api: params.get("trxid_api") ?? undefined,
      trxid: params.get("trxid") ?? undefined,
      code: params.get("code") ?? undefined,
      phone: params.get("phone") ?? undefined,
      status: params.get("status") ?? undefined,
      note: params.get("note") ?? undefined,
      message: params.get("message") ?? undefined,
      sn: params.get("sn") ?? undefined,
    };
  }

  try {
    return JSON.parse(rawText) as PortalPulsaCallbackPayload;
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "SalikurVouch PPOB Callback" });
}

export async function POST(request: Request) {
  try {
    const payload = await parsePayload(request);
    const trxId = String(payload?.trxid_api ?? "").trim();

    if (!payload || !trxId) {
      return NextResponse.json(
        { ok: false, error: "Invalid PortalPulsa callback payload" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: tx } = await admin
      .from("ppob_transactions")
      .select(
        "id, trx_id, product_code, target_number, status, serial_number, telegram_id"
      )
      .eq("trx_id", trxId)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "Transaction not found in SalikurVouch",
      });
    }

    const nextStatus = mapPortalPulsaStatus(payload.status);
    const nextSn = String(payload.sn ?? "").trim() || tx.serial_number || "";
    const note = String(payload.note ?? payload.message ?? "").trim();

    await admin
      .from("ppob_transactions")
      .update({
        status: nextStatus,
        serial_number: nextSn || null,
        raw_response: payload as unknown as Json,
      })
      .eq("id", tx.id);

    // Notify reseller via Telegram when status transitions to final state
    if (
      tx.telegram_id &&
      tx.status !== nextStatus &&
      (nextStatus === "SUCCESS" || nextStatus === "FAILED")
    ) {
      const bot = await getBotTokenFromSettings();
      if (bot?.token) {
        const icon = nextStatus === "SUCCESS" ? "✅" : "❌";
        const lines = [
          `${icon} <b>Update Transaksi PPOB (${nextStatus})</b>`,
          `<code>========================</code>`,
          `Trx ID : <code>${escapeHtml(tx.trx_id)}</code>`,
          `Produk : <code>${escapeHtml(tx.product_code)}</code>`,
          `Tujuan : <code>${escapeHtml(tx.target_number)}</code>`,
        ];
        if (nextSn) lines.push(`SN     : <code>${escapeHtml(nextSn)}</code>`);
        if (note) lines.push(`Ket    : ${escapeHtml(note)}`);

        await sendTelegramMessage({
          token: bot.token,
          chatId: tx.telegram_id,
          text: lines.join("\n"),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, trxId, status: nextStatus });
  } catch (err) {
    console.error("[ppob/callback] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Internal callback error",
      },
      { status: 500 }
    );
  }
}
