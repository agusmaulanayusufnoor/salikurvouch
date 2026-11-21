import { AlertTriangle } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PppProfilesClient } from "./profiles-client";

export const metadata = {
  title: "MikroTik PPP Profiles",
};

export default async function PppProfilesPage() {
  let errorMsg: string | null = null;
  let profiles: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listPppProfiles"]>
  > = [];
  let pools: string[] = [];
  let queues: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    [profiles, pools, queues] = await Promise.all([
      adapter.listPppProfiles(),
      adapter.listIpPools().catch(() => []),
      adapter.listSimpleQueues().catch(() => []),
    ]);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">PPP Profiles</h2>
        <p className="text-sm text-muted-foreground">
          Kelola IP Pool, Rate Limit, Parent Queue, dan auto-move profile PPPoE.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daftar Profile ({profiles.length})
          </CardTitle>
          <CardDescription>Dari `/ppp/profile`</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <PppProfilesClient
              profiles={profiles}
              pools={pools}
              queues={queues}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
