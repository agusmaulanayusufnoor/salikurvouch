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
import { HotspotActiveClient } from "./active-client";

export const metadata = {
  title: "MikroTik Hotspot Active",
};

export default async function HotspotActivePage() {
  let errorMsg: string | null = null;
  let sessions: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotActive"]>
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    sessions = await adapter.listHotspotActive();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Hotspot Active Sessions
          </h2>
          <p className="text-sm text-muted-foreground">
            Daftar perangkat online (`/ip/hotspot/active`) beserta tombol Kick.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/mikrotik/hotspot/active">
            <RefreshCw className="size-4" />
            Refresh
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Online Sekarang ({sessions.length})
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
            <HotspotActiveClient sessions={sessions} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
