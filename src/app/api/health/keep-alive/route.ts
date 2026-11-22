import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keep-Alive endpoint to prevent Supabase Free-Tier 7-day auto-pause.
 * Invoked by GitHub Actions (.github/workflows/supabase-keepalive.yml)
 * and/or Vercel Cron (vercel.json).
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (expectedSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (token !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Perform a lightweight write + read so Supabase registers active DB usage
    const [updateRes, countRes] = await Promise.all([
      admin
        .from("app_settings")
        .update({ last_keepalive_at: nowIso })
        .eq("id", 1),
      admin.from("resellers").select("id", { count: "exact", head: true }),
    ]);

    if (updateRes.error) {
      throw updateRes.error;
    }
    if (countRes.error) {
      throw countRes.error;
    }

    return NextResponse.json({
      ok: true,
      timestamp: nowIso,
      resellersCount: countRes.count ?? 0,
      message: "Supabase keep-alive heartbeat recorded.",
    });
  } catch (err) {
    console.error("[keep-alive] failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Failed to ping Supabase DB",
      },
      { status: 500 }
    );
  }
}
