import { AlertTriangle } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PppSecretsClient } from "./secrets-client";

export const metadata = {
  title: "MikroTik PPP Secrets",
};

export default async function PppSecretsPage() {
  let errorMsg: string | null = null;
  let secrets: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listPppSecrets"]>
  > = [];
  let profiles: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    const [sList, pList] = await Promise.all([
      adapter.listPppSecrets(),
      adapter.listPppProfiles().catch(() => []),
    ]);
    secrets = sList;
    profiles = pList.map((p) => p.name);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">PPP Users / Secrets</h2>
        <p className="text-sm text-muted-foreground">
          Manajemen akun PPPoE/VPN (`/ppp/secret`) langsung pada MikroTik.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daftar Secrets ({secrets.length})
          </CardTitle>
          <CardDescription>Dari `/ppp/secret`</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <PppSecretsClient secrets={secrets} profiles={profiles} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
