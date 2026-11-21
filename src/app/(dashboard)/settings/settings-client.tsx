"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Router,
  Bot,
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  PlugZap,
  Save,
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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  saveAppSettingsAction,
  saveRouterSettingsAction,
} from "./actions";
import type { TestConnectionResult } from "@/lib/mikrotik/types";

export interface RouterSettingsData {
  id: string;
  name: string;
  host: string;
  port: number;
  ros_version: "v6" | "v7";
  connection_mode: "api_tcp" | "api_ssl" | "rest_api";
  allow_self_signed_tls: boolean;
  username: string;
  hasPassword: boolean;
  dns_name: string;
}

export interface AppSettingsData {
  hasBotToken: boolean;
  bot_username: string;
  bot_mode: "saldo_only" | "nonsaldo_only" | "hybrid";
  owner_username: string;
  owner_telegram_id: string;
  max_deposit_amount: number;
  low_balance_threshold: number;
  ppob_enabled: boolean;
  ppob_markup_small_pct: number;
  ppob_markup_large_pct: number;
  ppob_markup_threshold: number;
  ppob_proxy_url: string;
}

export function SettingsClient({
  router,
  appSettings,
}: {
  router: RouterSettingsData | null;
  appSettings: AppSettingsData;
}) {
  // Router state
  const [routerName, setRouterName] = useState(router?.name ?? "SalikurNet");
  const [host, setHost] = useState(router?.host ?? "");
  const [rosVersion, setRosVersion] = useState<"v6" | "v7">(
    router?.ros_version ?? "v6"
  );
  const [connectionMode, setConnectionMode] = useState<
    "api_tcp" | "api_ssl" | "rest_api"
  >(router?.connection_mode ?? "api_tcp");
  const [port, setPort] = useState(String(router?.port ?? 8728));
  const [allowSelfSigned, setAllowSelfSigned] = useState(
    router?.allow_self_signed_tls ?? true
  );
  const [routerUsername, setRouterUsername] = useState(
    router?.username ?? "admin"
  );
  const [routerPassword, setRouterPassword] = useState("");
  const [dnsName, setDnsName] = useState(
    router?.dns_name ?? "wifi.salikur.net"
  );

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null
  );

  // Bot & PPOB state
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState(appSettings.bot_username);
  const [botMode, setBotMode] = useState(appSettings.bot_mode);
  const [ownerUsername, setOwnerUsername] = useState(
    appSettings.owner_username
  );
  const [ownerTelegramId, setOwnerTelegramId] = useState(
    appSettings.owner_telegram_id
  );
  const [maxDeposit, setMaxDeposit] = useState(
    String(appSettings.max_deposit_amount)
  );
  const [lowBalance, setLowBalance] = useState(
    String(appSettings.low_balance_threshold)
  );
  const [ppobEnabled, setPpobEnabled] = useState(appSettings.ppob_enabled);
  const [markupSmall, setMarkupSmall] = useState(
    String(appSettings.ppob_markup_small_pct)
  );
  const [markupLarge, setMarkupLarge] = useState(
    String(appSettings.ppob_markup_large_pct)
  );
  const [markupThreshold, setMarkupThreshold] = useState(
    String(appSettings.ppob_markup_threshold)
  );
  const [ppobProxyUrl, setPpobProxyUrl] = useState(appSettings.ppob_proxy_url);

  const [isSavingRouter, startRouterSave] = useTransition();
  const [isSavingApp, startAppSave] = useTransition();

  function handleRosVersionChange(nextVersion: "v6" | "v7") {
    setRosVersion(nextVersion);
    if (nextVersion === "v6" && connectionMode === "rest_api") {
      setConnectionMode("api_tcp");
      if (port === "443" || port === "80") setPort("8728");
    }
  }

  function handleConnectionModeChange(
    nextMode: "api_tcp" | "api_ssl" | "rest_api"
  ) {
    setConnectionMode(nextMode);
    if (nextMode === "rest_api" && (port === "8728" || port === "8729")) {
      setPort("443");
    } else if (nextMode === "api_ssl" && (port === "8728" || port === "443")) {
      setPort("8729");
    } else if (nextMode === "api_tcp" && (port === "8729" || port === "443")) {
      setPort("8728");
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mikrotik/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routerId: router?.id,
          name: routerName,
          host,
          port: Number(port) || 8728,
          rosVersion,
          connectionMode,
          allowSelfSignedTls: allowSelfSigned,
          username: routerUsername,
          password: routerPassword || undefined,
          dnsName,
        }),
      });
      const json = (await res.json()) as TestConnectionResult;
      setTestResult(json);
      if (json.ok) {
        toast.success(
          `Terhubung ke ${json.identity} (RouterOS ${json.version}) dalam ${json.latencyMs}ms`
        );
      } else {
        toast.error(json.error || "Gagal terhubung ke router MikroTik");
      }
    } catch {
      toast.error("Gagal mengirim permintaan test connection.");
    } finally {
      setIsTesting(false);
    }
  }

  function handleSaveRouter(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    if (router?.id) fd.set("id", router.id);
    fd.set("name", routerName);
    fd.set("host", host);
    fd.set("port", port);
    fd.set("ros_version", rosVersion);
    fd.set("connection_mode", connectionMode);
    fd.set("allow_self_signed_tls", String(allowSelfSigned));
    fd.set("username", routerUsername);
    fd.set("password", routerPassword);
    fd.set("dns_name", dnsName);

    startRouterSave(async () => {
      const res = await saveRouterSettingsAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setRouterPassword("");
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleSaveApp(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("bot_token", botToken);
    fd.set("bot_username", botUsername);
    fd.set("bot_mode", botMode);
    fd.set("owner_username", ownerUsername);
    fd.set("owner_telegram_id", ownerTelegramId);
    fd.set("max_deposit_amount", maxDeposit);
    fd.set("low_balance_threshold", lowBalance);
    fd.set("ppob_enabled", String(ppobEnabled));
    fd.set("ppob_markup_small_pct", markupSmall);
    fd.set("ppob_markup_large_pct", markupLarge);
    fd.set("ppob_markup_threshold", markupThreshold);
    fd.set("ppob_proxy_url", ppobProxyUrl);

    startAppSave(async () => {
      const res = await saveAppSettingsAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setBotToken("");
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Tabs defaultValue="router" className="space-y-4">
      <TabsList>
        <TabsTrigger value="router">
          <Router className="size-4" />
          MikroTik RouterOS (v6 &amp; v7)
        </TabsTrigger>
        <TabsTrigger value="bot">
          <Bot className="size-4" />
          Bot Telegram &amp; Owner
        </TabsTrigger>
        <TabsTrigger value="ppob">
          <Smartphone className="size-4" />
          Portal Pulsa (PPOB)
        </TabsTrigger>
      </TabsList>

      {/* TAB 1: MIKROTIK ROUTEROS v6 & v7 */}
      <TabsContent value="router" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Konfigurasi Router MikroTik</CardTitle>
                <CardDescription>
                  Mendukung <strong>RouterOS v6</strong> (TCP/SSL API) dan{" "}
                  <strong>RouterOS v7</strong> (REST API HTTPS &amp; TCP/SSL
                  API). Password disimpan terenkripsi AES-256-GCM.
                </CardDescription>
              </div>
              <Badge variant={rosVersion === "v7" ? "success" : "secondary"}>
                Mode: ROS {rosVersion.toUpperCase()} ({connectionMode})
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveRouter} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="router-name">Nama Router</Label>
                  <Input
                    id="router-name"
                    value={routerName}
                    onChange={(e) => setRouterName(e.target.value)}
                    placeholder="SalikurNet"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dns-name">DNS Login Hotspot</Label>
                  <Input
                    id="dns-name"
                    value={dnsName}
                    onChange={(e) => setDnsName(e.target.value)}
                    placeholder="wifi.salikur.net"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="ros-version">Versi RouterOS</Label>
                  <Select
                    id="ros-version"
                    value={rosVersion}
                    onChange={(e) =>
                      handleRosVersionChange(e.target.value as "v6" | "v7")
                    }
                  >
                    <option value="v6">RouterOS v6 (6.x)</option>
                    <option value="v7">RouterOS v7 (7.x)</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="connection-mode">Mode Koneksi API</Label>
                  <Select
                    id="connection-mode"
                    value={connectionMode}
                    onChange={(e) =>
                      handleConnectionModeChange(
                        e.target.value as "api_tcp" | "api_ssl" | "rest_api"
                      )
                    }
                  >
                    <option value="api_tcp">Binary API TCP (default 8728)</option>
                    <option value="api_ssl">Binary API SSL (default 8729)</option>
                    {rosVersion === "v7" ? (
                      <option value="rest_api">
                        REST API HTTPS (v7 — optimal untuk Vercel)
                      </option>
                    ) : null}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="router-port">Port</Label>
                  <Input
                    id="router-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    min={1}
                    max={65535}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="router-host">Host / IP Publik / DDNS</Label>
                  <Input
                    id="router-host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="167.99.68.60 atau vpn.salikur.net"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="router-user">Username MikroTik</Label>
                  <Input
                    id="router-user"
                    value={routerUsername}
                    onChange={(e) => setRouterUsername(e.target.value)}
                    placeholder="admin"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="router-pass">
                    Password MikroTik{" "}
                    {router?.hasPassword ? (
                      <span className="text-xs text-muted-foreground">
                        (kosongkan jika tidak diubah)
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="router-pass"
                    type="password"
                    value={routerPassword}
                    onChange={(e) => setRouterPassword(e.target.value)}
                    placeholder={
                      router?.hasPassword ? "•••••••• (tersimpan)" : "Masukkan password"
                    }
                  />
                </div>
              </div>

              {connectionMode !== "api_tcp" ? (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Izinkan Sertifikat TLS Self-Signed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aktifkan jika MikroTik menggunakan sertifikat SSL buatan sendiri
                      pada `www-ssl` / `api-ssl`.
                    </p>
                  </div>
                  <Switch
                    checked={allowSelfSigned}
                    onCheckedChange={setAllowSelfSigned}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isSavingRouter}>
                  {isSavingRouter ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Simpan Pengaturan Router
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  Test Connection Live
                </Button>
              </div>
            </form>

            {testResult ? (
              <div
                className={`mt-5 rounded-lg border p-4 text-sm ${
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                  {testResult.ok
                    ? "Koneksi RouterOS Berhasil"
                    : "Koneksi RouterOS Gagal"}
                  <Badge variant="outline" className="ml-auto font-mono">
                    {testResult.latencyMs} ms
                  </Badge>
                </div>

                {testResult.ok ? (
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Identity</dt>
                      <dd className="font-semibold">{testResult.identity}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">RouterOS Terdeteksi</dt>
                      <dd className="font-semibold">
                        {testResult.version} ({testResult.detectedMajorVersion})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Board Model</dt>
                      <dd className="font-semibold">{testResult.boardName || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Uptime / Suhu</dt>
                      <dd className="font-semibold">
                        {testResult.uptime || "-"}{" "}
                        {testResult.temperatureC !== null &&
                        testResult.temperatureC !== undefined
                          ? `(${testResult.temperatureC}°C)`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 font-mono text-xs">{testResult.error}</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      {/* TAB 2: BOT TELEGRAM & OWNER */}
      <TabsContent value="bot">
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Bot Telegram &amp; Owner</CardTitle>
            <CardDescription>
              Satu webhook terpadu mendukung mode Saldo, Non-Saldo, maupun Hybrid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveApp} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bot-token">
                    Token Bot Telegram{" "}
                    {appSettings.hasBotToken ? (
                      <span className="text-xs text-muted-foreground">
                        (terenkripsi — kosongkan jika tetap)
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="bot-token"
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={
                      appSettings.hasBotToken
                        ? "•••••••• (tersimpan)"
                        : "123456:ABC-DEF..."
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot-username">Username Bot</Label>
                  <Input
                    id="bot-username"
                    value={botUsername}
                    onChange={(e) => setBotUsername(e.target.value)}
                    placeholder="MikSalikurBot"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="bot-mode">Mode Operasi Bot</Label>
                  <Select
                    id="bot-mode"
                    value={botMode}
                    onChange={(e) =>
                      setBotMode(
                        e.target.value as "saldo_only" | "nonsaldo_only" | "hybrid"
                      )
                    }
                  >
                    <option value="saldo_only">Saldo Only (Reseller)</option>
                    <option value="nonsaldo_only">Non-Saldo Only (Admin)</option>
                    <option value="hybrid">Hybrid (Saldo + Non-Saldo)</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-username">Username Owner</Label>
                  <Input
                    id="owner-username"
                    value={ownerUsername}
                    onChange={(e) => setOwnerUsername(e.target.value)}
                    placeholder="agusmyn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-tid">Telegram ID Owner</Label>
                  <Input
                    id="owner-tid"
                    value={ownerTelegramId}
                    onChange={(e) => setOwnerTelegramId(e.target.value)}
                    placeholder="150377182"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max-deposit">Batas Maksimal Request Deposit (Rp)</Label>
                  <Input
                    id="max-deposit"
                    type="number"
                    value={maxDeposit}
                    onChange={(e) => setMaxDeposit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="low-balance">Peringatan Saldo Rendah (Rp)</Label>
                  <Input
                    id="low-balance"
                    type="number"
                    value={lowBalance}
                    onChange={(e) => setLowBalance(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" disabled={isSavingApp}>
                {isSavingApp ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Simpan Pengaturan Bot
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      {/* TAB 3: PORTAL PULSA (PPOB) */}
      <TabsContent value="ppob">
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Portal Pulsa (PPOB)</CardTitle>
            <CardDescription>
              Aturan markup harga jual otomatis &amp; opsi Static-IP Proxy untuk
              whitelist PortalPulsa.com saat deploy di Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveApp} className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Aktifkan Modul PPOB / Pulsa</p>
                  <p className="text-xs text-muted-foreground">
                    Mengizinkan perintah `/isipulsa`, `/pulsa`, `/pln`, `/game` di bot
                    dan transaksi PPOB di panel web.
                  </p>
                </div>
                <Switch
                  checked={ppobEnabled}
                  onCheckedChange={setPpobEnabled}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="markup-threshold">Batas Harga Modal (Rp)</Label>
                  <Input
                    id="markup-threshold"
                    type="number"
                    value={markupThreshold}
                    onChange={(e) => setMarkupThreshold(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="markup-small">
                    Markup di Bawah Batas (%)
                  </Label>
                  <Input
                    id="markup-small"
                    type="number"
                    step="0.1"
                    value={markupSmall}
                    onChange={(e) => setMarkupSmall(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="markup-large">
                    Markup &ge; Batas (%)
                  </Label>
                  <Input
                    id="markup-large"
                    type="number"
                    step="0.1"
                    value={markupLarge}
                    onChange={(e) => setMarkupLarge(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ppob-proxy">
                  Outbound Static-IP Proxy URL (Opsional untuk Vercel)
                </Label>
                <Input
                  id="ppob-proxy"
                  value={ppobProxyUrl}
                  onChange={(e) => setPpobProxyUrl(e.target.value)}
                  placeholder="http://user:pass@proxy-ip:port (kosongkan jika tidak perlu)"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  Kredensial API (`PORTALPULSA_USERID`, `KEY`, `SECRET`) dibaca aman
                  dari server environment variables.
                </p>
              </div>

              <Button type="submit" disabled={isSavingApp}>
                {isSavingApp ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Simpan Pengaturan PPOB
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
