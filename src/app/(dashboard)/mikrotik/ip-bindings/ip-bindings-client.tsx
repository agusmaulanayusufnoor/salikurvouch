"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { HotspotIpBinding } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bulkDeleteIpBindingsAction,
  deleteIpBindingAction,
  saveIpBindingAction,
  toggleIpBindingStatusAction,
} from "./actions";

const PAGE_SIZE = 25;

export function IpBindingsClient({
  bindings,
  servers,
}: {
  bindings: HotspotIpBinding[];
  servers: string[];
}) {
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HotspotIpBinding | null>(null);
  const [isPending, startTransition] = useTransition();

  const distinctServers = useMemo(() => {
    const set = new Set<string>(servers);
    for (const b of bindings) {
      if (b.server && b.server !== "all") set.add(b.server);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bindings, servers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bindings.filter((b) => {
      if (serverFilter !== "all" && (b.server || "all") !== serverFilter) {
        return false;
      }
      if (typeFilter !== "all" && b.type !== typeFilter) return false;
      if (statusFilter === "active" && b.disabled) return false;
      if (statusFilter === "disabled" && !b.disabled) return false;
      if (!q) return true;
      return (
        b.macAddress.toLowerCase().includes(q) ||
        b.address.toLowerCase().includes(q) ||
        b.toAddress.toLowerCase().includes(q) ||
        b.server.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q) ||
        b.comment.toLowerCase().includes(q)
      );
    });
  }, [bindings, search, serverFilter, typeFilter, statusFilter]);

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
    typeFilter !== "all" ||
    statusFilter !== "all";

  function openAddModal() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditModal(b: HotspotIpBinding) {
    setEditing(b);
    setModalOpen(true);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveIpBindingAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setModalOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleToggleDisable(b: HotspotIpBinding) {
    startTransition(async () => {
      const res = await toggleIpBindingStatusAction(b.id, !b.disabled);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleDeleteOne(b: HotspotIpBinding) {
    const label = b.comment || b.macAddress || b.address || b.id;
    if (!confirm(`Hapus IP Binding "${label}" dari MikroTik?`)) return;
    startTransition(async () => {
      const res = await deleteIpBindingAction(b.id);
      if (res.ok) {
        toast.success(res.message);
        if (editing?.id === b.id) setModalOpen(false);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(b.id);
          return next;
        });
      } else {
        toast.error(res.message);
      }
    });
  }

  function toggleRowSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectVisible() {
    const visibleIds = visibleRows.map((b) => b.id);
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

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Yakin ingin menghapus ${ids.length} IP Binding terpilih?`)) {
      return;
    }
    startTransition(async () => {
      const res = await bulkDeleteIpBindingsAction(ids);
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
            placeholder="Cari MAC address, IP address, to-address, comment..."
            className="pl-9"
          />
        </div>

        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Type</option>
          <option value="bypassed">bypassed</option>
          <option value="regular">regular</option>
          <option value="blocked">blocked</option>
        </Select>

        <Select
          value={serverFilter}
          onChange={(e) => {
            setServerFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Server</option>
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
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      {/* Action & Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} IP binding
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
                setTypeFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
            >
              <X className="size-3.5" />
              Reset Filter
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              <Trash2 className="size-3.5" />
              Hapus Terpilih ({selectedIds.size})
            </Button>
          ) : null}

          <Button type="button" size="sm" onClick={openAddModal}>
            <Plus className="size-4" />
            Tambah IP Binding
          </Button>
        </div>
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
                  visibleRows.every((b) => selectedIds.has(b.id))
                }
                onChange={toggleSelectVisible}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>MAC Address</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>To Address</TableHead>
            <TableHead>Server</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-10 text-center text-muted-foreground"
              >
                {bindings.length === 0
                  ? "Belum ada data IP Binding di Router MikroTik."
                  : "Tidak ada IP Binding yang cocok dengan filter pencarian."}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((b) => (
              <TableRow
                key={b.id}
                className={b.disabled ? "opacity-60" : undefined}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(b.id)}
                    onChange={() => toggleRowSelect(b.id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                  {b.macAddress || "-"}
                  {b.disabled ? (
                    <span className="ml-1.5 text-[10px] font-medium text-destructive">
                      (disabled)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {b.address || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {b.toAddress || "-"}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {b.server || "all"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    variant={
                      b.type === "bypassed"
                        ? "success"
                        : b.type === "blocked"
                          ? "destructive"
                          : "secondary"
                    }
                    className="font-mono text-[11px]"
                  >
                    {b.type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                  {b.comment || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleDisable(b)}
                      disabled={isPending}
                      title={
                        b.disabled ? "Aktifkan IP Binding" : "Disable IP Binding"
                      }
                    >
                      {b.disabled ? (
                        <Lock className="size-4 text-amber-600" />
                      ) : (
                        <Unlock className="size-4 text-emerald-600" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEditModal(b)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleDeleteOne(b)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3" />
                      Hapus
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination (25 per page) */}
      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length.toLocaleString("id-ID")} IP binding
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

      {/* Add / Edit IP Binding Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit IP Binding" : "Tambah IP Binding"}
            </DialogTitle>
            <DialogDescription>
              Kelola entri `/ip/hotspot/ip-binding` langsung di Router MikroTik.
            </DialogDescription>
          </DialogHeader>

          <form
            key={editing?.id ?? "new"}
            onSubmit={handleSave}
            className="space-y-3.5"
          >
            {editing ? (
              <>
                <input type="hidden" name="id" value={editing.id} />
                <input
                  type="hidden"
                  name="prev_mac_address"
                  value={editing.macAddress}
                />
                <input
                  type="hidden"
                  name="prev_address"
                  value={editing.address}
                />
                <input
                  type="hidden"
                  name="prev_to_address"
                  value={editing.toAddress}
                />
              </>
            ) : null}

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-enabled">Enabled</Label>
              <div className="sm:col-span-2">
                <Select
                  id="ib-enabled"
                  name="enabled"
                  defaultValue={editing?.disabled ? "no" : "yes"}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-mac">MAC Address</Label>
              <div className="sm:col-span-2">
                <Input
                  id="ib-mac"
                  name="mac_address"
                  defaultValue={editing?.macAddress ?? ""}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-addr">Address</Label>
              <div className="sm:col-span-2">
                <Input
                  id="ib-addr"
                  name="address"
                  defaultValue={editing?.address ?? ""}
                  placeholder="Contoh: 192.168.16.10"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-to-addr">To Address</Label>
              <div className="sm:col-span-2">
                <Input
                  id="ib-to-addr"
                  name="to_address"
                  defaultValue={editing?.toAddress ?? ""}
                  placeholder="Opsional (NAT IP)"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-server">Server</Label>
              <div className="sm:col-span-2">
                <Select
                  id="ib-server"
                  name="server"
                  defaultValue={editing?.server || "all"}
                >
                  <option value="all">all</option>
                  {distinctServers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-type">Type</Label>
              <div className="sm:col-span-2">
                <Select
                  id="ib-type"
                  name="type"
                  defaultValue={editing?.type || "bypassed"}
                >
                  <option value="bypassed">bypassed</option>
                  <option value="regular">regular</option>
                  <option value="blocked">blocked</option>
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="ib-comment">Comment</Label>
              <div className="sm:col-span-2">
                <Input
                  id="ib-comment"
                  name="comment"
                  defaultValue={editing?.comment ?? ""}
                  placeholder="Keterangan perangkat (misal: AP Lantai 2)"
                />
              </div>
            </div>

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3">
              <div>
                {editing ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDeleteOne(editing)}
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                    Hapus
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                >
                  Tutup
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Simpan
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
