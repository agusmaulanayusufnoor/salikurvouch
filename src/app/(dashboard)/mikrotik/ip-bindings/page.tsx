import Link from "next/link";
import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IpBindingsClient } from "./ip-bindings-client";

export const metadata = {
  title: "MikroTik IP Bindings",
};

export default async function IpBindingsPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let bindings: Awaited<
    ReturnType<
      Awaited<
        ReturnType<typeof getDefaultMikroTikAdapter>
      >["listHotspotIpBindings"]
    >
  > = [];
  let servers: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    const [bList, sList] = await Promise.all([
      adapter.listHotspotIpBindings(),
      adapter.listHotspotServers().catch(() => []),
    ]);
    bindings = bList;
    servers = sList.map((s) => s.name).filter(Boolean);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">IP Bindings</h2>
          <p className="text-sm text-muted-foreground">
            Kelola `/ip/hotspot/ip-binding` live dari {routerName} — tambah,
            edit, bypass/block, disable, hapus, dan cari perangkat.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/mikrotik/ip-bindings">
            <RefreshCw className="size-4" />
            Refresh Live
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4 text-primary" />
            Hotspot IP Bindings ({bindings.length.toLocaleString("id-ID")} entri)
          </CardTitle>
          <CardDescription>
            Pagination 25 baris per halaman dengan pencarian cepat, filter
            Type/Server/Status, serta CRUD langsung ke MikroTik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <IpBindingsClient bindings={bindings} servers={servers} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
