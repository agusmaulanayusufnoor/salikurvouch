import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const executeSchema = z.object({
  months: z.union([z.literal(6), z.literal(12)]),
  confirmation: z.string().trim(),
});

function expectedConfirmationPhrase(months: 6 | 12): string {
  return months === 6 ? "HAPUS-6-BULAN" : "HAPUS-1-TAHUN";
}

function computeCutoffDate(months: 6 | 12): {
  cutoffIso: string;
  cutoffDateWib: string;
} {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffIso = cutoff.toISOString();

  // Format YYYY-MM-DD in Asia/Jakarta (+07:00)
  const wibFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    cutoffIso,
    cutoffDateWib: wibFormatter.format(cutoff),
  };
}

/**
 * GET /api/admin/database/cutoff?months=6|12
 * Dry-run preview of rows eligible for deletion before the cutoff window.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const rawMonths = Number(request.nextUrl.searchParams.get("months"));
  if (rawMonths !== 6 && rawMonths !== 12) {
    return NextResponse.json(
      { error: "Parameter months harus 6 (6 bulan) atau 12 (1 tahun)." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rpc_preview_cutoff_data", {
      p_months: rawMonths,
    });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      expectedConfirmation: expectedConfirmationPhrase(rawMonths),
      preview: data,
    });
  } catch (err) {
    console.error("[admin/database/cutoff GET] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal melakukan simulasi cutoff data.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/database/cutoff
 * Deletes historical rows older than 6 or 12 months while preserving all master data
 * (resellers, current balances, routers, voucher_packages, app_settings, admin_profiles).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }

  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pilih periode retensi 6 atau 12 bulan yang valid." },
      { status: 400 }
    );
  }

  const { months, confirmation } = parsed.data;
  const requiredPhrase = expectedConfirmationPhrase(months);
  if (confirmation !== requiredPhrase) {
    return NextResponse.json(
      {
        error: `Konfirmasi tidak sesuai. Ketik persis '${requiredPhrase}' untuk melanjutkan.`,
      },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { cutoffIso, cutoffDateWib } = computeCutoffDate(months);
    const nowIso = new Date().toISOString();

    const breakdown: { table: string; label: string; rows: number }[] = [];

    const runDelete = async (
      table: string,
      label: string,
      fn: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
    ) => {
      const { count, error } = await fn();
      if (error) {
        throw new Error(`Gagal menghapus data lama pada '${table}': ${error.message}`);
      }
      breakdown.push({ table, label, rows: count ?? 0 });
    };

    await runDelete(
      "wallet_transactions",
      "Riwayat Mutasi Saldo & Voucher",
      () =>
        admin
          .from("wallet_transactions")
          .delete({ count: "exact" })
          .lt("created_at", cutoffIso)
    );

    await runDelete("vouchers", "Detail Kode Voucher", () =>
      admin
        .from("vouchers")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete("voucher_batches", "Arsip Batch Voucher", () =>
      admin
        .from("voucher_batches")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete("ppob_transactions", "Riwayat Transaksi PPOB", () =>
      admin
        .from("ppob_transactions")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete("ppob_daily_counters", "Counter Harian PPOB", () =>
      admin
        .from("ppob_daily_counters")
        .delete({ count: "exact" })
        .lt("tx_date", cutoffDateWib)
    );

    await runDelete(
      "deposit_requests",
      "Request Deposit (Non-Pending)",
      () =>
        admin
          .from("deposit_requests")
          .delete({ count: "exact" })
          .neq("status", "pending")
          .lt("created_at", cutoffIso)
    );

    await runDelete("auth_audit_logs", "Log Audit Login", () =>
      admin
        .from("auth_audit_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete("broadcast_logs", "Log Broadcast Telegram", () =>
      admin
        .from("broadcast_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete(
      "telegram_processed_updates",
      "Log Idempotency Telegram",
      () =>
        admin
          .from("telegram_processed_updates")
          .delete({ count: "exact" })
          .lt("processed_at", cutoffIso)
    );

    await runDelete("password_reset_otps", "OTP Reset Password Lama", () =>
      admin
        .from("password_reset_otps")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso)
    );

    await runDelete("bot_user_states", "State Bot Kedaluwarsa", () =>
      admin
        .from("bot_user_states")
        .delete({ count: "exact" })
        .lt("expires_at", nowIso)
    );

    await admin
      .from("app_settings")
      .update({ last_cutoff_at: nowIso })
      .eq("id", 1);

    const totalDeleted = breakdown.reduce((sum, item) => sum + item.rows, 0);

    return NextResponse.json({
      ok: true,
      result: {
        retain_months: months,
        cutoff_at: cutoffIso,
        executed_at: nowIso,
        total_deleted: totalDeleted,
        breakdown,
      },
      message: `Pembersihan data selesai. ${totalDeleted.toLocaleString("id-ID")} baris data lama berhasil dihapus.`,
    });
  } catch (err) {
    console.error("[admin/database/cutoff POST] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal mengeksekusi penghapusan data cutoff.",
      },
      { status: 500 }
    );
  }
}
