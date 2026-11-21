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
import { HotspotUsersClient } from "./users-client";

export const metadata = {
  title: "MikroTik Hotspot Users",
};

export default async function HotspotUsersPage() {
  let errorMsg: string | null = null;
  let users: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotUsers"]>
  > = [];
  let profiles: string[] = [];
  let servers: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    const [uList, pList, sList] = await Promise.all([
      adapter.listHotspotUsers(),
      adapter.listHotspotProfiles(),
      adapter.listHotspotServers(),
    ]);
    users = uList;
    profiles = pList.map((p) => p.name);
    servers = sList.map((s) => s.name);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Hotspot Users (MikroTik)
          </h2>
          <p className="text-sm text-muted-foreground">
            Kelola daftar user `/ip/hotspot/user` langsung pada RouterOS v6 / v7.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/mikrotik/hotspot/users">
            <RefreshCw className="size-4" />
            Refresh
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daftar User ({users.length})
          </CardTitle>
          <CardDescription>
            Menampilkan hingga 200 hasil pencarian sekaligus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <HotspotUsersClient
              users={users}
              profiles={profiles}
              servers={servers}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
