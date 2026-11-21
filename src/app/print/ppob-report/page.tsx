import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { PpobPrintToolbar } from "./print-toolbar";

export default async function PrintPpobReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    resellerId?: string;
    status?: string;
  }>;
}) {
  const staff = await getAuthenticatedStaff();
  if (!staff) redirect("/login");

  const sp = await searchParams;
  const from = sp.from || "";
  const to = sp.to || "";
  const resellerId = sp.resellerId || "";
  const status = sp.status || "";

  const supabase = await createClient();
  let query = supabase
    .from("ppob_transactions")
    .select(
      "id, trx_id, telegram_id, product_code, target_number, cost_price, sell_price, profit, status, serial_number, created_at, resellers(username)"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (resellerId && resellerId !== "all") query = query.eq("reseller_id", resellerId);
  if (status && status !== "all") query = query.eq("status", status);
  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);

  const { data } = await query;
  const rows = data ?? [];

  const okRows = rows.filter(
    (r) => r.status === "SUCCESS" || r.status === "PROCESSED"
  );
  const sumCost = okRows.reduce((s, r) => s + Number(r.cost_price), 0);
  const sumSell = okRows.reduce((s, r) => s + Number(r.sell_price), 0);
  const sumProfit = okRows.reduce((s, r) => s + Number(r.profit), 0);

  return (
    <div className="min-h-screen bg-slate-100 pb-10 text-slate-900 print:bg-white print:pb-0">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
        }
      `}</style>

      <PpobPrintToolbar count={rows.length} />

      <div className="mx-auto max-w-[297mm] bg-white p-6 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold">
              LAPORAN TRANSAKSI &amp; LABA PORTAL PULSA (PPOB)
            </h1>
            <p className="text-xs text-slate-600">
              SalikurVouch • Periode: {from || "Awal"} s/d {to || "Sekarang"}
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p>Dicetak oleh: {staff.fullName || staff.username}</p>
            <p>Tanggal cetak: {formatDateTimeID(new Date())}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-3 text-xs">
          <div className="rounded border p-2.5">
            <p className="text-slate-500">Transaksi Sukses</p>
            <p className="text-base font-bold">{okRows.length}</p>
          </div>
          <div className="rounded border p-2.5">
            <p className="text-slate-500">Total Penjualan</p>
            <p className="text-base font-bold">{formatIDR(sumSell)}</p>
          </div>
          <div className="rounded border p-2.5">
            <p className="text-slate-500">Total Modal API</p>
            <p className="text-base font-bold">{formatIDR(sumCost)}</p>
          </div>
          <div className="rounded border bg-emerald-50 p-2.5">
            <p className="text-emerald-800">Total Laba Bersih</p>
            <p className="text-base font-bold text-emerald-700">
              {formatIDR(sumProfit)}
            </p>
          </div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="border border-slate-700 px-2 py-1.5 text-left">No</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">Waktu</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">TRX ID</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">Reseller</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">Produk</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">Tujuan</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Modal</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Jual</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Laba</th>
              <th className="border border-slate-700 px-2 py-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const res = Array.isArray(r.resellers)
                ? r.resellers[0]
                : r.resellers;
              return (
                <tr key={r.id} className="even:bg-slate-50">
                  <td className="border border-slate-300 px-2 py-1">{idx + 1}</td>
                  <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">
                    {formatDateTimeID(r.created_at)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 font-mono">
                    {r.trx_id}
                  </td>
                  <td className="border border-slate-300 px-2 py-1">
                    {res?.username ? `@${res.username}` : r.telegram_id}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 font-mono">
                    {r.product_code}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 font-mono">
                    {r.target_number}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                    {formatIDR(Number(r.cost_price))}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                    {formatIDR(Number(r.sell_price))}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono font-semibold">
                    {formatIDR(Number(r.profit))}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {r.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={6} className="border border-slate-400 px-2 py-1.5 text-right">
                TOTAL (SUCCESS / PROCESSED)
              </td>
              <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                {formatIDR(sumCost)}
              </td>
              <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                {formatIDR(sumSell)}
              </td>
              <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                {formatIDR(sumProfit)}
              </td>
              <td className="border border-slate-400 px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 grid grid-cols-2 text-center text-xs">
          <div>
            <p>Mengetahui,</p>
            <p className="mt-12 font-semibold">Owner SalikurNet</p>
          </div>
          <div>
            <p>Dibuat oleh,</p>
            <p className="mt-12 font-semibold">{staff.fullName || staff.username}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
