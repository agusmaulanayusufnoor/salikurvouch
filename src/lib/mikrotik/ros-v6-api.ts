import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import type {
  CreateHotspotIpBindingInput,
  CreateHotspotProfileInput,
  CreateHotspotUserInput,
  CreatePppProfileInput,
  CreatePppSecretInput,
  DhcpLease,
  HotspotActiveSession,
  HotspotIpBinding,
  HotspotLogEntry,
  HotspotProfile,
  HotspotServer,
  HotspotUser,
  InterfaceTraffic,
  MikhmonUserLogEntry,
  MikhmonUserLogQuery,
  MikroTikAdapter,
  NetwatchHost,
  PingOptions,
  PingResult,
  PppActiveSession,
  PppProfile,
  PppSecret,
  RouterConfig,
  RouterInterface,
  RouterStatusSnapshot,
  TestConnectionResult,
  TracerouteOptions,
  TracerouteResult,
} from "./types";
import {
  countUnusedHotspotVouchers,
  normalizeDhcpLease,
  normalizeHealth,
  normalizeHotspotActive,
  normalizeHotspotIpBinding,
  normalizeHotspotLog,
  normalizeHotspotProfile,
  normalizeHotspotServer,
  normalizeHotspotUser,
  normalizeInterface,
  normalizeMikhmonUserLog,
  normalizeNetwatch,
  normalizePingResult,
  normalizePppActive,
  normalizePppProfile,
  normalizePppSecret,
  normalizeResource,
  normalizeTracerouteResult,
  parseNumber,
} from "./normalizers";

/**
 * Encodes a RouterOS API word length prefix per official MikroTik API specification.
 */
