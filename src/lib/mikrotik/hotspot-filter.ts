import type { HotspotUser } from "@/lib/mikrotik/types";

export type HotspotUsageFilter = "all" | "unused" | "used" | "disabled";

export interface HotspotFilterCriteria {
  search?: string;
  profile?: string;
  comment?: string;
  usage?: HotspotUsageFilter | string;
}

export function isUnusedVoucher(u: HotspotUser): boolean {
  if (u.disabled || u.name === "default-trial") return false;
  const up = u.uptime.trim().toLowerCase();
  const noUptime = !up || up === "0s" || up === "00:00:00";
  return noUptime && u.bytesIn === 0 && u.bytesOut === 0;
}

export function filterHotspotUsers(
  users: HotspotUser[],
  criteria: HotspotFilterCriteria
): HotspotUser[] {
  const q = (criteria.search ?? "").trim().toLowerCase();
  const profileFilter = criteria.profile || "all";
  const commentFilter = criteria.comment || "all";
  const usageFilter = criteria.usage || "all";

  return users.filter((u) => {
    if (profileFilter !== "all" && u.profile !== profileFilter) return false;
    if (commentFilter !== "all" && u.comment.trim() !== commentFilter) {
      return false;
    }
    if (usageFilter === "unused" && !isUnusedVoucher(u)) return false;
    if (usageFilter === "used" && (isUnusedVoucher(u) || u.disabled)) {
      return false;
    }
    if (usageFilter === "disabled" && !u.disabled) return false;

    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.profile.toLowerCase().includes(q) ||
      u.comment.toLowerCase().includes(q) ||
      u.macAddress.toLowerCase().includes(q)
    );
  });
}

export function formatBytesLimitLabel(bytes: number): string {
  if (!bytes || bytes <= 0) return "Unlimited";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Number.isInteger(gb) ? gb : gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export function parseCommentVoucherPrice(comment?: string | null): number {
  const raw = (comment ?? "").trim();
  if (!raw.startsWith("vc-bot|")) return 0;
  const parts = raw.split("|");
  const candidate = Number(parts[2]);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
}
