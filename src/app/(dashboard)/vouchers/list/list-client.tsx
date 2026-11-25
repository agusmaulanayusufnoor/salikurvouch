"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search,
  Pencil,
  Trash2,
  Plus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Loader2,
  Filter,
  X,
  RotateCcw,
  Send,
  Printer,
} from "lucide-react";
import type { HotspotUser } from "@/lib/mikrotik/types";
import {
  filterHotspotUsers,
  isUnusedVoucher,
} from "@/lib/mikrotik/hotspot-filter";
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
  bulkDeleteVouchersAction,
  deleteVoucherItemAction,
  resetVoucherCountersAction,
  saveVoucherItemAction,
  sendExistingVoucherToTelegramAction,
  toggleVoucherStatusAction,
} from "./actions";

export interface ResellerOption {
  id: string;
  telegram_id: number;
  username: string;
}

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

function splitDataLimit(bytes: number): { value: string; unit: "MB" | "GB" } {
  if (!bytes || bytes <= 0) return { value: "", unit: "GB" };
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const clean = Number.isInteger(gb) ? String(gb) : gb.toFixed(2);
    return { value: clean, unit: "GB" };
  }
  const mb = bytes / (1024 * 1024);
  return {
    value: Number.isInteger(mb) ? String(mb) : mb.toFixed(1),
    unit: "MB",
  };
}

const PAGE_SIZE = 100;

