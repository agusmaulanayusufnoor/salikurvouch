import Link from "next/link";
import { RefreshCw, Search, Wallet, AlertTriangle } from "lucide-react";
import {
  getPortalPulsaBalance,
  getPortalPulsaCatalog,
  type PpobCategory,
} from "@/lib/portalpulsa/client";
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
    getPortalPulsaCatalog(category, { keyword: q, bypassCache }),
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

          <form className="flex gap-2">
            <input type="hidden" name="category" value={category} />
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari kode / operator..."
                className="w-56 pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Cari
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {!catalogRes.ok ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Gagal memuat katalog {category}: {catalogRes.error}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Deskripsi Produk</TableHead>
                  <TableHead className="text-right">Modal API</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-right">Est. Laba</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogRes.products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Tidak ada produk ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  catalogRes.products.slice(0, 200).map((p) => (
                    <TableRow key={p.code}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {p.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {p.operator}
                      </TableCell>
                      <TableCell className="text-xs">{p.description}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatIDR(p.costPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatIDR(p.sellPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600">
                        +{formatIDR(p.profit)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status.toLowerCase() === "normal"
                              ? "success"
                              : "warning"
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
