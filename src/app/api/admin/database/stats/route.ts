import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rpc_get_database_storage_stats");
    if (error) throw error;

    return NextResponse.json({ ok: true, stats: data });
  } catch (err) {
    console.error("[admin/database/stats] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal mengambil statistik storage Supabase.",
      },
      { status: 500 }
    );
  }
}
