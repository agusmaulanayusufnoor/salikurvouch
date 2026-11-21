import { decryptSecret, isEncryptedSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface BotSettingsRuntime {
  token: string;
  botUsername: string | null;
  botMode: "saldo_only" | "nonsaldo_only" | "hybrid";
  webhookSecret: string | null;
  ownerTelegramId: number | null;
  ownerUsername: string | null;
  maxDepositAmount: number;
  lowBalanceThreshold: number;
  ppobEnabled: boolean;
  ppobMarkupSmallPct: number;
  ppobMarkupLargePct: number;
  ppobMarkupThreshold: number;
  ppobProxyUrl: string | null;
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function getBotTokenFromSettings(): Promise<BotSettingsRuntime | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!data?.bot_token_encrypted) return null;

  const token = isEncryptedSecret(data.bot_token_encrypted)
    ? decryptSecret(data.bot_token_encrypted)
    : data.bot_token_encrypted;

  if (!token) return null;

  return {
    token,
    botUsername: data.bot_username,
    botMode:
      (data.bot_mode as "saldo_only" | "nonsaldo_only" | "hybrid") ||
      "saldo_only",
    webhookSecret: data.webhook_secret,
    ownerTelegramId: data.owner_telegram_id,
    ownerUsername: data.owner_username,
    maxDepositAmount: Number(data.max_deposit_amount ?? 1000000),
    lowBalanceThreshold: Number(data.low_balance_threshold ?? 10000),
    ppobEnabled: data.ppob_enabled ?? true,
    ppobMarkupSmallPct: Number(data.ppob_markup_small_pct ?? 3),
    ppobMarkupLargePct: Number(data.ppob_markup_large_pct ?? 1),
    ppobMarkupThreshold: Number(data.ppob_markup_threshold ?? 100000),
    ppobProxyUrl: data.ppob_proxy_url ?? null,
  };
}

async function telegramPost<T>(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  return (await res.json()) as TelegramApiResponse<T>;
}

export async function sendTelegramMessage(params: {
  token: string;
  chatId: number | string;
  text: string;
  parseMode?: "HTML" | "Markdown";
  inlineKeyboard?: TelegramInlineButton[][];
  disableWebPagePreview?: boolean;
}) {
  return telegramPost<{ message_id: number }>(params.token, "sendMessage", {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: params.parseMode ?? "HTML",
    disable_web_page_preview: params.disableWebPagePreview ?? true,
    ...(params.inlineKeyboard
      ? { reply_markup: { inline_keyboard: params.inlineKeyboard } }
      : {}),
  });
}

export async function sendLongTelegramMessage(params: {
  token: string;
  chatId: number | string;
  text: string;
  parseMode?: "HTML" | "Markdown";
  maxChunkLength?: number;
}) {
  const limit = params.maxChunkLength ?? 3900;
  if (params.text.length <= limit) {
    return [
      await sendTelegramMessage({
        token: params.token,
        chatId: params.chatId,
        text: params.text,
        parseMode: params.parseMode,
      }),
    ];
  }

  const lines = params.text.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > limit && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);

  const results = [];
  for (const chunk of chunks) {
    results.push(
      await sendTelegramMessage({
        token: params.token,
        chatId: params.chatId,
        text: chunk,
        parseMode: params.parseMode,
      })
    );
  }
  return results;
}

export async function sendTelegramPhotoBuffer(params: {
  token: string;
  chatId: number | string;
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
  caption?: string;
  parseMode?: "HTML" | "Markdown";
  inlineKeyboard?: TelegramInlineButton[][];
}): Promise<TelegramApiResponse<{ message_id: number }>> {
  const form = new FormData();
  form.set("chat_id", String(params.chatId));
  const bytes = new Uint8Array(params.buffer);
  form.set(
    "photo",
    new Blob([bytes], { type: params.mimeType ?? "image/png" }),
    params.filename ?? "voucher-qr.png"
  );
  if (params.caption) {
    form.set("caption", params.caption.slice(0, 1024));
    form.set("parse_mode", params.parseMode ?? "HTML");
  }
  if (params.inlineKeyboard) {
    form.set(
      "reply_markup",
      JSON.stringify({ inline_keyboard: params.inlineKeyboard })
    );
  }

  const res = await fetch(
    `https://api.telegram.org/bot${params.token}/sendPhoto`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15000),
    }
  );
  return (await res.json()) as TelegramApiResponse<{ message_id: number }>;
}

export async function sendTelegramPhotoByFileIdOrUrl(params: {
  token: string;
  chatId: number | string;
  photo: string;
  caption?: string;
  parseMode?: "HTML" | "Markdown";
  inlineKeyboard?: TelegramInlineButton[][];
}) {
  return telegramPost<{ message_id: number }>(params.token, "sendPhoto", {
    chat_id: params.chatId,
    photo: params.photo,
    caption: params.caption ? params.caption.slice(0, 1024) : undefined,
    parse_mode: params.parseMode ?? "HTML",
    ...(params.inlineKeyboard
      ? { reply_markup: { inline_keyboard: params.inlineKeyboard } }
      : {}),
  });
}

export async function answerTelegramCallback(params: {
  token: string;
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  return telegramPost<boolean>(params.token, "answerCallbackQuery", {
    callback_query_id: params.callbackQueryId,
    text: params.text?.slice(0, 200),
    show_alert: params.showAlert ?? false,
  });
}

export async function editTelegramMessageText(params: {
  token: string;
  chatId: number | string;
  messageId: number;
  text: string;
  parseMode?: "HTML" | "Markdown";
  inlineKeyboard?: TelegramInlineButton[][];
}) {
  return telegramPost(params.token, "editMessageText", {
    chat_id: params.chatId,
    message_id: params.messageId,
    text: params.text,
    parse_mode: params.parseMode ?? "HTML",
    ...(params.inlineKeyboard
      ? { reply_markup: { inline_keyboard: params.inlineKeyboard } }
      : {}),
  });
}

export async function sendTelegramChatAction(params: {
  token: string;
  chatId: number | string;
  action?: "typing" | "upload_photo";
}) {
  return telegramPost<boolean>(params.token, "sendChatAction", {
    chat_id: params.chatId,
    action: params.action ?? "typing",
  });
}

export async function setTelegramWebhook(params: {
  token: string;
  url: string;
  secretToken: string;
  dropPendingUpdates?: boolean;
}) {
  return telegramPost<boolean>(params.token, "setWebhook", {
    url: params.url,
    secret_token: params.secretToken,
    drop_pending_updates: params.dropPendingUpdates ?? false,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function deleteTelegramWebhook(params: {
  token: string;
  dropPendingUpdates?: boolean;
}) {
  return telegramPost<boolean>(params.token, "deleteWebhook", {
    drop_pending_updates: params.dropPendingUpdates ?? false,
  });
}

export async function getTelegramWebhookInfo(token: string) {
  return telegramPost<TelegramWebhookInfo>(token, "getWebhookInfo", {});
}

export async function getTelegramBotMe(token: string) {
  return telegramPost<{ id: number; username: string; first_name: string }>(
    token,
    "getMe",
    {}
  );
}
