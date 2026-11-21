import { AlertTriangle, Radio } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrafficClient } from "./traffic-client";

export const metadata = {
  title: "Traffic Monitor & Netwatch",
};

export default async function TrafficPage() {
  let errorMsg: string | null = null;
  let interfaces: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listInterfaces"]>
  > = [];
  let netwatch: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listNetwatch"]>
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    [interfaces, netwatch] = await Promise.all([
      adapter.listInterfaces(),
      adapter.listNetwatch().catch(() => []),
    ]);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Traffic Monitor &amp; Netwatch
        </h2>
        <p className="text-sm text-muted-foreground">
          Grafik bandwidth interface real-time (`/interface/monitor-traffic`)
          dan status host (`/tool/netwatch`).
        </p>
      </div>

      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : (
        <>
          <TrafficClient interfaces={interfaces} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="size-4 text-primary" />
                Netwatch Host Monitoring ({netwatch.length})
              </CardTitle>
              <CardDescription>Dari `/tool/netwatch/print`</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host IP</TableHead>
                    <TableHead>Keterangan / Lokasi</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Sejak</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {netwatch.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Belum ada rule Netwatch pada router.
                      </TableCell>
                    </TableRow>
                  ) : (
                    netwatch.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {h.host}
                        </TableCell>
                        <TableCell className="text-xs">
                          {h.comment || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {h.interval || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {h.since || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              h.status.toLowerCase() === "up"
                                ? "success"
                                : "destructive"
                            }
                          >
                            {h.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
