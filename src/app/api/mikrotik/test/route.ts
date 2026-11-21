import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedStaff } from "@/lib/auth";
import {
  createMikroTikAdapter,
  getRouterConfigFromDb,
} from "@/lib/mikrotik/adapter";

export const runtime = "nodejs";

const testBodySchema = z.object({
  routerId: z.string().uuid().optional(),
  name: z.string().trim().optional(),
  host: z.string().trim().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  rosVersion: z.enum(["v6", "v7"]).optional(),
  connectionMode: z.enum(["api_tcp", "api_ssl", "rest_api"]).optional(),
  allowSelfSignedTls: z.boolean().optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string().optional(),
  dnsName: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (staff.role !== "super_admin" && staff.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = testBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Payload tidak valid" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const saved = await getRouterConfigFromDb(input.routerId);

  const host = input.host ?? saved?.host;
  const username = input.username ?? saved?.username;
  const password =
    input.password && input.password.length > 0
      ? input.password
      : saved?.password ?? "";

  if (!host || !username) {
    return NextResponse.json(
      { ok: false, error: "Host dan Username MikroTik wajib diisi." },
      { status: 400 }
    );
  }

  const rosVersion = input.rosVersion ?? saved?.rosVersion ?? "v6";
  const connectionMode =
    input.connectionMode ?? saved?.connectionMode ?? "api_tcp";
  const defaultPort =
    connectionMode === "rest_api"
      ? 443
      : connectionMode === "api_ssl"
        ? 8729
        : 8728;

  const adapter = createMikroTikAdapter({
    id: saved?.id,
    name: input.name ?? saved?.name ?? "Router",
    host,
    port: input.port ?? saved?.port ?? defaultPort,
    rosVersion,
    connectionMode,
    allowSelfSignedTls:
      input.allowSelfSignedTls ?? saved?.allowSelfSignedTls ?? true,
    username,
    password,
    dnsName: input.dnsName ?? saved?.dnsName ?? "wifi.salikur.net",
    connectTimeoutMs: 5000,
    readTimeoutMs: 8000,
  });

  const result = await adapter.testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
