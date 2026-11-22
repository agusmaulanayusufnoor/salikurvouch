import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { createAdminClient } from "@/lib/supabase/admin";

export type PpobCategory = "PULSA" | "PLN" | "GAME";

export interface PortalPulsaMarkupConfig {
  smallPct: number;
  largePct: number;
  threshold: number;
  proxyUrl?: string | null;
}

export interface PortalPulsaProduct {
  code: string;
  description: string;
  provider: string;
  providerSub: string;
  operator: string;
  costPrice: number;
  sellPrice: number;
  profit: number;
  status: string;
}

export interface PortalPulsaBalanceResult {
  ok: boolean;
  balance: number;
  rawMessage: string;
  error?: string;
}

export interface PortalPulsaOrderResult {
  ok: boolean;
  trxId: string;
  status: "SUCCESS" | "PROCESSED" | "PENDING" | "FAILED";
  message: string;
  serialNumber: string;
  raw: unknown;
}

interface CacheEntry {
  expiresAt: number;
  items: PortalPulsaProduct[];
}

const CATALOG_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const API_URL = "https://portalpulsa.com/api/connect/";

export function calculatePpobSellPrice(
  costPrice: number,
  markup: PortalPulsaMarkupConfig
): { sellPrice: number; profit: number } {
  const pct =
    costPrice < markup.threshold ? markup.smallPct : markup.largePct;
  const sellPrice = Math.ceil(costPrice * (1 + pct / 100));
  return {
    sellPrice,
    profit: Math.max(sellPrice - costPrice, 0),
  };
}

export async function getPpobRuntimeConfig(): Promise<PortalPulsaMarkupConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select(
      "ppob_markup_small_pct, ppob_markup_large_pct, ppob_markup_threshold, ppob_proxy_url"
    )
    .eq("id", 1)
    .maybeSingle();

  return {
    smallPct: Number(data?.ppob_markup_small_pct ?? 3),
    largePct: Number(data?.ppob_markup_large_pct ?? 1),
    threshold: Number(data?.ppob_markup_threshold ?? 100000),
    proxyUrl:
      process.env.PORTALPULSA_PROXY_URL?.trim() ||
      data?.ppob_proxy_url?.trim() ||
      null,
  };
}

function getCredentials() {
  const userid = process.env.PORTALPULSA_USERID?.trim();
  const key = process.env.PORTALPULSA_KEY?.trim();
  const secret = process.env.PORTALPULSA_SECRET?.trim();
  if (!userid || !key || !secret) {
    throw new Error(
      "Kredensial Portal Pulsa (PORTALPULSA_USERID/KEY/SECRET) belum diatur di environment."
    );
  }
  return { userid, key, secret };
}

/**
 * Posts form-urlencoded data to PortalPulsa, optionally tunneling through an HTTP CONNECT proxy
 * (useful on Vercel for static egress IP whitelisting).
 */
async function postPortalPulsaRaw(
  fields: Record<string, string>,
  proxyUrl?: string | null
): Promise<unknown> {
  const { userid, key, secret } = getCredentials();
  const body = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = {
    "portal-userid": userid,
    "portal-key": key,
    "portal-secret": secret,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (!proxyUrl) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON dari Portal Pulsa (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  }

  const parsedProxy = new URL(proxyUrl);

  // Mode A: HTTPS PHP/HTTP Endpoint Relay (e.g. https://salikur.net/ppob-relay.php?token=...)
  // Works on both cPanel shared hosting and VPS with a whitelisted static IP!
  const isHttpRelayEndpoint =
    parsedProxy.pathname.endsWith(".php") ||
    parsedProxy.pathname.includes("relay") ||
    parsedProxy.searchParams.has("token");

  if (isHttpRelayEndpoint) {
    const relayToken = parsedProxy.searchParams.get("token") ?? "";
    const relayRes = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        ...headers,
        ...(relayToken ? { "X-Relay-Token": relayToken } : {}),
      },
      body,
      signal: AbortSignal.timeout(25000),
    });
    const text = await relayRes.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Invalid JSON dari Relay Portal Pulsa (HTTP ${relayRes.status}): ${text.slice(0, 200)}`
      );
    }
  }

  // Mode B: Standard HTTP CONNECT Proxy (e.g. http://user:pass@ip:8080)
  const proxyAuth =
    parsedProxy.username || parsedProxy.password
      ? `Basic ${Buffer.from(
          `${decodeURIComponent(parsedProxy.username)}:${decodeURIComponent(parsedProxy.password)}`
        ).toString("base64")}`
      : undefined;

  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      host: parsedProxy.hostname,
      port: Number(parsedProxy.port) || 8080,
      method: "CONNECT",
      path: "portalpulsa.com:443",
      headers: {
        Host: "portalpulsa.com:443",
        ...(proxyAuth ? { "Proxy-Authorization": proxyAuth } : {}),
      },
      timeout: 15000,
    });

    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT gagal (HTTP ${res.statusCode})`));
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: "portalpulsa.com",
      });

      const req = https.request(
        {
          hostname: "portalpulsa.com",
          path: "/api/connect/",
          method: "POST",
          createConnection: () => tlsSocket,
          headers: {
            ...headers,
            "Content-Length": String(Buffer.byteLength(body)),
          },
          timeout: 25000,
        },
        (apiRes) => {
          const chunks: Buffer[] = [];
          apiRes.on("data", (c: Buffer) => chunks.push(c));
          apiRes.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(
                new Error(
                  `Invalid JSON dari Portal Pulsa via proxy (HTTP ${apiRes.statusCode})`
                )
              );
            }
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Portal Pulsa proxy timeout")));
      req.write(body);
      req.end();
    });

    connectReq.on("error", reject);
    connectReq.on("timeout", () =>
      connectReq.destroy(new Error("Proxy CONNECT timeout"))
    );
    connectReq.end();
  });
}

