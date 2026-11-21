import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  title: "Riwayat Mutasi Voucher & Saldo",
};

export default async function VoucherHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    txType?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const txType = sp.txType || "all";
  const from = sp.from || "";
  const to = sp.to || "";
  const q = sp.q?.trim() || "";

  const supabase = await createClient();

  let query = supabase
    .from("wallet_transactions")
    .select(
      "id, reseller_id, telegram_id, seller_name, tx_type, amount, voucher_price, markup_amount, balance_before, balance_after, voucher_username, voucher_profile, status, notes, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (txType !== "all") query = query.eq("tx_type", txType);
  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);
  if (q) {
    const safeQ = q.replace(/[%_,]/g, "");
    query = query.or(
      `seller_name.ilike.%${safeQ}%,voucher_username.ilike.%${safeQ}%,notes.ilike.%${safeQ}%`
    );
  }

  const { data: rows, count } = await query;
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const exportParams = new URLSearchParams();
  if (txType !== "all") exportParams.set("txType", txType);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (q) exportParams.set("q", q);

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams(exportParams);
    p.set("page", String(nextPage));
    return `/vouchers/history?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Riwayat Mutasi Voucher &amp; Saldo
          </h2>
          <p className="text-sm text-muted-foreground">
            Server-side pagination atas {totalRows.toLocaleString("id-ID")} catatan
            mutasi historis &amp; real-time.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exports/vouchers?format=xlsx&${exportParams.toString()}`}>
              <FileSpreadsheet className="size-4" />
              Export Excel (.xlsx)
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter &amp; Pencarian</CardTitle>
          <CardDescription>
            Halaman {page} dari {totalPages.toLocaleString("id-ID")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari reseller, kode voucher, atau catatan..."
                className="pl-9"
              />
            </div>
            <Select name="txType" defaultValue={txType}>
              <option value="all">Semua Tipe Mutasi</option>
              <option value="voucher_purchase">Pembelian Voucher</option>
              <option value="voucher_nonsaldo">Voucher Non-Saldo</option>
              <option value="topup">Top Up</option>
              <option value="topdown">Top Down</option>
              <option value="ppob_purchase">PPOB Pulsa</option>
              <option value="refund">Refund</option>
              <option value="voucher_failed">Gagal</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" name="from" defaultValue={from} />
              <Input type="date" name="to" defaultValue={to} />
            </div>
            <Button type="submit">Filter</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu (WIB)</TableHead>
                <TableHead>Reseller</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Voucher / Profile</TableHead>
                <TableHead className="text-right">Mutasi</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Saldo Akhir</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Tidak ada transaksi yang cocok.
                  </TableCell>
                </TableRow>
              ) : (
                (rows ?? []).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTimeID(tx.created_at)}
                    </TableCell>
                    <TableCell>
                      {tx.reseller_id ? (
                        <Link
                          href={`/resellers/${tx.reseller_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          @{tx.seller_name || tx.telegram_id}
                        </Link>
                      ) : (
                        <span className="text-sm">
                          {tx.seller_name || tx.telegram_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tx.tx_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.voucher_username ? (
                        <span className="font-mono font-medium">
                          {tx.voucher_username}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {tx.notes || "-"}
                        </span>
                      )}
                      {tx.voucher_profile ? (
                        <span className="ml-1 text-muted-foreground">
                          [{tx.voucher_profile}]
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${
                        Number(tx.amount) >= 0 ? "text-emerald-600" : ""
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

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Menampilkan{" "}
              {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, totalRows)} dari{" "}
              {totalRows.toLocaleString("id-ID")} baris
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeft className="size-4" />
                    Sebelumnya
                  </Link>
                </Button>
              ) : null}
              <Badge variant="secondary" className="font-mono">
                {page} / {totalPages}
              </Badge>
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
