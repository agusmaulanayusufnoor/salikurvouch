import Link from "next/link";
import { AlertTriangle, FileClock, RefreshCw, ScrollText } from "lucide-react";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserLogClient } from "./user-log-client";

export const metadata = {
  title: "User Log",
};

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export default async function UserLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    day?: string;
    all?: string;
  }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = MONTH_KEYS[now.getMonth()] ?? "nov";
  const currentYear = now.getFullYear();

  const isAll = sp.all === "1";
  const selectedMonth =
    sp.month && MONTH_KEYS.includes(sp.month.toLowerCase())
      ? sp.month.toLowerCase()
      : defaultMonth;
  const selectedYear =
    sp.year && /^\d{4}$/.test(sp.year) ? sp.year : String(currentYear);
  const selectedDay =
    sp.day && /^(0[1-9]|[12]\d|3[01])$/.test(sp.day) ? sp.day : "all";

  const ownerKey = `${selectedMonth}${selectedYear}`;
  const periodLabel = isAll ? "all" : ownerKey;

  const yearSet = new Set<string>([
    String(currentYear - 2),
    String(currentYear - 1),
    String(currentYear),
    String(currentYear + 1),
    selectedYear,
  ]);
  const yearOptions = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  let errorMsg: string | null = null;
  let routerName = "MikroTik";
  let logs: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof getDefaultMikroTikAdapter>>["listMikhmonUserLogs"]
    >
  > = [];

  try {
    const adapter = await getDefaultMikroTikAdapter();
    routerName = `${adapter.config.name} (ROS ${adapter.config.rosVersion})`;
    logs = await adapter.listMikhmonUserLogs(
      isAll ? { all: true } : { owner: ownerKey }
    );
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Router tidak terjangkau.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            User Log {isAll ? "(Semua Periode)" : ownerKey}
          </h2>
          <p className="text-sm text-muted-foreground">
            Riwayat login voucher Mikhmon (`/system/script`) dari {routerName} —
            filter per tanggal/bulan/tahun, cari, dan export CSV.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/logs/hotspot">
              <ScrollText className="size-4" />
              Hotspot Log
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={
                isAll
                  ? "/logs/users?all=1"
                  : `/logs/users?month=${selectedMonth}&year=${selectedYear}${selectedDay !== "all" ? `&day=${selectedDay}` : ""}`
              }
            >
              <RefreshCw className="size-4" />
              Refresh Live
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="size-4 text-primary" />
            User Log {isAll ? "All" : ownerKey} (
            {logs.length.toLocaleString("id-ID")} entri)
          </CardTitle>
          <CardDescription>
            Menampilkan Date, Time, Username, Address, MAC Address, dan Validity
            dari script log Mikhmon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <UserLogClient
              logs={logs}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedDay={selectedDay}
              isAll={isAll}
              periodLabel={periodLabel}
              yearOptions={yearOptions}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
