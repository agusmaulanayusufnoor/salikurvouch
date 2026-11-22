import crypto from "node:crypto";
import zlib from "node:zlib";

export const BACKUP_FORMAT_VERSION = 1;

/**
 * Ordered strictly by Foreign Key dependencies (parents before children).
 * Sensitive secrets (`password_encrypted`, `bot_token_encrypted`) remain
 * AES-256-GCM encrypted in the snapshot and are NEVER exported as plaintext.
 */
export const BACKUP_TABLES = [
  "routers",
  "servers",
  "app_settings",
  "admin_server_access",
  "bot_message_templates",
  "voucher_packages",
  "resellers",
  "voucher_batches",
  "vouchers",
  "wallet_transactions",
  "deposit_requests",
  "ppob_transactions",
  "ppob_daily_counters",
  "broadcast_logs",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

/**
 * Reverse order for safe deletion during `replace` restore mode.
 * Note: `app_settings` (singleton id=1) is upserted in place, never deleted.
 */
export const RESTORE_DELETE_ORDER: readonly BackupTableName[] = [
  "broadcast_logs",
  "ppob_daily_counters",
  "ppob_transactions",
  "deposit_requests",
  "wallet_transactions",
  "vouchers",
  "voucher_batches",
  "voucher_packages",
  "resellers",
  "bot_message_templates",
  "admin_server_access",
  "servers",
  "routers",
];

/**
 * Conflict columns matching actual live Postgres PRIMARY KEYs for idempotent upsert.
 */
export const TABLE_CONFLICT_COLUMNS: Record<BackupTableName, string> = {
  routers: "id",
  servers: "id",
  app_settings: "id",
  admin_server_access: "admin_id,server_id",
  bot_message_templates: "server_id,key",
  voucher_packages: "id",
  resellers: "id",
  voucher_batches: "id",
  vouchers: "id",
  wallet_transactions: "id",
  deposit_requests: "id",
  ppob_transactions: "id",
  ppob_daily_counters: "server_id,tx_date,telegram_id,product_code,target_number",
  broadcast_logs: "id",
};

export type BackupTablesPayload = Record<
  BackupTableName,
  Record<string, unknown>[]
>;

export interface DatabaseBackupSnapshot {
  meta: {
    app: "salikurvouch";
    formatVersion: number;
    exportedAt: string;
    exportedBy: string;
    counts: Record<BackupTableName, number>;
    totalRows: number;
    sha256: string;
  };
  tables: BackupTablesPayload;
}

export function computeTablesChecksum(tables: BackupTablesPayload): string {
  const canonical = JSON.stringify(tables);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildBackupSnapshot(params: {
  exportedBy: string;
  tables: BackupTablesPayload;
  exportedAt?: string;
}): DatabaseBackupSnapshot {
  const counts = {} as Record<BackupTableName, number>;
  let totalRows = 0;

  for (const table of BACKUP_TABLES) {
    const rows = Array.isArray(params.tables[table])
      ? params.tables[table]
      : [];
    counts[table] = rows.length;
    totalRows += rows.length;
  }

  return {
    meta: {
      app: "salikurvouch",
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: params.exportedAt ?? new Date().toISOString(),
      exportedBy: params.exportedBy,
      counts,
      totalRows,
      sha256: computeTablesChecksum(params.tables),
    },
    tables: params.tables,
  };
}

export function compressBackupSnapshot(snapshot: DatabaseBackupSnapshot): Buffer {
  const json = JSON.stringify(snapshot);
  return zlib.gzipSync(Buffer.from(json, "utf8"), { level: 6 });
}

export function parseAndVerifyBackupBuffer(buffer: Buffer): {
  snapshot: DatabaseBackupSnapshot;
  checksumValid: boolean;
} {
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const rawJson = isGzip
    ? zlib.gunzipSync(buffer).toString("utf8")
    : buffer.toString("utf8");

  const parsed = JSON.parse(rawJson) as Partial<DatabaseBackupSnapshot>;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.meta?.app !== "salikurvouch" ||
    !parsed.tables ||
    typeof parsed.tables !== "object"
  ) {
    throw new Error(
      "Format file backup tidak valid. Pastikan file berasal dari Backup SalikurVouch."
    );
  }

  const normalizedTables = {} as BackupTablesPayload;
  for (const table of BACKUP_TABLES) {
    const rows = (parsed.tables as Record<string, unknown>)[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new Error(`Struktur tabel '${table}' pada file backup tidak valid.`);
    }
    normalizedTables[table] =
      (rows as Record<string, unknown>[] | undefined) ?? [];
  }

  const expectedHash = computeTablesChecksum(normalizedTables);
  const checksumValid =
    typeof parsed.meta.sha256 === "string" &&
    parsed.meta.sha256 === expectedHash;

  return {
    snapshot: {
      meta: parsed.meta as DatabaseBackupSnapshot["meta"],
      tables: normalizedTables,
    },
    checksumValid,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}
