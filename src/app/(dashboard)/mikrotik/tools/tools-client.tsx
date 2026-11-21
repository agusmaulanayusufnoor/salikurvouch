"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Route,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { PingResult, TracerouteResult } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { runPingAction, runTracerouteAction } from "./actions";

const PRESET_TARGETS = ["8.8.8.8", "1.1.1.1", "google.com", "cloudflare.com"];

export function MikroTikToolsClient({
  interfaces,
  routerName,
}: {
  interfaces: string[];
  routerName: string;
}) {
  const [activeTab, setActiveTab] = useState<"ping" | "traceroute">("ping");

  // Ping form state
  const [pingTarget, setPingTarget] = useState("8.8.8.8");
  const [pingCount, setPingCount] = useState("4");
  const [pingSize, setPingSize] = useState("56");
  const [pingInterface, setPingInterface] = useState("");
  const [pingSrcAddress, setPingSrcAddress] = useState("");
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  // Traceroute form state
  const [traceTarget, setTraceTarget] = useState("8.8.8.8");
  const [traceMaxHops, setTraceMaxHops] = useState("15");
  const [traceCount, setTraceCount] = useState("1");
  const [traceProtocol, setTraceProtocol] = useState<"icmp" | "udp">("icmp");
  const [traceInterface, setTraceInterface] = useState("");
  const [traceSrcAddress, setTraceSrcAddress] = useState("");
  const [traceUseDns, setTraceUseDns] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceResult, setTraceResult] = useState<TracerouteResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  async function handleRunPing(e: React.FormEvent) {
    e.preventDefault();
    setPingLoading(true);
    setPingError(null);
    try {
      const res = await runPingAction({
        address: pingTarget,
        count: Number(pingCount),
        size: pingSize ? Number(pingSize) : undefined,
        interfaceName: pingInterface || undefined,
        srcAddress: pingSrcAddress || undefined,
      });
      if (res.ok && res.data) {
        setPingResult(res.data);
        toast.success(`Ping ke ${res.data.target} selesai.`);
      } else {
        setPingError(res.message ?? "Ping gagal dijalankan.");
        toast.error(res.message ?? "Ping gagal dijalankan.");
      }
    } finally {
      setPingLoading(false);
    }
  }

  async function handleRunTraceroute(e: React.FormEvent) {
    e.preventDefault();
    setTraceLoading(true);
    setTraceError(null);
    try {
      const res = await runTracerouteAction({
        address: traceTarget,
        count: Number(traceCount),
        maxHops: Number(traceMaxHops),
        protocol: traceProtocol,
        interfaceName: traceInterface || undefined,
        srcAddress: traceSrcAddress || undefined,
        useDns: traceUseDns,
      });
      if (res.ok && res.data) {
        setTraceResult(res.data);
        toast.success(
          `Traceroute ke ${res.data.target} selesai (${res.data.hops.length} hop).`
        );
      } else {
        setTraceError(res.message ?? "Traceroute gagal dijalankan.");
        toast.error(res.message ?? "Traceroute gagal dijalankan.");
      }
    } finally {
      setTraceLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={activeTab === "ping" ? "default" : "outline"}
          onClick={() => setActiveTab("ping")}
        >
          <Activity className="size-4" />
          Ping
        </Button>
        <Button
          type="button"
          variant={activeTab === "traceroute" ? "default" : "outline"}
          onClick={() => setActiveTab("traceroute")}
        >
          <Route className="size-4" />
          Traceroute
        </Button>
      </div>

      {/* PING TAB */}
      {activeTab === "ping" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ping Tool — {routerName}
            </CardTitle>
            <CardDescription>
              Jalankan `/ping` langsung dari Router MikroTik ke target IP atau
              domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleRunPing} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="ping-target">Target IP / Hostname</Label>
                  <Input
                    id="ping-target"
                    value={pingTarget}
                    onChange={(e) => setPingTarget(e.target.value)}
                    placeholder="8.8.8.8 atau google.com"
                    className="font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ping-count">Count (1–10)</Label>
                  <Input
                    id="ping-count"
                    type="number"
                    min={1}
                    max={10}
                    value={pingCount}
                    onChange={(e) => setPingCount(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ping-size">Size (bytes)</Label>
                  <Input
                    id="ping-size"
                    type="number"
                    min={28}
                    max={1500}
                    value={pingSize}
                    onChange={(e) => setPingSize(e.target.value)}
                    placeholder="56"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ping-iface">Interface (Opsional)</Label>
                  <Select
                    id="ping-iface"
                    value={pingInterface}
                    onChange={(e) => setPingInterface(e.target.value)}
                  >
                    <option value="">Default Routing</option>
                    {interfaces.map((iface) => (
                      <option key={iface} value={iface}>
                        {iface}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Quick target:
                  </span>
                  {PRESET_TARGETS.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 font-mono text-xs"
                      onClick={() => setPingTarget(t)}
                    >
                      {t}
                    </Button>
                  ))}
                  <Input
                    value={pingSrcAddress}
                    onChange={(e) => setPingSrcAddress(e.target.value)}
                    placeholder="Src Address (opsional)"
                    className="h-7 w-44 font-mono text-xs"
                  />
                </div>

                <Button type="submit" disabled={pingLoading}>
                  {pingLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {pingLoading ? "Menjalankan Ping..." : "Mulai Ping"}
                </Button>
              </div>
            </form>

            {pingError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{pingError}</span>
              </div>
            ) : null}

            {pingResult ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Sent / Received
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold">
                      {pingResult.sent} / {pingResult.received}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Packet Loss</p>
                    <p
                      className={`mt-1 font-mono text-lg font-bold ${
                        pingResult.packetLossPct === 0
                          ? "text-emerald-600"
                          : pingResult.packetLossPct === 100
                            ? "text-destructive"
                            : "text-amber-600"
                      }`}
                    >
                      {pingResult.packetLossPct}%
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Avg RTT</p>
                    <p className="mt-1 font-mono text-lg font-bold text-primary">
                      {pingResult.avgRtt || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Min / Max RTT
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold">
                      {pingResult.minRtt || "-"} / {pingResult.maxRtt || "-"}
                    </p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Seq</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead className="w-24">Size</TableHead>
                      <TableHead className="w-24">TTL</TableHead>
                      <TableHead className="w-32">Time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pingResult.replies.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Tidak ada balasan dari router.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pingResult.replies.map((r, i) => {
                        const isOk =
                          Boolean(r.time) &&
                          r.status.toLowerCase() !== "timeout";
                        return (
                          <TableRow key={`${r.seq}-${i}`}>
                            <TableCell className="font-mono text-xs">
                              {r.seq}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold">
                              {r.host}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {r.size || "-"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {r.ttl || "-"}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold text-emerald-600">
                              {r.time || "-"}
                            </TableCell>
                            <TableCell>
                              {isOk ? (
                                <Badge variant="success" className="gap-1 text-[11px]">
                                  <CheckCircle2 className="size-3" />
                                  Reply
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="gap-1 text-[11px]">
                                  <XCircle className="size-3" />
                                  {r.status || "timeout"}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* TRACEROUTE TAB */}
      {activeTab === "traceroute" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Traceroute Tool — {routerName}
            </CardTitle>
            <CardDescription>
              Jalankan `/tool/traceroute` langsung dari Router MikroTik untuk
              melacak jalur hop ke tujuan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleRunTraceroute} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="trace-target">Target IP / Hostname</Label>
                  <Input
                    id="trace-target"
                    value={traceTarget}
                    onChange={(e) => setTraceTarget(e.target.value)}
                    placeholder="8.8.8.8 atau google.com"
                    className="font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trace-hops">Max Hops (1–30)</Label>
                  <Input
                    id="trace-hops"
                    type="number"
                    min={1}
                    max={30}
                    value={traceMaxHops}
                    onChange={(e) => setTraceMaxHops(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trace-proto">Protocol</Label>
                  <Select
                    id="trace-proto"
                    value={traceProtocol}
                    onChange={(e) =>
                      setTraceProtocol(e.target.value as "icmp" | "udp")
                    }
                  >
                    <option value="icmp">ICMP</option>
                    <option value="udp">UDP</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trace-count">Count (1–3)</Label>
                  <Input
                    id="trace-count"
                    type="number"
                    min={1}
                    max={3}
                    value={traceCount}
                    onChange={(e) => setTraceCount(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trace-iface">Interface (Opsional)</Label>
                  <Select
                    id="trace-iface"
                    value={traceInterface}
                    onChange={(e) => setTraceInterface(e.target.value)}
                  >
                    <option value="">Default Routing</option>
                    {interfaces.map((iface) => (
                      <option key={iface} value={iface}>
                        {iface}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Quick target:
                  </span>
                  {PRESET_TARGETS.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 font-mono text-xs"
                      onClick={() => setTraceTarget(t)}
                    >
                      {t}
                    </Button>
                  ))}
                  <Input
                    value={traceSrcAddress}
                    onChange={(e) => setTraceSrcAddress(e.target.value)}
                    placeholder="Src Address (opsional)"
                    className="h-7 w-44 font-mono text-xs"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={traceUseDns}
                      onChange={(e) => setTraceUseDns(e.target.checked)}
                      className="size-3.5 rounded border-input accent-primary"
                    />
                    Resolve DNS
                  </label>
                </div>

                <Button type="submit" disabled={traceLoading}>
                  {traceLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {traceLoading
                    ? "Menjalankan Traceroute..."
                    : "Mulai Traceroute"}
                </Button>
              </div>
            </form>

            {traceError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{traceError}</span>
              </div>
            ) : null}

            {traceResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="font-mono">
                    Target: {traceResult.target}
                  </Badge>
                  <Badge variant="success" className="font-mono">
                    {traceResult.hops.length} hop terdeteksi
                  </Badge>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Hop</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="w-24">Loss</TableHead>
                      <TableHead className="w-20">Sent</TableHead>
                      <TableHead className="w-24">Last</TableHead>
                      <TableHead className="w-24">Avg</TableHead>
                      <TableHead className="w-24">Best</TableHead>
                      <TableHead className="w-24">Worst</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traceResult.hops.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Tidak ada hop yang dikembalikan router.
                        </TableCell>
                      </TableRow>
                    ) : (
                      traceResult.hops.map((h) => {
                        const isTimeout =
                          h.address === "*" ||
                          h.status.toLowerCase().includes("timeout");
                        return (
                          <TableRow key={h.hop}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {h.hop}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-xs ${
                                isTimeout
                                  ? "text-muted-foreground"
                                  : "font-semibold text-foreground"
                              }`}
                            >
                              {h.address}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {h.lossPct}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {h.sent}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {h.last}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-emerald-600">
                              {h.avg}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {h.best}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {h.worst}
                            </TableCell>
                            <TableCell className="text-xs">
                              {isTimeout ? (
                                <Badge variant="warning" className="text-[11px]">
                                  {h.status || "timeout"}
                                </Badge>
                              ) : h.status ? (
                                <Badge variant="secondary" className="text-[11px]">
                                  {h.status}
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-[11px]">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
