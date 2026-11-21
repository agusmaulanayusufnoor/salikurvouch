import { NextResponse } from "next/server";
import { getAuthenticatedStaff } from "@/lib/auth";
import {
  checkPortalPulsaStatus,
  findPortalPulsaProduct,
} from "@/lib/portalpulsa/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim() || "";
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Masukkan kode produk." },
      { status: 400 }
    );
  }

  const product = await findPortalPulsaProduct(code);
  if (!product) {
    return NextResponse.json(
      { ok: false, error: `Produk "${code}" tidak ditemukan di katalog Portal Pulsa.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, product });
}

export async function POST(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { trxId?: string } = {};
  try {
    body = (await request.json()) as { trxId?: string };
  } catch {
    body = {};
  }

  const trxId = body.trxId?.trim() || "";
  if (!trxId) {
    return NextResponse.json(
      { ok: false, error: "trxId wajib diisi." },
      { status: 400 }
    );
  }

  const res = await checkPortalPulsaStatus(trxId);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
