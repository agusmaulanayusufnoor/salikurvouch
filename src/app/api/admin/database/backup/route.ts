import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKUP_TABLES,
  buildBackupSnapshot,
  compressBackupSnapshot,
  type BackupTableName,
  type BackupTablesPayload,
} from "@/lib/database/backup-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

async function fetchAllTableRows(
  admin: ReturnType<typeof createAdminClient>,
  table: BackupTableName
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Gagal mengekspor tabel '${table}': ${error.message}`);
    }

    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return rows;
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const tables = {} as BackupTablesPayload;

    for (const table of BACKUP_TABLES) {
      tables[table] = await fetchAllTableRows(admin, table);
    }

    const now = new Date();
    const snapshot = buildBackupSnapshot({
      exportedBy: auth.admin.email || auth.admin.username,
      exportedAt: now.toISOString(),
      tables,
    });

    const gzipBuffer = compressBackupSnapshot(snapshot);

    // Record backup timestamp in app_settings
    await admin
      .from("app_settings")
      .update({ last_backup_at: now.toISOString() })
      .eq("id", 1);

    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "Z");
    const filename = `salikurvouch-backup-${stamp}.json.gz`;

    return new NextResponse(new Uint8Array(gzipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(gzipBuffer.length),
        "Cache-Control": "no-store",
        "X-Backup-Total-Rows": String(snapshot.meta.totalRows),
        "X-Backup-Sha256": snapshot.meta.sha256,
      },
    });
  } catch (err) {
    console.error("[admin/database/backup] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal membuat file backup database.",
      },
      { status: 500 }
    );
  }
}
