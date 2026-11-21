import Link from "next/link";
import { AlertTriangle, Laptop, RefreshCw } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DhcpLeasesClient } from "./dhcp-leases-client";

export const metadata = {
  title: "MikroTik DHCP Leases",
};

export default async function DhcpLeasesPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let leases: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listDhcpLeases"]
    >
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    leases = await adapter.listDhcpLeases();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">DHCP Leases</h2>
          <p className="text-sm text-muted-foreground">
            Daftar perangkat DHCP live dari {routerName} (`/ip/dhcp-server/lease`)
            — cari perangkat, filter, dan kick lease.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/mikrotik/dhcp-leases">
            <RefreshCw className="size-4" />
            Refresh Live
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Laptop className="size-4 text-primary" />
            DHCP Leases ({leases.length.toLocaleString("id-ID")} perangkat)
          </CardTitle>
          <CardDescription>
            Pagination 25 baris per halaman dengan pencarian cepat dan tombol
            Kick satuan maupun massal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <DhcpLeasesClient leases={leases} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
