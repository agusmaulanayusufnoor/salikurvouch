"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PortalPulsaProduct } from "@/lib/portalpulsa/client";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

export function PpobCatalogClient({
  products,
  initialQuery = "",
}: {
  products: PortalPulsaProduct[];
  initialQuery?: string;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "code">(
    "price_asc"
  );
  const [page, setPage] = useState(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const distinctOperators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const op = (p.operator || p.provider || "Lainnya").trim();
      counts.set(op, (counts.get(op) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [products]);

  const distinctSubTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const op = (p.operator || p.provider || "Lainnya").trim();
      if (operatorFilter !== "all" && op !== operatorFilter) continue;
      const sub = (p.providerSub || "").trim();
      if (!sub) continue;
      counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [products, operatorFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      const op = (p.operator || p.provider || "Lainnya").trim();
      const sub = (p.providerSub || "").trim();

      if (operatorFilter !== "all" && op !== operatorFilter) return false;
      if (subFilter !== "all" && sub !== subFilter) return false;
      if (
        statusFilter === "normal" &&
        p.status.trim().toLowerCase() !== "normal"
      ) {
        return false;
      }

      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        op.toLowerCase().includes(q) ||
        sub.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === "price_asc") return a.sellPrice - b.sellPrice;
      if (sortBy === "price_desc") return b.sellPrice - a.sellPrice;
      return a.code.localeCompare(b.code);
    });
  }, [products, search, operatorFilter, subFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  const hasActiveFilter =
    search.trim() !== "" ||
    operatorFilter !== "all" ||
    subFilter !== "all" ||
    statusFilter !== "all";

  function handleSelectOperator(nextOp: string) {
    setOperatorFilter(nextOp);
    setSubFilter("all");
    setPage(1);
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success(`Kode "${code}" disalin ke clipboard.`);
      setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 1500);
    } catch {
      toast.error("Gagal menyalin kode.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Quick Operator Pills */}
      {distinctOperators.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={operatorFilter === "all" ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => handleSelectOperator("all")}
          >
            Semua ({products.length})
          </Button>
          {distinctOperators.slice(0, 14).map(([op, cnt]) => (
            <Button
              key={op}
              type="button"
              size="sm"
              variant={operatorFilter === op ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => handleSelectOperator(op)}
            >
              {op} ({cnt})
            </Button>
          ))}
        </div>
      ) : null}

      {/* Filter Toolbar */}
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode (misal I5), deskripsi..."
            className="pl-9"
          />
        </div>

        <Select
          value={operatorFilter}
          onChange={(e) => handleSelectOperator(e.target.value)}
        >
          <option value="all">
            Semua Operator ({distinctOperators.length})
          </option>
          {distinctOperators.map(([op, cnt]) => (
            <option key={op} value={op}>
              {op} ({cnt})
            </option>
          ))}
        </Select>

        <Select
          value={subFilter}
          onChange={(e) => {
            setSubFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">
            Semua Jenis ({distinctSubTypes.length})
          </option>
          {distinctSubTypes.map(([sub, cnt]) => (
            <option key={sub} value={sub}>
              {sub} ({cnt})
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Status</option>
          <option value="normal">Normal Saja</option>
        </Select>

        <Select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as "price_asc" | "price_desc" | "code");
            setPage(1);
          }}
        >
          <option value="price_asc">Harga Termurah</option>
          <option value="price_desc">Harga Termahal</option>
          <option value="code">Kode A–Z</option>
        </Select>
      </div>

      {/* Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} produk
          </Badge>
          {operatorFilter !== "all" ? (
            <Badge variant="default" className="text-[11px]">
              Operator: {operatorFilter}
            </Badge>
          ) : null}
          {subFilter !== "all" ? (
            <Badge variant="warning" className="text-[11px]">
              Jenis: {subFilter}
            </Badge>
          ) : null}
          {hasActiveFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSearch("");
                setOperatorFilter("all");
                setSubFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
            >
              <X className="size-3.5" />
              Reset Filter
            </Button>
          ) : null}
        </div>
        <span className="text-muted-foreground">
          Klik kode produk untuk menyalin • Halaman {safePage} / {totalPages}
        </span>
      </div>

      {/* Product Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kode</TableHead>
            <TableHead>Operator</TableHead>
            <TableHead>Jenis</TableHead>
            <TableHead>Deskripsi Produk</TableHead>
            <TableHead className="text-right">Modal API</TableHead>
            <TableHead className="text-right">Harga Jual</TableHead>
            <TableHead className="text-right">Est. Laba</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-10 text-center text-muted-foreground"
              >
                Tidak ada produk yang cocok dengan filter saat ini.
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((p) => {
              const op = (p.operator || p.provider || "Lainnya").trim();
              const isCopied = copiedCode === p.code;
              return (
                <TableRow key={p.code}>
                  <TableCell className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(p.code)}
                      title="Klik untuk salin kode produk"
                      className="inline-flex items-center gap-1"
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer font-mono hover:bg-primary hover:text-primary-foreground"
                      >
                        {p.code}
                        {isCopied ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-2.5 opacity-60" />
                        )}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSelectOperator(op)}
                      className="hover:text-primary hover:underline"
                    >
                      {op}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {p.providerSub ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSubFilter(p.providerSub);
                          setPage(1);
                        }}
                        className="hover:text-primary hover:underline"
                      >
                        {p.providerSub}
                      </button>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{p.description}</TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                    {formatIDR(p.costPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold whitespace-nowrap">
                    {formatIDR(p.sellPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold whitespace-nowrap text-emerald-600">
                    +{formatIDR(p.profit)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
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
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination (25 per page) */}
      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length.toLocaleString("id-ID")} produk
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                Sebelumnya
              </Button>
              {pageNumbers.map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={num === safePage ? "default" : "outline"}
                  size="sm"
                  className="min-w-8 px-2 font-mono text-xs"
                  onClick={() => setPage(num)}
                >
                  {num}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
