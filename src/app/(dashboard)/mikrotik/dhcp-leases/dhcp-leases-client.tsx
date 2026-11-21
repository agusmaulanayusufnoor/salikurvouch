"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search,
  UserX,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { DhcpLease } from "@/lib/mikrotik/types";
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
import { bulkKickDhcpLeasesAction, kickDhcpLeaseAction } from "./actions";

const PAGE_SIZE = 25;

export function DhcpLeasesClient({ leases }: { leases: DhcpLease[] }) {
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const distinctServers = useMemo(() => {
    const set = new Set<string>();
    for (const l of leases) {
      if (l.server) set.add(l.server);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leases]);

  const distinctStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const l of leases) {
      if (l.status) set.add(l.status);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leases.filter((l) => {
      if (serverFilter !== "all" && l.server !== serverFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (typeFilter === "dynamic" && !l.dynamic) return false;
      if (typeFilter === "static" && l.dynamic) return false;
      if (!q) return true;
      return (
        l.address.toLowerCase().includes(q) ||
        l.macAddress.toLowerCase().includes(q) ||
        l.hostName.toLowerCase().includes(q) ||
        l.server.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        l.comment.toLowerCase().includes(q)
      );
    });
  }, [leases, search, serverFilter, statusFilter, typeFilter]);

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
    serverFilter !== "all" ||
    statusFilter !== "all" ||
    typeFilter !== "all";

  function toggleRowSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectVisible() {
    const visibleIds = visibleRows.map((l) => l.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function handleKickOne(l: DhcpLease) {
    const label = l.hostName ? `${l.hostName} (${l.address})` : l.address || l.macAddress;
    if (!confirm(`Kick / hapus DHCP Lease "${label}" dari MikroTik?`)) return;
    setKickingId(l.id);
    startTransition(async () => {
      try {
        const res = await kickDhcpLeaseAction(l.id, label);
        if (res.ok) {
          toast.success(res.message);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(l.id);
            return next;
          });
        } else {
          toast.error(res.message);
        }
      } finally {
        setKickingId(null);
      }
    });
  }

  function handleBulkKick() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Yakin ingin kick / hapus ${ids.length} DHCP Lease terpilih?`)) {
      return;
    }
    startTransition(async () => {
      const res = await bulkKickDhcpLeasesAction(ids);
      if (res.ok) {
        toast.success(res.message);
        setSelectedIds(new Set());
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari IP address, MAC, hostname, server, comment..."
            className="pl-9"
          />
        </div>

        <Select
          value={serverFilter}
          onChange={(e) => {
            setServerFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Server ({distinctServers.length})</option>
          {distinctServers.map((s) => (
            <option key={s} value={s}>
              Server: {s}
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
          <option value="all">Semua Status ({distinctStatuses.length})</option>
          {distinctStatuses.map((st) => (
            <option key={st} value={st}>
              Status: {st}
            </option>
          ))}
        </Select>

        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Tipe</option>
          <option value="dynamic">Dynamic</option>
          <option value="static">Static</option>
        </Select>
      </div>

      {/* Summary & Bulk Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} lease
          </Badge>
          <span className="text-muted-foreground">
            Halaman {safePage} dari {totalPages} (25 / halaman)
          </span>
          {hasActiveFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSearch("");
                setServerFilter("all");
                setStatusFilter("all");
                setTypeFilter("all");
                setPage(1);
              }}
            >
              <X className="size-3.5" />
              Reset Filter
            </Button>
          ) : null}
        </div>

        {selectedIds.size > 0 ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleBulkKick}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserX className="size-3.5" />
            )}
            Kick Terpilih ({selectedIds.size})
          </Button>
        ) : null}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Pilih semua di halaman ini"
                checked={
                  visibleRows.length > 0 &&
                  visibleRows.every((l) => selectedIds.has(l.id))
                }
                onChange={toggleSelectVisible}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>Address</TableHead>
            <TableHead>MAC Address</TableHead>
            <TableHead>Host Name</TableHead>
            <TableHead>Server</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expires After</TableHead>
            <TableHead>Tipe</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={10}
                className="py-10 text-center text-muted-foreground"
              >
                {leases.length === 0
                  ? "Tidak ada DHCP Lease di Router MikroTik."
                  : "Tidak ada DHCP Lease yang cocok dengan filter pencarian."}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((l) => {
              const isRowKicking = kickingId === l.id;
              const isBound = l.status.toLowerCase() === "bound";
              return (
                <TableRow
                  key={l.id}
                  className={l.disabled ? "opacity-60" : undefined}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(l.id)}
                      onChange={() => toggleRowSelect(l.id)}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                    {l.address || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {l.macAddress || "-"}
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-xs font-medium">
                    {l.hostName || "-"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {l.server || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant={
                        isBound
                          ? "success"
                          : l.status.toLowerCase() === "conflict"
                            ? "destructive"
                            : "secondary"
                      }
                      className="font-mono text-[11px]"
                    >
                      {l.status || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {l.expiresAfter || l.lastSeen || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant={l.dynamic ? "secondary" : "default"}
                      className="text-[10px]"
                    >
                      {l.dynamic ? "Dynamic" : "Static"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {l.comment || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => handleKickOne(l)}
                      disabled={isPending || isRowKicking}
                      title={`Kick ${l.address || l.macAddress}`}
                    >
                      {isRowKicking ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <UserX className="size-3" />
                      )}
                      Kick
                    </Button>
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
            {filtered.length.toLocaleString("id-ID")} DHCP lease
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
