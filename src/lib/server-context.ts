import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthenticatedStaff } from "@/lib/auth";

export const ACTIVE_SERVER_COOKIE = "salikur_active_server";

export interface ServerSummary {
  id: string;
  slug: string;
  name: string;
  routerId: string | null;
  routerHost: string | null;
  routerPort: number | null;
  routerRosVersion: string | null;
  botUsername: string | null;
  botMode: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ActiveServerFull {
  id: string;
  slug: string;
  name: string;
  router_id: string | null;
  bot_token_encrypted: string | null;
  bot_username: string | null;
  bot_mode: "saldo_only" | "nonsaldo_only" | "hybrid";
  webhook_secret: string | null;
  owner_username: string | null;
  owner_telegram_id: number | null;
  max_deposit_amount: number;
  low_balance_threshold: number;
  ppob_enabled: boolean;
  ppob_markup_small_pct: number;
  ppob_markup_large_pct: number;
  ppob_markup_threshold: number;
  ppob_proxy_url: string | null;
  is_default: boolean;
  is_active: boolean;
}

function normalizeServerRow(row: Record<string, unknown>): ActiveServerFull {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    router_id: row.router_id ? String(row.router_id) : null,
    bot_token_encrypted: row.bot_token_encrypted
      ? String(row.bot_token_encrypted)
      : null,
    bot_username: row.bot_username ? String(row.bot_username) : null,
    bot_mode:
      (row.bot_mode as "saldo_only" | "nonsaldo_only" | "hybrid") ||
      "saldo_only",
    webhook_secret: row.webhook_secret ? String(row.webhook_secret) : null,
    owner_username: row.owner_username ? String(row.owner_username) : null,
    owner_telegram_id:
      row.owner_telegram_id !== null && row.owner_telegram_id !== undefined
        ? Number(row.owner_telegram_id)
        : null,
    max_deposit_amount: Number(row.max_deposit_amount ?? 1000000),
    low_balance_threshold: Number(row.low_balance_threshold ?? 10000),
    ppob_enabled: Boolean(row.ppob_enabled ?? true),
    ppob_markup_small_pct: Number(row.ppob_markup_small_pct ?? 3),
    ppob_markup_large_pct: Number(row.ppob_markup_large_pct ?? 1),
    ppob_markup_threshold: Number(row.ppob_markup_threshold ?? 100000),
    ppob_proxy_url: row.ppob_proxy_url ? String(row.ppob_proxy_url) : null,
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active ?? true),
  };
}

/**
 * Lists all active servers accessible to the given staff user.
 * - `super_admin` always sees all active servers.
 * - `admin` / `operator` sees servers assigned in `admin_server_access`,
 *   or all active servers if no explicit access restrictions are configured for them.
 */
export async function listAccessibleServers(
  staff?: Pick<AuthenticatedStaff, "userId" | "role"> | null
): Promise<ServerSummary[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("servers")
    .select(
      "id, slug, name, router_id, bot_username, bot_mode, is_default, is_active, routers(host, port, ros_version)"
    )
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  let filtered = rows ?? [];

  if (staff && staff.role !== "super_admin") {
    const { data: grants } = await admin
      .from("admin_server_access")
      .select("server_id")
      .eq("admin_id", staff.userId);

    if (grants && grants.length > 0) {
      const allowedIds = new Set(grants.map((g) => g.server_id));
      filtered = filtered.filter((s) => allowedIds.has(s.id));
    }
  }

  return filtered.map((s) => {
    const rRaw = s.routers as
      | { host?: string; port?: number; ros_version?: string }
      | Array<{ host?: string; port?: number; ros_version?: string }>
      | null;
    const routerObj = Array.isArray(rRaw) ? rRaw[0] : rRaw;

    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      routerId: s.router_id,
      routerHost: routerObj?.host ?? null,
      routerPort: routerObj?.port ?? null,
      routerRosVersion: routerObj?.ros_version ?? null,
      botUsername: s.bot_username,
      botMode: s.bot_mode,
      isDefault: s.is_default,
      isActive: s.is_active,
    };
  });
}

/**
 * Safely reads the active server cookie. Returns null when called outside
 * a request context (e.g. CLI scripts or static builds).
 */
async function readActiveServerCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ACTIVE_SERVER_COOKIE)?.value?.trim() || null;
  } catch {
    return null;
  }
}

export async function getServerById(
  serverId: string
): Promise<ActiveServerFull | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle();
  return data ? normalizeServerRow(data as Record<string, unknown>) : null;
}

export async function getServerBySlug(
  slug: string
): Promise<ActiveServerFull | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servers")
    .select("*")
    .eq("slug", slug.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  return data ? normalizeServerRow(data as Record<string, unknown>) : null;
}

export async function getDefaultServer(): Promise<ActiveServerFull> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servers")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) {
    throw new Error("Belum ada server yang dikonfigurasi di tabel servers.");
  }
  return normalizeServerRow(data as Record<string, unknown>);
}

/**
 * Resolves the currently active server:
 * 1. Explicit `serverId` if provided (e.g. Telegram webhook / background job)
 * 2. Browser cookie `salikur_active_server` (verified against staff RBAC if provided)
 * 3. Default server (`is_default = TRUE`, i.e. Server 1)
 */
export async function getActiveServer(
  explicitServerId?: string,
  staff?: Pick<AuthenticatedStaff, "userId" | "role"> | null
): Promise<ActiveServerFull> {
  if (explicitServerId) {
    const found = await getServerById(explicitServerId);
    if (found) return found;
  }

  const cookieServerId = await readActiveServerCookie();

  if (staff && staff.role !== "super_admin") {
    const accessible = await listAccessibleServers(staff);
    if (accessible.length > 0) {
      const targetId =
        cookieServerId && accessible.some((s) => s.id === cookieServerId)
          ? cookieServerId
          : accessible[0].id;
      const found = await getServerById(targetId);
      if (found) return found;
    }
  } else if (cookieServerId) {
    const found = await getServerById(cookieServerId);
    if (found && found.is_active) return found;
  }

  return getDefaultServer();
}

export async function getActiveServerId(
  explicitServerId?: string
): Promise<string> {
  const srv = await getActiveServer(explicitServerId);
  return srv.id;
}
