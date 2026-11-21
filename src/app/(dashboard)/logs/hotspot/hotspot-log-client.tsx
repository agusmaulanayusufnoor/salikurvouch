"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { HotspotLogEntry } from "@/lib/mikrotik/types";
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

function escapeCsvCell(val: string): string {
  const safe = val.replaceAll('"', '""');
  return `"${safe}"`;
}

function getMessageTone(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("logged in")) return "text-emerald-600 font-medium";
  if (
    lower.includes("failed") ||
    lower.includes("invalid") ||
    lower.includes("error") ||
    lower.includes("no more sessions")
  ) {
    return "text-destructive font-medium";
  }
  if (lower.includes("logged out")) return "text-amber-600";
  return "text-foreground";
}

export function HotspotLogClient({ logs }: { logs: HotspotLogEntry[] }) {
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [page, setPage] = useState(1);

  const distinctTopics = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      if (l.topics) set.add(l.topics);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (topicFilter !== "all" && l.topics !== topicFilter) return false;
      if (!q) return true;
      return (
        l.time.toLowerCase().includes(q) ||
        l.userIp.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.topics.toLowerCase().includes(q)
      );
    });
  }, [logs, search, topicFilter]);

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

  function handleExportCsv() {
    const header = ["Time", "User (IP)", "Message", "Topics"];
    const lines = [
      header.join(","),
      ...filtered.map((l) =>
        [
          escapeCsvCell(l.time),
          escapeCsvCell(l.userIp),
          escapeCsvCell(l.message),
          escapeCsvCell(l.topics),
        ].join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hotspot-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasActiveFilter = search.trim() !== "" || topicFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari user, IP, pesan log, waktu..."
            className="pl-9"
          />
        </div>

        <Select
          value={topicFilter}
          onChange={(e) => {
            setTopicFilter(e.target.value);
            setPage(1);
          }}
          className="w-56"
        >
          <option value="all">Semua Topic ({distinctTopics.length})</option>
          {distinctTopics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

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

        {hasActiveFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setTopicFilter("all");
              setPage(1);
            }}
          >
            <X className="size-4" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <Badge variant="secondary" className="font-mono">
          {filtered.length.toLocaleString("id-ID")} log
        </Badge>
        <span className="text-muted-foreground">
          Urutan terbaru di atas • Halaman {safePage} dari {totalPages} (25 /
          halaman)
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Time</TableHead>
            <TableHead className="w-56">User (IP)</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-44">Topics</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-10 text-center text-muted-foreground"
              >
                {logs.length === 0
                  ? "Belum ada log hotspot di buffer MikroTik."
                  : "Tidak ada log yang cocok dengan filter pencarian."}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((l, idx) => (
              <TableRow key={l.id || `${l.time}-${idx}`}>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {l.time || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                  {l.userIp}
                </TableCell>
                <TableCell className={`text-xs ${getMessageTone(l.message)}`}>
                  {l.message}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {l.topics || "hotspot"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length.toLocaleString("id-ID")} log
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
