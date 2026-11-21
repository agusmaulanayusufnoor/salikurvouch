import { AlertTriangle } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HotspotProfilesClient } from "./profiles-client";

export const metadata = {
  title: "MikroTik Hotspot Profiles",
};

export default async function HotspotProfilesPage() {
  let errorMsg: string | null = null;
  let profiles: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listHotspotProfiles"]>
  > = [];
  let queues: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    [profiles, queues] = await Promise.all([
      adapter.listHotspotProfiles(),
      adapter.listSimpleQueues().catch(() => []),
    ]);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Hotspot User Profiles
        </h2>
        <p className="text-sm text-muted-foreground">
          Kelola profile kecepatan, validity, lock MAC, dan parent queue pada
          MikroTik.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daftar Profile ({profiles.length})
          </CardTitle>
          <CardDescription>Dari `/ip/hotspot/user/profile`</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <HotspotProfilesClient profiles={profiles} queues={queues} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
