import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
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

  const activeServer = await getActiveServer(undefined, staff);
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "app.salikur.net";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const defaultWebhookUrl = `${proto}://${host}/api/telegram/webhook/${activeServer.slug}`;

  const botConfig = await getBotTokenFromSettings(activeServer.id);

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
          Telegram Webhook Manager — {activeServer.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Daftarkan, verifikasi, dan pantau status live webhook bot{" "}
          <strong>
            {botConfig?.botUsername
              ? `@${botConfig.botUsername}`
              : activeServer.slug}
          </strong>{" "}
          dengan endpoint khusus{" "}
          <code>/api/telegram/webhook/{activeServer.slug}</code>.
        </p>
      </div>

      <WebhookClient
        key={activeServer.id}
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