export function VoucherListClient({
  users,
  profiles,
  servers,
  resellers,
  initialFilters,
}: {
  users: HotspotUser[];
  profiles: string[];
  servers: string[];
  resellers: ResellerOption[];
  initialFilters?: {
    search?: string;
    profile?: string;
    comment?: string;
    usage?: string;
  };
}) {
  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [profileFilter, setProfileFilter] = useState(
    initialFilters?.profile || "all"
  );
  const [commentFilter, setCommentFilter] = useState(
    initialFilters?.comment || "all"
  );
  const [usageFilter, setUsageFilter] = useState(
    initialFilters?.usage || "all"
  );
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit / Add Modal state (Mikhmon-style)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HotspotUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [dataLimitVal, setDataLimitVal] = useState("");
  const [dataLimitUnit, setDataLimitUnit] = useState<"MB" | "GB">("GB");
  const [selectedResellerId, setSelectedResellerId] = useState(
    resellers[0]?.id ?? ""
  );
  const [isResettingCounter, setIsResettingCounter] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [isPending, startTransition] = useTransition();

  const distinctProfiles = useMemo(() => {
    const set = new Set<string>(profiles);
    for (const u of users) {
      if (u.profile) set.add(u.profile);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users, profiles]);

  const distinctComments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const c = u.comment.trim();
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [users]);

  const filtered = useMemo(
    () =>
      filterHotspotUsers(users, {
        search,
        profile: profileFilter,
        comment: commentFilter,
        usage: usageFilter,
      }),
    [users, search, profileFilter, commentFilter, usageFilter]
  );

  const printableFiltered = useMemo(
    () => filtered.filter((u) => u.name !== "default-trial"),
    [filtered]
  );

  const printFilteredHref = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    if (profileFilter !== "all") p.set("profile", profileFilter);
    if (commentFilter !== "all") p.set("comment", commentFilter);
    if (usageFilter !== "all") p.set("usage", usageFilter);
    const qs = p.toString();
    return qs ? `/print/vouchers/list?${qs}` : "/print/vouchers/list";
  }, [search, profileFilter, commentFilter, usageFilter]);

  const printSelectedHref = useMemo(() => {
    if (selectedIds.size === 0) return "";
    const p = new URLSearchParams();
    p.set("ids", Array.from(selectedIds).join(","));
    return `/print/vouchers/list?${p.toString()}`;
  }, [selectedIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const unusedInFilter = useMemo(
    () => filtered.filter(isUnusedVoucher).length,
    [filtered]
  );

  function openAddModal() {
    setEditing(null);
    setShowPassword(false);
    setDataLimitVal("");
    setDataLimitUnit("GB");
    setModalOpen(true);
  }

  function openEditModal(u: HotspotUser) {
    setEditing(u);
    setShowPassword(false);
    const split = splitDataLimit(u.limitBytesTotal);
    setDataLimitVal(split.value);
    setDataLimitUnit(split.unit);
    setModalOpen(true);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("data_limit_value", dataLimitVal);
    fd.set("data_limit_unit", dataLimitUnit);

    startTransition(async () => {
      const res = await saveVoucherItemAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setModalOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleDeleteOne(u: HotspotUser) {
    if (!confirm(`Hapus voucher "${u.name}" dari MikroTik?`)) return;
    startTransition(async () => {
      const res = await deleteVoucherItemAction(u.id);
      if (res.ok) {
        toast.success(res.message);
        if (editing?.id === u.id) setModalOpen(false);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(u.id);
          return next;
        });
      } else {
        toast.error(res.message);
      }
    });
  }

  async function handleResetCounter() {
    if (!editing) return;
    if (
      !confirm(
        `Reset counter Uptime & Bytes In/Out untuk voucher "${editing.name}" menjadi 0?`
      )
    ) {
      return;
    }
    setIsResettingCounter(true);
    try {
      const res = await resetVoucherCountersAction(editing.id, editing.name);
      if (res.ok) {
        toast.success(res.message);
        setEditing((prev) =>
          prev
            ? { ...prev, uptime: "00:00:00", bytesIn: 0, bytesOut: 0 }
            : prev
        );
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsResettingCounter(false);
    }
  }

  async function handleSendToTelegram() {
    if (!editing) return;
    if (!selectedResellerId) {
      toast.error("Pilih reseller penerima Telegram terlebih dahulu.");
      return;
    }
    const fd = formRef.current ? new FormData(formRef.current) : null;
    const name = String(fd?.get("name") ?? editing.name).trim();
    const password = String(fd?.get("password") ?? editing.password).trim();
    const profile = String(fd?.get("profile") ?? editing.profile).trim();
    const limitUptime = String(
      fd?.get("limit_uptime") ?? editing.limitUptime
    ).trim();
    const comment = String(fd?.get("comment") ?? editing.comment).trim();
    const parsedNum = Number(dataLimitVal);
    const limitBytesTotal =
      dataLimitVal.trim() && Number.isFinite(parsedNum) && parsedNum > 0
        ? Math.round(
            parsedNum *
              (dataLimitUnit === "GB" ? 1024 * 1024 * 1024 : 1024 * 1024)
          )
        : 0;

    setIsSendingTelegram(true);
    try {
      const res = await sendExistingVoucherToTelegramAction({
        resellerId: selectedResellerId,
        name,
        password: password || name,
        profile,
        limitUptime,
        limitBytesTotal,
        comment,
      });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsSendingTelegram(false);
    }
  }

  function handleToggleDisable(u: HotspotUser) {
    startTransition(async () => {
      const res = await toggleVoucherStatusAction(u.id, !u.disabled);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
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
    const deletableIds = visibleRows
      .filter((u) => u.name !== "default-trial")
      .map((u) => u.id);
    const allSelected =
      deletableIds.length > 0 && deletableIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of deletableIds) next.delete(id);
      } else {
        for (const id of deletableIds) next.add(id);
      }
      return next;
    });
  }

  function handleBulkDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Yakin ingin menghapus ${ids.length} voucher yang dipilih dari MikroTik?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await bulkDeleteVouchersAction(ids);
      if (res.ok) {
        toast.success(res.message);
        setSelectedIds(new Set());
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleBulkDeleteComment() {
    if (commentFilter === "all") return;
    const targets = filtered
      .filter((u) => u.name !== "default-trial")
      .map((u) => u.id);
    if (targets.length === 0) return;
    if (
      !confirm(
        `Yakin ingin menghapus SEMUA ${targets.length} voucher dengan comment "${commentFilter}"?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await bulkDeleteVouchersAction(targets);
      if (res.ok) {
        toast.success(res.message);
        setCommentFilter("all");
        setSelectedIds(new Set());
      } else {
        toast.error(res.message);
      }
    });
  }

  const hasActiveFilter =
    search.trim() !== "" ||
    profileFilter !== "all" ||
    commentFilter !== "all" ||
    usageFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Filter Toolbar (Mikhmon Style) */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode voucher, profile, comment, MAC..."
            className="pl-9"
          />
        </div>

        <Select
          value={profileFilter}
          onChange={(e) => {
            setProfileFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Profile ({distinctProfiles.length})</option>
          {distinctProfiles.map((p) => (
            <option key={p} value={p}>
              Profile: {p}
            </option>
          ))}
        </Select>

        <Select
          value={commentFilter}
          onChange={(e) => {
            setCommentFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Comment ({distinctComments.length})</option>
          {distinctComments.map(([c, cnt]) => (
            <option key={c} value={c}>
              {c} ({cnt})
            </option>
          ))}
        </Select>

        <Select
          value={usageFilter}
          onChange={(e) => {
            setUsageFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua Status</option>
          <option value="unused">Belum Terpakai (Sisa)</option>
          <option value="used">Sudah Terpakai</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      {/* Action & Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} voucher
          </Badge>
          <Badge variant="success" className="font-mono">
            Sisa belum terpakai: {unusedInFilter.toLocaleString("id-ID")}
          </Badge>
          {hasActiveFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSearch("");
                setProfileFilter("all");
                setCommentFilter("all");
                setUsageFilter("all");
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
            <>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={printSelectedHref} target="_blank">
                  <Printer className="size-3.5" />
                  Print Terpilih ({selectedIds.size})
                </Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleBulkDeleteSelected}
                disabled={isPending}
              >
                <Trash2 className="size-3.5" />
                Hapus Terpilih ({selectedIds.size})
              </Button>
            </>
          ) : null}

          {commentFilter !== "all" && filtered.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleBulkDeleteComment}
              disabled={isPending}
            >
              <Trash2 className="size-3.5" />
              Hapus Comment Ini ({filtered.length})
            </Button>
          ) : null}

          {printableFiltered.length > 0 ? (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={printFilteredHref} target="_blank">
                <Printer className="size-3.5" />
                Print PDF ({printableFiltered.length})
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              <Printer className="size-3.5" />
              Print PDF (0)
            </Button>
          )}

          <Button type="button" size="sm" onClick={openAddModal}>
            <Plus className="size-4" />
            Tambah Voucher
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
                aria-label="Pilih semua baris tampil"
                checked={
                  visibleRows.filter((u) => u.name !== "default-trial").length >
                    0 &&
                  visibleRows
                    .filter((u) => u.name !== "default-trial")
                    .every((u) => selectedIds.has(u.id))
                }
                onChange={toggleSelectVisible}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>Server</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead>MAC Address</TableHead>
            <TableHead>Uptime</TableHead>
            <TableHead className="text-right">Bytes In</TableHead>
            <TableHead className="text-right">Bytes Out</TableHead>
            <TableHead>Comment &amp; Limit</TableHead>
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
                Tidak ada voucher yang cocok dengan filter saat ini.
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((u) => {
              const isTrial = u.name === "default-trial";
              const unused = isUnusedVoucher(u);
              const dataLimitInfo =
                u.limitBytesTotal > 0 ? formatBytesHuman(u.limitBytesTotal) : "";

              return (
                <TableRow
                  key={u.id}
                  className={u.disabled ? "opacity-60" : undefined}
                >
                  <TableCell>
                    {!isTrial ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleRowSelect(u.id)}
                        className="size-4 rounded border-input accent-primary"
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.server || "all"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="flex items-center gap-1.5 text-left font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      <Pencil className="size-3 shrink-0 opacity-70" />
                      {u.name}
                    </button>
                    {unused ? (
                      <span className="text-[10px] font-medium text-emerald-600">
                        belum dipakai
                      </span>
                    ) : u.disabled ? (
                      <span className="text-[10px] font-medium text-destructive">
                        disabled
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {u.profile ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileFilter(u.profile);
                          setPage(1);
                        }}
                        title="Filter profile ini"
                      >
                        <Badge variant="secondary" className="cursor-pointer">
                          {u.profile}
                        </Badge>
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {u.macAddress || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {u.uptime || "00:00:00"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatBytesHuman(u.bytesIn)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatBytesHuman(u.bytesOut)}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs">
                    {u.comment ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCommentFilter(u.comment.trim());
                          setPage(1);
                        }}
                        className="inline-flex items-center gap-1 text-left text-foreground hover:text-primary hover:underline"
                        title="Klik untuk filter comment ini"
                      >
                        <Filter className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{u.comment}</span>
                      </button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                    {dataLimitInfo || u.limitUptime ? (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {[dataLimitInfo, u.limitUptime]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleDisable(u)}
                        disabled={isPending || isTrial}
                        title={
                          u.disabled ? "Aktifkan Voucher" : "Disable Voucher"
                        }
                      >
                        {u.disabled ? (
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
                        onClick={() => openEditModal(u)}
                      >
                        <Pencil className="size-3" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleDeleteOne(u)}
                        disabled={isPending || isTrial}
                      >
                        <Trash2 className="size-3" />
                        Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length.toLocaleString("id-ID")} voucher
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Badge variant="secondary" className="font-mono">
              {safePage} / {totalPages}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      ) : null}

      {/* Mikhmon-style Edit / Add Voucher Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit Voucher ${editing.name}` : "Tambah Voucher Baru"}
            </DialogTitle>
            <DialogDescription>
              Perubahan langsung disimpan ke `/ip/hotspot/user` pada Router
              MikroTik.
            </DialogDescription>
          </DialogHeader>

          <form
            key={editing?.id ?? "new"}
            ref={formRef}
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
              </>
            ) : null}

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-enabled">Enabled</Label>
              <div className="sm:col-span-2">
                <Select
                  id="v-enabled"
                  name="enabled"
                  defaultValue={editing?.disabled ? "no" : "yes"}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-server">Server</Label>
              <div className="sm:col-span-2">
                <Select
                  id="v-server"
                  name="server"
                  defaultValue={editing?.server || "all"}
                >
                  <option value="all">all</option>
                  {servers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-name">Name</Label>
              <div className="sm:col-span-2">
                <Input
                  id="v-name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  className="font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-pass">Password</Label>
              <div className="flex gap-2 sm:col-span-2">
                <Input
                  id="v-pass"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  defaultValue={editing?.password ?? ""}
                  className="font-mono"
                  placeholder={editing ? "" : "Kosongkan jika = Name"}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Sembunyikan" : "Tampilkan"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-profile">Profile</Label>
              <div className="sm:col-span-2">
                {distinctProfiles.length > 0 ? (
                  <Select
                    id="v-profile"
                    name="profile"
                    defaultValue={editing?.profile || distinctProfiles[0]}
                  >
                    {distinctProfiles.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id="v-profile"
                    name="profile"
                    defaultValue={editing?.profile ?? "default"}
                  />
                )}
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-mac">MAC Address</Label>
              <div className="sm:col-span-2">
                <Input
                  id="v-mac"
                  name="mac_address"
                  defaultValue={editing?.macAddress ?? ""}
                  placeholder="Kosongkan untuk unlock MAC"
                  className="font-mono"
                />
              </div>
            </div>

            {editing ? (
              <>
                <div className="grid items-center gap-2 sm:grid-cols-3">
                  <Label>Uptime</Label>
                  <div className="sm:col-span-2">
                    <Input
                      value={editing.uptime || "00:00:00"}
                      readOnly
                      className="bg-muted/50 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid items-center gap-2 sm:grid-cols-3">
                  <Label>Bytes In / Out</Label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Input
                      value={`${formatBytesHuman(editing.bytesIn)} / ${formatBytesHuman(editing.bytesOut)}`}
                      readOnly
                      className="bg-muted/50 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleResetCounter}
                      disabled={isPending || isResettingCounter}
                      title="Reset Uptime & Bytes In/Out ke 0 seperti di MikroTik"
                    >
                      {isResettingCounter ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      Reset Counter
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-timelimit">Time Limit</Label>
              <div className="sm:col-span-2">
                <Input
                  id="v-timelimit"
                  name="limit_uptime"
                  defaultValue={editing?.limitUptime ?? ""}
                  placeholder="Contoh: 1d, 7d, 71w3d (kosong = unlimited)"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-datalimit">Data Limit</Label>
              <div className="flex gap-2 sm:col-span-2">
                <Input
                  id="v-datalimit"
                  type="number"
                  step="any"
                  min={0}
                  value={dataLimitVal}
                  onChange={(e) => setDataLimitVal(e.target.value)}
                  placeholder="0 = Unlimited"
                  className="font-mono"
                />
                <Select
                  value={dataLimitUnit}
                  onChange={(e) =>
                    setDataLimitUnit(e.target.value as "MB" | "GB")
                  }
                  className="w-24"
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                </Select>
              </div>
            </div>

            <div className="grid items-center gap-2 sm:grid-cols-3">
              <Label htmlFor="v-comment">Comment</Label>
              <div className="sm:col-span-2">
                <Input
                  id="v-comment"
                  name="comment"
                  defaultValue={editing?.comment ?? ""}
                  placeholder="vc-..."
                />
              </div>
            </div>

            {editing ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <Label
                  htmlFor="v-telegram-reseller"
                  className="flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Send className="size-3.5 text-sky-600" />
                  Send to Telegram (Kirim QR &amp; Kode Voucher)
                </Label>
                {resellers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Belum ada reseller aktif dengan ID Telegram terdaftar.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      id="v-telegram-reseller"
                      value={selectedResellerId}
                      onChange={(e) => setSelectedResellerId(e.target.value)}
                      className="flex-1"
                    >
                      {resellers.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.username} (ID: {r.telegram_id})
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSendToTelegram}
                      disabled={isSendingTelegram || isPending}
                      className="shrink-0 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      {isSendingTelegram ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Send to Telegram
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3">
              <div>
                {editing && editing.name !== "default-trial" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDeleteOne(editing)}
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                    Hapus Voucher
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
                  Simpan Perubahan
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
