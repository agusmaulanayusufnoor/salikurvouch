import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() || "";
  const to = searchParams.get("to")?.trim() || "";
  const resellerId = searchParams.get("resellerId")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const q = searchParams.get("q")?.trim() || "";

  const [supabase, activeServer] = await Promise.all([
    createClient(),
    getActiveServer(),
  ]);
  let query = supabase
    .from("ppob_transactions")
    .select(
      "id, trx_id, telegram_id, product_code, target_number, customer_id, cost_price, sell_price, profit, status, serial_number, description, source, created_at, resellers(username)"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (activeServer) query = query.eq("server_id", activeServer.id);
  if (resellerId && resellerId !== "all") query = query.eq("reseller_id", resellerId);
  if (status && status !== "all") query = query.eq("status", status);
  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);
  if (q) {
    const safeQ = q.replace(/[%_,]/g, "");
    query = query.or(
      `trx_id.ilike.%${safeQ}%,product_code.ilike.%${safeQ}%,target_number.ilike.%${safeQ}%,description.ilike.%${safeQ}%`
    );
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const wb = new ExcelJS.Workbook();
  wb.creator = "SalikurVouch";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Laporan Portal Pulsa");
  sheet.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal (WIB)", key: "created_at", width: 22 },
    { header: "TRX ID", key: "trx_id", width: 32 },
    { header: "Reseller", key: "reseller", width: 18 },
    { header: "Kode Produk", key: "product_code", width: 14 },
    { header: "Nomor Tujuan", key: "target_number", width: 16 },
    { header: "Harga Modal (Rp)", key: "cost_price", width: 16 },
    { header: "Harga Jual (Rp)", key: "sell_price", width: 16 },
    { header: "Laba (Rp)", key: "profit", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "SN", key: "serial_number", width: 24 },
    { header: "Keterangan", key: "description", width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" },
  };

  let sumCost = 0;
  let sumSell = 0;
  let sumProfit = 0;

  list.forEach((r, idx) => {
    const reseller = Array.isArray(r.resellers) ? r.resellers[0] : r.resellers;
    const cost = Number(r.cost_price);
    const sell = Number(r.sell_price);
    const profit = Number(r.profit);
    if (r.status === "SUCCESS" || r.status === "PROCESSED") {
      sumCost += cost;
      sumSell += sell;
      sumProfit += profit;
    }

    sheet.addRow({
      no: idx + 1,
      created_at: new Date(r.created_at).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      }),
      trx_id: r.trx_id,
      reseller: reseller?.username ? `@${reseller.username}` : String(r.telegram_id),
      product_code: r.product_code,
      target_number: r.target_number,
      cost_price: cost,
      sell_price: sell,
      profit,
      status: r.status,
      serial_number: r.serial_number ?? "",
      description: r.description ?? "",
    });
  });

  const totalRow = sheet.addRow({
    no: "",
    created_at: "TOTAL (SUCCESS/PROCESSED)",
    cost_price: sumCost,
    sell_price: sumSell,
    profit: sumProfit,
  });
  totalRow.font = { bold: true };

  for (const col of ["cost_price", "sell_price", "profit"]) {
    sheet.getColumn(col).numFmt = "#,##0";
  }

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const slugPart = activeServer?.slug ? `-${activeServer.slug}` : "";
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salikurvouch${slugPart}-ppob-${stamp}.xlsx"`,
    },
  });
}
