"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  HardDrive,
  HeartPulse,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileArchive,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatDateTimeID } from "@/lib/utils";

export interface DatabaseStorageStats {
  db_size_bytes: number;
  db_limit_bytes: number;
  storage_size_bytes: number;
  storage_limit_bytes: number;
  storage_object_count: number;
  storage_buckets: {
    bucket_id: string;
    object_count: number;
    size_bytes: number;
  }[];
  tables: {
    table_name: string;
    total_bytes: number;
    row_estimate: number;
  }[];
  last_keepalive_at: string | null;
  last_backup_at: string | null;
  last_cutoff_at: string | null;
  checked_at: string;
}

interface BackupPreview {
  checksumValid: boolean;
  meta: {
    exportedAt: string;
    exportedBy: string;
    totalRows: number;
    counts: Record<string, number>;
    sha256: string;
  };
}

export interface CutoffPreview {
  retain_months: number;
  cutoff_at: string;
  total_rows_to_delete: number;
  breakdown: { table: string; label: string; rows: number }[];
}

function formatBytesClient(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function usageColor(pct: number): {
  bar: string;
  badge: "success" | "warning" | "destructive";
  label: string;
} {
  if (pct >= 85) {
    return { bar: "bg-destructive", badge: "destructive", label: "Kritis" };
  }
  if (pct >= 70) {
    return { bar: "bg-amber-500", badge: "warning", label: "Waspada" };
  }
  return { bar: "bg-emerald-500", badge: "success", label: "Aman" };
}

export function DatabaseMaintenancePanel({
  initialStats,
  initialCutoffPreview,
}: {
  initialStats: DatabaseStorageStats | null;
  initialCutoffPreview: CutoffPreview | null;
}) {
  const [stats, setStats] = useState<DatabaseStorageStats | null>(initialStats);
  const [loadingStats, setLoadingStats] = useState(false);
  const [pinging, setPinging] = useState(false);

  // Backup & Restore state
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(
    null
  );
  const [previewingBackup, setPreviewingBackup] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);

  // Data Cutoff state
  const [cutoffMonths, setCutoffMonths] = useState<6 | 12>(12);
  const [cutoffPreview, setCutoffPreview] = useState<CutoffPreview | null>(
    initialCutoffPreview
  );
  const [expectedCutoffPhrase, setExpectedCutoffPhrase] =
    useState("HAPUS-1-TAHUN");
  const [loadingCutoffPreview, setLoadingCutoffPreview] = useState(false);
  const [cutoffConfirm, setCutoffConfirm] = useState("");
  const [executingCutoff, setExecutingCutoff] = useState(false);

  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/database/stats", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat statistik");
      setStats(json.stats as DatabaseStorageStats);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat status storage."
      );
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadCutoffPreview = useCallback(async (months: 6 | 12) => {
    setLoadingCutoffPreview(true);
    setCutoffConfirm("");
    try {
      const res = await fetch(`/api/admin/database/cutoff?months=${months}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal simulasi cutoff");
      setCutoffPreview(json.preview as CutoffPreview);
      setExpectedCutoffPhrase(
        json.expectedConfirmation ||
          (months === 6 ? "HAPUS-6-BULAN" : "HAPUS-1-TAHUN")
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat simulasi cutoff."
      );
    } finally {
      setLoadingCutoffPreview(false);
    }
  }, []);

  function handleSelectCutoffMonths(months: 6 | 12) {
    setCutoffMonths(months);
    void loadCutoffPreview(months);
  }

  async function handleManualKeepAlive() {
    setPinging(true);
    try {
      const res = await fetch("/api/admin/database/keep-alive", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Keep-alive gagal");
      toast.success(json.message || "Ping keep-alive berhasil.");
      await refreshStats();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menjalankan keep-alive."
      );
    } finally {
      setPinging(false);
    }
  }

  async function handleDownloadBackup() {
    setDownloadingBackup(true);
    try {
      const res = await fetch("/api/admin/database/backup", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Gagal mengunduh backup.");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "salikurvouch-backup.json.gz";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const totalRows = res.headers.get("X-Backup-Total-Rows");
      toast.success(
        `Backup selesai diunduh (${totalRows ? `${Number(totalRows).toLocaleString("id-ID")} baris` : filename}).`
      );
      await refreshStats();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengunduh backup."
      );
    } finally {
      setDownloadingBackup(false);
    }
  }

  async function handleSelectRestoreFile(file: File | null) {
    setSelectedFile(file);
    setBackupPreview(null);
    setRestoreConfirm("");
    if (!file) return;

    setPreviewingBackup(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "preview");

      const res = await fetch("/api/admin/database/restore", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "File backup tidak valid.");
      setBackupPreview({
        checksumValid: Boolean(json.checksumValid),
        meta: json.meta,
      });
      if (!json.checksumValid) {
        toast.warning("Checksum SHA-256 tidak cocok! File mungkin rusak.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memvalidasi file backup."
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setPreviewingBackup(false);
    }
  }

  async function handleExecuteRestore() {
    if (!selectedFile || !backupPreview) return;
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("mode", restoreMode);
      fd.append("confirmation", restoreConfirm.trim());

      const res = await fetch("/api/admin/database/restore", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Restore gagal.");

      toast.success(
        `${json.message} (${Number(json.totalRestored ?? 0).toLocaleString("id-ID")} baris diproses).`
      );
      setSelectedFile(null);
      setBackupPreview(null);
      setRestoreConfirm("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([refreshStats(), loadCutoffPreview(cutoffMonths)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore gagal.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleExecuteCutoff() {
    setExecutingCutoff(true);
    try {
      const res = await fetch("/api/admin/database/cutoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          months: cutoffMonths,
          confirmation: cutoffConfirm.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cutoff gagal.");

      toast.success(json.message || "Pembersihan data lama selesai.");
      setCutoffConfirm("");
      await Promise.all([refreshStats(), loadCutoffPreview(cutoffMonths)]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menghapus data cutoff."
      );
    } finally {
      setExecutingCutoff(false);
    }
  }

  const dbPct = stats
    ? Math.min(100, (stats.db_size_bytes / stats.db_limit_bytes) * 100)
    : 0;
  const storagePct = stats
    ? Math.min(
        100,
        (stats.storage_size_bytes / stats.storage_limit_bytes) * 100
      )
    : 0;
  const dbStatus = usageColor(dbPct);
  const storageStatus = usageColor(storagePct);

  const daysSinceKeepAlive =
    stats?.last_keepalive_at && stats?.checked_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(stats.checked_at).getTime() -
              new Date(stats.last_keepalive_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <div className="space-y-6">
      {/* 1. Supabase Free-Tier Storage Monitor */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-primary" />
                Database PostgreSQL (Free Tier 500 MB)
              </CardTitle>
              <CardDescription>
                Pemakaian disk database Supabase saat ini
              </CardDescription>
            </div>
            <Badge variant={dbStatus.badge}>{dbStatus.label}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">
                {stats ? formatBytesClient(stats.db_size_bytes) : "-"}
              </span>
              <span className="text-sm text-muted-foreground">
                dari {stats ? formatBytesClient(stats.db_limit_bytes) : "500 MB"}{" "}
                ({dbPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${dbStatus.bar}`}
                style={{ width: `${Math.max(dbPct, 1)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sisa kapasitas estimasi:{" "}
              <span className="font-medium text-foreground">
                {stats
                  ? formatBytesClient(
                      Math.max(stats.db_limit_bytes - stats.db_size_bytes, 0)
                    )
                  : "-"}
              </span>
              . Gunakan fitur Cutoff Data di bawah jika pemakaian mendekati 75%.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="size-4 text-primary" />
                File Storage Media (Free Tier 1 GB)
              </CardTitle>
              <CardDescription>
                Bucket broadcast-media &amp; deposit-proofs
              </CardDescription>
            </div>
            <Badge variant={storageStatus.badge}>{storageStatus.label}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">
                {stats ? formatBytesClient(stats.storage_size_bytes) : "-"}
              </span>
              <span className="text-sm text-muted-foreground">
                dari{" "}
                {stats ? formatBytesClient(stats.storage_limit_bytes) : "1 GB"}{" "}
                ({storagePct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${storageStatus.bar}`}
                style={{ width: `${Math.max(storagePct, 0.5)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {stats?.storage_buckets.map((b) => (
                <span
                  key={b.bucket_id}
                  className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono"
                >
                  {b.bucket_id}: {b.object_count} file (
                  {formatBytesClient(b.size_bytes)})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Anti Auto-Pause Keep-Alive Card */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4 text-emerald-600" />
              Proteksi Anti Auto-Pause Supabase (7 Hari Inaktif)
            </CardTitle>
            <CardDescription>
              Proyek Supabase Free Tier akan di-pause otomatis jika tidak ada
              aktivitas selama 7 hari. Keep-Alive berjalan otomatis setiap hari
              via Vercel Cron dan setiap 3 hari via GitHub Actions.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStats}
              disabled={loadingStats}
            >
              <RefreshCw
                className={`size-4 ${loadingStats ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleManualKeepAlive}
              disabled={pinging}
            >
              {pinging ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HeartPulse className="size-4" />
              )}
              Ping Database Sekarang
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Ping Keep-Alive Terakhir</p>
            <p className="mt-1 text-sm font-semibold">
              {stats?.last_keepalive_at
                ? formatDateTimeID(stats.last_keepalive_at)
                : "Belum pernah tercatat"}
            </p>
            <div className="mt-1.5">
              {daysSinceKeepAlive !== null && daysSinceKeepAlive <= 4 ? (
                <Badge variant="success">Aktif ({daysSinceKeepAlive} hari lalu)</Badge>
              ) : (
                <Badge variant="warning">Perlu test ping / set cron</Badge>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Backup Database Terakhir</p>
            <p className="mt-1 text-sm font-semibold">
              {stats?.last_backup_at
                ? formatDateTimeID(stats.last_backup_at)
                : "Belum pernah backup"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Format terkompresi <code className="font-mono">.json.gz</code> + SHA-256
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Cutoff Data Terakhir</p>
            <p className="mt-1 text-sm font-semibold">
              {stats?.last_cutoff_at
                ? formatDateTimeID(stats.last_cutoff_at)
                : "Belum pernah cutoff"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Endpoint cron: <code className="font-mono">/api/health/keep-alive</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Backup & Restore Database */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4 text-primary" />
              Backup Database
            </CardTitle>
            <CardDescription>
              Unduh seluruh tabel bisnis &amp; konfigurasi (reseller, saldo,
              mutasi, voucher, PPOB, server, router, template) dalam format{" "}
              <code className="font-mono">.json.gz</code>. Kredensial router
              &amp; bot tetap terenkripsi AES-256-GCM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                Disarankan backup rutin minimal 1x seminggu dan wajib sebelum
                melakukan Cutoff Data atau Restore.
              </p>
            </div>
            <Button
              onClick={handleDownloadBackup}
              disabled={downloadingBackup}
              className="w-full"
            >
              {downloadingBackup ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Menyiapkan &amp; Mengompresi Snapshot...
                </>
              ) : (
                <>
                  <FileArchive className="size-4" />
                  Download Full Backup (.json.gz)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4 text-primary" />
              Restore Database
            </CardTitle>
            <CardDescription>
              Unggah file backup <code className="font-mono">.json.gz</code>{" "}
              atau <code className="font-mono">.json</code> hasil unduhan
              SalikurVouch. Sistem memverifikasi checksum SHA-256 sebelum
              memulihkan data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-file">Pilih File Backup</Label>
              <Input
                ref={fileInputRef}
                id="backup-file"
                type="file"
                accept=".gz,.json,application/gzip,application/json"
                disabled={previewingBackup || restoring}
                onChange={(e) =>
                  handleSelectRestoreFile(e.target.files?.[0] ?? null)
                }
              />
            </div>

            {previewingBackup ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Memvalidasi file &amp; checksum SHA-256...
              </div>
            ) : null}

            {backupPreview ? (
              <div className="space-y-3 rounded-lg border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    Preview Snapshot
                  </span>
                  {backupPreview.checksumValid ? (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" />
                      SHA-256 Valid
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="size-3" />
                      Checksum Invalid
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  <span>Tanggal Export:</span>
                  <span className="font-medium text-foreground">
                    {formatDateTimeID(backupPreview.meta.exportedAt)}
                  </span>
                  <span>Diekspor Oleh:</span>
                  <span className="font-medium text-foreground">
                    {backupPreview.meta.exportedBy}
                  </span>
                  <span>Total Baris:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {backupPreview.meta.totalRows.toLocaleString("id-ID")} baris
                  </span>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Mode Restore</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRestoreMode("merge")}
                      className={`rounded-md border p-2 text-left transition-colors ${
                        restoreMode === "merge"
                          ? "border-primary bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <p className="font-semibold text-foreground">
                        Merge / Upsert
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Aman — tambah/update tanpa menghapus data lain
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreMode("replace")}
                      className={`rounded-md border p-2 text-left transition-colors ${
                        restoreMode === "replace"
                          ? "border-destructive bg-destructive/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <p className="font-semibold text-destructive">
                        Replace Total
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Hapus data lama lalu ganti penuh dari backup
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="restore-confirm">
                    Ketik <code className="font-mono font-bold">RESTORE</code>{" "}
                    untuk konfirmasi
                  </Label>
                  <Input
                    id="restore-confirm"
                    value={restoreConfirm}
                    onChange={(e) => setRestoreConfirm(e.target.value)}
                    placeholder="RESTORE"
                    disabled={restoring}
                  />
                </div>

                <Button
                  variant={restoreMode === "replace" ? "destructive" : "default"}
                  className="w-full"
                  disabled={
                    restoring ||
                    !backupPreview.checksumValid ||
                    restoreConfirm.trim() !== "RESTORE"
                  }
                  onClick={handleExecuteRestore}
                >
                  {restoring ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Memulihkan Database...
                    </>
                  ) : (
                    `Eksekusi Restore (${restoreMode.toUpperCase()})`
                  )}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* 4. Hapus Data Cutoff (Retensi 1 Tahun / 6 Bulan Terakhir) */}
      <Card className="border-amber-300/70 dark:border-amber-800/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4 text-destructive" />
            Hapus Data Cutoff (Penghematan Kuota Free Tier)
          </CardTitle>
          <CardDescription>
            Hapus riwayat transaksi &amp; log lama untuk menjaga ukuran database
            tetap lega di bawah 500 MB.{" "}
            <strong className="text-foreground">
              Master reseller, saldo berjalan saat ini, router, server, paket
              voucher, dan pengaturan TIDAK akan terhapus.
            </strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Retention period selector */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleSelectCutoffMonths(12)}
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                cutoffMonths === 12
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  Sisakan 1 Tahun Terakhir (12 Bulan)
                </p>
                <p className="text-xs text-muted-foreground">
                  Menghapus mutasi, voucher, PPOB &amp; log lebih lama dari 12
                  bulan.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCutoffMonths(6)}
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                cutoffMonths === 6
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">
                  Sisakan 6 Bulan Terakhir (6 Bulan)
                </p>
                <p className="text-xs text-muted-foreground">
                  Penghematan storage maksimal — hanya menyimpan riwayat 6 bulan
                  terakhir.
                </p>
              </div>
            </button>
          </div>

          {/* Preview Breakdown */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  Simulasi Data yang Akan Dihapus
                </p>
                <p className="text-xs text-muted-foreground">
                  {cutoffPreview
                    ? `Batas tanggal cutoff: data sebelum ${formatDateTimeID(cutoffPreview.cutoff_at)}`
                    : "Menghitung data..."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cutoffPreview ? (
                  <Badge
                    variant={
                      cutoffPreview.total_rows_to_delete > 0
                        ? "warning"
                        : "secondary"
                    }
                  >
                    Total:{" "}
                    {cutoffPreview.total_rows_to_delete.toLocaleString("id-ID")}{" "}
                    baris
                  </Badge>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingCutoffPreview}
                  onClick={() => loadCutoffPreview(cutoffMonths)}
                >
                  <RefreshCw
                    className={`size-3.5 ${loadingCutoffPreview ? "animate-spin" : ""}`}
                  />
                  Hitung Ulang
                </Button>
              </div>
            </div>

            {loadingCutoffPreview ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Menghitung baris historis...
              </div>
            ) : cutoffPreview ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Kategori Data</th>
                      <th className="py-2 pr-3 font-mono">Tabel</th>
                      <th className="py-2 text-right">Baris Dihapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cutoffPreview.breakdown.map((row) => (
                      <tr key={row.table}>
                        <td className="py-1.5 pr-3">{row.label}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">
                          {row.table}
                        </td>
                        <td className="py-1.5 text-right font-mono font-semibold">
                          {row.rows.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* Confirmation & Action */}
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-2 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Aksi ini bersifat permanen. Unduh backup terlebih dahulu jika
                Anda masih membutuhkan arsip transaksi lama untuk pembukuan.
              </span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="cutoff-confirm" className="text-xs">
                  Ketik{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono font-bold">
                    {expectedCutoffPhrase}
                  </code>{" "}
                  untuk mengonfirmasi penghapusan permanen
                </Label>
                <Input
                  id="cutoff-confirm"
                  value={cutoffConfirm}
                  onChange={(e) => setCutoffConfirm(e.target.value)}
                  placeholder={expectedCutoffPhrase}
                  disabled={executingCutoff}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadBackup}
                  disabled={downloadingBackup}
                >
                  <Download className="size-4" />
                  Backup Dulu
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    executingCutoff ||
                    cutoffConfirm.trim() !== expectedCutoffPhrase ||
                    (cutoffPreview?.total_rows_to_delete ?? 0) === 0
                  }
                  onClick={handleExecuteCutoff}
                >
                  {executingCutoff ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" />
                      Hapus Data Lama
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Breakdown Ukuran Per Tabel PostgreSQL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Rincian Pemakaian Storage per Tabel (Schema Public)
          </CardTitle>
          <CardDescription>
            Termasuk ukuran data tabel + index PostgreSQL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-4">Nama Tabel</th>
                  <th className="py-2 pr-4 text-right">Estimasi Baris</th>
                  <th className="py-2 text-right">Total Ukuran (Data + Index)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(stats?.tables ?? []).map((t) => (
                  <tr key={t.table_name} className="hover:bg-muted/40">
                    <td className="py-2 pr-4 font-mono text-xs sm:text-sm">
                      {t.table_name}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                      {t.row_estimate.toLocaleString("id-ID")}
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      {formatBytesClient(t.total_bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
