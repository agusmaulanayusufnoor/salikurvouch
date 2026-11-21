"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import {
  deleteVoucherPackageAction,
  saveVoucherPackageAction,
  toggleVoucherPackageAction,
} from "./actions";

export interface VoucherPackageRow {
  id: string;
  router_id: string | null;
  mode: "saldo" | "nonsaldo";
  name: string;
  menu_label: string;
  price: number;
  markup: number;
  mikrotik_server: string;
  mikrotik_profile: string;
  limit_uptime: string;
  limit_download_mb: number;
  limit_upload_mb: number;
  limit_total_mb: number;
  login_type: "vc" | "up";
  char_type: string;
  code_length: number;
  card_color: string;
  sort_order: number;
  is_active: boolean;
}

const CHAR_TYPE_LABELS: Record<string, string> = {
  "1": "1 — Angka (1234)",
  "2": "2 — HURUF BESAR (ABCD)",
  "3": "3 — huruf kecil (abcd)",
  "4": "4 — Campuran Huruf (AbCd)",
  "5": "5 — Huruf + Angka (Ab12)",
  "6": "6 — kecil + angka (ab12)",
  "7": "7 — BESAR + angka (AB12)",
};

function formatQuotaLabel(mb: number): string {
  if (!mb || mb <= 0) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function PackagesClient({
  packages,
  defaultRouterId,
  isAdmin,
}: {
  packages: VoucherPackageRow[];
  defaultRouterId: string | null;
  isAdmin: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VoucherPackageRow | null>(null);
  const [formMode, setFormMode] = useState<"saldo" | "nonsaldo">("saldo");
  const [formPrice, setFormPrice] = useState("5000");
  const [formMarkup, setFormMarkup] = useState("1000");
  const [formColor, setFormColor] = useState("#20a8d8");
  const [isPending, startTransition] = useTransition();

  const saldoPackages = packages.filter((p) => p.mode === "saldo");
  const nonsaldoPackages = packages.filter((p) => p.mode === "nonsaldo");

  function openCreate(mode: "saldo" | "nonsaldo") {
    setEditing(null);
    setFormMode(mode);
    setFormPrice(mode === "saldo" ? "5000" : "0");
    setFormMarkup(mode === "saldo" ? "1000" : "0");
    setFormColor("#20a8d8");
    setDialogOpen(true);
  }

  function openEdit(pkg: VoucherPackageRow) {
    setEditing(pkg);
    setFormMode(pkg.mode);
    setFormPrice(String(pkg.price));
    setFormMarkup(String(pkg.markup));
    setFormColor(
      pkg.card_color.startsWith("#") ? pkg.card_color : `#${pkg.card_color}`
    );
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("mode", formMode);
    fd.set("card_color", formColor);
    if (defaultRouterId && !fd.get("router_id")) {
      fd.set("router_id", defaultRouterId);
    }

    startTransition(async () => {
      const res = await saveVoucherPackageAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setDialogOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleToggle(pkg: VoucherPackageRow, nextActive: boolean) {
    startTransition(async () => {
      const res = await toggleVoucherPackageAction(pkg.id, nextActive);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleDelete(pkg: VoucherPackageRow) {
    if (!confirm(`Hapus paket voucher "${pkg.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteVoucherPackageAction(pkg.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  const netCostPreview = Math.max(
    (Number(formPrice) || 0) - (Number(formMarkup) || 0),
    0
  );

  function renderTable(list: VoucherPackageRow[], mode: "saldo" | "nonsaldo") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {mode === "saldo"
                ? "Paket Voucher Mode Saldo (Reseller)"
                : "Paket Voucher Mode Non-Saldo (Admin/Gratis)"}
            </CardTitle>
            <CardDescription>
              {list.length} paket terdaftar • Urutan sesuai `sort_order`
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button size="sm" onClick={() => openCreate(mode)}>
              <Plus className="size-4" />
              Tambah Paket
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paket / Menu</TableHead>
                <TableHead>Profile &amp; Server</TableHead>
                <TableHead className="text-right">Harga Jual</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Potong Saldo</TableHead>
                <TableHead>Limit &amp; Kuota</TableHead>
                <TableHead>Format Kode</TableHead>
                <TableHead>Aktif</TableHead>
                {isAdmin ? <TableHead className="text-right">Aksi</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 9 : 8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Belum ada paket voucher untuk mode {mode}.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-3.5 shrink-0 rounded border"
                          style={{ backgroundColor: pkg.card_color }}
                        />
                        <div>
                          <p className="font-semibold">{pkg.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {pkg.menu_label}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary">{pkg.mikrotik_profile}</Badge>
                      <p className="mt-0.5 text-muted-foreground">
                        srv: {pkg.mikrotik_server}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(pkg.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-600">
                      {formatIDR(pkg.markup)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {mode === "saldo"
                        ? formatIDR(Math.max(pkg.price - pkg.markup, 0))
                        : "Rp 0"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-mono">{pkg.limit_uptime}</p>
                      <p className="text-muted-foreground">
                        Total: {formatQuotaLabel(pkg.limit_total_mb)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">
                        {pkg.login_type === "vc" ? "Voucher (U=P)" : "User/Pass"}
                      </Badge>
                      <p className="mt-0.5 text-muted-foreground">
                        Tipe {pkg.char_type} • {pkg.code_length} char
                      </p>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={pkg.is_active}
                        disabled={!isAdmin || isPending}
                        onCheckedChange={(checked) => handleToggle(pkg, checked)}
                      />
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(pkg)}
                            title="Edit Paket"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(pkg)}
                            disabled={isPending}
                            title="Hapus Paket"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Tabs defaultValue="saldo">
        <TabsList>
          <TabsTrigger value="saldo">
            Mode Saldo ({saldoPackages.length})
          </TabsTrigger>
          <TabsTrigger value="nonsaldo">
            Mode Non-Saldo ({nonsaldoPackages.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="saldo">
          {renderTable(saldoPackages, "saldo")}
        </TabsContent>
        <TabsContent value="nonsaldo">
          {renderTable(nonsaldoPackages, "nonsaldo")}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit Paket "${editing.name}"` : "Tambah Paket Voucher Baru"}
            </DialogTitle>
            <DialogDescription>
              Mode: <strong className="uppercase">{formMode}</strong>. Semua paket
              langsung tersedia di Bot Telegram &amp; Batch Generator Web.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <input
              type="hidden"
              name="router_id"
              value={editing?.router_id ?? defaultRouterId ?? ""}
            />
            <input
              type="hidden"
              name="is_active"
              value={String(editing?.is_active ?? true)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-name">Nama Paket / Tombol</Label>
                <Input
                  id="p-name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  placeholder="5.000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-label">Label Menu Bot (`Text_List`)</Label>
                <Input
                  id="p-label"
                  name="menu_label"
                  defaultValue={editing?.menu_label ?? ""}
                  placeholder="Voucher 5.000 (2 Hari)"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="p-price">Harga Jual (Rp)</Label>
                <Input
                  id="p-price"
                  name="price"
                  type="number"
                  min={0}
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-markup">Markup Reseller (Rp)</Label>
                <Input
                  id="p-markup"
                  name="markup"
                  type="number"
                  min={0}
                  value={formMarkup}
                  onChange={(e) => setFormMarkup(e.target.value)}
                  required
                />
              </div>
              <div className="rounded-lg border bg-muted/40 p-2.5">
                <p className="text-xs text-muted-foreground">
                  Saldo Reseller Terpotong
                </p>
                <p className="mt-1 font-mono text-base font-bold">
                  {formMode === "saldo" ? formatIDR(netCostPreview) : "Rp 0"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="p-profile">Hotspot Profile MikroTik</Label>
                <Input
                  id="p-profile"
                  name="mikrotik_profile"
                  defaultValue={editing?.mikrotik_profile ?? ""}
                  placeholder="5000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-server">Hotspot Server</Label>
                <Input
                  id="p-server"
                  name="mikrotik_server"
                  defaultValue={editing?.mikrotik_server ?? "all"}
                  placeholder="all"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-uptime">Limit Uptime (ROS)</Label>
                <Input
                  id="p-uptime"
                  name="limit_uptime"
                  defaultValue={editing?.limit_uptime ?? "1d"}
                  placeholder="1d / 7d / 00:00:00"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="p-dl">Limit Download (MB)</Label>
                <Input
                  id="p-dl"
                  name="limit_download_mb"
                  type="number"
                  min={0}
                  defaultValue={editing?.limit_download_mb ?? 0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-ul">Limit Upload (MB)</Label>
                <Input
                  id="p-ul"
                  name="limit_upload_mb"
                  type="number"
                  min={0}
                  defaultValue={editing?.limit_upload_mb ?? 0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-tot">Limit Total Kuota (MB)</Label>
                <Input
                  id="p-tot"
                  name="limit_total_mb"
                  type="number"
                  min={0}
                  defaultValue={editing?.limit_total_mb ?? 0}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="p-login">Mode Login</Label>
                <Select
                  id="p-login"
                  name="login_type"
                  defaultValue={editing?.login_type ?? "vc"}
                >
                  <option value="vc">vc (User = Pass)</option>
                  <option value="up">up (User &amp; Pass)</option>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="p-char">Tipe Karakter</Label>
                <Select
                  id="p-char"
                  name="char_type"
                  defaultValue={editing?.char_type ?? "6"}
                >
                  {Object.entries(CHAR_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-len">Panjang Kode</Label>
                <Input
                  id="p-len"
                  name="code_length"
                  type="number"
                  min={3}
                  max={16}
                  defaultValue={editing?.code_length ?? 5}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-color">Warna Kartu / Badge</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1"
                  />
                  <Input
                    id="p-color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-sort">Urutan Tampil (`sort_order`)</Label>
                <Input
                  id="p-sort"
                  name="sort_order"
                  type="number"
                  min={0}
                  defaultValue={editing?.sort_order ?? packages.length}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Simpan Paket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
