import Link from "next/link";
import {
  Users,
  Wallet,
  Ticket,
  Smartphone,
  Router,
  Bot,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveServer } from "@/lib/server-context";
import { formatIDR, formatDateTimeID } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveRouterPanel } from "@/components/dashboard/live-router-panel";

function getLast14DayWindow() {
  const nowMs = new Date().getTime();
  const fourteenDaysAgo = new Date(
    nowMs - 14 * 24 * 60 * 60 * 1000
  ).toISOString();
  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dayKeys.push(
      new Date(nowMs + 7 * 3600_000 - i * 86400_000).toISOString().slice(0, 10)
    );
  }
  return { fourteenDaysAgo, dayKeys };
}

export default async function DashboardPage() {
  const [supabase, activeServer] = await Promise.all([
    createClient(),
    getActiveServer(),
  ]);
  const serverId = activeServer?.id ?? "";
  const { fourteenDaysAgo, dayKeys } = getLast14DayWindow();

  const [
    resellersRes,
    txCountRes,
    ppobCountRes,
    recentTxRes,
    trendTxRes,
    routerRes,
  ] = await Promise.all([
    supabase
      .from("resellers")
      .select("balance, vouchers_sold, status")
      .eq("server_id", serverId),
    supabase
      .from("wallet_transactions")
      .select("*", { count: "exact", head: true })
      .eq("server_id", serverId),
    supabase
      .from("ppob_transactions")
      .select("profit, sell_price, status")
      .eq("server_id", serverId),
    supabase
      .from("wallet_transactions")
      .select(
        "id, seller_name, tx_type, voucher_username, voucher_profile, notes, amount, voucher_price, balance_after, status, created_at"
      )
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("wallet_transactions")
      .select("voucher_price, created_at")
      .eq("server_id", serverId)
      .eq("tx_type", "voucher_purchase")
      .eq("status", "success")
      .gte("created_at", fourteenDaysAgo)
      .limit(5000),
    activeServer?.router_id
      ? supabase
          .from("routers")
          .select("id, name, ros_version, connection_mode")
          .eq("id", activeServer.router_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const resellers = resellersRes.data ?? [];
  const activeResellers = resellers.filter((r) => r.status === "active").length;
  const totalResellerBalance = resellers.reduce(
    (sum, r) => sum + Number(r.balance ?? 0),
    0
  );
  const totalVouchersSold = resellers.reduce(
    (sum, r) => sum + Number(r.vouchers_sold ?? 0),
    0
  );
  const totalWalletTx = txCountRes.count ?? 0;

  const ppobRows = ppobCountRes.data ?? [];
  const ppobSuccessProfit = ppobRows
    .filter((p) => p.status === "SUCCESS" || p.status === "PROCESSED")
    .reduce((sum, p) => sum + Number(p.profit ?? 0), 0);

  // Build 14-day daily sales trend (WIB)
  const dayBuckets = new Map<string, { qty: number; revenue: number }>();
  for (const d of dayKeys) {
    dayBuckets.set(d, { qty: 0, revenue: 0 });
  }
  for (const row of trendTxRes.data ?? []) {
    const dayKey = new Date(
      new Date(row.created_at).getTime() + 7 * 3600_000
    )
      .toISOString()
      .slice(0, 10);
    const bucket = dayBuckets.get(dayKey);
    if (bucket) {
      bucket.qty += 1;
      bucket.revenue += Number(row.voucher_price ?? 0);
    }
  }
  const trendData = Array.from(dayBuckets.entries()).map(([date, v]) => ({
    date,
    label: date.slice(5),
    ...v,
  }));
  const maxTrendRev = Math.max(1, ...trendData.map((d) => d.revenue));

  const recentTx = recentTxRes.data ?? [];
  const routerConfigured = Boolean(routerRes.data);
  const botConfigured = Boolean(activeServer?.bot_username);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Dashboard — {activeServer?.name ?? "SalikurNet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Ringkasan operasional server aktif (Voucher, Reseller &amp; Portal
            Pulsa PPOB)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={routerConfigured ? "success" : "warning"}>
            <Router className="size-3" />
            {routerConfigured
              ? `${routerRes.data?.name} (ROS ${routerRes.data?.ros_version})`
              : "Router Belum Dikonfigurasi"}
          </Badge>
          <Badge variant={botConfigured ? "success" : "warning"}>
            <Bot className="size-3" />
            {botConfigured
              ? `@${activeServer?.bot_username}`
              : "Bot Belum Dikonfigurasi"}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reseller Aktif
            </CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeResellers}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Dari total {resellers.length} reseller terdaftar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Saldo Reseller
            </CardTitle>
            <Wallet className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatIDR(totalResellerBalance)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Akumulasi saldo berjalan seluruh agen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Mutasi &amp; Voucher
            </CardTitle>
            <Ticket className="size-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalWalletTx.toLocaleString("id-ID")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalVouchersSold.toLocaleString("id-ID")} voucher tercatat di
              profil agen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Laba Portal Pulsa (PPOB)
            </CardTitle>
            <Smartphone className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatIDR(ppobSuccessProfit)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Dari {ppobRows.length.toLocaleString("id-ID")} transaksi PPOB
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time MikroTik Status Panel */}
      <LiveRouterPanel key={serverId || "default"} />

      {/* 14-day Sales Trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-primary" />
              Tren Penjualan Voucher 14 Hari Terakhir
            </CardTitle>
            <CardDescription>
              Total omset harian dari transaksi voucher berhasil (WIB)
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers/history">
              Riwayat Lengkap
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1.5 pt-4">
            {trendData.map((d) => {
              const pct = Math.max(
                d.revenue > 0 ? 8 : 2,
                Math.round((d.revenue / maxTrendRev) * 100)
              );
              return (
                <div
                  key={d.date}
                  className="group flex flex-1 flex-col items-center gap-1"
                  title={`${d.date}: ${d.qty} voucher (${formatIDR(d.revenue)})`}
                >
                  <div className="flex h-28 w-full items-end">
                    <div
                      className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Transaksi Mutasi Terbaru</CardTitle>
            <CardDescription>
              10 aktivitas terakhir pada ledger wallet_transactions
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/vouchers/history">
              Lihat Semua <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentTx.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Belum ada data mutasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2.5 pr-4">Waktu</th>
                    <th className="py-2.5 pr-4">Reseller</th>
                    <th className="py-2.5 pr-4">Kode Voucher</th>
                    <th className="py-2.5 pr-4 text-right">Mutasi</th>
                    <th className="py-2.5 pr-4 text-right">Saldo Akhir</th>
                    <th className="py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentTx.map((tx) => {
                    const fallbackLabel =
                      tx.tx_type === "topup"
                        ? "Top Up Saldo"
                        : tx.tx_type === "topdown"
                          ? "Top Down Saldo"
                          : tx.tx_type === "refund"
                            ? "Refund"
                            : tx.tx_type === "ppob_purchase"
                              ? tx.notes || "PPOB"
                              : tx.notes || tx.tx_type;
                    return (
                      <tr key={tx.id} className="hover:bg-muted/40">
                        <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                          {formatDateTimeID(tx.created_at)}
                        </td>
                        <td className="py-2.5 pr-4 font-medium">
                          {tx.seller_name || "-"}
                        </td>
                        <td className="py-2.5 pr-4">
                          {tx.voucher_username ? (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="font-mono text-xs"
                              >
                                {tx.voucher_username}
                              </Badge>
                              {tx.voucher_profile ? (
                                <span className="text-xs text-muted-foreground">
                                  ({tx.voucher_profile})
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span
                              className="inline-block max-w-[220px] truncate text-xs text-muted-foreground"
                              title={fallbackLabel}
                            >
                              {fallbackLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono">
                          {formatIDR(Number(tx.amount))}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono">
                          {formatIDR(Number(tx.balance_after))}
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              tx.status === "success"
                                ? "success"
                                : tx.status === "failed" ||
                                    tx.status === "refunded"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
