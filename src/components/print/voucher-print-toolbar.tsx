"use client";

import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function VoucherPrintToolbar({
  title,
  subtitle,
  count,
  pageCount,
  backHref = "/vouchers/batches",
  backLabel = "Kembali ke Batch",
}: {
  title: string;
  subtitle?: string;
  count: number;
  pageCount: number;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="print:hidden sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-xs">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
        <div>
          <p className="font-mono text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            {count} kartu voucher • {Math.max(1, pageCount)} halaman A4 Portrait
            (5 kolom × 10 baris, maks. 50/halaman)
            {subtitle ? ` • ${subtitle}` : ""}
          </p>
        </div>
      </div>

      <Button size="sm" onClick={() => window.print()} disabled={count === 0}>
        <Printer className="size-4" />
        Cetak / Simpan PDF (A4)
      </Button>
    </div>
  );
}
