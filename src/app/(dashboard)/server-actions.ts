"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import {
  ACTIVE_SERVER_COOKIE,
  listAccessibleServers,
} from "@/lib/server-context";

export async function switchActiveServerAction(
  serverId: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const staff = await requireStaff();
    const accessible = await listAccessibleServers(staff);
    const target = accessible.find((s) => s.id === serverId);

    if (!target) {
      return {
        ok: false,
        message: "Anda tidak memiliki akses ke server tersebut.",
      };
    }

    const store = await cookies();
    store.set(ACTIVE_SERVER_COOKIE, target.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/", "layout");
    return { ok: true, message: `Beralih ke server ${target.name}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal mengganti server.",
    };
  }
}
