import { decryptSecret, isEncryptedSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveServer } from "@/lib/server-context";
import { RosBinaryApiAdapter } from "./ros-v6-api";
import { RosV7RestAdapter } from "./ros-v7-rest";
import type {
  MikroTikAdapter,
  RosVersion,
  RouterConfig,
  RouterConnectionMode,
} from "./types";

export function createMikroTikAdapter(config: RouterConfig): MikroTikAdapter {
  if (config.rosVersion === "v7" && config.connectionMode === "rest_api") {
    return new RosV7RestAdapter(config);
  }
  return new RosBinaryApiAdapter(config);
}

export function decryptRouterPassword(stored: string): string {
  if (!stored) return "";
  if (isEncryptedSecret(stored)) {
    return decryptSecret(stored);
  }
  return stored;
}

export async function getRouterConfigFromDb(
  routerId?: string
): Promise<RouterConfig | null> {
  let resolvedRouterId = routerId;
  if (!resolvedRouterId) {
    try {
      const activeServer = await getActiveServer();
      resolvedRouterId = activeServer.router_id ?? undefined;
    } catch {
      // Fall back to default router query below
    }
  }

  const admin = createAdminClient();
  let query = admin
    .from("routers")
    .select(
      "id, name, host, port, ros_version, connection_mode, allow_self_signed_tls, username, password_encrypted, dns_name"
    )
    .eq("is_active", true);

  if (resolvedRouterId) {
    query = query.eq("id", resolvedRouterId);
  } else {
    query = query.order("is_default", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    host: data.host,
    port: data.port,
    rosVersion: data.ros_version as RosVersion,
    connectionMode: data.connection_mode as RouterConnectionMode,
    allowSelfSignedTls: data.allow_self_signed_tls,
    username: data.username,
    password: decryptRouterPassword(data.password_encrypted),
    dnsName: data.dns_name,
  };
}

export async function getDefaultMikroTikAdapter(
  routerId?: string
): Promise<MikroTikAdapter> {
  const config = await getRouterConfigFromDb(routerId);
  if (!config) {
    throw new Error(
      "Konfigurasi router MikroTik belum diatur. Silakan isi di menu Pengaturan."
    );
  }
  return createMikroTikAdapter(config);
}

export * from "./types";
export * from "./scripts";
export * from "./normalizers";
