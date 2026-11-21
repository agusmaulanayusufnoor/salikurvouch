import { createClient } from "@/lib/supabase/server";
import { SendVoucherClient } from "./send-client";

export const metadata = {
  title: "Generate & Kirim Voucher",
};

export default async function SendVoucherPage() {
  const supabase = await createClient();

  const [resellersRes, packagesRes] = await Promise.all([
    supabase
      .from("resellers")
      .select("id, telegram_id, username, balance")
      .eq("status", "active")
      .order("username", { ascending: true }),
    supabase
      .from("voucher_packages")
      .select(
        "id, name, mode, price, markup, mikrotik_profile, limit_uptime, limit_total_mb"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Generate &amp; Kirim Voucher Hotspot
        </h2>
        <p className="text-sm text-muted-foreground">
          Buat voucher satuan maupun batch (1–100), kirim otomatis ke Telegram
          reseller, dan cetak kartu PDF A4.
        </p>
      </div>

      <SendVoucherClient
        resellers={(resellersRes.data ?? []).map((r) => ({
          ...r,
          balance: Number(r.balance),
        }))}
        packages={(packagesRes.data ?? []).map((p) => ({
          ...p,
          price: Number(p.price),
          markup: Number(p.markup),
          limit_uptime: p.limit_uptime ?? "00:00:00",
        }))}
      />
    </div>
  );
}
