import { notFound, redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import { formatUptimeLabel } from "@/lib/voucher-generator";
import { PrintToolbar } from "./print-toolbar";

const VOUCHERS_PER_PAGE = 50; // 5 columns x 10 rows per A4 portrait page

function chunkArray<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function getPriceBadgeColor(price: number, customColor?: string | null): string {
  if (
    customColor &&
    /^#[0-9a-fA-F]{6}$/.test(customColor) &&
    customColor.toUpperCase() !== "#FFFFFF"
  ) {
    return customColor;
  }
  if (price <= 3000) return "#ec4899";
  if (price <= 5000) return "#2563eb";
  if (price <= 10000) return "#059669";
  if (price <= 15000) return "#d97706";
  if (price <= 25000) return "#7c3aed";
  return "#dc2626";
}

export default async function PrintVouchersPage({
  params,
}: {
  params: Promise<{ batchCode: string }>;
}) {
  const staff = await getAuthenticatedStaff();
  if (!staff) redirect("/login");

  const { batchCode } = await params;
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("voucher_batches")
    .select("*, resellers(username)")
    .eq("batch_code", batchCode)
    .maybeSingle();

  if (!batch) notFound();

  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("*")
    .eq("batch_id", batch.id)
    .order("id", { ascending: true });

  const voucherList = vouchers ?? [];

  const cards = voucherList.map((v, index) => {
    const dns = v.dns_name || "wifi.salikur.net";
    const badgeColor = getPriceBadgeColor(Number(v.price), v.card_color);
    return {
      num: index + 1,
      username: v.username,
      password: v.password,
      loginType: v.login_type,
      profile: v.profile || batch.package_name,
      price: Number(v.price),
      uptimeLabel: formatUptimeLabel(v.time_limit),
      quotaLabel: v.data_limit_label || "Unlimited",
      dns,
      badgeColor,
    };
  });

  const pages = chunkArray(cards, VOUCHERS_PER_PAGE);

  return (
    <div className="min-h-screen bg-slate-100 pb-10 text-slate-900 print:min-h-0 print:bg-white print:pb-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 5mm;
        }
        @media print {
          html,
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .voucher-a4-page {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
          .voucher-a4-page-break {
            break-after: page;
            page-break-after: always;
          }
        }
        .voucher-a4-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          grid-auto-rows: 26.5mm;
          gap: 1.8mm;
        }
      `}</style>

      <PrintToolbar
        batchCode={batch.batch_code}
        count={cards.length}
        pageCount={pages.length}
      />

      {cards.length === 0 ? (
        <div className="mx-auto max-w-[210mm] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
          <p className="py-12 text-center text-sm text-slate-500">
            Tidak ada kode voucher dalam batch ini.
          </p>
        </div>
      ) : (
        <div className="space-y-6 print:space-y-0">
          {pages.map((pageCards, pageIdx) => {
            const isLastPage = pageIdx === pages.length - 1;
            return (
              <section
                key={`page-${pageIdx + 1}`}
                className={`voucher-a4-page mx-auto w-[210mm] max-w-full bg-white p-[5mm] shadow-sm ${
                  !isLastPage ? "voucher-a4-page-break" : ""
                }`}
              >
                <div className="voucher-a4-grid">
                  {pageCards.map((card) => (
                    <div
                      key={`${card.num}-${card.username}`}
                      className="flex h-full break-inside-avoid flex-col justify-between overflow-hidden rounded border border-slate-300 bg-white leading-tight"
                    >
                      {/* Header strip */}
                      <div
                        className="flex items-center justify-between gap-1 px-1.5 py-[2px] text-white"
                        style={{ backgroundColor: card.badgeColor }}
                      >
                        <span className="truncate text-[8.5px] font-bold tracking-tight">
                          SalikurNet
                        </span>
                        <span className="shrink-0 rounded bg-black/25 px-1 py-[1px] font-mono text-[8px] font-bold">
                          {formatIDR(card.price)}
                        </span>
                      </div>

                      {/* Body (compact, without QR Code) */}
                      <div className="flex flex-1 flex-col justify-center gap-0.5 px-1.5 py-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-slate-500">
                          <span>[{card.num}]</span>
                          <span className="truncate font-medium text-slate-700">
                            {card.uptimeLabel}
                          </span>
                        </div>

                        {card.loginType === "vc" ||
                        card.username === card.password ? (
                          <div className="rounded border border-dashed border-slate-400 bg-slate-50 px-1 py-[2px] text-center">
                            <p className="text-[6.5px] uppercase tracking-wider text-slate-500">
                              Kode Voucher
                            </p>
                            <p className="truncate font-mono text-[12px] font-extrabold tracking-wide text-slate-900">
                              {card.username}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded border border-dashed border-slate-400 bg-slate-50 px-1 py-[2px] font-mono text-[8.5px]">
                            <p className="truncate">
                              <span className="text-slate-500">U:</span>{" "}
                              <strong className="text-slate-900">
                                {card.username}
                              </strong>
                            </p>
                            <p className="truncate">
                              <span className="text-slate-500">P:</span>{" "}
                              <strong className="text-slate-900">
                                {card.password}
                              </strong>
                            </p>
                          </div>
                        )}

                        <p className="truncate text-[7.5px] text-slate-600">
                          Kuota: <strong>{card.quotaLabel}</strong>
                        </p>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between gap-1 border-t border-slate-200 bg-slate-50 px-1.5 py-[2px] text-[7px] text-slate-600">
                        <span className="truncate">{card.dns}</span>
                        <span className="shrink-0 font-mono font-medium">
                          {card.profile}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
