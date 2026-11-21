"use client";

import { useEffect, useState } from "react";
import { Activity, Pause, Play, ArrowDown, ArrowUp } from "lucide-react";
import type { InterfaceTraffic, RouterInterface } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
  return `${Math.round(bps)} bps`;
}

export function TrafficClient({
  interfaces,
}: {
  interfaces: RouterInterface[];
}) {
  const [selected, setSelected] = useState(interfaces[0]?.name ?? "ether1");
  const [running, setRunning] = useState(true);
  const [samples, setSamples] = useState<InterfaceTraffic[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!running || !selected) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/mikrotik/traffic?interface=${encodeURIComponent(selected)}`
        );
        const json = (await res.json()) as {
          ok: boolean;
          data?: InterfaceTraffic;
          error?: string;
        };
        if (cancelled) return;
        if (json.ok && json.data) {
          setErrorMsg(null);
          setSamples((prev) => [...prev.slice(-29), json.data!]);
        } else {
          setErrorMsg(json.error ?? "Gagal membaca traffic");
        }
      } catch {
        if (!cancelled) setErrorMsg("Koneksi ke server terputus");
      }
    };

    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, selected]);

  const latest = samples[samples.length - 1];
  const maxVal = Math.max(
    10_000,
    ...samples.flatMap((s) => [s.rxBitsPerSecond, s.txBitsPerSecond])
  );

  const width = 640;
  const height = 220;
  const toPoints = (getter: (s: InterfaceTraffic) => number) => {
    if (samples.length === 0) return "";
    return samples
      .map((s, idx) => {
        const x =
          samples.length === 1
            ? width
            : (idx / (samples.length - 1)) * width;
        const y = height - (getter(s) / maxVal) * (height - 16) - 8;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const rxPoints = toPoints((s) => s.rxBitsPerSecond);
  const txPoints = toPoints((s) => s.txBitsPerSecond);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" />
            Live Interface Traffic (Polling 3 detik)
          </CardTitle>
          <CardDescription>
            Skala puncak grafik: {formatBps(maxVal)}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setSamples([]);
            }}
            className="w-48"
          >
            {interfaces.map((iface) => (
              <option key={iface.id} value={iface.name}>
                {iface.name} ({iface.type})
              </option>
            ))}
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? (
              <>
                <Pause className="size-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="size-4" />
                Lanjut
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-2">
              <ArrowDown className="size-4 text-blue-600" />
              <span className="text-sm font-medium">RX (Download)</span>
            </div>
            <span className="font-mono text-lg font-bold text-blue-700 dark:text-blue-400">
              {formatBps(latest?.rxBitsPerSecond ?? 0)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2">
              <ArrowUp className="size-4 text-emerald-600" />
              <span className="text-sm font-medium">TX (Upload)</span>
            </div>
            <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {formatBps(latest?.txBitsPerSecond ?? 0)}
            </span>
          </div>
        </div>

        {errorMsg ? (
          <Badge variant="destructive">{errorMsg}</Badge>
        ) : null}

        <div className="overflow-hidden rounded-lg border bg-muted/20 p-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-56 w-full"
            preserveAspectRatio="none"
          >
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={0}
                x2={width}
                y1={height * ratio}
                y2={height * ratio}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4 4"
              />
            ))}
            {rxPoints ? (
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                points={rxPoints}
              />
            ) : null}
            {txPoints ? (
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                points={txPoints}
              />
            ) : null}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
