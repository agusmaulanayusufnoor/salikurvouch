"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PpobPrintToolbar({ count }: { count: number }) {
  return (
    <div className="print:hidden sticky top-0 z-20 mb-4 flex items-center justify-between border-b bg-white px-4 py-3 shadow-xs">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/ppob/transactions">
            <ArrowLeft className="size-4" />
            Kembali
          </Link>
        </Button>
        <p className="text-sm font-medium text-slate-700">
          Laporan Portal Pulsa ({count} transaksi) — A4 Landscape
        </p>
      </div>
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Cetak / Simpan PDF
      </Button>
    </div>
  );
}
