import { Users, Wallet, Ticket, UserCheck } from "lucide-react";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResellersClient } from "./resellers-client";

export const metadata = {
  title: "Daftar Reseller",
};

export default async function ResellersPage() {
  const [staff, supabase, activeServer] = await Promise.all([
    getAuthenticatedStaff(),
    createClient(),
    getActiveServer(),
  ]);

  const { data } = await supabase
    .from("resellers")
    .select(
      "id, telegram_id, username, phone, balance, vouchers_sold, reseller_type, status, joined_at, updated_at"
    )
    .eq("server_id", activeServer?.id ?? "")
    .order("balance", { ascending: false });

  const resellers = (data ?? []).map((r) => ({
    ...r,
    balance: Number(r.balance),
    reseller_type: r.reseller_type ?? "agent",
  }));

  const activeCount = resellers.filter((r) => r.status === "active").length;
  const totalBalance = resellers.reduce((s, r) => s + r.balance, 0);
  const totalSold = resellers.reduce((s, r) => s + r.vouchers_sold, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Manajemen Reseller (GoVoucher)
        </h2>
        <p className="text-sm text-muted-foreground">
          Kelola akun reseller, saldo deposit, status aktif, dan riwayat mutasi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Reseller
            </CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resellers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reseller Aktif
            </CardTitle>
            <UserCheck className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Saldo Mengendap
            </CardTitle>
            <Wallet className="size-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIDR(totalBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Voucher Terjual
            </CardTitle>
            <Ticket className="size-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSold.toLocaleString("id-ID")}
            </div>
          </CardContent>
        </Card>
      </div>

      <ResellersClient
        resellers={resellers}
        isAdmin={staff?.role === "super_admin" || staff?.role === "admin"}
      />
    </div>
  );
}
