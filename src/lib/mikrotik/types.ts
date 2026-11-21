export type RosVersion = "v6" | "v7";
export type RouterConnectionMode = "api_tcp" | "api_ssl" | "rest_api";

export interface RouterConfig {
  id?: string;
  name: string;
  host: string;
  port: number;
  rosVersion: RosVersion;
  connectionMode: RouterConnectionMode;
  allowSelfSignedTls: boolean;
  username: string;
  password: string;
  dnsName: string;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
}

export interface RouterSystemResource {
  identity: string;
  version: string;
  detectedMajorVersion: RosVersion | "unknown";
  boardName: string;
  platform: string;
  architectureName: string;
  uptime: string;
  cpu: string;
  cpuCount: number;
  cpuFrequencyMhz: number;
  cpuLoadPct: number;
  freeMemoryBytes: number;
  totalMemoryBytes: number;
  freeHddBytes: number;
  totalHddBytes: number;
  badBlocksPct: number;
}

export interface RouterHealth {
  temperatureC: number | null;
  cpuTemperatureC: number | null;
  voltageV: number | null;
  rawMetrics: Record<string, string>;
}

export interface RouterStatusSnapshot {
  resource: RouterSystemResource;
  health: RouterHealth;
  hotspotActiveCount: number;
  unusedVoucherCount: number;
  totalHotspotUsersCount: number;
  neighborCount: number;
  latencyMs: number;
  checkedAt: string;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  identity?: string;
  version?: string;
  detectedMajorVersion?: RosVersion | "unknown";
  boardName?: string;
  uptime?: string;
  temperatureC?: number | null;
  connectionMode: RouterConnectionMode;
  configuredRosVersion: RosVersion;
  error?: string;
}

export interface HotspotUser {
  id: string;
  name: string;
  password: string;
  profile: string;
  server: string;
  macAddress: string;
  limitUptime: string;
  uptime: string;
  limitBytesTotal: number;
  bytesIn: number;
  bytesOut: number;
  comment: string;
  disabled: boolean;
}

export interface CreateHotspotUserInput {
  name: string;
  password: string;
  profile: string;
  server?: string;
  macAddress?: string;
  limitUptime?: string;
  limitBytesIn?: number;
  limitBytesOut?: number;
  limitBytesTotal?: number;
  comment?: string;
  disabled?: boolean;
}

export interface HotspotActiveSession {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  server: string;
  uptime: string;
  sessionTimeLeft: string;
  loginBy: string;
  bytesIn: number;
  bytesOut: number;
  comment: string;
}

export interface HotspotProfile {
  id: string;
  name: string;
  rateLimit: string;
  sharedUsers: string;
  sessionTimeout: string;
  parentQueue: string;
  transparentProxy: boolean;
  onLogin: string;
}

export interface CreateHotspotProfileInput {
  name: string;
  rateLimit?: string;
  sharedUsers?: string;
  parentQueue?: string;
  transparentProxy?: boolean;
  onLogin?: string;
}

export interface HotspotServer {
  id: string;
  name: string;
  interfaceName: string;
  profile: string;
  disabled: boolean;
}

export interface PppSecret {
  id: string;
  name: string;
  password: string;
  service: string;
  profile: string;
  localAddress: string;
  remoteAddress: string;
  comment: string;
  disabled: boolean;
}

export interface CreatePppSecretInput {
  name: string;
  password: string;
  service?: string;
  profile?: string;
  localAddress?: string;
  remoteAddress?: string;
  comment?: string;
  disabled?: boolean;
}

export interface PppActiveSession {
  id: string;
  name: string;
  service: string;
  callerId: string;
  address: string;
  uptime: string;
  comment: string;
}

export interface PppProfile {
  id: string;
  name: string;
  localAddress: string;
  remoteAddress: string;
  dnsServer: string;
  rateLimit: string;
  parentQueue: string;
  comment: string;
  onUp: string;
}

export interface CreatePppProfileInput {
  name: string;
  localAddress?: string;
  remoteAddress?: string;
  dnsServer?: string;
  rateLimit?: string;
  parentQueue?: string;
  comment?: string;
  onUp?: string;
}

export interface RouterInterface {
  id: string;
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  rxBytes: number;
  txBytes: number;
}

export interface InterfaceTraffic {
  interfaceName: string;
  rxBitsPerSecond: number;
  txBitsPerSecond: number;
  rxPacketsPerSecond: number;
  txPacketsPerSecond: number;
  sampledAt: string;
}

export interface NetwatchHost {
  id: string;
  host: string;
  comment: string;
  status: string;
  since: string;
  interval: string;
  disabled: boolean;
}

export interface HotspotLogEntry {
  id: string;
  time: string;
  topics: string;
  userIp: string;
  message: string;
  rawMessage: string;
}

export interface MikhmonUserLogEntry {
  id: string;
  date: string;
  time: string;
  username: string;
  price: string;
  address: string;
  macAddress: string;
  validity: string;
  profile: string;
  comment: string;
  owner: string;
}

