import { NextResponse } from "next/server";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const routerId = searchParams.get("routerId") || undefined;

  try {
    const adapter = await getDefaultMikroTikAdapter(routerId);
    const snapshot = await adapter.getSystemStatus();
    return NextResponse.json({ ok: true, data: snapshot });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Gagal mengambil status router MikroTik",
      },
      { status: 502 }
    );
  }
}
