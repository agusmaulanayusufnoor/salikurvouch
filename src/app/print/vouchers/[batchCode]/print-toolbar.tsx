"use client";

import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({
  batchCode,
  count,
}: {
  batchCode: string;
  count: number;
}) {
  return (
    <div className="print:hidden sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-xs">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/vouchers/batches">
            <ArrowLeft className="size-4" />
            Kembali ke Batch
          </Link>
        </Button>
        <div>
          <p className="font-mono text-sm font-bold text-slate-900">
            {batchCode}
          </p>
          <p className="text-xs text-slate-500">
            {count} kartu voucher • Format A4 Portrait 4 kolom (QR lokal)
          </p>
        </div>
      </div>

      <Button size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Cetak / Simpan PDF (A4)
      </Button>
    </div>
  );
}
