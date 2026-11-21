import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ResellerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    txType?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const txType = sp.txType || "all";
  const from = sp.from || "";
  const to = sp.to || "";

  const supabase = await createClient();

  const { data: reseller } = await supabase
    .from("resellers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!reseller) {
    notFound();
  }

  let txQuery = supabase
    .from("wallet_transactions")
    .select(
      "id, tx_type, amount, voucher_price, markup_amount, balance_before, balance_after, voucher_username, voucher_profile, status, notes, created_at",
      { count: "exact" }
    )
    .eq("reseller_id", id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (txType !== "all") txQuery = txQuery.eq("tx_type", txType);
  if (from) txQuery = txQuery.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) txQuery = txQuery.lte("created_at", `${to}T23:59:59+07:00`);

  const { data: transactions, count } = await txQuery;
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const exportParams = new URLSearchParams({ resellerId: id });
  if (txType !== "all") exportParams.set("txType", txType);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    p.set("page", String(nextPage));
    if (txType !== "all") p.set("txType", txType);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return `/resellers/${id}?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon">
            <Link href="/resellers">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                @{reseller.username}
              </h2>
              <Badge
                variant={reseller.status === "active" ? "success" : "destructive"}
              >
                {reseller.status}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Telegram ID: {reseller.telegram_id} • Telp: {reseller.phone || "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/resellers/topup?tid=${reseller.telegram_id}`}>
              <Wallet className="size-4" />
              Top Up / Top Down
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exports/vouchers?format=xlsx&${exportParams.toString()}`}>
              <FileSpreadsheet className="size-4" />
              Export .xlsx
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exports/vouchers?format=csv&${exportParams.toString()}`}>
              <Download className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo Saat Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatIDR(Number(reseller.balance))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Voucher Terjual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reseller.vouchers_sold.toLocaleString("id-ID")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Mutasi (Filter Aktif)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRows.toLocaleString("id-ID")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Mutasi Saldo &amp; Voucher</CardTitle>
          <CardDescription>
            Halaman {page} dari {totalPages} ({totalRows.toLocaleString("id-ID")}{" "}
            baris)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-4">
            <Select name="txType" defaultValue={txType}>
              <option value="all">Semua Tipe</option>
              <option value="voucher_purchase">Pembelian Voucher</option>
              <option value="topup">Top Up</option>
              <option value="topdown">Top Down</option>
              <option value="ppob_purchase">PPOB Pulsa</option>
              <option value="refund">Refund</option>
              <option value="voucher_failed">Gagal</option>
            </Select>
            <Input type="date" name="from" defaultValue={from} />
            <Input type="date" name="to" defaultValue={to} />
            <Button type="submit" variant="secondary">
              Terapkan Filter
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Voucher / Catatan</TableHead>
                <TableHead className="text-right">Mutasi</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Saldo Akhir</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactions ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Belum ada mutasi pada rentang filter ini.
                  </TableCell>
                </TableRow>
              ) : (
                (transactions ?? []).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTimeID(tx.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tx.tx_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.voucher_username ? (
                        <span className="font-mono font-medium">
                          {tx.voucher_username}
                        </span>
                      ) : null}
                      {tx.voucher_profile ? (
                        <span className="ml-1.5 text-muted-foreground">
                          ({tx.voucher_profile})
                        </span>
                      ) : null}
                      {!tx.voucher_username && tx.notes ? (
                        <span className="text-muted-foreground">{tx.notes}</span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${
                        Number(tx.amount) >= 0
                          ? "text-emerald-600"
                          : "text-foreground"
                      }`}
                    >
                      {Number(tx.amount) >= 0 ? "+" : ""}
                      {formatIDR(Number(tx.amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatIDR(Number(tx.markup_amount ?? 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(Number(tx.balance_after))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tx.status === "success" ? "success" : "destructive"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, totalRows)} dari{" "}
              {totalRows.toLocaleString("id-ID")}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeft className="size-4" />
                    Sebelumnya
                  </Link>
                </Button>
              ) : null}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>
                    Berikutnya
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
