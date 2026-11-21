import Link from "next/link";
import { AlertTriangle, List, RefreshCw, Wifi } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActiveVouchersClient } from "./active-client";

export const metadata = {
  title: "Voucher Aktif Login",
};

export default async function ActiveVouchersPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let sessions: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotActive"]
    >
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    sessions = await adapter.listHotspotActive();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Voucher Aktif Login
          </h2>
          <p className="text-sm text-muted-foreground">
            Sesi Hotspot aktif real-time dari {routerName} (`/ip/hotspot/active`)
            — cari voucher dan kick user aktif ala Mikhmon.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers/list">
              <List className="size-4" />
              List Semua Voucher
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers/active">
              <RefreshCw className="size-4" />
              Refresh Live
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="size-4 text-emerald-600" />
            Hotspot Active ({sessions.length.toLocaleString("id-ID")} online)
          </CardTitle>
          <CardDescription>
            Pagination 25 voucher per halaman dengan pencarian cepat dan tombol
            Kick user aktif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <ActiveVouchersClient sessions={sessions} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
