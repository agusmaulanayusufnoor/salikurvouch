import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
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
