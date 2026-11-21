import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import {
  getBotTokenFromSettings,
  getTelegramWebhookInfo,
  type TelegramWebhookInfo,
} from "@/lib/telegram/api";
import { WebhookClient } from "./webhook-client";

export const metadata = {
  title: "Webhook Manager Telegram",
};

export default async function WebhookPage() {
  const staff = await getAuthenticatedStaff();
  if (!staff || (staff.role !== "super_admin" && staff.role !== "admin")) {
    redirect("/");
  }

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "salikurvouch.vercel.app";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const defaultWebhookUrl = `${proto}://${host}/api/telegram/webhook`;

  const botConfig = await getBotTokenFromSettings();

  let webhookInfo: TelegramWebhookInfo | null = null;
  let webhookError: string | null = null;

  if (botConfig) {
    try {
      const res = await getTelegramWebhookInfo(botConfig.token);
      if (res.ok && res.result) {
        webhookInfo = res.result;
      } else {
        webhookError = res.description ?? "Response tidak valid";
      }
    } catch (err) {
      webhookError =
        err instanceof Error ? err.message : "Gagal menghubungi Telegram API";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Telegram Webhook Manager
        </h2>
        <p className="text-sm text-muted-foreground">
          Daftarkan, verifikasi, dan pantau status live webhook bot Telegram
          dengan keamanan `secret_token`.
        </p>
      </div>

      <WebhookClient
        defaultWebhookUrl={defaultWebhookUrl}
        botUsername={botConfig?.botUsername ?? null}
        hasBotToken={Boolean(botConfig)}
        initialSecret={botConfig?.webhookSecret ?? ""}
        webhookInfo={webhookInfo}
        webhookError={webhookError}
      />
    </div>
  );
}
