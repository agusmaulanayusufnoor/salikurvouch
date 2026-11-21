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
  const iface = searchParams.get("interface")?.trim() || "";
  if (!iface) {
    return NextResponse.json(
      { ok: false, error: "Parameter interface wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const adapter = await getDefaultMikroTikAdapter();
    const sample = await adapter.monitorInterfaceTraffic(iface);
    return NextResponse.json({ ok: true, data: sample });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Gagal monitor traffic MikroTik",
      },
      { status: 502 }
    );
  }
}
