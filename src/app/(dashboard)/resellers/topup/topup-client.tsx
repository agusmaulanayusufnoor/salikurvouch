"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, Loader2, Send } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adjustBalanceAction } from "../actions";

export interface TopupResellerOption {
  id: string;
  telegram_id: number;
  username: string;
  balance: number;
  status: string;
}

const PRESETS = [50000, 100000, 200000, 300000, 500000, 1000000];

export function TopupClient({
  resellers,
  initialTelegramId,
}: {
  resellers: TopupResellerOption[];
  initialTelegramId?: string;
}) {
  const [selectedTid, setSelectedTid] = useState(
    initialTelegramId || (resellers[0] ? String(resellers[0].telegram_id) : "")
  );
  const [txType, setTxType] = useState<"topup" | "topdown">("topup");
  const [amount, setAmount] = useState("100000");
  const [notes, setNotes] = useState("");
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [isPending, startTransition] = useTransition();

  const currentReseller = resellers.find(
    (r) => String(r.telegram_id) === selectedTid
  );
  const numericAmount = Math.max(0, Number(amount) || 0);
  const projectedBalance = currentReseller
    ? txType === "topup"
      ? currentReseller.balance + numericAmount
      : currentReseller.balance - numericAmount
    : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentReseller) {
      toast.error("Pilih reseller terlebih dahulu.");
      return;
    }
    if (txType === "topdown" && projectedBalance < 0) {
      toast.error("Nominal Top Down melebihi saldo aktif reseller.");
      return;
    }

    const fd = new FormData();
    fd.set("telegram_id", String(currentReseller.telegram_id));
    fd.set("tx_type", txType);
    fd.set("amount", String(numericAmount));
    fd.set("notes", notes);
    fd.set("notify_telegram", String(notifyTelegram));

    startTransition(async () => {
      const res = await adjustBalanceAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setNotes("");
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaksi Top Up / Top Down Atomik</CardTitle>
        <CardDescription>
          Menggunakan PostgreSQL row-level locking (`rpc_adjust_balance`) untuk
          mencegah race condition dan saldo minus.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setTxType("topup")}
              className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                txType === "topup"
                  ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30"
                  : "hover:bg-muted/50"
              }`}
            >
              <ArrowUpCircle className="size-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Top Up Saldo (+)</p>
                <p className="text-xs text-muted-foreground">
                  Menambah deposit saldo reseller
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTxType("topdown")}
              className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                txType === "topdown"
                  ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30"
                  : "hover:bg-muted/50"
              }`}
            >
              <ArrowDownCircle className="size-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Top Down / Refund (-)</p>
                <p className="text-xs text-muted-foreground">
                  Mengurangi saldo reseller secara aman
                </p>
              </div>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reseller-select">Pilih Reseller</Label>
            <Select
              id="reseller-select"
              value={selectedTid}
              onChange={(e) => setSelectedTid(e.target.value)}
            >
              {resellers.map((r) => (
                <option key={r.id} value={String(r.telegram_id)}>
                  @{r.username} (ID: {r.telegram_id}) — Saldo:{" "}
                  {formatIDR(r.balance)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nominal-input">Nominal (Rp)</Label>
            <Input
              id="nominal-input"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(p))}
                >
                  {formatIDR(p)}
                </Button>
              ))}
            </div>
          </div>

          {currentReseller ? (
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Saldo Awal</p>
                <p className="font-mono font-semibold">
                  {formatIDR(currentReseller.balance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mutasi</p>
                <p
                  className={`font-mono font-semibold ${
                    txType === "topup" ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {txType === "topup" ? "+" : "-"}
                  {formatIDR(numericAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estimasi Akhir</p>
                <p
                  className={`font-mono font-bold ${
                    projectedBalance < 0 ? "text-destructive" : ""
                  }`}
                >
                  {formatIDR(projectedBalance)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="topup-notes">Catatan (Opsional)</Label>
            <Input
              id="topup-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Misal: Transfer BCA a.n. Budi"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Kirim Notifikasi Telegram</p>
                <p className="text-xs text-muted-foreground">
                  Mengirim struk mutasi saldo (+ tombol Beli Voucher untuk Top Up)
                  ke chat reseller.
                </p>
              </div>
            </div>
            <Switch
              checked={notifyTelegram}
              onCheckedChange={setNotifyTelegram}
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || (txType === "topdown" && projectedBalance < 0)}
            className="w-full sm:w-auto"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {txType === "topup" ? "Proses Top Up Saldo" : "Proses Top Down Saldo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
