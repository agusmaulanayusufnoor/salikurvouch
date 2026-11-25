"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Ticket,
  Package,
  Printer,
  Loader2,
  Send,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  generateBatchVoucherAction,
  generateCustomSingleVoucherAction,
  type VoucherSendResult,
} from "./actions";

export interface SendResellerOption {
  id: string;
  telegram_id: number;
  username: string;
  balance: number;
}

export interface SendPackageOption {
  id: string;
  name: string;
  mode: string;
  price: number;
  markup: number;
  mikrotik_profile: string;
  limit_uptime: string;
  limit_total_mb: number;
}

export function SendVoucherClient({
  resellers,
  packages,
}: {
  resellers: SendResellerOption[];
  packages: SendPackageOption[];
}) {
  // Batch form state
  const [resellerId, setResellerId] = useState(resellers[0]?.id ?? "");
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [quantity, setQuantity] = useState("10");
  const [prefix, setPrefix] = useState("");
  const [customComment, setCustomComment] = useState("");
  const [deductBalance, setDeductBalance] = useState(false); // Locked Decision #5: default OFF
  const [sendTelegram, setSendTelegram] = useState(true);

  // Single custom state
  const [singleResellerId, setSingleResellerId] = useState(
    resellers[0]?.id ?? ""
  );
  const [singleSendTg, setSingleSendTg] = useState(true);
  const [singleRollback, setSingleRollback] = useState(true);

  const [lastResult, setLastResult] = useState<VoucherSendResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedReseller = resellers.find((r) => r.id === resellerId);
  const selectedPkg = packages.find((p) => p.id === packageId);
  const qtyNum = Math.min(Math.max(Number(quantity) || 1, 1), 100);
  const unitNet = selectedPkg
    ? Math.max(selectedPkg.price - selectedPkg.markup, 0)
    : 0;
  const totalDeduct = deductBalance ? unitNet * qtyNum : 0;
  const insufficientBalance =
    deductBalance &&
    selectedReseller &&
    selectedReseller.balance < totalDeduct;

  function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("reseller_id", resellerId);
    fd.set("package_id", packageId);
    fd.set("quantity", String(qtyNum));
    fd.set("prefix", prefix);
    fd.set("custom_comment", customComment);
    fd.set("deduct_balance", String(deductBalance));
    fd.set("send_telegram", String(sendTelegram));

    startTransition(async () => {
      const res = await generateBatchVoucherAction(fd);
      setLastResult(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleSingleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("reseller_id", singleResellerId);
    fd.set("send_telegram", String(singleSendTg));
    fd.set("rollback_on_telegram_fail", String(singleRollback));

    startTransition(async () => {
      const res = await generateCustomSingleVoucherAction(fd);
      setLastResult(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="batch">
        <TabsList>
          <TabsTrigger value="batch">
            <Package className="size-4" />
            Batch Generator (1–100)
          </TabsTrigger>
          <TabsTrigger value="single">
            <Ticket className="size-4" />
            Custom Single Voucher
          </TabsTrigger>
        </TabsList>

        <TabsContent value="batch">
          <Card>
            <CardHeader>
              <CardTitle>Generate &amp; Kirim Batch Voucher</CardTitle>
              <CardDescription>
                Membuat 1–100 voucher langsung di MikroTik (ROS v6/v7), menyimpan
                arsip ke Supabase, dan siap cetak kartu PDF A4 (5 kolom, maks.
                50/halaman).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBatchSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="b-reseller">Reseller Penerima</Label>
                    <Select
                      id="b-reseller"
                      value={resellerId}
                      onChange={(e) => setResellerId(e.target.value)}
                      required
                    >
                      {resellers.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.username} — Saldo: {formatIDR(r.balance)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="b-package">Paket Voucher</Label>
                    <Select
                      id="b-package"
                      value={packageId}
                      onChange={(e) => setPackageId(e.target.value)}
                      required
                    >
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.mikrotik_profile}) — Jual{" "}
                          {formatIDR(p.price)} / Potong{" "}
                          {formatIDR(Math.max(p.price - p.markup, 0))}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="b-qty">Jumlah Voucher (1–100)</Label>
                    <Input
                      id="b-qty"
                      type="number"
                      min={1}
                      max={100}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="b-prefix">Prefix Kode (Opsional)</Label>
                    <Input
                      id="b-prefix"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      placeholder="misal: v5-"
                      maxLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="b-custom-comment">
                      Custom Comment (Opsional)
                    </Label>
                    <Input
                      id="b-custom-comment"
                      value={customComment}
                      onChange={(e) => setCustomComment(e.target.value)}
                      placeholder="Default: BATCH"
                      maxLength={32}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Mengganti kata{" "}
                      <code className="font-mono">BATCH</code> →{" "}
                      <code className="font-mono">
                        {(customComment
                          .trim()
                          .replace(/\s+/g, "_")
                          .replace(/[^A-Za-z0-9_-]/g, "")
                          .replace(/_+/g, "_")
                          .replace(/^[_-]+|[_-]+$/g, "") || "BATCH")}
                        _YYYYMMDD_...
                      </code>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Total Nilai Jual / Potong Saldo
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold">
                      {formatIDR((selectedPkg?.price ?? 0) * qtyNum)} /{" "}
                      <span
                        className={
                          insufficientBalance
                            ? "text-destructive"
                            : "text-emerald-600"
                        }
                      >
                        {formatIDR(totalDeduct)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2.5">
                      <Wallet className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">
                          Potong Saldo Reseller
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Default non-aktif (sesuai perilaku legacy Broadcast_z)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={deductBalance}
                      onCheckedChange={setDeductBalance}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2.5">
                      <Send className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Kirim ke Telegram</p>
                        <p className="text-xs text-muted-foreground">
                          1 voucher kirim QR PNG; &gt;1 kirim daftar terpecah rapi
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={sendTelegram}
                      onCheckedChange={setSendTelegram}
                    />
                  </div>
                </div>

                {insufficientBalance ? (
                  <p className="text-sm font-medium text-destructive">
                    Saldo @{selectedReseller?.username} tidak cukup untuk memotong{" "}
                    {formatIDR(totalDeduct)}.
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={isPending || Boolean(insufficientBalance)}
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Package className="size-4" />
                  )}
                  Generate {qtyNum} Voucher Sekarang
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Buat &amp; Kirim Custom Single Voucher</CardTitle>
              <CardDescription>
                Tentukan username, password, dan profile Hotspot secara manual lalu
                kirim gambar QR Code lokal ke Telegram reseller.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSingleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="s-reseller">Reseller Penerima</Label>
                    <Select
                      id="s-reseller"
                      value={singleResellerId}
                      onChange={(e) => setSingleResellerId(e.target.value)}
                      required
                    >
                      {resellers.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.username} ({r.telegram_id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-profile">Hotspot Profile MikroTik</Label>
                    <Input
                      id="s-profile"
                      name="profile"
                      defaultValue={packages[0]?.mikrotik_profile ?? "default"}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="s-user">Username Voucher</Label>
                    <Input
                      id="s-user"
                      name="username"
                      placeholder="tamu2026"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-pass">
                      Password (kosongkan jika = username)
                    </Label>
                    <Input id="s-pass" name="password" placeholder="opsional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-server">Server Hotspot</Label>
                    <Input id="s-server" name="server" defaultValue="all" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="s-uptime">Limit Uptime</Label>
                    <Input
                      id="s-uptime"
                      name="limit_uptime"
                      defaultValue="1d"
                      placeholder="1d / 7d / 00:00:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-quota">Limit Kuota Total (MB)</Label>
                    <Input
                      id="s-quota"
                      name="limit_total_mb"
                      type="number"
                      min={0}
                      defaultValue={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-price">Harga Label Kartu (Rp)</Label>
                    <Input
                      id="s-price"
                      name="price"
                      type="number"
                      min={0}
                      defaultValue={5000}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="s-custom-comment">
                    Custom Comment (Opsional)
                  </Label>
                  <Input
                    id="s-custom-comment"
                    name="custom_comment"
                    placeholder="Kosongkan untuk default: BATCH"
                    maxLength={32}
                  />
                  <p className="text-xs text-muted-foreground">
                    Jika diisi, menggantikan kata{" "}
                    <code className="font-mono">BATCH</code> pada comment
                    MikroTik dan kode batch (misal:{" "}
                    <code className="font-mono">PROMO_20261124_...</code>).
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      Kirim QR Code ke Telegram
                    </p>
                    <Switch
                      checked={singleSendTg}
                      onCheckedChange={setSingleSendTg}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      Auto-Rollback MikroTik jika Telegram gagal
                    </p>
                    <Switch
                      checked={singleRollback}
                      onCheckedChange={setSingleRollback}
                    />
                  </div>
                </div>

                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Ticket className="size-4" />
                  )}
                  Buat &amp; Kirim Voucher Custom
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {lastResult?.ok && lastResult.batchCode ? (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <div>
                <CardTitle className="text-base">
                  Batch {lastResult.batchCode} Berhasil Dibuat
                </CardTitle>
                <CardDescription>{lastResult.message}</CardDescription>
              </div>
            </div>
            <Button asChild size="sm">
              <Link
                href={`/print/vouchers/${lastResult.batchCode}`}
                target="_blank"
              >
                <Printer className="size-4" />
                Cetak Kartu PDF A4
              </Link>
            </Button>
          </CardHeader>
          {lastResult.vouchers && lastResult.vouchers.length > 0 ? (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastResult.vouchers.map((item, i) => (
                    <TableRow key={item.username}>
                      <TableCell className="text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {item.username}
                      </TableCell>
                      <TableCell className="font-mono">
                        {item.password}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.profile}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatIDR(item.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