export function encodeWordLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length < 0x4000) {
    const val = length | 0x8000;
    return Buffer.from([(val >> 8) & 0xff, val & 0xff]);
  }
  if (length < 0x200000) {
    const val = length | 0xc00000;
    return Buffer.from([(val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
  }
  if (length < 0x10000000) {
    const val = (length | 0xe0000000) >>> 0;
    return Buffer.from([
      (val >>> 24) & 0xff,
      (val >>> 16) & 0xff,
      (val >>> 8) & 0xff,
      val & 0xff,
    ]);
  }
  return Buffer.from([
    0xf0,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  ]);
}

export function encodeSentence(words: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const word of words) {
    const wordBuf = Buffer.from(word, "utf8");
    parts.push(encodeWordLength(wordBuf.length), wordBuf);
  }
  parts.push(Buffer.from([0x00]));
  return Buffer.concat(parts);
}

/**
 * Decodes one length-prefixed RouterOS word from `buffer` at `offset`.
 * Returns `null` if more bytes are needed from the TCP stream.
 */
export function decodeWordAt(
  buffer: Buffer,
  offset: number
): { word: string; nextOffset: number } | null {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  let len = 0;
  let headerBytes = 1;

  if ((first & 0x80) === 0x00) {
    len = first;
    headerBytes = 1;
  } else if ((first & 0xc0) === 0x80) {
    if (offset + 2 > buffer.length) return null;
    len = ((first & ~0xc0) << 8) + buffer[offset + 1];
    headerBytes = 2;
  } else if ((first & 0xe0) === 0xc0) {
    if (offset + 3 > buffer.length) return null;
    len =
      ((first & ~0xe0) << 16) +
      (buffer[offset + 1] << 8) +
      buffer[offset + 2];
    headerBytes = 3;
  } else if ((first & 0xf0) === 0xe0) {
    if (offset + 4 > buffer.length) return null;
    len =
      (((first & ~0xf0) << 24) >>> 0) +
      (buffer[offset + 1] << 16) +
      (buffer[offset + 2] << 8) +
      buffer[offset + 3];
    headerBytes = 4;
  } else if ((first & 0xf8) === 0xf0) {
    if (offset + 5 > buffer.length) return null;
    len =
      ((buffer[offset + 1] << 24) >>> 0) +
      (buffer[offset + 2] << 16) +
      (buffer[offset + 3] << 8) +
      buffer[offset + 4];
    headerBytes = 5;
  } else {
    throw new Error(`Invalid RouterOS API word length byte: 0x${first.toString(16)}`);
  }

  const end = offset + headerBytes + len;
  if (end > buffer.length) return null;

  const word = buffer.subarray(offset + headerBytes, end).toString("utf8");
  return { word, nextOffset: end };
}

interface ParsedSentence {
  type: "!re" | "!done" | "!trap" | "!fatal" | string;
  attrs: Record<string, string>;
}

function parseSentenceWords(words: string[]): ParsedSentence {
  const [type = "", ...rest] = words;
  const attrs: Record<string, string> = {};
  for (const word of rest) {
    if (!word.startsWith("=")) continue;
    const secondEq = word.indexOf("=", 1);
    if (secondEq === -1) {
      attrs[word.slice(1)] = "";
    } else {
      const key = word.slice(1, secondEq);
      const val = word.slice(secondEq + 1);
      attrs[key] = val;
    }
  }
  return { type, attrs };
}

class RouterOsBinarySession {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private currentWords: string[] = [];
  private sentenceQueue: ParsedSentence[] = [];
  private waiters: Array<{
    resolve: (s: ParsedSentence) => void;
    reject: (e: Error) => void;
  }> = [];
  private closedError: Error | null = null;

  constructor(private readonly config: RouterConfig) {}

  async connect(): Promise<void> {
    const connectTimeoutMs = this.config.connectTimeoutMs ?? 5000;
    const useSsl = this.config.connectionMode === "api_ssl";

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.close();
          reject(err);
        } else {
          resolve();
        }
      };

      const timer = setTimeout(() => {
        done(
          new Error(
            `Koneksi RouterOS timeout (${connectTimeoutMs}ms) ke ${this.config.host}:${this.config.port}`
          )
        );
      }, connectTimeoutMs);

      const sock = useSsl
        ? tls.connect({
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: !this.config.allowSelfSignedTls,
          })
        : net.createConnection({
            host: this.config.host,
            port: this.config.port,
          });

      this.socket = sock;

      const connectEvent = useSsl ? "secureConnect" : "connect";
      sock.once(connectEvent, () => done());
      sock.on("data", (chunk: Buffer) => this.handleData(chunk));
      sock.on("error", (err) => {
        const wrapped = new Error(`RouterOS socket error: ${err.message}`);
        this.closedError = wrapped;
        this.flushWaitersWithError(wrapped);
        done(wrapped);
      });
      sock.on("close", () => {
        const err = this.closedError ?? new Error("RouterOS socket closed");
        this.closedError = err;
        this.flushWaitersWithError(err);
      });
    });

    await this.login();
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    let offset = 0;
    while (offset < this.buffer.length) {
      const decoded = decodeWordAt(this.buffer, offset);
      if (!decoded) break;
      offset = decoded.nextOffset;

      if (decoded.word === "") {
        if (this.currentWords.length > 0) {
          const sentence = parseSentenceWords(this.currentWords);
          this.currentWords = [];
          const waiter = this.waiters.shift();
          if (waiter) {
            waiter.resolve(sentence);
          } else {
            this.sentenceQueue.push(sentence);
          }
        }
      } else {
        this.currentWords.push(decoded.word);
      }
    }

    if (offset > 0) {
      this.buffer = this.buffer.subarray(offset);
    }
  }

  private flushWaitersWithError(err: Error) {
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(err);
    }
  }

  private nextSentence(timeoutMs: number): Promise<ParsedSentence> {
    const queued = this.sentenceQueue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closedError) return Promise.reject(this.closedError);

    return new Promise<ParsedSentence>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === wrappedResolve);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`RouterOS read timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      const wrappedResolve = (s: ParsedSentence) => {
        clearTimeout(timer);
        resolve(s);
      };
      const wrappedReject = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      this.waiters.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  async command(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    readTimeoutOverrideMs?: number
  ): Promise<{ rows: Record<string, string>[]; doneAttrs: Record<string, string> }> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("RouterOS socket is not connected");
    }

    const words: string[] = [path];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (k.startsWith("?")) {
        words.push(`${k}=${String(v)}`);
      } else {
        words.push(`=${k}=${String(v)}`);
      }
    }

    this.socket.write(encodeSentence(words));

    const readTimeoutMs =
      readTimeoutOverrideMs ?? this.config.readTimeoutMs ?? 8000;
    const rows: Record<string, string>[] = [];
    let doneAttrs: Record<string, string> = {};
    let trapMessage: string | null = null;

    while (true) {
      const sentence = await this.nextSentence(readTimeoutMs);
      if (sentence.type === "!re") {
        rows.push(sentence.attrs);
      } else if (sentence.type === "!trap") {
        trapMessage = sentence.attrs.message || "RouterOS API trap error";
      } else if (sentence.type === "!fatal") {
        throw new Error(sentence.attrs.message || "RouterOS API fatal error");
      } else if (sentence.type === "!done") {
        doneAttrs = sentence.attrs;
        break;
      }
    }

    if (trapMessage) {
      throw new Error(`RouterOS API error (${path}): ${trapMessage}`);
    }

    return { rows, doneAttrs };
  }

  private async login(): Promise<void> {
    // Post-6.43 login method (works on ROS 6.43+ and all ROS v7)
    const first = await this.command("/login", {
      name: this.config.username,
      password: this.config.password,
    });

    // Pre-6.43 challenge-response fallback if `ret` challenge is returned
    if (first.doneAttrs.ret) {
      const challenge = Buffer.from(first.doneAttrs.ret, "hex");
      const md5 = crypto
        .createHash("md5")
        .update(Buffer.from([0x00]))
        .update(Buffer.from(this.config.password, "utf8"))
        .update(challenge)
        .digest("hex");

      await this.command("/login", {
        name: this.config.username,
        response: `00${md5}`,
      });
    }
  }

  close() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.socket = null;
  }
}

export class RosBinaryApiAdapter implements MikroTikAdapter {
  constructor(public readonly config: RouterConfig) {}

  private async withSession<T>(
    fn: (session: RouterOsBinarySession) => Promise<T>
  ): Promise<T> {
    const session = new RouterOsBinarySession(this.config);
    try {
      await session.connect();
      return await fn(session);
    } finally {
      session.close();
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const started = Date.now();
    try {
      const data = await this.withSession(async (s) => {
        const idRes = await s.command("/system/identity/print");
        const resRes = await s.command("/system/resource/print");
        const healthRes = await s
          .command("/system/health/print")
          .catch(() => ({ rows: [], doneAttrs: {} }));
        const resource = normalizeResource(
          idRes.rows[0]?.name ?? this.config.name,
          resRes.rows[0] ?? {}
        );
        const health = normalizeHealth(healthRes.rows);
        return { resource, health };
      });

      return {
        ok: true,
        latencyMs: Date.now() - started,
        identity: data.resource.identity,
        version: data.resource.version,
        detectedMajorVersion: data.resource.detectedMajorVersion,
        boardName: data.resource.boardName,
        uptime: data.resource.uptime,
        temperatureC: data.health.temperatureC ?? data.health.cpuTemperatureC,
        connectionMode: this.config.connectionMode,
        configuredRosVersion: this.config.rosVersion,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        connectionMode: this.config.connectionMode,
        configuredRosVersion: this.config.rosVersion,
        error: err instanceof Error ? err.message : "Gagal terhubung ke router",
      };
    }
  }

  async getSystemStatus(): Promise<RouterStatusSnapshot> {
    const started = Date.now();
    return this.withSession(async (s) => {
      const idRes = await s.command("/system/identity/print");
      const resRes = await s.command("/system/resource/print");
      const healthRes = await s
        .command("/system/health/print")
        .catch(() => ({ rows: [], doneAttrs: {} }));
      const activeRes = await s
        .command("/ip/hotspot/active/print")
        .catch(() => ({ rows: [], doneAttrs: {} }));
      const usersRes = await s
        .command("/ip/hotspot/user/print")
        .catch(() => ({ rows: [], doneAttrs: {} }));
      const neighborRes = await s
        .command("/ip/neighbor/print")
        .catch(() => ({ rows: [], doneAttrs: {} }));

      const voucherStats = countUnusedHotspotVouchers(usersRes.rows);

      return {
        resource: normalizeResource(
          idRes.rows[0]?.name ?? this.config.name,
          resRes.rows[0] ?? {}
        ),
        health: normalizeHealth(healthRes.rows),
        hotspotActiveCount: activeRes.rows.length,
        unusedVoucherCount: voucherStats.unusedCount,
        totalHotspotUsersCount: voucherStats.totalCount,
        neighborCount: neighborRes.rows.length,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    });
  }

  async listHotspotServers(): Promise<HotspotServer[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/print");
      return res.rows.map(normalizeHotspotServer);
    });
  }

  async listHotspotProfiles(): Promise<HotspotProfile[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/user/profile/print");
      return res.rows.map(normalizeHotspotProfile);
    });
  }

  async addHotspotProfile(input: CreateHotspotProfileInput): Promise<string> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/user/profile/add", {
        name: input.name,
        "rate-limit": input.rateLimit || undefined,
        "shared-users": input.sharedUsers || "1",
        "parent-queue":
          input.parentQueue && input.parentQueue !== "none"
            ? input.parentQueue
            : undefined,
        "transparent-proxy": input.transparentProxy ? "yes" : "no",
        "on-login": input.onLogin || undefined,
      });
      return res.doneAttrs.ret ?? "";
    });
  }

  async removeHotspotProfile(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/user/profile/remove", { ".id": id });
    });
  }

  async listHotspotUsers(): Promise<HotspotUser[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/user/print");
      return res.rows.map(normalizeHotspotUser);
    });
  }

  async addHotspotUser(input: CreateHotspotUserInput): Promise<string> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/user/add", {
        server: input.server || "all",
        name: input.name,
        password: input.password,
        profile: input.profile,
        "mac-address": input.macAddress || undefined,
        "limit-uptime":
          input.limitUptime && input.limitUptime !== "00:00:00"
            ? input.limitUptime
            : undefined,
        "limit-bytes-in":
          input.limitBytesIn && input.limitBytesIn > 0
            ? input.limitBytesIn
            : undefined,
        "limit-bytes-out":
          input.limitBytesOut && input.limitBytesOut > 0
            ? input.limitBytesOut
            : undefined,
        "limit-bytes-total":
          input.limitBytesTotal && input.limitBytesTotal > 0
            ? input.limitBytesTotal
            : undefined,
        comment: input.comment || undefined,
        disabled: input.disabled ? "yes" : "no",
      });
      return res.doneAttrs.ret ?? "";
    });
  }

  async updateHotspotUser(
    id: string,
    patch: Partial<CreateHotspotUserInput>
  ): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/user/set", {
        ".id": id,
        name: patch.name,
        password: patch.password,
        profile: patch.profile,
        server: patch.server,
        "mac-address": patch.macAddress,
        "limit-uptime": patch.limitUptime,
        "limit-bytes-total":
          patch.limitBytesTotal === undefined
            ? undefined
            : String(patch.limitBytesTotal),
        comment: patch.comment,
        disabled:
          patch.disabled === undefined
            ? undefined
            : patch.disabled
              ? "yes"
              : "no",
      });
    });
  }

  async removeHotspotUser(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/user/remove", { ".id": id });
    });
  }

  async resetHotspotUserCounters(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/user/reset-counters", { numbers: id });
    });
  }

  async listHotspotActive(): Promise<HotspotActiveSession[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/active/print");
      return res.rows.map(normalizeHotspotActive);
    });
  }

  async kickHotspotActive(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/active/remove", { ".id": id });
    });
  }

  async listPppSecrets(): Promise<PppSecret[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ppp/secret/print");
      return res.rows.map(normalizePppSecret);
    });
  }

  async addPppSecret(input: CreatePppSecretInput): Promise<string> {
    return this.withSession(async (s) => {
      const res = await s.command("/ppp/secret/add", {
        name: input.name,
        password: input.password,
        service: input.service || "any",
        profile: input.profile || "default",
        "local-address": input.localAddress || undefined,
        "remote-address": input.remoteAddress || undefined,
        comment: input.comment || undefined,
        disabled: input.disabled ? "yes" : "no",
      });
      return res.doneAttrs.ret ?? "";
    });
  }

  async updatePppSecret(
    id: string,
    patch: Partial<CreatePppSecretInput>
  ): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ppp/secret/set", {
        ".id": id,
        name: patch.name,
        password: patch.password,
        service: patch.service,
        profile: patch.profile,
        "local-address": patch.localAddress,
        "remote-address": patch.remoteAddress,
        comment: patch.comment,
        disabled:
          patch.disabled === undefined
            ? undefined
            : patch.disabled
              ? "yes"
              : "no",
      });
    });
  }

  async removePppSecret(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ppp/secret/remove", { ".id": id });
    });
  }

  async listPppActive(): Promise<PppActiveSession[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ppp/active/print");
      return res.rows.map(normalizePppActive);
    });
  }

  async disconnectPppActive(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ppp/active/remove", { ".id": id });
    });
  }

  async listPppProfiles(): Promise<PppProfile[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ppp/profile/print");
      return res.rows.map(normalizePppProfile);
    });
  }

  async addPppProfile(input: CreatePppProfileInput): Promise<string> {
    return this.withSession(async (s) => {
      const res = await s.command("/ppp/profile/add", {
        name: input.name,
        "local-address": input.localAddress || undefined,
        "remote-address": input.remoteAddress || undefined,
        "dns-server": input.dnsServer || undefined,
        "rate-limit": input.rateLimit || undefined,
        "parent-queue":
          input.parentQueue && input.parentQueue !== "none"
            ? input.parentQueue
            : undefined,
        comment: input.comment || undefined,
        "on-up": input.onUp || undefined,
      });
      return res.doneAttrs.ret ?? "";
    });
  }

  async removePppProfile(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ppp/profile/remove", { ".id": id });
    });
  }

  async listSimpleQueues(): Promise<string[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/queue/simple/print");
      return res.rows.map((r) => r.name).filter(Boolean);
    });
  }

  async listIpPools(): Promise<string[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/pool/print");
      return res.rows.map((r) => r.name).filter(Boolean);
    });
  }

  async listInterfaces(): Promise<RouterInterface[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/interface/print");
      return res.rows.map(normalizeInterface);
    });
  }

  async monitorInterfaceTraffic(
    interfaceName: string
  ): Promise<InterfaceTraffic> {
    return this.withSession(async (s) => {
      const res = await s.command("/interface/monitor-traffic", {
        interface: interfaceName,
        once: "",
      });
      const row = res.rows[0] ?? {};
      return {
        interfaceName,
        rxBitsPerSecond: parseNumber(row["rx-bits-per-second"]),
        txBitsPerSecond: parseNumber(row["tx-bits-per-second"]),
        rxPacketsPerSecond: parseNumber(row["rx-packets-per-second"]),
        txPacketsPerSecond: parseNumber(row["tx-packets-per-second"]),
        sampledAt: new Date().toISOString(),
      };
    });
  }

  async listNetwatch(): Promise<NetwatchHost[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/tool/netwatch/print");
      return res.rows.map(normalizeNetwatch);
    });
  }

  async listHotspotLogs(): Promise<HotspotLogEntry[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/log/print");
      return res.rows
        .filter((r) => String(r.topics ?? "").toLowerCase().includes("hotspot"))
        .map(normalizeHotspotLog)
        .reverse();
    });
  }

  async listMikhmonUserLogs(
    query?: MikhmonUserLogQuery
  ): Promise<MikhmonUserLogEntry[]> {
    return this.withSession(async (s) => {
      let rows: Record<string, string>[] = [];
      if (query?.all || !query?.owner) {
        const res = await s.command("/system/script/print", {
          "?comment": "mikhmon",
        });
        rows = res.rows;
      } else {
        const res = await s.command("/system/script/print", {
          "?owner": query.owner,
        });
        rows = res.rows;
      }
      const parsed: MikhmonUserLogEntry[] = [];
      for (const r of rows) {
        const entry = normalizeMikhmonUserLog(r);
        if (entry) parsed.push(entry);
      }
      return parsed;
    });
  }

  async ping(options: PingOptions): Promise<PingResult> {
    const count = Math.min(Math.max(options.count ?? 4, 1), 10);
    const timeoutMs = Math.max(20000, count * 2000 + 6000);
    return this.withSession(async (s) => {
      const res = await s.command(
        "/ping",
        {
          address: options.address,
          count,
          interface: options.interfaceName || undefined,
          size: options.size || undefined,
          "src-address": options.srcAddress || undefined,
        },
        timeoutMs
      );
      return normalizePingResult(options.address, res.rows);
    });
  }

  async traceroute(options: TracerouteOptions): Promise<TracerouteResult> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    const maxHops = Math.min(Math.max(options.maxHops ?? 15, 1), 30);
    return this.withSession(async (s) => {
      const res = await s.command(
        "/tool/traceroute",
        {
          address: options.address,
          count,
          "max-hops": maxHops,
          protocol: options.protocol || "icmp",
          "use-dns": options.useDns ? "yes" : "no",
          interface: options.interfaceName || undefined,
          "src-address": options.srcAddress || undefined,
        },
        30000
      );
      return normalizeTracerouteResult(options.address, res.rows);
    });
  }

  async listDhcpLeases(): Promise<DhcpLease[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/dhcp-server/lease/print");
      return res.rows.map(normalizeDhcpLease);
    });
  }

  async removeDhcpLease(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/dhcp-server/lease/remove", { ".id": id });
    });
  }

  async listHotspotIpBindings(): Promise<HotspotIpBinding[]> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/ip-binding/print");
      return res.rows.map(normalizeHotspotIpBinding);
    });
  }

  async addHotspotIpBinding(
    input: CreateHotspotIpBindingInput
  ): Promise<string> {
    return this.withSession(async (s) => {
      const res = await s.command("/ip/hotspot/ip-binding/add", {
        "mac-address": input.macAddress || undefined,
        address: input.address || undefined,
        "to-address": input.toAddress || undefined,
        server: input.server || "all",
        type: input.type || "bypassed",
        comment: input.comment || undefined,
        disabled: input.disabled ? "yes" : "no",
      });
      return res.doneAttrs.ret ?? "";
    });
  }

  async updateHotspotIpBinding(
    id: string,
    patch: Partial<CreateHotspotIpBindingInput>,
    unsetFields?: Array<"mac-address" | "address" | "to-address">
  ): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/ip-binding/set", {
        ".id": id,
        "mac-address": patch.macAddress || undefined,
        address: patch.address || undefined,
        "to-address": patch.toAddress || undefined,
        server: patch.server,
        type: patch.type,
        comment: patch.comment,
        disabled:
          patch.disabled === undefined
            ? undefined
            : patch.disabled
              ? "yes"
              : "no",
      });
      if (unsetFields && unsetFields.length > 0) {
        for (const field of unsetFields) {
          await s.command("/ip/hotspot/ip-binding/unset", {
            numbers: id,
            "value-name": field,
          });
        }
      }
    });
  }

  async removeHotspotIpBinding(id: string): Promise<void> {
    await this.withSession(async (s) => {
      await s.command("/ip/hotspot/ip-binding/remove", { ".id": id });
    });
  }
}
