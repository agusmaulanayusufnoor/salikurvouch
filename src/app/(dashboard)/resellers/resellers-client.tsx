"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Wallet,
  Eye,
  Ban,
  CheckCircle2,
  Trash2,
  Loader2,
} from "lucide-react";
import { formatIDR, formatDateTimeID } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createResellerAction,
  deleteResellerAction,
  toggleResellerStatusAction,
  updateResellerAction,
} from "./actions";

export interface ResellerRow {
  id: string;
  telegram_id: number;
  username: string;
  phone: string | null;
  balance: number;
  vouchers_sold: number;
  reseller_type: string;
  status: string;
  joined_at: string;
  updated_at: string;
}

export function ResellersClient({
  resellers,
  isAdmin,
}: {
  resellers: ResellerRow[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ResellerRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = resellers.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      r.username.toLowerCase().includes(q) ||
      String(r.telegram_id).includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createResellerAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setCreateOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateResellerAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setEditing(null);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleToggleStatus(r: ResellerRow) {
    const nextStatus = r.status === "active" ? "suspended" : "active";
    startTransition(async () => {
      const res = await toggleResellerStatusAction(r.id, nextStatus);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleDelete(r: ResellerRow) {
    if (
      !confirm(
        `Hapus permanen reseller @${r.username}? (Hanya diizinkan jika belum pernah bertransaksi)`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteResellerAction(r.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Direktori Reseller</CardTitle>
          <CardDescription>
            Menampilkan {filtered.length} dari {resellers.length} reseller terdaftar.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/resellers/topup">
              <Wallet className="size-4" />
              Top Up / Top Down
            </Link>
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Tambah Reseller
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Reseller Baru</DialogTitle>
                <DialogDescription>
                  Daftarkan Telegram User ID reseller secara manual beserta saldo
                  awal (opsional).
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="c-tid">Telegram User ID</Label>
                    <Input
                      id="c-tid"
                      name="telegram_id"
                      placeholder="150377182"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-user">Username / Nama Seller</Label>
                    <Input
                      id="c-user"
                      name="username"
                      placeholder="agen_salikur"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="c-phone">No. HP / WhatsApp</Label>
                    <Input
                      id="c-phone"
                      name="phone"
                      placeholder="081234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-bal">Saldo Awal (Rp)</Label>
                    <Input
                      id="c-bal"
                      name="initial_balance"
                      type="number"
                      min={0}
                      defaultValue={0}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="c-type">Tipe Reseller</Label>
                    <Select id="c-type" name="reseller_type" defaultValue="agent">
                      <option value="agent">Agent</option>
                      <option value="vip">VIP</option>
                      <option value="internal">Internal</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-status">Status</Label>
                    <Select id="c-status" name="status" defaultValue="active">
                      <option value="active">Aktif</option>
                      <option value="suspended">Suspended</option>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Simpan Reseller
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama seller, Telegram ID, atau no HP..."
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-44"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reseller</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Telepon / WA</TableHead>
              <TableHead className="text-right">Saldo Aktif</TableHead>
              <TableHead className="text-right">Voucher Terjual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bergabung</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Tidak ada reseller yang cocok dengan filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/resellers/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      @{r.username}
                    </Link>
                    <p className="text-xs text-muted-foreground uppercase">
                      {r.reseller_type}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.telegram_id}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.phone || "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatIDR(r.balance)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.vouchers_sold.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "active" ? "success" : "destructive"}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTimeID(r.joined_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title="Detail & Mutasi"
                      >
                        <Link href={`/resellers/${r.id}`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title="Top Up / Top Down"
                      >
                        <Link href={`/resellers/topup?tid=${r.telegram_id}`}>
                          <Wallet className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Edit Profil"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={
                          r.status === "active"
                            ? "Suspend Reseller"
                            : "Aktifkan Reseller"
                        }
                        onClick={() => handleToggleStatus(r)}
                        disabled={isPending}
                      >
                        {r.status === "active" ? (
                          <Ban className="size-4 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        )}
                      </Button>
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Hapus Reseller"
                          onClick={() => handleDelete(r)}
                          disabled={isPending}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profil Reseller</DialogTitle>
            <DialogDescription>
              Telegram ID: <span className="font-mono">{editing?.telegram_id}</span>
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-2">
                <Label htmlFor="e-user">Username / Nama Seller</Label>
                <Input
                  id="e-user"
                  name="username"
                  defaultValue={editing.username}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-phone">No. HP / WhatsApp</Label>
                <Input
                  id="e-phone"
                  name="phone"
                  defaultValue={editing.phone ?? ""}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="e-type">Tipe Reseller</Label>
                  <Select
                    id="e-type"
                    name="reseller_type"
                    defaultValue={editing.reseller_type}
                  >
                    <option value="agent">Agent</option>
                    <option value="vip">VIP</option>
                    <option value="internal">Internal</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-status">Status</Label>
                  <Select
                    id="e-status"
                    name="status"
                    defaultValue={editing.status}
                  >
                    <option value="active">Aktif</option>
                    <option value="suspended">Suspended</option>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Simpan Perubahan
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