export async function getPortalPulsaBalance(): Promise<PortalPulsaBalanceResult> {
  try {
    const cfg = await getPpobRuntimeConfig();
    const json = (await postPortalPulsaRaw(
      { inquiry: "S" },
      cfg.proxyUrl
    )) as { result?: string; message?: string };

    if (json?.result === "success") {
      const msg = String(json.message ?? "");
      const match = msg.match(/Rp\s*([\d.]+)/i);
      const balance = match ? Number(match[1].replace(/\./g, "")) : 0;
      return { ok: true, balance, rawMessage: msg };
    }
    return {
      ok: false,
      balance: 0,
      rawMessage: String(json?.message ?? "Unknown error"),
      error: String(json?.message ?? "Gagal cek saldo Portal Pulsa"),
    };
  } catch (err) {
    return {
      ok: false,
      balance: 0,
      rawMessage: "",
      error: err instanceof Error ? err.message : "Gagal menghubungi Portal Pulsa",
    };
  }
}

export async function getPortalPulsaCatalog(
  category: PpobCategory,
  options?: { keyword?: string; bypassCache?: boolean }
): Promise<{ ok: boolean; products: PortalPulsaProduct[]; error?: string }> {
  const cfg = await getPpobRuntimeConfig();
  const cacheKey = `${category}:${cfg.smallPct}:${cfg.largePct}:${cfg.threshold}`;
  const cached = CATALOG_CACHE.get(cacheKey);

  let allProducts: PortalPulsaProduct[] | null = null;
  if (!options?.bypassCache && cached && cached.expiresAt > Date.now()) {
    allProducts = cached.items;
  }

  if (!allProducts) {
    try {
      const json = (await postPortalPulsaRaw(
        { inquiry: "HARGA", code: category },
        cfg.proxyUrl
      )) as { result?: string; message?: unknown };

      if (json?.result !== "success" || !Array.isArray(json.message)) {
        return {
          ok: false,
          products: [],
          error:
            typeof json?.message === "string"
              ? json.message
              : `Gagal mengambil katalog ${category}`,
        };
      }

      allProducts = (json.message as Array<Record<string, unknown>>)
        .filter((item) => item && item.code && item.price !== undefined)
        .map((item) => {
          const costPrice = Number(item.price) || 0;
          const { sellPrice, profit } = calculatePpobSellPrice(costPrice, cfg);
          return {
            code: String(item.code),
            description: String(item.description ?? item.code),
            provider: String(item.provider ?? ""),
            providerSub: String(item.provider_sub ?? ""),
            operator: String(item.operator ?? item.provider ?? "Lainnya"),
            costPrice,
            sellPrice,
            profit,
            status: String(item.status ?? "normal"),
          };
        });

      CATALOG_CACHE.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        items: allProducts,
      });
    } catch (err) {
      return {
        ok: false,
        products: [],
        error: err instanceof Error ? err.message : "Error API Portal Pulsa",
      };
    }
  }

  const kw = options?.keyword?.trim().toLowerCase();
  const filtered = kw
    ? allProducts.filter(
        (p) =>
          p.code.toLowerCase().includes(kw) ||
          p.description.toLowerCase().includes(kw) ||
          p.operator.toLowerCase().includes(kw)
      )
    : allProducts;

  return { ok: true, products: filtered };
}

export async function findPortalPulsaProduct(
  productCode: string
): Promise<PortalPulsaProduct | null> {
  const upper = productCode.trim().toUpperCase();
  for (const cat of ["PULSA", "PLN", "GAME"] as PpobCategory[]) {
    const res = await getPortalPulsaCatalog(cat);
    if (!res.ok) continue;
    const hit = res.products.find((p) => p.code.toUpperCase() === upper);
    if (hit) return hit;
  }
  return null;
}

export async function executePortalPulsaOrder(params: {
  code: string;
  phone: string;
  customerId?: string;
  trxId: string;
  counterNo: number;
}): Promise<PortalPulsaOrderResult> {
  const cfg = await getPpobRuntimeConfig();
  const isPln = params.code.toUpperCase().startsWith("PLN");
  const fields: Record<string, string> = {
    inquiry: isPln ? "PLN" : "I",
    code: params.code.toUpperCase(),
    phone: params.phone,
    idcust: params.customerId ?? "",
    trxid_api: params.trxId,
    no: String(params.counterNo),
  };

  try {
    const json = (await postPortalPulsaRaw(fields, cfg.proxyUrl)) as Record<
      string,
      unknown
    >;
    const ok = json?.result === "success";
    const msg = String(json?.message ?? (ok ? "Diproses" : "Gagal"));
    const sn = String(json?.sn ?? "");
    return {
      ok,
      trxId: params.trxId,
      status: ok ? "SUCCESS" : "FAILED",
      message: msg,
      serialNumber: sn,
      raw: json,
    };
  } catch (err) {
    return {
      ok: false,
      trxId: params.trxId,
      status: "FAILED",
      message: err instanceof Error ? err.message : "Gagal menghubungi API",
      serialNumber: "",
      raw: null,
    };
  }
}

export async function checkPortalPulsaStatus(trxId: string): Promise<{
  ok: boolean;
  message: string;
  raw: unknown;
}> {
  try {
    const cfg = await getPpobRuntimeConfig();
    const json = (await postPortalPulsaRaw(
      { inquiry: "status", trxid_api: trxId },
      cfg.proxyUrl
    )) as Record<string, unknown>;
    return {
      ok: json?.result === "success",
      message: String(json?.message ?? "Status tidak diketahui"),
      raw: json,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gagal cek status",
      raw: null,
    };
  }
}
