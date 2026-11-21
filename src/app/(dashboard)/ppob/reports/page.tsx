import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = {
  title: "Laporan Laba Portal Pulsa",
};

export default async function PpobReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from || "";
  const to = sp.to || "";

  const supabase = await createClient();
  let query = supabase
    .from("ppob_transactions")
    .select(
      "product_code, telegram_id, cost_price, sell_price, profit, status, resellers(username)"
    )
    .in("status", ["SUCCESS", "PROCESSED"]);

  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);

  const { data } = await query;
  const rows = data ?? [];

  const byReseller = new Map<
    string,
    { label: string; count: number; sales: number; cost: number; profit: number }
  >();
  const byProduct = new Map<
    string,
    { code: string; count: number; sales: number; cost: number; profit: number }
  >();

  let totalSales = 0;
  let totalCost = 0;
  let totalProfit = 0;

  for (const r of rows) {
    const res = Array.isArray(r.resellers) ? r.resellers[0] : r.resellers;
    const resKey = res?.username ? `@${res.username}` : `ID:${r.telegram_id}`;
    const sales = Number(r.sell_price);
    const cost = Number(r.cost_price);
    const profit = Number(r.profit);

    totalSales += sales;
    totalCost += cost;
    totalProfit += profit;

    const rEntry = byReseller.get(resKey) ?? {
      label: resKey,
      count: 0,
      sales: 0,
      cost: 0,
      profit: 0,
    };
    rEntry.count += 1;
    rEntry.sales += sales;
    rEntry.cost += cost;
    rEntry.profit += profit;
    byReseller.set(resKey, rEntry);

    const pEntry = byProduct.get(r.product_code) ?? {
      code: r.product_code,
      count: 0,
      sales: 0,
      cost: 0,
      profit: 0,
    };
    pEntry.count += 1;
    pEntry.sales += sales;
    pEntry.cost += cost;
    pEntry.profit += profit;
    byProduct.set(r.product_code, pEntry);
  }

  const resellerList = Array.from(byReseller.values()).sort(
    (a, b) => b.profit - a.profit
  );
  const productList = Array.from(byProduct.values()).sort(
    (a, b) => b.profit - a.profit
  );

  const qp = new URLSearchParams();
  if (from) qp.set("from", from);
  if (to) qp.set("to", to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Laporan Laba Portal Pulsa (PPOB)
          </h2>
          <p className="text-sm text-muted-foreground">
            Rekapitulasi omset, modal API, dan laba bersih per reseller maupun
            per kode produk.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exports/ppob?${qp.toString()}`}>
              <FileSpreadsheet className="size-4" />
              Export Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/print/ppob-report?${qp.toString()}`} target="_blank">
              <Printer className="size-4" />
              Cetak PDF A4
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Dari Tanggal
              </label>
              <Input type="date" name="from" defaultValue={from} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Sampai Tanggal
              </label>
              <Input type="date" name="to" defaultValue={to} />
            </div>
            <Button type="submit">Terapkan Periode</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Penjualan ({rows.length} trx)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatIDR(totalSales)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Modal API
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatIDR(totalCost)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Laba Bersih
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-600">
            {formatIDR(totalProfit)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rekap Laba per Reseller</CardTitle>
            <CardDescription>Diurutkan dari laba tertinggi</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reseller</TableHead>
                  <TableHead className="text-right">Trx</TableHead>
                  <TableHead className="text-right">Penjualan</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resellerList.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(r.sales)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600">
                      {formatIDR(r.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rekap Laba per Kode Produk</CardTitle>
            <CardDescription>Diurutkan dari laba tertinggi</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Trx</TableHead>
                  <TableHead className="text-right">Penjualan</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productList.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {p.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {p.count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(p.sales)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600">
                      {formatIDR(p.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
