import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ServersClient, type ServerCardItem } from "./servers-client";

export const metadata = {
  title: "Kelola Multi-Server",
};

export default async function ServersManagePage() {
  const staff = await getAuthenticatedStaff();
  if (!staff || (staff.role !== "super_admin" && staff.role !== "admin")) {
    redirect("/");
  }

  const activeServer = await getActiveServer(undefined, staff);
  const admin = createAdminClient();

  const [serversRes, resellersRes, packagesRes] = await Promise.all([
    admin
      .from("servers")
      .select(
        "id, slug, name, is_default, bot_username, bot_token_encrypted, owner_username, routers(host, port, ros_version, dns_name)"
      )
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    admin.from("resellers").select("server_id").eq("status", "active"),
    admin.from("voucher_packages").select("server_id").eq("is_active", true),
  ]);

  const resellerCounts = new Map<string, number>();
  for (const r of resellersRes.data ?? []) {
    resellerCounts.set(r.server_id, (resellerCounts.get(r.server_id) ?? 0) + 1);
  }

  const packageCounts = new Map<string, number>();
  for (const p of packagesRes.data ?? []) {
    packageCounts.set(p.server_id, (packageCounts.get(p.server_id) ?? 0) + 1);
  }

  const items: ServerCardItem[] = (serversRes.data ?? []).map((s) => {
    const rRaw = s.routers as
      | {
          host?: string;
          port?: number;
          ros_version?: string;
          dns_name?: string;
        }
      | Array<{
          host?: string;
          port?: number;
          ros_version?: string;
          dns_name?: string;
        }>
      | null;
    const routerObj = Array.isArray(rRaw) ? rRaw[0] : rRaw;

    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      isDefault: s.is_default,
      routerHost: routerObj?.host ?? "-",
      routerPort: routerObj?.port ?? 8728,
      routerRosVersion: routerObj?.ros_version ?? "v6",
      routerDnsName: routerObj?.dns_name ?? "-",
      botUsername: s.bot_username,
      hasBotToken: Boolean(s.bot_token_encrypted),
      ownerUsername: s.owner_username,
      resellerCount: resellerCounts.get(s.id) ?? 0,
      packageCount: packageCounts.get(s.id) ?? 0,
    };
  });

  return (
    <ServersClient
      servers={items}
      activeServerId={activeServer.id}
      isSuperAdmin={staff.role === "super_admin"}
    />
  );
}
