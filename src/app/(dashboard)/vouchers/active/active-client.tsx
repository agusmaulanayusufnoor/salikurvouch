"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search,
  UserX,
  X,
  Loader2,
  Server,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { HotspotActiveSession } from "@/lib/mikrotik/types";
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
import {
  bulkKickActiveVouchersAction,
  kickActiveVoucherAction,
} from "./actions";

const PAGE_SIZE = 25;

function formatBytesHuman(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Byte";
  const units = ["Byte", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(val) : val.toFixed(2)} ${units[i]}`;
}

export function ActiveVouchersClient({
  sessions,
}: {
  sessions: HotspotActiveSession[];
}) {
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [loginByFilter, setLoginByFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const distinctServers = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.server) set.add(s.server);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const distinctLoginBy = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.loginBy) set.add(s.loginBy);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (serverFilter !== "all" && s.server !== serverFilter) return false;
      if (loginByFilter !== "all" && s.loginBy !== loginByFilter) return false;
      if (!q) return true;
      return (
        s.user.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.macAddress.toLowerCase().includes(q) ||
        s.server.toLowerCase().includes(q) ||
        s.loginBy.toLowerCase().includes(q) ||
        s.comment.toLowerCase().includes(q)
      );
    });
  }, [sessions, search, serverFilter, loginByFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const hasActiveFilter =
    search.trim() !== "" || serverFilter !== "all" || loginByFilter !== "all";

  function toggleRowSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectVisible() {
    const visibleIds = visibleRows.map((s) => s.id);
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

  function handleKickOne(s: HotspotActiveSession) {
    if (
      !confirm(
        `Kick user aktif "${s.user}" (${s.address || s.macAddress}) dari Hotspot?`
      )
    ) {
      return;
    }
    setKickingId(s.id);
    startTransition(async () => {
      try {
        const res = await kickActiveVoucherAction(s.id, s.user);
        if (res.ok) {
          toast.success(res.message);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(s.id);
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
    if (!confirm(`Yakin ingin kick ${ids.length} user aktif yang dipilih?`)) {
      return;
    }
    startTransition(async () => {
      const res = await bulkKickActiveVouchersAction(ids);
      if (res.ok) {
        toast.success(res.message);
        setSelectedIds(new Set());
      } else {
        toast.error(res.message);
      }
    });
  }

  // Page numbers window around current page
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [safePage, totalPages]);

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari voucher/user, IP address, MAC address, comment..."
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
          {distinctServers.map((srv) => (
            <option key={srv} value={srv}>
              Server: {srv}
            </option>
          ))}
        </Select>

        <Select
          value={loginByFilter}
          onChange={(e) => {
            setLoginByFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">
            Semua Login By ({distinctLoginBy.length})
          </option>
          {distinctLoginBy.map((lb) => (
            <option key={lb} value={lb}>
              Login By: {lb}
            </option>
          ))}
        </Select>
      </div>

      {/* Summary & Bulk Actions Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="success" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} aktif
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
                setLoginByFilter("all");
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

      {/* Mikhmon-style Hotspot Active Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Pilih semua di halaman ini"
                checked={
                  visibleRows.length > 0 &&
                  visibleRows.every((s) => selectedIds.has(s.id))
                }
                onChange={toggleSelectVisible}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>Server</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>MAC Address</TableHead>
            <TableHead>Uptime</TableHead>
            <TableHead className="text-right">Bytes In</TableHead>
            <TableHead className="text-right">Bytes Out</TableHead>
            <TableHead>Time Left</TableHead>
            <TableHead>Login By</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={12}
                className="py-10 text-center text-muted-foreground"
              >
                {sessions.length === 0
                  ? "Tidak ada voucher yang sedang aktif login."
                  : "Tidak ada voucher aktif yang cocok dengan pencarian."}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((s) => {
              const isRowKicking = kickingId === s.id;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleRowSelect(s.id)}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Server className="size-3 opacity-60" />
                      {s.server || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold whitespace-nowrap text-foreground">
                    {s.user}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {s.address || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {s.macAddress || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {s.uptime || "00:00:00"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatBytesHuman(s.bytesIn)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatBytesHuman(s.bytesOut)}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {s.sessionTimeLeft || "-"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {s.loginBy ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {s.loginBy}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {s.comment || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => handleKickOne(s)}
                      disabled={isPending || isRowKicking}
                      title={`Kick ${s.user}`}
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
            {filtered.length.toLocaleString("id-ID")} voucher aktif
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
