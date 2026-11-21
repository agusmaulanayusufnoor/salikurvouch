"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import type { MikhmonUserLogEntry } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

const MONTHS = [
  { key: "jan", num: "01", label: "January" },
  { key: "feb", num: "02", label: "February" },
  { key: "mar", num: "03", label: "March" },
  { key: "apr", num: "04", label: "April" },
  { key: "may", num: "05", label: "May" },
  { key: "jun", num: "06", label: "June" },
  { key: "jul", num: "07", label: "July" },
  { key: "aug", num: "08", label: "August" },
  { key: "sep", num: "09", label: "September" },
  { key: "oct", num: "10", label: "October" },
  { key: "nov", num: "11", label: "November" },
  { key: "dec", num: "12", label: "December" },
];

const DAYS = Array.from({ length: 31 }, (_, i) =>
  String(i + 1).padStart(2, "0")
);

function escapeCsvCell(val: string): string {
  const safe = val.replaceAll('"', '""');
  return `"${safe}"`;
}

function matchesDay(dateStr: string, day: string): boolean {
  if (!day || day === "all") return true;
  const trimmed = dateStr.trim().toLowerCase();
  // ROS v6 format: nov/01/2026
  const slashParts = trimmed.split("/");
  if (slashParts.length === 3) {
    return slashParts[1].padStart(2, "0") === day;
  }
  // ROS v7 ISO format: 2026-11-01
  const dashParts = trimmed.split("-");
  if (dashParts.length === 3) {
    return dashParts[2].padStart(2, "0") === day;
  }
  return true;
}

export function UserLogClient({
  logs,
  selectedMonth,
  selectedYear,
  selectedDay,
  isAll,
  periodLabel,
  yearOptions,
}: {
  logs: MikhmonUserLogEntry[];
  selectedMonth: string;
  selectedYear: string;
  selectedDay: string;
  isAll: boolean;
  periodLabel: string;
  yearOptions: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [day, setDay] = useState(selectedDay);
  const [month, setMonth] = useState(selectedMonth);
  const [year, setYear] = useState(selectedYear);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (!isAll && day !== "all" && !matchesDay(l.date, day)) return false;
      if (!q) return true;
      return (
        l.date.toLowerCase().includes(q) ||
        l.time.toLowerCase().includes(q) ||
        l.username.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.macAddress.toLowerCase().includes(q) ||
        l.validity.toLowerCase().includes(q) ||
        l.profile.toLowerCase().includes(q) ||
        l.comment.toLowerCase().includes(q)
      );
    });
  }, [logs, search, day, isAll]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  function handleApplyPeriodFilter(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("month", month);
    params.set("year", year);
    if (day !== "all") params.set("day", day);
    router.push(`/logs/users?${params.toString()}`);
  }

  function handleShowAll() {
    router.push("/logs/users?all=1");
  }

  function handleExportCsv() {
    const header = [
      "Date",
      "Time",
      "Username",
      "Address",
      "MAC Address",
      "Validity",
      "Profile",
      "Comment",
    ];
    const lines = [
      header.join(","),
      ...filtered.map((l) =>
        [
          escapeCsvCell(l.date),
          escapeCsvCell(l.time),
          escapeCsvCell(l.username),
          escapeCsvCell(l.address),
          escapeCsvCell(l.macAddress),
          escapeCsvCell(l.validity),
          escapeCsvCell(l.profile),
          escapeCsvCell(l.comment),
        ].join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-log-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Search, CSV, All (Mikhmon Style) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search username, IP, MAC, validity..."
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="size-4" />
          CSV
        </Button>

        <Button
          type="button"
          variant={isAll ? "default" : "outline"}
          size="sm"
          onClick={handleShowAll}
        >
          <Layers className="size-4" />
          All
        </Button>
      </div>

      {/* Row 2: Day / Month / Year / Filter (Mikhmon Style) */}
      <form
        onSubmit={handleApplyPeriodFilter}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Select
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Day (Semua Tanggal)</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              Tanggal {d}
            </option>
          ))}
        </Select>

        <Select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>

        <Select value={year} onChange={(e) => setYear(e.target.value)}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>

        <Button type="submit" variant="secondary">
          <Filter className="size-4" />
          Filter
        </Button>
      </form>

      {/* Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            User Log {periodLabel}
          </Badge>
          <Badge variant="success" className="font-mono">
            {filtered.length.toLocaleString("id-ID")} entri
          </Badge>
        </div>
        <span className="text-muted-foreground">
          Halaman {safePage} dari {totalPages} (25 / halaman)
        </span>
      </div>

      {/* Mikhmon-style User Log Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>MAC Address</TableHead>
            <TableHead>Validity</TableHead>
            <TableHead>Profile</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-10 text-center text-muted-foreground"
              >
                {logs.length === 0
                  ? `Tidak ada data User Log pada periode "${periodLabel}" di /system/script MikroTik.`
                  : "Tidak ada data User Log yang cocok dengan pencarian/tanggal."}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((l, idx) => (
              <TableRow key={l.id || `${l.date}-${l.time}-${l.username}-${idx}`}>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {l.date || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {l.time || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                  {l.username || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {l.address || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {l.macAddress || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {l.validity ? (
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {l.validity}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {l.profile || "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination (25 per page) */}
      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length.toLocaleString("id-ID")} entri
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                Sebelumnya
              </Button>
              {pageNumbers.map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={num === safePage ? "default" : "outline"}
                  size="sm"
                  className="min-w-8 px-2 font-mono text-xs"
                  onClick={() => setPage(num)}
                >
                  {num}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
