import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { PackagesClient, type VoucherPackageRow } from "./packages-client";

export const metadata = {
  title: "Paket Voucher Hotspot",
};

export default async function VoucherPackagesPage() {
  const [staff, supabase, activeServer] = await Promise.all([
    getAuthenticatedStaff(),
    createClient(),
    getActiveServer(),
  ]);

  const { data: pkgData } = await supabase
    .from("voucher_packages")
    .select("*")
    .eq("server_id", activeServer?.id ?? "")
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  const packages: VoucherPackageRow[] = (pkgData ?? []).map((p) => ({
    id: p.id,
    router_id: p.router_id,
    mode: p.mode as "saldo" | "nonsaldo",
    name: p.name,
    menu_label: p.menu_label,
    price: Number(p.price),
    markup: Number(p.markup),
    mikrotik_server: p.mikrotik_server,
    mikrotik_profile: p.mikrotik_profile,
    limit_uptime: p.limit_uptime ?? "00:00:00",
    limit_download_mb: p.limit_download_mb,
    limit_upload_mb: p.limit_upload_mb,
    limit_total_mb: p.limit_total_mb,
    login_type: p.login_type as "vc" | "up",
    char_type: p.char_type,
    code_length: p.code_length,
    card_color: p.card_color,
    sort_order: p.sort_order,
    is_active: p.is_active,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Konfigurasi Paket Voucher
        </h2>
        <p className="text-sm text-muted-foreground">
          CRUD dinamis paket voucher Hotspot (Mode Saldo &amp; Non-Saldo) dengan
          perhitungan markup dan batas kuota akurat.
        </p>
      </div>

      <PackagesClient
        packages={packages}
        defaultRouterId={activeServer?.router_id ?? null}
        isAdmin={staff?.role === "super_admin" || staff?.role === "admin"}
      />
    </div>
  );
}
