import Link from "next/link";
import {
  FileSpreadsheet,
  Printer,
  Search,
  Smartphone,
  TrendingUp,
  Wallet,
  Coins,
} from "lucide-react";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PpobTransactionsClient,
  type PpobTxRow,
} from "./transactions-client";

export const metadata = {
  title: "Transaksi Portal Pulsa (PPOB)",
};

export default async function PpobTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    resellerId?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const from = sp.from || "";
  const to = sp.to || "";
  const resellerId = sp.resellerId || "all";
  const status = sp.status || "all";
  const q = sp.q?.trim() || "";

  const [staff, supabase] = await Promise.all([
    getAuthenticatedStaff(),
    createClient(),
  ]);

  let txQuery = supabase
    .from("ppob_transactions")
    .select(
      "id, trx_id, reseller_id, telegram_id, product_code, target_number, customer_id, cost_price, sell_price, profit, status, serial_number, description, source, raw_response, created_at, resellers(username)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (resellerId !== "all") txQuery = txQuery.eq("reseller_id", resellerId);
  if (status !== "all") txQuery = txQuery.eq("status", status);
  if (from) txQuery = txQuery.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) txQuery = txQuery.lte("created_at", `${to}T23:59:59+07:00`);
  if (q) {
    const safeQ = q.replace(/[%_,]/g, "");
    txQuery = txQuery.or(
      `trx_id.ilike.%${safeQ}%,product_code.ilike.%${safeQ}%,target_number.ilike.%${safeQ}%,description.ilike.%${safeQ}%`
    );
  }

  const [txRes, resellersRes] = await Promise.all([
    txQuery,
    supabase
      .from("resellers")
      .select("id, username, telegram_id")
      .order("username", { ascending: true }),
  ]);

  const rows: PpobTxRow[] = (txRes.data ?? []).map((r) => {
    const res = Array.isArray(r.resellers) ? r.resellers[0] : r.resellers;
    return {
      id: r.id,
      trx_id: r.trx_id,
      reseller_id: r.reseller_id,
      telegram_id: r.telegram_id,
      reseller_username: res?.username ?? null,
      product_code: r.product_code,
      target_number: r.target_number,
      customer_id: r.customer_id,
      cost_price: Number(r.cost_price),
      sell_price: Number(r.sell_price),
      profit: Number(r.profit),
      status: r.status as PpobTxRow["status"],
      serial_number: r.serial_number ?? "",
      description: r.description,
      source: r.source,
      raw_response: r.raw_response,
      created_at: r.created_at,
    };
  });

  const okRows = rows.filter(
    (r) => r.status === "SUCCESS" || r.status === "PROCESSED"
  );
  const failedCount = rows.filter((r) => r.status === "FAILED").length;
  const totalSales = okRows.reduce((s, r) => s + r.sell_price, 0);
  const totalCost = okRows.reduce((s, r) => s + r.cost_price, 0);
  const totalProfit = okRows.reduce((s, r) => s + r.profit, 0);
  const marginPct = totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : "0.00";

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (resellerId !== "all") exportParams.set("resellerId", resellerId);
  if (status !== "all") exportParams.set("status", status);
  if (q) exportParams.set("q", q);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Transaksi Portal Pulsa (PPOB)
          </h2>
          <p className="text-sm text-muted-foreground">
            Pencatatan transaksi Pulsa, PLN, dan Game dari Bot Telegram maupun
            input manual web.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exports/ppob?${exportParams.toString()}`}>
              <FileSpreadsheet className="size-4" />
              Export Excel (.xlsx)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/print/ppob-report?${exportParams.toString()}`}
              target="_blank"
            >
              <Printer className="size-4" />
              Cetak PDF A4 Landscape
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transaksi Sukses / Gagal
            </CardTitle>
            <Smartphone className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {okRows.length}{" "}
              <span className="text-sm font-normal text-destructive">
                / {failedCount} gagal
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Penjualan
            </CardTitle>
            <Wallet className="size-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIDR(totalSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Modal API
            </CardTitle>
            <Coins className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIDR(totalCost)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Laba Bersih &amp; Margin
            </CardTitle>
            <TrendingUp className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatIDR(totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">Margin {marginPct}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter &amp; Riwayat Transaksi</CardTitle>
          <CardDescription>
            Menampilkan {rows.length} transaksi terbaru sesuai filter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari TRX ID, kode produk, no tujuan..."
                className="pl-9"
              />
            </div>
            <Select name="resellerId" defaultValue={resellerId}>
              <option value="all">Semua Reseller</option>
              {(resellersRes.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.username}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={status}>
              <option value="all">Semua Status</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="PROCESSED">PROCESSED</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </Select>
            <div className="grid grid-cols-2 gap-1.5">
              <Input type="date" name="from" defaultValue={from} />
              <Input type="date" name="to" defaultValue={to} />
            </div>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>

          <PpobTransactionsClient
            rows={rows}
            resellers={resellersRes.data ?? []}
            isAdmin={staff?.role === "super_admin" || staff?.role === "admin"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
