import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  buildBackupSnapshot,
  compressBackupSnapshot,
  formatBytes,
  parseAndVerifyBackupBuffer,
  type BackupTablesPayload,
} from "./backup-format";

function createEmptyTables(): BackupTablesPayload {
  const payload = {} as BackupTablesPayload;
  for (const t of BACKUP_TABLES) {
    payload[t] = [];
  }
  return payload;
}

describe("database backup-format", () => {
  it("builds, gzips, parses, and verifies checksum round-trip", () => {
    const tables = createEmptyTables();
    tables.resellers = [
      { id: "r1", telegram_id: 12345, username: "agen1", balance: 50000 },
    ];
    tables.wallet_transactions = [
      { id: 1, telegram_id: 12345, tx_type: "topup", amount: 50000 },
    ];

    const snapshot = buildBackupSnapshot({
      exportedBy: "admin@salikur.net",
      tables,
    });

    expect(snapshot.meta.totalRows).toBe(2);
    expect(snapshot.meta.counts.resellers).toBe(1);
    expect(snapshot.meta.sha256).toHaveLength(64);

    const gz = compressBackupSnapshot(snapshot);
    const { snapshot: parsed, checksumValid } = parseAndVerifyBackupBuffer(gz);
    expect(checksumValid).toBe(true);
    expect(parsed.tables.resellers).toHaveLength(1);
    expect(parsed.meta.exportedBy).toBe("admin@salikur.net");
  });

  it("detects tampered JSON backup checksum", () => {
    const tables = createEmptyTables();
    tables.resellers = [{ id: "r1", telegram_id: 12345, balance: 50000 }];

    const snapshot = buildBackupSnapshot({ exportedBy: "admin", tables });
    snapshot.tables.resellers[0].balance = 9999999; // tamper without updating sha256

    const raw = Buffer.from(JSON.stringify(snapshot), "utf8");
    const { checksumValid } = parseAndVerifyBackupBuffer(raw);
    expect(checksumValid).toBe(false);
  });

  it("formats byte sizes cleanly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(524288000)).toBe("500.00 MB");
    expect(formatBytes(1073741824)).toBe("1.00 GB");
  });
});
