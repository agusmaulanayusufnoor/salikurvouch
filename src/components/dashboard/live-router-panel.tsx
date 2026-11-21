"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Router,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi,
  Ticket,
  Radio,
  Thermometer,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import type { RouterStatusSnapshot } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function fmtMb(bytes: number): string {
  return `${Math.round(bytes / 1048576)} MB`;
}

export function LiveRouterPanel() {
  const [snapshot, setSnapshot] = useState<RouterStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/mikrotik/status");
      const json = (await res.json()) as {
        ok: boolean;
        data?: RouterStatusSnapshot;
        error?: string;
      };
      if (json.ok && json.data) {
        setSnapshot(json.data);
        setError(null);
      } else {
        setError(json.error ?? "Router tidak terjangkau");
      }
    } catch {
      setError("Gagal menghubungi endpoint status router");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    void fetchStatus();
  };

  useEffect(() => {
    const initial = setTimeout(() => void fetchStatus(), 0);
    const id = setInterval(() => void fetchStatus(), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [fetchStatus]);

  const res = snapshot?.resource;
  const usedRamPct =
    res && res.totalMemoryBytes > 0
      ? Math.round(
          ((res.totalMemoryBytes - res.freeMemoryBytes) /
            res.totalMemoryBytes) *
            100
        )
      : 0;
  const temp =
    snapshot?.health.temperatureC ?? snapshot?.health.cpuTemperatureC ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Router className="size-4 text-primary" />
            Monitoring MikroTik Live
          </CardTitle>
          <CardDescription>
            {res
              ? `${res.identity} • ${res.boardName} • ROS ${res.version}`
              : "Auto-refresh setiap 15 detik"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {snapshot ? (
            <Badge variant="success" className="font-mono">
              Online ({snapshot.latencyMs}ms)
            </Badge>
          ) : error ? (
            <Badge variant="warning">Offline</Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && !snapshot ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : res ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cpu className="size-3.5" /> CPU Load ({res.cpuCount}c)
              </p>
              <p className="mt-1 font-mono text-lg font-bold">
                {res.cpuLoadPct}%
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(res.cpuLoadPct, 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HardDrive className="size-3.5" /> RAM Terpakai ({usedRamPct}%)
              </p>
              <p className="mt-1 font-mono text-sm font-bold">
                {fmtMb(res.totalMemoryBytes - res.freeMemoryBytes)} /{" "}
                {fmtMb(res.totalMemoryBytes)}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(usedRamPct, 100)}%` }}
                />
              </div>
            </div>

            <Link
              href="/vouchers/active"
              className="group block rounded-lg border p-3 transition-colors hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
              title="Lihat daftar voucher aktif login"
            >
              <p className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Wifi className="size-3.5" /> Hotspot Aktif
                </span>
                <ArrowUpRight className="size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-600">
                {snapshot.hotspotActiveCount.toLocaleString("id-ID")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Uptime: {res.uptime || "-"}
              </p>
            </Link>

            <Link
              href="/vouchers/list"
              className="group block rounded-lg border p-3 transition-colors hover:border-primary/60 hover:bg-primary/5"
              title="Lihat daftar semua voucher"
            >
              <p className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Ticket className="size-3.5" /> Sisa Voucher
                </span>
                <ArrowUpRight className="size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-primary">
                {snapshot.unusedVoucherCount.toLocaleString("id-ID")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Belum dipakai (dari{" "}
                {snapshot.totalHotspotUsersCount.toLocaleString("id-ID")} user)
              </p>
            </Link>

            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className="size-3.5" /> AP Neighbor
              </p>
              <p className="mt-1 font-mono text-lg font-bold">
                {snapshot.neighborCount.toLocaleString("id-ID")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Perangkat terdeteksi
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Thermometer className="size-3.5" /> Suhu / Disk Free
              </p>
              <p className="mt-1 font-mono text-lg font-bold">
                {temp !== null ? `${temp}°C` : "-"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                HDD: {fmtMb(res.freeHddBytes)} free
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Menghubungi MikroTik...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
