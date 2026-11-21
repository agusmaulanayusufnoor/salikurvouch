"use server";

import { requireStaff } from "@/lib/auth";
import { getDefaultMikroTikAdapter } from "@/lib/mikrotik/adapter";
import type { PingResult, TracerouteResult } from "@/lib/mikrotik/types";

const HOST_REGEX = /^[a-zA-Z0-9._:-]{1,128}$/;

function validateHost(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned || !HOST_REGEX.test(cleaned)) return null;
  return cleaned;
}

export async function runPingAction(input: {
  address: string;
  count?: number;
  size?: number;
  interfaceName?: string;
  srcAddress?: string;
}): Promise<{ ok: boolean; data?: PingResult; message?: string }> {
  try {
    await requireStaff();
    const address = validateHost(input.address);
    if (!address) {
      return {
        ok: false,
        message: "Target IP atau hostname tidak valid (contoh: 8.8.8.8 / google.com).",
      };
    }

    const srcAddress = input.srcAddress?.trim()
      ? validateHost(input.srcAddress)
      : undefined;
    if (input.srcAddress?.trim() && !srcAddress) {
      return { ok: false, message: "Format Source Address tidak valid." };
    }

    const count = Math.min(Math.max(Number(input.count) || 4, 1), 10);
    const sizeRaw = Number(input.size);
    const size =
      Number.isFinite(sizeRaw) && sizeRaw >= 28 && sizeRaw <= 1500
        ? Math.round(sizeRaw)
        : undefined;

    const adapter = await getDefaultMikroTikAdapter();
    const data = await adapter.ping({
      address,
      count,
      size,
      interfaceName: input.interfaceName?.trim() || undefined,
      srcAddress: srcAddress || undefined,
    });

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal menjalankan Ping di MikroTik.",
    };
  }
}

export async function runTracerouteAction(input: {
  address: string;
  count?: number;
  maxHops?: number;
  protocol?: "icmp" | "udp";
  interfaceName?: string;
  srcAddress?: string;
  useDns?: boolean;
}): Promise<{ ok: boolean; data?: TracerouteResult; message?: string }> {
  try {
    await requireStaff();
    const address = validateHost(input.address);
    if (!address) {
      return {
        ok: false,
        message: "Target IP atau hostname tidak valid (contoh: 1.1.1.1 / google.com).",
      };
    }

    const srcAddress = input.srcAddress?.trim()
      ? validateHost(input.srcAddress)
      : undefined;
    if (input.srcAddress?.trim() && !srcAddress) {
      return { ok: false, message: "Format Source Address tidak valid." };
    }

    const count = Math.min(Math.max(Number(input.count) || 1, 1), 3);
    const maxHops = Math.min(Math.max(Number(input.maxHops) || 15, 1), 30);
    const protocol = input.protocol === "udp" ? "udp" : "icmp";

    const adapter = await getDefaultMikroTikAdapter();
    const data = await adapter.traceroute({
      address,
      count,
      maxHops,
      protocol,
      interfaceName: input.interfaceName?.trim() || undefined,
      srcAddress: srcAddress || undefined,
      useDns: Boolean(input.useDns),
    });

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Gagal menjalankan Traceroute di MikroTik.",
    };
  }
}
