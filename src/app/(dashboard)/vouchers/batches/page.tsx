import Link from "next/link";
import { Printer, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  title: "Riwayat Batch Voucher & Cetak PDF",
};

export default async function VoucherBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;

  const supabase = await createClient();
  const { data: batches, count } = await supabase
    .from("voucher_batches")
    .select(
      "id, batch_code, source, package_name, unit_price, quantity, deducted_balance, telegram_sent, telegram_error, created_at, resellers(username, telegram_id)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Riwayat Batch Voucher &amp; Cetak PDF
          </h2>
          <p className="text-sm text-muted-foreground">
            Total {totalRows.toLocaleString("id-ID")} batch tersimpan (termasuk
            arsip migrasi legacy) — siap cetak ulang kartu A4 4 kolom.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/vouchers/send">
            <Plus className="size-4" />
            Generate Batch Baru
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Batch</CardTitle>
          <CardDescription>
            Halaman {page} dari {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode Batch</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Reseller</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total Nilai</TableHead>
                <TableHead>Sumber &amp; Status</TableHead>
                <TableHead className="text-right">Cetak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(batches ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Belum ada batch voucher.
                  </TableCell>
                </TableRow>
              ) : (
                (batches ?? []).map((b) => {
                  const r = Array.isArray(b.resellers)
                    ? b.resellers[0]
                    : b.resellers;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {b.batch_code}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeID(b.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r ? `@${r.username}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{b.package_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {b.quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatIDR(Number(b.unit_price) * b.quantity)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{b.source}</Badge>
                          <Badge
                            variant={b.telegram_sent ? "success" : "warning"}
                          >
                            {b.telegram_sent ? "TG Terkirim" : "Belum Kirim TG"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/print/vouchers/${b.batch_code}`}
                            target="_blank"
                          >
                            <Printer className="size-3.5" />
                            Cetak A4
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Total {totalRows} batch
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/vouchers/batches?page=${page - 1}`}>
                    <ChevronLeft className="size-4" />
                    Sebelumnya
                  </Link>
                </Button>
              ) : null}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/vouchers/batches?page=${page + 1}`}>
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
