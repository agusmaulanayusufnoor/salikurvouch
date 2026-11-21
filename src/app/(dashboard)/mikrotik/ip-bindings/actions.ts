"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import type { IpBindingType } from "@/lib/mikrotik/types";

export type IpBindingActionResult = {
  ok: boolean;
  message: string;
};

export async function saveIpBindingAction(
  formData: FormData
): Promise<IpBindingActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();

    const id = String(formData.get("id") ?? "").trim();
    const enabled = String(formData.get("enabled") ?? "yes") === "yes";
    const macAddress = String(formData.get("mac_address") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const toAddress = String(formData.get("to_address") ?? "").trim();
    const prevMac = String(formData.get("prev_mac_address") ?? "").trim();
    const prevAddress = String(formData.get("prev_address") ?? "").trim();
    const prevToAddress = String(formData.get("prev_to_address") ?? "").trim();
    const server = String(formData.get("server") ?? "all").trim() || "all";
    const rawType = String(formData.get("type") ?? "bypassed").trim();
    const type: IpBindingType =
      rawType === "regular" || rawType === "blocked" ? rawType : "bypassed";
    const comment = String(formData.get("comment") ?? "").trim();

    if (!macAddress && !address) {
      return {
        ok: false,
        message: "Isi minimal MAC Address atau Address (IP).",
      };
    }

    if (id) {
      const unsetFields: Array<"mac-address" | "address" | "to-address"> = [];
      if (!macAddress && prevMac) unsetFields.push("mac-address");
      if (!address && prevAddress) unsetFields.push("address");
      if (!toAddress && prevToAddress) unsetFields.push("to-address");

      await adapter.updateHotspotIpBinding(
        id,
        {
          macAddress: macAddress || undefined,
          address: address || undefined,
          toAddress: toAddress || undefined,
          server,
          type,
          comment,
          disabled: !enabled,
        },
        unsetFields
      );
    } else {
      await adapter.addHotspotIpBinding({
        macAddress: macAddress || undefined,
        address: address || undefined,
        toAddress: toAddress || undefined,
        server,
        type,
        comment: comment || undefined,
        disabled: !enabled,
      });
    }

    revalidatePath("/mikrotik/ip-bindings");
    return {
      ok: true,
      message: id
        ? "IP Binding berhasil diperbarui di MikroTik."
        : "IP Binding berhasil ditambahkan ke MikroTik.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menyimpan IP Binding.",
    };
  }
}

export async function toggleIpBindingStatusAction(
  id: string,
  disabled: boolean
): Promise<IpBindingActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.updateHotspotIpBinding(id, { disabled });
    revalidatePath("/mikrotik/ip-bindings");
    return {
      ok: true,
      message: disabled
        ? "IP Binding dinonaktifkan."
        : "IP Binding diaktifkan.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Gagal mengubah status IP Binding.",
    };
  }
}

export async function deleteIpBindingAction(
  id: string
): Promise<IpBindingActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removeHotspotIpBinding(id);
    revalidatePath("/mikrotik/ip-bindings");
    return { ok: true, message: "IP Binding berhasil dihapus dari MikroTik." };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menghapus IP Binding.",
    };
  }
}

export async function bulkDeleteIpBindingsAction(
  ids: string[]
): Promise<IpBindingActionResult> {
  try {
    await requireStaff();
    if (!ids.length) {
      return { ok: false, message: "Pilih minimal 1 IP Binding untuk dihapus." };
    }
    const adapter = await getDefaultMikroTikAdapter();
    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await adapter.removeHotspotIpBinding(id);
        deleted++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/mikrotik/ip-bindings");
    return {
      ok: failed === 0,
      message:
        failed === 0
          ? `${deleted} IP Binding berhasil dihapus.`
          : `${deleted} IP Binding dihapus, ${failed} gagal.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal hapus massal IP Binding.",
    };
  }
}
