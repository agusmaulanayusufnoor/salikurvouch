"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Webhook,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  KeyRound,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { TelegramWebhookInfo } from "@/lib/telegram/api";
import {
  regenerateWebhookSecretAction,
  setWebhookAction,
  unsetWebhookAction,
} from "../actions";

export function WebhookClient({
  defaultWebhookUrl,
  botUsername,
  hasBotToken,
  initialSecret,
  webhookInfo,
  webhookError,
}: {
  defaultWebhookUrl: string;
  botUsername: string | null;
  hasBotToken: boolean;
  initialSecret: string;
  webhookInfo: TelegramWebhookInfo | null;
  webhookError: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(webhookInfo?.url || defaultWebhookUrl);
  const [secret, setSecret] = useState(initialSecret);
  const [dropPending, setDropPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSetWebhook(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await setWebhookAction(url, dropPending);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleUnsetWebhook() {
    if (!confirm("Nonaktifkan Webhook Telegram sekarang?")) return;
    startTransition(async () => {
      const res = await unsetWebhookAction(dropPending);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleRegenerateSecret() {
    if (
      !confirm(
        "Buat Webhook Secret baru? Setelah ini Anda harus klik Set Webhook lagi."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await regenerateWebhookSecretAction();
      if (res.ok && res.data) {
        setSecret(res.data);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  }

  async function handleCopySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    toast.success("Webhook secret disalin ke clipboard.");
  }

  const isActive = Boolean(webhookInfo?.url);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Status Live Webhook</CardTitle>
              <CardDescription>
                Bot: {botUsername ? `@${botUsername}` : "Belum dikonfigurasi"}
              </CardDescription>
            </div>
            <Badge variant={isActive ? "success" : "warning"}>
              {isActive ? "Aktif" : "Non-Aktif"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasBotToken ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Token Bot Telegram belum diatur. Silakan isi di menu{" "}
                <strong>Pengaturan → Bot Telegram</strong> terlebih dahulu.
              </span>
            </div>
          ) : webhookError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Gagal mengambil `getWebhookInfo`: {webhookError}
            </div>
          ) : webhookInfo ? (
            <dl className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">URL Aktif di Telegram</dt>
                <dd className="mt-0.5 break-all font-mono text-xs font-medium">
                  {webhookInfo.url || "(kosong / belum terdaftar)"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Pending Updates</dt>
                  <dd className="mt-0.5 text-lg font-bold">
                    {webhookInfo.pending_update_count}
                  </dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">IP Server</dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium">
                    {webhookInfo.ip_address || "-"}
                  </dd>
                </div>
              </div>
              {webhookInfo.last_error_message ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="font-semibold">Error Terakhir Telegram:</p>
                  <p className="mt-1">{webhookInfo.last_error_message}</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                  <CheckCircle2 className="size-4" />
                  Tidak ada error pengiriman webhook terbaru.
                </div>
              )}
            </dl>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="size-4" />
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kelola Endpoint Webhook</CardTitle>
          <CardDescription>
            Otomatis mengirim header keamanan `X-Telegram-Bot-Api-Secret-Token`
            saat mendaftar ke Telegram.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetWebhook} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL Webhook Next.js (HTTPS)</Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://salikurvouch.vercel.app/api/telegram/webhook"
                required
              />
              <p className="text-xs text-muted-foreground">
                Default terdeteksi: <span className="font-mono">{defaultWebhookUrl}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Secret Token (`X-Telegram-Bot-Api-Secret-Token`)</Label>
              <div className="flex gap-2">
                <Input
                  value={secret ? `${secret.slice(0, 8)}••••••••${secret.slice(-6)}` : "(belum ada)"}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                  disabled={!secret}
                  title="Salin Secret"
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRegenerateSecret}
                  disabled={isPending}
                  title="Generate Secret Baru"
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Drop Pending Updates</p>
                <p className="text-xs text-muted-foreground">
                  Buang antrean pesan lama saat mengaktifkan/menonaktifkan webhook.
                </p>
              </div>
              <Switch checked={dropPending} onCheckedChange={setDropPending} />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={isPending || !hasBotToken}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Webhook className="size-4" />
                )}
                Set Webhook
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleUnsetWebhook}
                disabled={isPending || !hasBotToken}
              >
                <Trash2 className="size-4" />
                Unset Webhook
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
