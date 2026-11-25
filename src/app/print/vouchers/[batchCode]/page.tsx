import { notFound, redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatUptimeLabel } from "@/lib/voucher-generator";
import {
  getPriceBadgeColor,
  VoucherA4PrintSheet,
  type PrintableVoucherCard,
} from "@/components/print/voucher-a4-print-sheet";

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

  const cards: PrintableVoucherCard[] = voucherList.map((v, index) => {
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

  return (
    <VoucherA4PrintSheet
      title={batch.batch_code}
      cards={cards}
      backHref="/vouchers/batches"
      backLabel="Kembali ke Batch"
      emptyMessage="Tidak ada kode voucher dalam batch ini."
    />
  );
}
