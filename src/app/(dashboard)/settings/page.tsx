import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
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

  const supabase = await createClient();
  const [routerRes, settingsRes] = await Promise.all([
    supabase
      .from("routers")
      .select(
        "id, name, host, port, ros_version, connection_mode, allow_self_signed_tls, username, password_encrypted, dns_name"
      )
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select(
        "bot_token_encrypted, bot_username, bot_mode, owner_username, owner_telegram_id, max_deposit_amount, low_balance_threshold, ppob_enabled, ppob_markup_small_pct, ppob_markup_large_pct, ppob_markup_threshold, ppob_proxy_url"
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const r = routerRes.data;
  const s = settingsRes.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Pengaturan Sistem
        </h2>
        <p className="text-sm text-muted-foreground">
          Konfigurasi MikroTik RouterOS (v6 &amp; v7), Bot Telegram, dan aturan
          markup Portal Pulsa (PPOB).
        </p>
      </div>

      <SettingsClient
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
          hasBotToken: Boolean(s?.bot_token_encrypted),
          bot_username: s?.bot_username ?? "",
          bot_mode:
            (s?.bot_mode as "saldo_only" | "nonsaldo_only" | "hybrid") ??
            "saldo_only",
          owner_username: s?.owner_username ?? "",
          owner_telegram_id: s?.owner_telegram_id
            ? String(s.owner_telegram_id)
            : "",
          max_deposit_amount: Number(s?.max_deposit_amount ?? 1000000),
          low_balance_threshold: Number(s?.low_balance_threshold ?? 10000),
          ppob_enabled: s?.ppob_enabled ?? true,
          ppob_markup_small_pct: Number(s?.ppob_markup_small_pct ?? 3),
          ppob_markup_large_pct: Number(s?.ppob_markup_large_pct ?? 1),
          ppob_markup_threshold: Number(s?.ppob_markup_threshold ?? 100000),
          ppob_proxy_url: s?.ppob_proxy_url ?? "",
        }}
      />
    </div>
  );
}
