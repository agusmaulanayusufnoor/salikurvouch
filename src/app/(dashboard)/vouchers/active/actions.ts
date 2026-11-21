"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";

export type ActiveVoucherActionResult = {
  ok: boolean;
  message: string;
};

export async function kickActiveVoucherAction(
  id: string,
  user?: string
): Promise<ActiveVoucherActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.kickHotspotActive(id);
    revalidatePath("/vouchers/active");
    revalidatePath("/mikrotik/hotspot/active");
    revalidatePath("/");
    return {
      ok: true,
      message: user
        ? `User "${user}" berhasil di-kick dari Hotspot Active.`
        : "User berhasil di-kick dari Hotspot Active.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal melakukan kick user aktif.",
    };
  }
}

export async function bulkKickActiveVouchersAction(
  ids: string[]
): Promise<ActiveVoucherActionResult> {
  try {
    await requireStaff();
    if (!ids.length) {
      return { ok: false, message: "Pilih minimal 1 user aktif untuk di-kick." };
    }
    const adapter = await getDefaultMikroTikAdapter();
    let kicked = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await adapter.kickHotspotActive(id);
        kicked++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/vouchers/active");
    revalidatePath("/mikrotik/hotspot/active");
    revalidatePath("/");
    return {
      ok: failed === 0,
      message:
        failed === 0
          ? `${kicked} user aktif berhasil di-kick.`
          : `${kicked} user berhasil di-kick, ${failed} gagal.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal melakukan kick massal.",
    };
  }
}
