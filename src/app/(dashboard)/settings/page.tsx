import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, ArrowRight } from "lucide-react";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/database/backup-format";
import type { DatabaseStorageStats } from "@/components/settings/database-maintenance-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsClient } from "./settings-client";

export const metadata = {
  title: "Pengaturan Router, Bot & PPOB",
};

export default async function SettingsPage() {
  const staff = await getAuthenticatedStaff();
  if (!staff || (staff.role !== "super_admin" && staff.role !== "admin")) {
    redirect("/");
  }

  const activeServer = await getActiveServer(undefined, staff);
  const supabase = await createClient();

  let r = null;
  if (activeServer.router_id) {
    const { data } = await supabase
      .from("routers")
      .select(
        "id, name, host, port, ros_version, connection_mode, allow_self_signed_tls, username, password_encrypted, dns_name"
      )
      .eq("id", activeServer.router_id)
      .maybeSingle();
    r = data;
  }

  let dbStats: DatabaseStorageStats | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("rpc_get_database_storage_stats");
    if (data && typeof data === "object") {
      dbStats = data as unknown as DatabaseStorageStats;
    }
  } catch {
    // Non-blocking: settings page still loads if service_role key is absent locally
  }

  const dbPct = dbStats
    ? Math.min(100, (dbStats.db_size_bytes / dbStats.db_limit_bytes) * 100)
    : 0;
  const storagePct = dbStats
    ? Math.min(
        100,
        (dbStats.storage_size_bytes / dbStats.storage_limit_bytes) * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Pengaturan Sistem — {activeServer.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Konfigurasi MikroTik RouterOS (v6 &amp; v7), Bot Telegram, dan aturan
          markup Portal Pulsa (PPOB) khusus untuk server{" "}
          <span className="font-semibold text-foreground">
            {activeServer.name}
          </span>{" "}
          (<code className="font-mono">{activeServer.slug}</code>).
        </p>
      </div>

      {/* Ringkasan Status Storage Supabase Free Tier */}
      {dbStats ? (
        <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Database className="size-4 text-primary" />
              <span>Supabase Free Tier</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">DB:</span>
              <span className="font-mono font-medium">
                {formatBytes(dbStats.db_size_bytes)} / 500 MB
              </span>
              <Badge
                variant={
                  dbPct >= 85
                    ? "destructive"
                    : dbPct >= 70
                      ? "warning"
                      : "success"
                }
              >
                {dbPct.toFixed(1)}%
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Storage:</span>
              <span className="font-mono font-medium">
                {formatBytes(dbStats.storage_size_bytes)} / 1 GB
              </span>
              <Badge variant={storagePct >= 80 ? "warning" : "secondary"}>
                {storagePct.toFixed(1)}%
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/database">
              Backup, Restore &amp; Cutoff
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : null}

      <SettingsClient
        key={activeServer.id}
        router={
          r
            ? {
                id: r.id,
                name: r.name,
                host: r.host,
                port: r.port,
                ros_version: r.ros_version as "v6" | "v7",
                connection_mode: r.connection_mode as
                  | "api_tcp"
                  | "api_ssl"
                  | "rest_api",
                allow_self_signed_tls: r.allow_self_signed_tls,
                username: r.username,
                hasPassword: Boolean(r.password_encrypted),
                dns_name: r.dns_name,
              }
            : null
        }
        appSettings={{
          hasBotToken: Boolean(activeServer.bot_token_encrypted),
          bot_username: activeServer.bot_username ?? "",
          bot_mode: activeServer.bot_mode,
          owner_username: activeServer.owner_username ?? "",
          owner_telegram_id: activeServer.owner_telegram_id
            ? String(activeServer.owner_telegram_id)
            : "",
          max_deposit_amount: activeServer.max_deposit_amount,
          low_balance_threshold: activeServer.low_balance_threshold,
          ppob_enabled: activeServer.ppob_enabled,
          ppob_markup_small_pct: activeServer.ppob_markup_small_pct,
          ppob_markup_large_pct: activeServer.ppob_markup_large_pct,
          ppob_markup_threshold: activeServer.ppob_markup_threshold,
          ppob_proxy_url: activeServer.ppob_proxy_url ?? "",
        }}
      />
    </div>
  );
}