export interface MikhmonUserLogQuery {
  /** e.g. "nov2026" — matches Mikhmon `/system/script` owner field */
  owner?: string;
  /** When true, fetches all scripts with `comment=mikhmon` */
  all?: boolean;
}

export interface PingOptions {
  address: string;
  count?: number;
  interfaceName?: string;
  size?: number;
  srcAddress?: string;
}

export interface PingReplyRow {
  seq: number;
  host: string;
  size: string;
  ttl: string;
  time: string;
  status: string;
}

export interface PingResult {
  target: string;
  replies: PingReplyRow[];
  sent: number;
  received: number;
  packetLossPct: number;
  minRtt: string;
  avgRtt: string;
  maxRtt: string;
}

export interface TracerouteOptions {
  address: string;
  count?: number;
  maxHops?: number;
  protocol?: "icmp" | "udp";
  interfaceName?: string;
  srcAddress?: string;
  useDns?: boolean;
}

export interface TracerouteHopRow {
  hop: number;
  address: string;
  lossPct: string;
  sent: string;
  last: string;
  avg: string;
  best: string;
  worst: string;
  status: string;
}

export interface TracerouteResult {
  target: string;
  hops: TracerouteHopRow[];
}

export interface DhcpLease {
  id: string;
  address: string;
  macAddress: string;
  hostName: string;
  server: string;
  status: string;
  expiresAfter: string;
  lastSeen: string;
  activeAddress: string;
  comment: string;
  dynamic: boolean;
  disabled: boolean;
}

export type IpBindingType = "regular" | "bypassed" | "blocked";

export interface HotspotIpBinding {
  id: string;
  macAddress: string;
  address: string;
  toAddress: string;
  server: string;
  type: IpBindingType;
  comment: string;
  disabled: boolean;
}

export interface CreateHotspotIpBindingInput {
  macAddress?: string;
  address?: string;
  toAddress?: string;
  server?: string;
  type?: IpBindingType;
  comment?: string;
  disabled?: boolean;
}

export interface MikroTikAdapter {
  readonly config: RouterConfig;
  testConnection(): Promise<TestConnectionResult>;
  getSystemStatus(): Promise<RouterStatusSnapshot>;
  listHotspotServers(): Promise<HotspotServer[]>;
  listHotspotProfiles(): Promise<HotspotProfile[]>;
  addHotspotProfile(input: CreateHotspotProfileInput): Promise<string>;
  removeHotspotProfile(id: string): Promise<void>;
  listHotspotUsers(): Promise<HotspotUser[]>;
  addHotspotUser(input: CreateHotspotUserInput): Promise<string>;
  updateHotspotUser(
    id: string,
    patch: Partial<CreateHotspotUserInput>
  ): Promise<void>;
  removeHotspotUser(id: string): Promise<void>;
  resetHotspotUserCounters(id: string): Promise<void>;
  listHotspotActive(): Promise<HotspotActiveSession[]>;
  kickHotspotActive(id: string): Promise<void>;
  listPppSecrets(): Promise<PppSecret[]>;
  addPppSecret(input: CreatePppSecretInput): Promise<string>;
  updatePppSecret(
    id: string,
    patch: Partial<CreatePppSecretInput>
  ): Promise<void>;
  removePppSecret(id: string): Promise<void>;
  listPppActive(): Promise<PppActiveSession[]>;
  disconnectPppActive(id: string): Promise<void>;
  listPppProfiles(): Promise<PppProfile[]>;
  addPppProfile(input: CreatePppProfileInput): Promise<string>;
  removePppProfile(id: string): Promise<void>;
  listSimpleQueues(): Promise<string[]>;
  listIpPools(): Promise<string[]>;
  listInterfaces(): Promise<RouterInterface[]>;
  monitorInterfaceTraffic(interfaceName: string): Promise<InterfaceTraffic>;
  listNetwatch(): Promise<NetwatchHost[]>;
  listHotspotLogs(): Promise<HotspotLogEntry[]>;
  listMikhmonUserLogs(
    query?: MikhmonUserLogQuery
  ): Promise<MikhmonUserLogEntry[]>;
  ping(options: PingOptions): Promise<PingResult>;
  traceroute(options: TracerouteOptions): Promise<TracerouteResult>;
  listDhcpLeases(): Promise<DhcpLease[]>;
  removeDhcpLease(id: string): Promise<void>;
  listHotspotIpBindings(): Promise<HotspotIpBinding[]>;
  addHotspotIpBinding(input: CreateHotspotIpBindingInput): Promise<string>;
  updateHotspotIpBinding(
    id: string,
    patch: Partial<CreateHotspotIpBindingInput>,
    unsetFields?: Array<"mac-address" | "address" | "to-address">
  ): Promise<void>;
  removeHotspotIpBinding(id: string): Promise<void>;
}
