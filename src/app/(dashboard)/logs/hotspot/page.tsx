import Link from "next/link";
import { AlertTriangle, FileClock, RefreshCw, ScrollText } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HotspotLogClient } from "./hotspot-log-client";

export const metadata = {
  title: "Hotspot Log",
};

export default async function HotspotLogPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let logs: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotLogs"]
    >
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    logs = await adapter.listHotspotLogs();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hotspot Log</h2>
          <p className="text-sm text-muted-foreground">
            Log aktivitas Hotspot real-time dari {routerName} (`/log` topik
            hotspot) ala Mikhmon.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/logs/users">
              <FileClock className="size-4" />
              User Log
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/logs/hotspot">
              <RefreshCw className="size-4" />
              Refresh Live
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-4 text-primary" />
            Hotspot Log ({logs.length.toLocaleString("id-ID")} entri)
          </CardTitle>
          <CardDescription>
            Menampilkan aktivitas login, logout, dan autentikasi voucher
            Hotspot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <HotspotLogClient logs={logs} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
