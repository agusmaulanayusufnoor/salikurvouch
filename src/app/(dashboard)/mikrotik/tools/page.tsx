import { AlertTriangle } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { MikroTikToolsClient } from "./tools-client";

export const metadata = {
  title: "Ping & Traceroute MikroTik",
};

export default async function MikroTikToolsPage() {
  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let interfaces: string[] = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    const ifaces = await adapter.listInterfaces().catch(() => []);
    interfaces = ifaces.map((i) => i.name).filter(Boolean);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Ping &amp; Traceroute
        </h2>
        <p className="text-sm text-muted-foreground">
          Alat diagnosa jaringan langsung dari Router MikroTik ({routerName}) —
          mendukung ROS v6 &amp; v7.
        </p>
      </div>

      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : (
        <MikroTikToolsClient interfaces={interfaces} routerName={routerName} />
      )}
    </div>
  );
}
