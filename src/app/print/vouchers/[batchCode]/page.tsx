import { notFound, redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/utils";
import {
  buildHotspotLoginUrl,
  formatUptimeLabel,
  generateQrDataUrl,
} from "@/lib/voucher-generator";
import { PrintToolbar } from "./print-toolbar";

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

  // Generate all QR Codes locally on server (zero external API dependency!)
  const cards = await Promise.all(
    voucherList.map(async (v, index) => {
      const dns = v.dns_name || "wifi.salikur.net";
      const loginUrl = buildHotspotLoginUrl(dns, v.username, v.password);
      const qrDataUrl = await generateQrDataUrl(loginUrl, "#0f172a");
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
        qrDataUrl,
      };
    })
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-10 text-slate-900 print:bg-white print:pb-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 6mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
        }
      `}</style>

      <PrintToolbar batchCode={batch.batch_code} count={cards.length} />

      <div className="mx-auto max-w-[210mm] bg-white p-3 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {cards.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Tidak ada kode voucher dalam batch ini.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            {cards.map((card) => (
              <div
                key={`${card.num}-${card.username}`}
                className="flex break-inside-avoid flex-col justify-between overflow-hidden rounded-md border border-slate-300 bg-white text-[10px]"
              >
                {/* Header strip */}
                <div
                  className="flex items-center justify-between px-2 py-1 text-white"
                  style={{ backgroundColor: card.badgeColor }}
                >
                  <span className="font-bold tracking-tight">
                    SalikurNet
                  </span>
                  <span className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                    {formatIDR(card.price)}
                  </span>
                </div>

                {/* Body */}
                <div className="flex items-center gap-1.5 p-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <span>[{card.num}]</span>
                      <span className="truncate font-medium text-slate-700">
                        {card.uptimeLabel}
                      </span>
                    </div>

                    {card.loginType === "vc" || card.username === card.password ? (
                      <div className="rounded border border-dashed border-slate-400 bg-slate-50 px-1.5 py-1 text-center">
                        <p className="text-[8px] uppercase text-slate-500">
                          Kode Voucher
                        </p>
                        <p className="font-mono text-sm font-extrabold tracking-wider text-slate-900">
                          {card.username}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5 rounded border border-dashed border-slate-400 bg-slate-50 px-1.5 py-1 font-mono text-[10px]">
                        <p className="truncate">
                          <span className="text-slate-500">Us:</span>{" "}
                          <strong className="text-slate-900">
                            {card.username}
                          </strong>
                        </p>
                        <p className="truncate">
                          <span className="text-slate-500">Ps:</span>{" "}
                          <strong className="text-slate-900">
                            {card.password}
                          </strong>
                        </p>
                      </div>
                    )}

                    <p className="truncate text-[9px] text-slate-600">
                      Kuota: <strong>{card.quotaLabel}</strong>
                    </p>
                  </div>

                  {/* Locally rendered QR Code */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.qrDataUrl}
                    alt={`QR ${card.username}`}
                    width={62}
                    height={62}
                    className="size-[62px] shrink-0 rounded border border-slate-200"
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] text-slate-600">
                  <span className="truncate">Login: {card.dns}</span>
                  <span className="font-mono">{card.profile}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
