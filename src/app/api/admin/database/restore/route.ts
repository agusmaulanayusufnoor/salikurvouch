import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKUP_TABLES,
  RESTORE_DELETE_ORDER,
  TABLE_CONFLICT_COLUMNS,
  parseAndVerifyBackupBuffer,
  type BackupTableName,
} from "@/lib/database/backup-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB compressed/uncompressed upload cap
const CHUNK_SIZE = 500;

/**
 * Identity columns (`GENERATED ALWAYS AS IDENTITY`) cannot be explicitly overwritten
 * via PostgREST upsert when `id` is present on insert unless stripped for brand-new rows
 * or matched on natural unique keys. For tables with `GENERATED ALWAYS AS IDENTITY`,
 * we strip `id` in merge/replace inserts and deduplicate by natural unique keys where available.
 */
const IDENTITY_TABLES = new Set<BackupTableName>([
  "vouchers",
  "wallet_transactions",
  "ppob_transactions",
]);

function stripIdentityId(
  table: BackupTableName,
  row: Record<string, unknown>
): Record<string, unknown> {
  if (!IDENTITY_TABLES.has(table)) return row;
  const copy = { ...row };
  delete copy.id;
  return copy;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "preview");
    const confirmation = String(formData.get("confirmation") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File backup (.json atau .json.gz) wajib diunggah." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file tidak valid (maksimal 25 MB)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { snapshot, checksumValid } = parseAndVerifyBackupBuffer(buffer);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        checksumValid,
        meta: snapshot.meta,
      });
    }

    if (!checksumValid) {
      return NextResponse.json(
        {
          error:
            "Checksum SHA-256 file backup tidak cocok. File mungkin rusak atau dimodifikasi.",
        },
        { status: 400 }
      );
    }

    if (mode !== "merge" && mode !== "replace") {
      return NextResponse.json(
        { error: "Mode restore harus 'preview', 'merge', atau 'replace'." },
        { status: 400 }
      );
    }

    if (confirmation !== "RESTORE") {
      return NextResponse.json(
        { error: "Ketik konfirmasi persis 'RESTORE' untuk melanjutkan." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // If replace mode, clear tables in reverse FK dependency order first
    if (mode === "replace") {
      for (const table of RESTORE_DELETE_ORDER) {
        if (table === "ppob_daily_counters") {
          const { error } = await admin
            .from(table)
            .delete()
            .gte("tx_date", "1970-01-01");
          if (error) throw new Error(`Gagal reset tabel ${table}: ${error.message}`);
        } else if (table === "bot_message_templates") {
          const { error } = await admin.from(table).delete().neq("key", "");
          if (error) throw new Error(`Gagal reset tabel ${table}: ${error.message}`);
        } else if (table === "admin_server_access") {
          const { error } = await admin
            .from(table)
            .delete()
            .neq("server_id", "00000000-0000-0000-0000-000000000000");
          if (error) throw new Error(`Gagal reset tabel ${table}: ${error.message}`);
        } else if (IDENTITY_TABLES.has(table)) {
          const { error } = await admin.from(table).delete().gt("id", 0);
          if (error) throw new Error(`Gagal reset tabel ${table}: ${error.message}`);
        } else {
          const { error } = await admin
            .from(table)
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000");
          if (error) throw new Error(`Gagal reset tabel ${table}: ${error.message}`);
        }
      }
    }

    const restoredCounts: Record<string, number> = {};

    for (const table of BACKUP_TABLES) {
      const rawRows = snapshot.tables[table] ?? [];
      restoredCounts[table] = 0;
      if (rawRows.length === 0) continue;

      for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
        const chunk = rawRows
          .slice(i, i + CHUNK_SIZE)
          .map((row) => stripIdentityId(table, row));

        if (table === "ppob_transactions") {
          const { error } = await admin
            .from("ppob_transactions")
            .upsert(chunk as never[], { onConflict: "trx_id" });
          if (error) throw new Error(`Restore ${table} gagal: ${error.message}`);
        } else if (table === "wallet_transactions") {
          if (mode === "replace") {
            const { error } = await admin
              .from("wallet_transactions")
              .insert(chunk as never[]);
            if (error) throw new Error(`Restore ${table} gagal: ${error.message}`);
          } else {
            const withLegacy = chunk.filter(
              (r) => r.legacy_no !== null && r.legacy_no !== undefined
            );
            const withoutLegacy = chunk.filter(
              (r) => r.legacy_no === null || r.legacy_no === undefined
            );
            if (withLegacy.length > 0) {
              const { error } = await admin
                .from("wallet_transactions")
                .upsert(withLegacy as never[], { onConflict: "legacy_no" });
              if (error)
                throw new Error(`Restore ${table} (legacy) gagal: ${error.message}`);
            }
            if (withoutLegacy.length > 0) {
              const { error } = await admin
                .from("wallet_transactions")
                .insert(withoutLegacy as never[]);
              if (error)
                throw new Error(`Restore ${table} gagal: ${error.message}`);
            }
          }
        } else if (table === "vouchers") {
          const { error } = await admin
            .from("vouchers")
            .insert(chunk as never[]);
          if (error) throw new Error(`Restore ${table} gagal: ${error.message}`);
        } else {
          const onConflict = TABLE_CONFLICT_COLUMNS[table];
          const { error } = await admin
            .from(table)
            .upsert(chunk as never[], { onConflict });
          if (error) throw new Error(`Restore ${table} gagal: ${error.message}`);
        }

        restoredCounts[table] += chunk.length;
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      restoredCounts,
      totalRestored: Object.values(restoredCounts).reduce((a, b) => a + b, 0),
      message: `Restore (${mode}) berhasil diselesaikan.`,
    });
  } catch (err) {
    console.error("[admin/database/restore] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal melakukan restore database.",
      },
      { status: 500 }
    );
  }
}
