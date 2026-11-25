import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import {
  filterHotspotUsers,
  formatBytesLimitLabel,
  parseCommentVoucherPrice,
} from "@/lib/mikrotik/hotspot-filter";
import { formatUptimeLabel } from "@/lib/voucher-generator";
import {
  getPriceBadgeColor,
  VoucherA4PrintSheet,
  type PrintableVoucherCard,
} from "@/components/print/voucher-a4-print-sheet";

export default async function PrintFilteredVoucherListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    profile?: string;
    comment?: string;
    usage?: string;
    ids?: string;
  }>;
}) {
  const staff = await getAuthenticatedStaff();
  if (!staff) redirect("/login");

  const sp = await searchParams;
  const q = sp.q ?? "";
  const profile = sp.profile || "all";
  const comment = sp.comment || "all";
  const usage = sp.usage || "all";
  const selectedIdsRaw = (sp.ids ?? "").trim();
  const selectedIdSet = selectedIdsRaw
    ? new Set(
        selectedIdsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const [supabase, activeServer, adapter] = await Promise.all([
    createClient(),
    getActiveServer(),
    getDefaultMikroTikAdapter(),
  ]);

  const [users, packagesRes] = await Promise.all([
    adapter.listHotspotUsers(),
    activeServer?.id
      ? supabase
          .from("voucher_packages")
          .select("mikrotik_profile, price, card_color")
          .eq("server_id", activeServer.id)
      : Promise.resolve({ data: [] }),
  ]);

  const pkgByProfile = new Map<
    string,
    { price: number; cardColor: string | null }
  >();
  for (const pkg of packagesRes.data ?? []) {
    if (pkg.mikrotik_profile && !pkgByProfile.has(pkg.mikrotik_profile)) {
      pkgByProfile.set(pkg.mikrotik_profile, {
        price: Number(pkg.price ?? 0),
        cardColor: pkg.card_color ?? null,
      });
    }
  }

  const matchedUsers = (
    selectedIdSet && selectedIdSet.size > 0
      ? users.filter((u) => selectedIdSet.has(u.id))
      : filterHotspotUsers(users, {
          search: q,
          profile,
          comment,
          usage,
        })
  ).filter((u) => u.name !== "default-trial");

  const dnsName = adapter.config.dnsName || "wifi.salikur.net";

  const cards: PrintableVoucherCard[] = matchedUsers.map((u, index) => {
    const pkg = pkgByProfile.get(u.profile);
    const commentPrice = parseCommentVoucherPrice(u.comment);
    const profileNumeric = /^\d+$/.test(u.profile) ? Number(u.profile) : 0;
    const resolvedPrice =
      pkg && pkg.price > 0
        ? pkg.price
        : commentPrice > 0
          ? commentPrice
          : profileNumeric;

    const password = u.password || u.name;
    return {
      num: index + 1,
      username: u.name,
      password,
      loginType: password !== u.name ? "up" : "vc",
      profile: u.profile || "-",
      price: resolvedPrice,
      uptimeLabel: formatUptimeLabel(u.limitUptime),
      quotaLabel: formatBytesLimitLabel(u.limitBytesTotal),
      dns: dnsName,
      badgeColor: getPriceBadgeColor(resolvedPrice, pkg?.cardColor),
    };
  });

  const filterSummaryParts: string[] = [];
  if (selectedIdSet && selectedIdSet.size > 0) {
    filterSummaryParts.push(`${selectedIdSet.size} voucher terpilih`);
  } else {
    if (comment !== "all") filterSummaryParts.push(`Comment: ${comment}`);
    if (profile !== "all") filterSummaryParts.push(`Profile: ${profile}`);
    if (usage !== "all") filterSummaryParts.push(`Status: ${usage}`);
    if (q.trim()) filterSummaryParts.push(`Cari: "${q.trim()}"`);
  }

  const backParams = new URLSearchParams();
  if (q.trim()) backParams.set("q", q.trim());
  if (profile !== "all") backParams.set("profile", profile);
  if (comment !== "all") backParams.set("comment", comment);
  if (usage !== "all") backParams.set("usage", usage);
  const backHref = backParams.toString()
    ? `/vouchers/list?${backParams.toString()}`
    : "/vouchers/list";

  return (
    <VoucherA4PrintSheet
      title={`List Voucher (${adapter.config.name})`}
      subtitle={
        filterSummaryParts.length > 0
          ? filterSummaryParts.join(" • ")
          : "Semua voucher aktif"
      }
      cards={cards}
      backHref={backHref}
      backLabel="Kembali ke List"
      emptyMessage="Tidak ada voucher yang cocok dengan filter untuk dicetak."
    />
  );
}
