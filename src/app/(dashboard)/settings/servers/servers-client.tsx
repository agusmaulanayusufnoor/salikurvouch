"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Server,
  Plus,
  CheckCircle2,
  ArrowRightLeft,
  Settings,
  Webhook,
  Trash2,
  Loader2,
  Router,
  Bot,
  Users,
} from "lucide-react";
import Link from "next/link";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { switchActiveServerAction } from "@/app/(dashboard)/server-actions";
import { createServerAction, deleteServerAction } from "./actions";

export interface ServerCardItem {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  routerHost: string;
  routerPort: number;
  routerRosVersion: string;
  routerDnsName: string;
  botUsername: string | null;
  hasBotToken: boolean;
  ownerUsername: string | null;
  resellerCount: number;
  packageCount: number;
}

export function ServersClient({
  servers,
  activeServerId,
  isSuperAdmin,
}: {
  servers: ServerCardItem[];
  activeServerId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [rosVersion, setRosVersion] = useState<"v6" | "v7">("v6");
  const [isPending, startTransition] = useTransition();

  function handleSwitch(serverId: string) {
    startTransition(async () => {
      const res = await switchActiveServerAction(serverId);
      if (res.ok) {
        toast.success(res.message ?? "Server aktif diperbarui.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Gagal mengganti server.");
      }
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createServerAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleDisable(srv: ServerCardItem) {
    if (
      !confirm(
        `Nonaktifkan server "${srv.name}"? Riwayat transaksi tetap tersimpan aman di database.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteServerAction(srv.id);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Kelola Multi-Server &amp; Router
          </h2>
          <p className="text-sm text-muted-foreground">
            Kelola banyak router MikroTik &amp; bot Telegram dalam satu panel
            SalikurVouch dan satu database Supabase.
          </p>
        </div>

        <Button type="button" onClick={() => setModalOpen(true)}>
          <Plus className="size-4" />
          Tambah Server Baru
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {servers.map((srv) => {
          const isActive = srv.id === activeServerId;
          return (
            <Card
              key={srv.id}
              className={
                isActive ? "border-primary ring-1 ring-primary/30" : undefined
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Server className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        {srv.name}
                        {srv.isDefault ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Utama
                          </Badge>
                        ) : null}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        slug: {srv.slug}
                      </CardDescription>
                    </div>
                  </div>
                  {isActive ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      Aktif
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Router className="size-3.5" /> MikroTik
                    </span>
                    <span className="font-mono font-semibold">
                      {srv.routerHost}:{srv.routerPort} (ROS{" "}
                      {srv.routerRosVersion})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Bot className="size-3.5" /> Bot Telegram
                    </span>
                    <span className="font-mono font-semibold">
                      {srv.botUsername
                        ? `@${srv.botUsername}`
                        : srv.hasBotToken
                          ? "Token Terpasang"
                          : "Belum Diatur"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5" /> Reseller / Paket
                    </span>
                    <span className="font-mono font-semibold">
                      {srv.resellerCount} reseller • {srv.packageCount} paket
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Webhook Path</span>
                    <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">
                      /api/telegram/webhook/{srv.slug}
                    </code>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSwitch(srv.id)}
                        disabled={isPending}
                      >
                        <ArrowRightLeft className="size-3.5" />
                        Buka Server Ini
                      </Button>
                    ) : (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings">
                            <Settings className="size-3.5" />
                            Pengaturan
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings/webhook">
                            <Webhook className="size-3.5" />
                            Webhook
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>

                  {isSuperAdmin && !srv.isDefault ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDisable(srv)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                      Nonaktifkan
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add New Server Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Tambah Server MikroTik &amp; Bot Baru</DialogTitle>
            <DialogDescription>
              Setiap server memiliki Router MikroTik, Bot Telegram, daftar
              reseller, saldo, dan paket voucher sendiri yang terisolasi rapi
              dalam 1 database Supabase.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="srv-name">Nama Server</Label>
                <Input
                  id="srv-name"
                  name="name"
                  placeholder="Contoh: SalikurNet 3"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-slug">Slug URL Webhook</Label>
                <Input
                  id="srv-slug"
                  name="slug"
                  placeholder="Contoh: server3"
                  className="font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="srv-host">IP / Host MikroTik</Label>
                <Input
                  id="srv-host"
                  name="router_host"
                  placeholder="167.99.68.60"
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-port">Port API</Label>
                <Input
                  id="srv-port"
                  name="router_port"
                  type="number"
                  defaultValue="8728"
                  className="font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="srv-ros">Versi RouterOS</Label>
                <Select
                  id="srv-ros"
                  name="ros_version"
                  value={rosVersion}
                  onChange={(e) => setRosVersion(e.target.value as "v6" | "v7")}
                >
                  <option value="v6">RouterOS v6 (Binary API)</option>
                  <option value="v7">RouterOS v7 (REST / Binary API)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-mode">Mode Koneksi</Label>
                <Select
                  id="srv-mode"
                  name="connection_mode"
                  defaultValue="api_tcp"
                >
                  <option value="api_tcp">API TCP (Port 8728 / Custom)</option>
                  <option value="api_ssl">API SSL (Port 8729)</option>
                  {rosVersion === "v7" ? (
                    <option value="rest_api">REST API HTTPS (ROS v7)</option>
                  ) : null}
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="srv-user">Username MikroTik</Label>
                <Input
                  id="srv-user"
                  name="router_username"
                  defaultValue="admin"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-pass">Password MikroTik</Label>
                <Input
                  id="srv-pass"
                  name="router_password"
                  type="password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-dns">DNS Hotspot</Label>
                <Input
                  id="srv-dns"
                  name="dns_name"
                  defaultValue="wifi.salikur.net"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="srv-token">Bot Token Telegram (Opsional)</Label>
                <Input
                  id="srv-token"
                  name="bot_token"
                  type="password"
                  placeholder="123456:AAH..."
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-botuser">Username Bot (tanpa @)</Label>
                <Input
                  id="srv-botuser"
                  name="bot_username"
                  placeholder="salikurnet3bot"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="srv-owner-u">Username Owner Telegram</Label>
                <Input
                  id="srv-owner-u"
                  name="owner_username"
                  placeholder="agusmyn"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-owner-id">ID Telegram Owner</Label>
                <Input
                  id="srv-owner-id"
                  name="owner_telegram_id"
                  placeholder="150377182"
                  className="font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Simpan &amp; Aktifkan Server
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
