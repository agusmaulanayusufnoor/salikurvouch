import Link from "next/link";
import { RefreshCw, Wallet, AlertTriangle } from "lucide-react";
import {
  getPortalPulsaBalance,
  getPortalPulsaCatalog,
  type PpobCategory,
} from "@/lib/portalpulsa/client";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PpobCatalogClient } from "./catalog-client";

export const metadata = {
  title: "Katalog Harga & Saldo Portal Pulsa",
};

const CATEGORIES: PpobCategory[] = ["PULSA", "PLN", "GAME"];

export default async function PpobCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; refresh?: string }>;
}) {
  const sp = await searchParams;
  const category = (
    CATEGORIES.includes(sp.category?.toUpperCase() as PpobCategory)
      ? sp.category?.toUpperCase()
      : "PULSA"
  ) as PpobCategory;
  const q = sp.q?.trim() || "";
  const bypassCache = sp.refresh === "1";

  const [balanceRes, catalogRes] = await Promise.all([
    getPortalPulsaBalance(),
    getPortalPulsaCatalog(category, { bypassCache }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Katalog Harga &amp; Saldo API Portal Pulsa
          </h2>
          <p className="text-sm text-muted-foreground">
            Saldo live PortalPulsa.com dan daftar harga modal, markup, serta
            estimasi laba (cache 10 menit).
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href={`/ppob/catalog?category=${category}&refresh=1`}>
            <RefreshCw className="size-4" />
            Refresh Live API
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Saldo API PortalPulsa.com</CardTitle>
            <CardDescription>
              {balanceRes.ok
                ? balanceRes.rawMessage
                : "Pastikan IP server terdaftar di IP Whitelist PortalPulsa.com"}
            </CardDescription>
          </div>
          <Wallet className="size-5 text-primary" />
        </CardHeader>
        <CardContent>
          {balanceRes.ok ? (
            <div className="text-3xl font-bold text-emerald-600">
              {formatIDR(balanceRes.balance)}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{balanceRes.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                asChild
                size="sm"
                variant={cat === category ? "default" : "outline"}
              >
                <Link href={`/ppob/catalog?category=${cat}`}>{cat}</Link>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Pilih Operator &amp; Jenis (misal: Indosat → Reguler) untuk
            menemukan kode produk dengan cepat.
          </p>
        </CardHeader>
        <CardContent>
          {!catalogRes.ok ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Gagal memuat katalog {category}: {catalogRes.error}
            </div>
          ) : (
            <PpobCatalogClient
              products={catalogRes.products}
              initialQuery={q}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
