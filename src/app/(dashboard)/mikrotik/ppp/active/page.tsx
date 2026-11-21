import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PppActiveClient } from "./active-client";

export const metadata = {
  title: "MikroTik PPP Active",
};

export default async function PppActivePage() {
  let errorMsg: string | null = null;
  let sessions: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listPppActive"]>
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    sessions = await adapter.listPppActive();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            PPP Active Connections
          </h2>
          <p className="text-sm text-muted-foreground">
            Pantau sesi PPPoE/VPN aktif (`/ppp/active`) dan disconnect secara
            real-time.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/mikrotik/ppp/active">
            <RefreshCw className="size-4" />
            Refresh
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Koneksi Aktif ({sessions.length})
          </CardTitle>
          <CardDescription>Real-time dari Router MikroTik</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <PppActiveClient sessions={sessions} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
