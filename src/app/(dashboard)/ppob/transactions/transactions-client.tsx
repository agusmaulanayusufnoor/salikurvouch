"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
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
  deletePpobTransactionAction,
  savePpobTransactionAction,
} from "../actions";

export interface PpobTxRow {
  id: number;
  trx_id: string;
  reseller_id: string | null;
  telegram_id: number;
  reseller_username: string | null;
  product_code: string;
  target_number: string;
  customer_id: string | null;
  cost_price: number;
  sell_price: number;
  profit: number;
  status: "SUCCESS" | "PROCESSED" | "PENDING" | "FAILED";
  serial_number: string;
  description: string | null;
  source: string;
  raw_response: unknown;
  created_at: string;
}

export function PpobTransactionsClient({
  rows,
  resellers,
  isAdmin,
}: {
  rows: PpobTxRow[];
  resellers: Array<{ id: string; username: string; telegram_id: number }>;
  isAdmin: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PpobTxRow | null>(null);
  const [detailRow, setDetailRow] = useState<PpobTxRow | null>(null);
  const [statusCheckMsg, setStatusCheckMsg] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Controlled form values for auto-fill & live profit preview
  const [productCode, setProductCode] = useState("");
  const [targetNumber, setTargetNumber] = useState("");
  const [costPrice, setCostPrice] = useState("0");
  const [sellPrice, setSellPrice] = useState("0");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<
    "SUCCESS" | "PROCESSED" | "PENDING" | "FAILED"
  >("SUCCESS");
  const [serialNumber, setSerialNumber] = useState("");
  const [resellerId, setResellerId] = useState("");
  const [trxId, setTrxId] = useState("");

  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setProductCode("");
    setTargetNumber("");
    setCostPrice("0");
    setSellPrice("0");
    setDescription("");
    setStatus("SUCCESS");
    setSerialNumber("");
    setResellerId(resellers[0]?.id ?? "");
    setTrxId("");
    setFormOpen(true);
  }

  function openEdit(row: PpobTxRow) {
    setEditing(row);
    setProductCode(row.product_code);
    setTargetNumber(row.target_number);
    setCostPrice(String(row.cost_price));
    setSellPrice(String(row.sell_price));
    setDescription(row.description ?? "");
    setStatus(row.status);
    setSerialNumber(row.serial_number);
    setResellerId(row.reseller_id ?? "");
    setTrxId(row.trx_id);
    setFormOpen(true);
  }

  async function handleLookupProduct() {
    if (!productCode.trim()) {
      toast.error("Masukkan kode produk terlebih dahulu (misal S5, S10, PLN20).");
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch(
        `/api/ppob/lookup?code=${encodeURIComponent(productCode.trim())}`
      );
      const json = (await res.json()) as {
        ok: boolean;
        product?: {
          code: string;
          description: string;
          costPrice: number;
          sellPrice: number;
        };
        error?: string;
      };
      if (!json.ok || !json.product) {
        toast.error(json.error || "Produk tidak ditemukan.");
      } else {
        setProductCode(json.product.code);
        setCostPrice(String(json.product.costPrice));
        setSellPrice(String(json.product.sellPrice));
        setDescription(json.product.description);
        toast.success(`Auto-fill: ${json.product.description}`);
      }
    } catch {
      toast.error("Gagal menghubungi API Portal Pulsa.");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleCheckStatusApi(targetTrxId: string) {
    setIsCheckingStatus(true);
    setStatusCheckMsg(null);
    try {
      const res = await fetch("/api/ppob/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trxId: targetTrxId }),
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      setStatusCheckMsg(json.message || "Tidak ada respon.");
      if (json.ok) toast.success(`Status API: ${json.message}`);
      else toast.error(json.message || "Gagal cek status API");
    } catch {
      toast.error("Gagal cek status API.");
    } finally {
      setIsCheckingStatus(false);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    if (editing) fd.set("id", String(editing.id));
    fd.set("trx_id", trxId);
    fd.set("reseller_id", resellerId);
    fd.set("product_code", productCode);
    fd.set("target_number", targetNumber);
    fd.set("cost_price", costPrice);
    fd.set("sell_price", sellPrice);
    fd.set("status", status);
    fd.set("serial_number", serialNumber);
    fd.set("description", description);

    startTransition(async () => {
      const res = await savePpobTransactionAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setFormOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleDelete(row: PpobTxRow) {
    if (!confirm(`Hapus transaksi PPOB ${row.trx_id}?`)) return;
    startTransition(async () => {
      const res = await deletePpobTransactionAction(row.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  const profitPreview =
    status === "FAILED"
      ? 0
      : (Number(sellPrice) || 0) - (Number(costPrice) || 0);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Catat Transaksi Manual
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu</TableHead>
            <TableHead>TRX ID / Produk</TableHead>
            <TableHead>Reseller</TableHead>
            <TableHead>Tujuan</TableHead>
            <TableHead className="text-right">Modal</TableHead>
            <TableHead className="text-right">Jual</TableHead>
            <TableHead className="text-right">Laba</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="py-8 text-center text-muted-foreground"
              >
                Tidak ada transaksi PPOB yang cocok.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTimeID(r.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {r.product_code}
                    </Badge>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {r.trx_id}
                    </span>
                  </div>
                  {r.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">
                  {r.reseller_username
                    ? `@${r.reseller_username}`
                    : r.telegram_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.target_number || "-"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatIDR(r.cost_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-medium">
                  {formatIDR(r.sell_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600">
                  {formatIDR(r.profit)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === "SUCCESS"
                        ? "success"
                        : r.status === "FAILED"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Detail & Cek Status API"
                      onClick={() => {
                        setDetailRow(r);
                        setStatusCheckMsg(null);
                      }}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit Transaksi"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Hapus"
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

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Transaksi PPOB" : "Catat Transaksi PPOB Manual"}
            </DialogTitle>
            <DialogDescription>
              Gunakan tombol <strong>Cek API</strong> untuk mengisi otomatis harga
              modal &amp; harga jual markup dari PortalPulsa.com.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pp-code">Kode Produk</Label>
                <div className="flex gap-2">
                  <Input
                    id="pp-code"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    placeholder="S10 / PLN20"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLookupProduct}
                    disabled={isLookingUp}
                  >
                    {isLookingUp ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    Cek API
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-target">No. Tujuan / ID Pelanggan</Label>
                <Input
                  id="pp-target"
                  value={targetNumber}
                  onChange={(e) => setTargetNumber(e.target.value)}
                  placeholder="081234567890"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pp-res">Reseller</Label>
                <Select
                  id="pp-res"
                  value={resellerId}
                  onChange={(e) => setResellerId(e.target.value)}
                >
                  <option value="">(Umum / Manual Admin)</option>
                  {resellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.username} ({r.telegram_id})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-status">Status</Label>
                <Select
                  id="pp-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as
                        | "SUCCESS"
                        | "PROCESSED"
                        | "PENDING"
                        | "FAILED"
                    )
                  }
                >
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="PROCESSED">PROCESSED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="FAILED">FAILED</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pp-cost">Harga Modal (Rp)</Label>
                <Input
                  id="pp-cost"
                  type="number"
                  min={0}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-sell">Harga Jual (Rp)</Label>
                <Input
                  id="pp-sell"
                  type="number"
                  min={0}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  required
                />
              </div>
              <div className="rounded-lg border bg-muted/40 p-2.5">
                <p className="text-xs text-muted-foreground">Preview Laba</p>
                <p
                  className={`mt-1 font-mono text-sm font-bold ${
                    profitPreview >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {formatIDR(profitPreview)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pp-sn">Serial Number (SN)</Label>
                <Input
                  id="pp-sn"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-trx">TRX ID (Opsional)</Label>
                <Input
                  id="pp-trx"
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  placeholder="Otomatis jika kosong"
                  disabled={Boolean(editing)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-desc">Keterangan</Label>
              <Input
                id="pp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Telkomsel 10.000"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Simpan Transaksi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Transaksi PPOB</DialogTitle>
            <DialogDescription className="font-mono">
              {detailRow?.trx_id}
            </DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Produk</dt>
                  <dd className="font-semibold">{detailRow.product_code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tujuan</dt>
                  <dd className="font-mono">{detailRow.target_number}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Modal / Jual / Laba</dt>
                  <dd className="font-mono">
                    {formatIDR(detailRow.cost_price)} /{" "}
                    {formatIDR(detailRow.sell_price)} /{" "}
                    <strong className="text-emerald-600">
                      {formatIDR(detailRow.profit)}
                    </strong>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">SN</dt>
                  <dd className="font-mono">{detailRow.serial_number || "-"}</dd>
                </div>
              </dl>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCheckStatusApi(detailRow.trx_id)}
                  disabled={isCheckingStatus}
                >
                  {isCheckingStatus ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Cek Status Ulang ke Portal Pulsa
                </Button>
              </div>

              {statusCheckMsg ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                  <strong>Respon Live API:</strong> {statusCheckMsg}
                </div>
              ) : null}

              {detailRow.raw_response ? (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    Raw Response JSON
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px]">
                    {JSON.stringify(detailRow.raw_response, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
