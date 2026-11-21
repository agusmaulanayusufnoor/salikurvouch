"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, Plus, Loader2 } from "lucide-react";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
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
  createManualDepositRequestAction,
  processDepositRequestAction,
} from "../actions";

export interface DepositRequestItem {
  id: string;
  amount: number;
  approved_amount: number | null;
  status: string;
  proof_file_path: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  reseller_username: string;
  reseller_telegram_id: number;
}

export function DepositsClient({
  requests,
  resellers,
}: {
  requests: DepositRequestItem[];
  resellers: Array<{ id: string; username: string; telegram_id: number }>;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [approveTarget, setApproveTarget] = useState<DepositRequestItem | null>(
    null
  );
  const [approveAmount, setApproveAmount] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = requests.filter(
    (r) => statusFilter === "all" || r.status === statusFilter
  );

  function openApproveDialog(item: DepositRequestItem) {
    setApproveTarget(item);
    setApproveAmount(String(item.amount));
    setApproveNotes("");
  }

  function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!approveTarget) return;
    startTransition(async () => {
      const res = await processDepositRequestAction({
        requestId: approveTarget.id,
        decision: "approved",
        approvedAmount: Number(approveAmount),
        notes: approveNotes,
      });
      if (res.ok) {
        toast.success(res.message);
        setApproveTarget(null);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleReject(item: DepositRequestItem) {
    const reason = prompt(`Alasan menolak deposit @${item.reseller_username} (opsional):`) ?? "";
    startTransition(async () => {
      const res = await processDepositRequestAction({
        requestId: item.id,
        decision: "rejected",
        notes: reason,
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleManualCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createManualDepositRequestAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setManualOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Daftar Request Deposit</CardTitle>
          <CardDescription>
            Permintaan deposit dari perintah `/deposit` bot Telegram maupun input
            manual admin.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-40"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Catat Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Catat Antrean Deposit Manual</DialogTitle>
                <DialogDescription>
                  Menambahkan request deposit berstatus pending untuk diverifikasi.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleManualCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="m-res">Reseller</Label>
                  <Select id="m-res" name="reseller_id" required>
                    {resellers.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.username} ({r.telegram_id})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-amt">Nominal Deposit (Rp)</Label>
                  <Input
                    id="m-amt"
                    name="amount"
                    type="number"
                    min={1000}
                    defaultValue={100000}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    Simpan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Reseller</TableHead>
              <TableHead className="text-right">Nominal Diajukan</TableHead>
              <TableHead className="text-right">Nominal Disetujui</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Diproses Oleh</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Tidak ada antrean request deposit saat ini.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTimeID(item.created_at)}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">@{item.reseller_username}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {item.reseller_telegram_id}
                    </p>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatIDR(item.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {item.approved_amount !== null
                      ? formatIDR(item.approved_amount)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "approved"
                          ? "success"
                          : item.status === "rejected"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.processed_by || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openApproveDialog(item)}
                          disabled={isPending}
                        >
                          <Check className="size-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(item)}
                          disabled={isPending}
                        >
                          <X className="size-3.5" />
                          Tolak
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Selesai</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog
        open={Boolean(approveTarget)}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Approve Deposit</DialogTitle>
            <DialogDescription>
              Reseller @{approveTarget?.reseller_username}. Anda dapat menyesuaikan
              nominal jika transfer aktual berbeda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApprove} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-amount">Nominal Disetujui (Rp)</Label>
              <Input
                id="app-amount"
                type="number"
                min={1}
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-notes">Catatan (Opsional)</Label>
              <Input
                id="app-notes"
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Bukti transfer terverifikasi"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Setujui &amp; Tambah Saldo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
