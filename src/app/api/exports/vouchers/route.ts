import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const resellerId = searchParams.get("resellerId")?.trim() || "";
  const txType = searchParams.get("txType")?.trim() || "";
  const from = searchParams.get("from")?.trim() || "";
  const to = searchParams.get("to")?.trim() || "";
  const q = searchParams.get("q")?.trim() || "";

  const [supabase, activeServer] = await Promise.all([
    createClient(),
    getActiveServer(),
  ]);

  let query = supabase
    .from("wallet_transactions")
    .select(
      "id, legacy_no, telegram_id, seller_name, tx_type, amount, voucher_price, markup_amount, balance_before, balance_after, voucher_username, voucher_profile, topup_by, status, notes, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(10000);

  if (activeServer) query = query.eq("server_id", activeServer.id);
  if (resellerId) query = query.eq("reseller_id", resellerId);
  if (txType && txType !== "all") query = query.eq("tx_type", txType);
  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);
  if (q) {
    const safeQ = q.replace(/[%_,]/g, "");
    query = query.or(
      `seller_name.ilike.%${safeQ}%,voucher_username.ilike.%${safeQ}%,notes.ilike.%${safeQ}%`
    );
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: `Gagal memuat data export: ${error.message}` },
      { status: 500 }
    );
  }

  const list = rows ?? [];
  const stamp = new Date().toISOString().slice(0, 10);
  const slugPart = activeServer?.slug ? `-${activeServer.slug}` : "";
  const baseName = `salikurvouch${slugPart}-mutasi-${stamp}`;

  if (format === "csv") {
    const headers = [
      "ID",
      "Tanggal (WIB)",
      "Telegram ID",
      "Reseller",
      "Tipe",
      "Nominal Mutasi",
      "Harga Voucher",
      "Markup",
      "Saldo Awal",
      "Saldo Akhir",
      "Voucher",
      "Profile",
      "Status",
      "Catatan",
    ];

    const lines = [
      headers.map(escapeCsvCell).join(","),
      ...list.map((r) =>
        [
          r.id,
          new Date(r.created_at).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          }),
          r.telegram_id,
          r.seller_name ?? "",
          r.tx_type,
          Number(r.amount),
          Number(r.voucher_price ?? 0),
          Number(r.markup_amount ?? 0),
          Number(r.balance_before),
          Number(r.balance_after),
          r.voucher_username ?? "",
          r.voucher_profile ?? "",
          r.status,
          r.notes ?? "",
        ]
          .map(escapeCsvCell)
          .join(",")
      ),
    ];

    return new NextResponse(lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SalikurVouch";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Riwayat Mutasi");
  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Tanggal (WIB)", key: "created_at", width: 22 },
    { header: "Telegram ID", key: "telegram_id", width: 16 },
    { header: "Reseller", key: "seller_name", width: 20 },
    { header: "Tipe", key: "tx_type", width: 18 },
    { header: "Nominal Mutasi", key: "amount", width: 16 },
    { header: "Harga Voucher", key: "voucher_price", width: 16 },
    { header: "Markup", key: "markup_amount", width: 14 },
    { header: "Saldo Awal", key: "balance_before", width: 16 },
    { header: "Saldo Akhir", key: "balance_after", width: 16 },
    { header: "Kode Voucher", key: "voucher_username", width: 16 },
    { header: "Profile", key: "voucher_profile", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Catatan", key: "notes", width: 28 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" },
  };
  headerRow.alignment = { vertical: "middle" };

  for (const r of list) {
    sheet.addRow({
      id: r.id,
      created_at: new Date(r.created_at).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      }),
      telegram_id: r.telegram_id,
      seller_name: r.seller_name ?? "-",
      tx_type: r.tx_type,
      amount: Number(r.amount),
      voucher_price: Number(r.voucher_price ?? 0),
      markup_amount: Number(r.markup_amount ?? 0),
      balance_before: Number(r.balance_before),
      balance_after: Number(r.balance_after),
      voucher_username: r.voucher_username ?? "-",
      voucher_profile: r.voucher_profile ?? "-",
      status: r.status,
      notes: r.notes ?? "",
    });
  }

  for (const colKey of [
    "amount",
    "voucher_price",
    "markup_amount",
    "balance_before",
    "balance_after",
  ]) {
    sheet.getColumn(colKey).numFmt = "#,##0";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
    },
  });
}
