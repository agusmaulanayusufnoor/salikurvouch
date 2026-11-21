"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";

export type DhcpLeaseActionResult = {
  ok: boolean;
  message: string;
};

export async function kickDhcpLeaseAction(
  id: string,
  label?: string
): Promise<DhcpLeaseActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removeDhcpLease(id);
    revalidatePath("/mikrotik/dhcp-leases");
    return {
      ok: true,
      message: label
        ? `DHCP Lease "${label}" berhasil di-kick / dihapus.`
        : "DHCP Lease berhasil di-kick / dihapus.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menghapus DHCP Lease.",
    };
  }
}

export async function bulkKickDhcpLeasesAction(
  ids: string[]
): Promise<DhcpLeaseActionResult> {
  try {
    await requireStaff();
    if (!ids.length) {
      return { ok: false, message: "Pilih minimal 1 DHCP Lease untuk di-kick." };
    }
    const adapter = await getDefaultMikroTikAdapter();
    let removed = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await adapter.removeDhcpLease(id);
        removed++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/mikrotik/dhcp-leases");
    return {
      ok: failed === 0,
      message:
        failed === 0
          ? `${removed} DHCP Lease berhasil di-kick.`
          : `${removed} DHCP Lease berhasil di-kick, ${failed} gagal.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal kick massal DHCP Lease.",
    };
  }
}
