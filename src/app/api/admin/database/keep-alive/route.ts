import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual Keep-Alive trigger from Settings -> Database UI.
 */
export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { error } = await admin
      .from("app_settings")
      .update({ last_keepalive_at: nowIso })
      .eq("id", 1);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      last_keepalive_at: nowIso,
      message: "Ping keep-alive berhasil dicatat di Supabase.",
    });
  } catch (err) {
    console.error("[admin/database/keep-alive] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal menjalankan ping keep-alive.",
      },
      { status: 500 }
    );
  }
}
