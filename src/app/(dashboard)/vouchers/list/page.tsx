import Link from "next/link";
import { AlertTriangle, RefreshCw, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveServer } from "@/lib/server-context";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VoucherListClient } from "./list-client";

export const metadata = {
  title: "List Semua Voucher Hotspot",
};

export default async function VoucherListPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let users: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotUsers"]>
  > = [];
  let profiles: string[] = [];
  let servers: string[] = [];

  const [supabase, activeServer] = await Promise.all([
    createClient(),
    getActiveServer(),
  ]);
  const resellersPromise = supabase
    .from("resellers")
    .select("id, telegram_id, username")
    .eq("server_id", activeServer?.id ?? "")
    .eq("status", "active")
    .order("username", { ascending: true });

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    const [uList, pList, sList] = await Promise.all([
      adapter.listHotspotUsers(),
      adapter.listHotspotProfiles().catch(() => []),
      adapter.listHotspotServers().catch(() => []),
    ]);
    users = uList;
    profiles = pList.map((p) => p.name);
    servers = sList.map((s) => s.name);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  const { data: resellersData } = await resellersPromise;
  const resellers = (resellersData ?? []).map((r) => ({
    id: r.id,
    telegram_id: r.telegram_id,
    username: r.username,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            List Semua Voucher Hotspot
          </h2>
          <p className="text-sm text-muted-foreground">
            Data live dari {routerName} — filter per Profile &amp; Comment ala
            Mikhmon, edit, reset counter, kirim Telegram, dan hapus voucher.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers/send">
              <Ticket className="size-4" />
              Generate Batch
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers/list">
              <RefreshCw className="size-4" />
              Refresh Live
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Total Voucher di Router ({users.length.toLocaleString("id-ID")})
          </CardTitle>
          <CardDescription>
            Klik nama voucher untuk Edit / Reset Counter / Kirim Telegram, atau
            klik Profile / Comment pada tabel untuk langsung memfilter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <VoucherListClient
              users={users}
              profiles={profiles}
              servers={servers}
              resellers={resellers}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
