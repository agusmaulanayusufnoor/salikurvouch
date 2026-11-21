"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import {
  buildHotspotOnLoginScript,
  buildPppOnUpScript,
  getDefaultMikroTikAdapter,
} from "@/lib/mikrotik/adapter";

export type MikroTikActionResult = {
  ok: boolean;
  message: string;
};

// --- HOTSPOT USERS ---
export async function saveHotspotUserAction(
  formData: FormData
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const profile = String(formData.get("profile") ?? "default").trim();
    const server = String(formData.get("server") ?? "all").trim();
    const limitUptime = String(formData.get("limit_uptime") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();

    if (!name) return { ok: false, message: "Username wajib diisi." };

    if (id) {
      await adapter.updateHotspotUser(id, {
        name,
        password: password || undefined,
        profile,
        server,
        limitUptime: limitUptime || undefined,
        comment,
      });
    } else {
      await adapter.addHotspotUser({
        name,
        password: password || name,
        profile,
        server,
        limitUptime: limitUptime || undefined,
        comment,
      });
    }

    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: true,
      message: id
        ? `User Hotspot "${name}" berhasil diperbarui.`
        : `User Hotspot "${name}" berhasil ditambahkan.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal memproses user Hotspot.",
    };
  }
}

export async function toggleHotspotUserAction(
  id: string,
  disabled: boolean
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.updateHotspotUser(id, { disabled });
    revalidatePath("/mikrotik/hotspot/users");
    return {
      ok: true,
      message: disabled ? "User dinonaktifkan." : "User diaktifkan.",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal mengubah status user.",
    };
  }
}

export async function removeHotspotUserAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removeHotspotUser(id);
    revalidatePath("/mikrotik/hotspot/users");
    return { ok: true, message: "User Hotspot berhasil dihapus." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menghapus user.",
    };
  }
}

// --- HOTSPOT ACTIVE ---
export async function kickHotspotActiveAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.kickHotspotActive(id);
    revalidatePath("/mikrotik/hotspot/active");
    return { ok: true, message: "Sesi Hotspot berhasil diputus (kicked)." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal memutus sesi.",
    };
  }
}

// --- HOTSPOT PROFILES ---
export async function addHotspotProfileAction(
  formData: FormData
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    const name = String(formData.get("name") ?? "").trim();
    const rateLimit = String(formData.get("rate_limit") ?? "").trim();
    const sharedUsers = String(formData.get("shared_users") ?? "1").trim();
    const parentQueue = String(formData.get("parent_queue") ?? "none").trim();
    const validity = String(formData.get("validity") ?? "").trim();
    const lockMac = formData.get("lock_mac") === "true";
    const transparentProxy = formData.get("transparent_proxy") === "true";

    if (!name) return { ok: false, message: "Nama profile wajib diisi." };

    const onLogin = buildHotspotOnLoginScript({
      validity,
      lockMac,
      rosVersion: adapter.config.rosVersion,
    });

    await adapter.addHotspotProfile({
      name,
      rateLimit: rateLimit || undefined,
      sharedUsers: sharedUsers || "1",
      parentQueue,
      transparentProxy,
      onLogin: onLogin || undefined,
    });

    revalidatePath("/mikrotik/hotspot/profiles");
    return { ok: true, message: `Profile Hotspot "${name}" berhasil dibuat.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal membuat profile.",
    };
  }
}

export async function removeHotspotProfileAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removeHotspotProfile(id);
    revalidatePath("/mikrotik/hotspot/profiles");
    return { ok: true, message: "Profile Hotspot berhasil dihapus." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menghapus profile.",
    };
  }
}

// --- PPP SECRETS ---
export async function savePppSecretAction(
  formData: FormData
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const service = String(formData.get("service") ?? "pppoe").trim();
    const profile = String(formData.get("profile") ?? "default").trim();
    const localAddress = String(formData.get("local_address") ?? "").trim();
    const remoteAddress = String(formData.get("remote_address") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();

    if (!name) return { ok: false, message: "Nama PPP secret wajib diisi." };

    if (id) {
      await adapter.updatePppSecret(id, {
        name,
        password: password || undefined,
        service,
        profile,
        localAddress: localAddress || undefined,
        remoteAddress: remoteAddress || undefined,
        comment,
      });
    } else {
      await adapter.addPppSecret({
        name,
        password: password || name,
        service,
        profile,
        localAddress: localAddress || undefined,
        remoteAddress: remoteAddress || undefined,
        comment,
      });
    }

    revalidatePath("/mikrotik/ppp/secrets");
    return {
      ok: true,
      message: id
        ? `PPP Secret "${name}" diperbarui.`
        : `PPP Secret "${name}" berhasil ditambahkan.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal memproses PPP secret.",
    };
  }
}

export async function togglePppSecretAction(
  id: string,
  disabled: boolean
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.updatePppSecret(id, { disabled });
    revalidatePath("/mikrotik/ppp/secrets");
    return {
      ok: true,
      message: disabled ? "PPP secret dinonaktifkan." : "PPP secret diaktifkan.",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal ubah status secret.",
    };
  }
}

export async function removePppSecretAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removePppSecret(id);
    revalidatePath("/mikrotik/ppp/secrets");
    return { ok: true, message: "PPP secret berhasil dihapus." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menghapus PPP secret.",
    };
  }
}

// --- PPP ACTIVE ---
export async function disconnectPppActiveAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.disconnectPppActive(id);
    revalidatePath("/mikrotik/ppp/active");
    return { ok: true, message: "Koneksi PPP aktif berhasil diputus." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal memutus PPP.",
    };
  }
}

// --- PPP PROFILES ---
export async function addPppProfileAction(
  formData: FormData
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    const name = String(formData.get("name") ?? "").trim();
    const localAddress = String(formData.get("local_address") ?? "").trim();
    const remoteAddress = String(formData.get("remote_address") ?? "").trim();
    const dnsServer = String(formData.get("dns_server") ?? "").trim();
    const rateLimit = String(formData.get("rate_limit") ?? "").trim();
    const parentQueue = String(formData.get("parent_queue") ?? "none").trim();
    const comment = String(formData.get("comment") ?? "").trim();
    const validity = String(formData.get("validity") ?? "").trim();
    const expiredProfile = String(formData.get("expired_profile") ?? "").trim();

    if (!name) return { ok: false, message: "Nama PPP profile wajib diisi." };

    const onUp = buildPppOnUpScript({ validity, expiredProfile });

    await adapter.addPppProfile({
      name,
      localAddress: localAddress || undefined,
      remoteAddress: remoteAddress || undefined,
      dnsServer: dnsServer || undefined,
      rateLimit: rateLimit || undefined,
      parentQueue,
      comment: comment || undefined,
      onUp: onUp || undefined,
    });

    revalidatePath("/mikrotik/ppp/profiles");
    return { ok: true, message: `PPP Profile "${name}" berhasil dibuat.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal membuat PPP profile.",
    };
  }
}

export async function removePppProfileAction(
  id: string
): Promise<MikroTikActionResult> {
  try {
    await requireStaff();
    const adapter = await getDefaultMikroTikAdapter();
    await adapter.removePppProfile(id);
    revalidatePath("/mikrotik/ppp/profiles");
    return { ok: true, message: "PPP Profile berhasil dihapus." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal menghapus PPP profile.",
    };
  }
}
