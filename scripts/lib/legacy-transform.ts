import type { Json, TablesInsert } from "../../src/lib/supabase/types";

export type LegacyRow = Record<string, unknown>;

/**
 * Case-insensitive field lookup for legacy SQLite rows.
 */
export function pickField(
  row: LegacyRow,
  candidates: string[]
): unknown | undefined {
  const lowered = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    lowered.set(k.toLowerCase(), v);
  }
  for (const name of candidates) {
    if (name in row && row[name] !== undefined) return row[name];
    const hit = lowered.get(name.toLowerCase());
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export function pickString(
  row: LegacyRow,
  candidates: string[],
  fallback = ""
): string {
  const val = pickField(row, candidates);
  if (val === null || val === undefined) return fallback;
  return String(val).trim();
}

export function parseNumericValue(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;

  let str = String(raw).trim();
  if (!str) return 0;

  // Strip currency prefixes and whitespace
  str = str.replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");

  // Handle Indonesian thousand separators (e.g. "50.000" or "1.250.000")
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(str)) {
    str = str.replace(",", ".");
  } else {
    str = str.replace(/,/g, "");
  }

  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
}

export function parseBigIntId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const cleaned = String(raw).trim().replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Parses legacy Mikbotam date/time strings into ISO-8601 WIB (+07:00).
 * Supports:
 * - Tanggal: "dd-mm-yyyy", "yyyy-mm-dd", "dd/mm/yyyy", "yyyy/mm/dd"
 * - Waktu: "HH:mm:ss", "HH:mm"
 * - Combined timestamp: "yyyy-mm-dd HH:mm:ss"
 */
export function parseIndonesianDateTime(
  tanggalRaw: unknown,
  waktuRaw?: unknown,
  fallbackIso = "2021-11-01T00:00:00+07:00"
): string {
  const tgl = String(tanggalRaw ?? "").trim();
  const wkt = String(waktuRaw ?? "").trim();

  if (!tgl) return fallbackIso;

  // Already ISO-8601
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(tgl)) {
    return tgl;
  }

  // Combined "YYYY-MM-DD HH:MM:SS"
  const combinedIso = tgl.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (combinedIso) {
    const [, y, m, d, hh, mm, ss = "00"] = combinedIso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}+07:00`;
  }

  // Separate date
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;

  const ymd = tgl.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmy = tgl.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (ymd) {
    [, year, month, day] = ymd;
  } else if (dmy) {
    [, day, month, year] = dmy;
  } else {
    const parsed = new Date(tgl);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return fallbackIso;
  }

  let hh = "00";
  let mm = "00";
  let ss = "00";
  const timeMatch = wkt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    hh = timeMatch[1].padStart(2, "0");
    mm = timeMatch[2].padStart(2, "0");
    ss = (timeMatch[3] ?? "00").padStart(2, "0");
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hh}:${mm}:${ss}+07:00`;
}

/**
 * Parses legacy quota values (bytes, "500M", "1G", or MB integer) into integer MB.
 */
export function parseLimitMb(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const str = String(raw).trim().toUpperCase();
  if (!str || str === "0" || str === "UNLIMITED") return 0;

  const gbMatch = str.match(/^(\d+(?:\.\d+)?)\s*G(?:B)?$/);
  if (gbMatch) return Math.round(Number(gbMatch[1]) * 1024);

  const mbMatch = str.match(/^(\d+(?:\.\d+)?)\s*M(?:B)?$/);
  if (mbMatch) return Math.round(Number(mbMatch[1]));

  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return 0;

  // Values >= 1_048_576 in Mikbotam are usually raw bytes
  if (num >= 1_048_576) {
    return Math.round(num / 1_048_576);
  }
  return Math.round(num);
}

export function normalizeHexColor(
  raw: string,
  fallback: string | null = "#20a8d8"
): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(cleaned)) return cleaned;
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned}`;
  return cleaned;
}

/**
 * Standard Mikbotam PHP `decrypturl($string, $key)` implementation.
 * Verified from backup_mikbotam/config/system.database.php (key = '4ku4ll'):
 *   $pamerbojo = base64_decode($pamerbojo);
 *   $kunciobeng = '4ku4ll';
 *   for ($i = 0; $i < strlen($pamerbojo); $i++) {
 *     $char = substr($pamerbojo, $i, 1);
 *     $keychar = substr($kunciobeng, ($i % strlen($kunciobeng)) - 1, 1);
 *     $char = chr(ord($char) - ord($keychar));
 *     $result .= $char;
 *   }
 * Note: PHP `substr($key, -1, 1)` returns the last character when `$i % strlen($key) === 0`.
 */
export function decryptLegacyMikbotamUrl(
  encoded: string,
  key = "4ku4ll"
): string {
  if (!encoded) return "";
  const normalizedB64 = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/,/g, "=");
  const decoded = Buffer.from(normalizedB64, "base64");
  const keyBytes = Buffer.from(key, "latin1");
  const out = Buffer.alloc(decoded.length);

  for (let i = 0; i < decoded.length; i++) {
    const keyIdx = ((i % keyBytes.length) - 1 + keyBytes.length) % keyBytes.length;
    out[i] = (decoded[i] - keyBytes[keyIdx] + 256) & 0xff;
  }

  return out.toString("utf8");
}

export function mapResellerRow(
  row: LegacyRow
): TablesInsert<"resellers"> | null {
  const telegramId = parseBigIntId(
    pickField(row, ["id_user", "telegram_id", "user_id"])
  );
  if (telegramId === null) return null;

  const username =
    pickString(row, ["Nama_seller", "nama_seller", "username", "nama"]) ||
    `reseller_${telegramId}`;
  const phone = pickString(row, ["nomer_tlp", "no_hp", "phone", "telp"]) || null;
  const balance = parseNumericValue(pickField(row, ["saldo", "balance"]));
  const vouchersSold = Math.round(
    parseNumericValue(
      pickField(row, ["Voucher_terjual", "voucher_terjual", "vouchers_sold"])
    )
  );
  const resellerType =
    pickString(row, ["type", "reseller_type"], "agent") || "agent";
  const statusRaw = pickString(row, ["status"], "active").toLowerCase();
  const status =
    statusRaw === "suspended" || statusRaw === "nonaktif" || statusRaw === "0"
      ? "suspended"
      : "active";

  const joinedAt = parseIndonesianDateTime(
    pickField(row, ["Tanggal", "tanggal", "joined_at"]),
    pickField(row, ["Waktu", "waktu"])
  );

  return {
    telegram_id: telegramId,
    username,
    phone,
    balance,
    vouchers_sold: vouchersSold,
    reseller_type: resellerType,
    status,
    joined_at: joinedAt,
  };
}

export function mapOperatingRowToWalletTx(
  row: LegacyRow,
  resellerIdByTelegramId: Map<number, string>
): TablesInsert<"wallet_transactions"> | null {
  const legacyNo = parseBigIntId(pickField(row, ["No", "no", "id"]));
  const telegramId =
    parseBigIntId(pickField(row, ["id_user", "telegram_id", "user_id"])) ?? 0;
  const sellerName =
    pickString(row, ["Nama_seller", "nama_seller", "username"]) || null;

  const keteranganRaw = pickString(
    row,
    ["keterangan", "Keterangan", "status"],
    ""
  );
  const ketLower = keteranganRaw.toLowerCase();

  const beliVoucher = parseNumericValue(
    pickField(row, ["beli_voucher", "Beli_voucher", "harga"])
  );
  const topUp = parseNumericValue(pickField(row, ["top_up", "Top_up"]));
  const markup = parseNumericValue(
    pickField(row, ["markup_voucher", "markup", "Markup", "komisi"])
  );
  const saldoAwal = parseNumericValue(
    pickField(row, ["saldo_awal", "Saldo_awal"])
  );
  const saldoAkhir = parseNumericValue(
    pickField(row, ["saldo_akhir", "Saldo_akhir"])
  );

  let txType:
    | "voucher_purchase"
    | "voucher_nonsaldo"
    | "voucher_failed"
    | "topup"
    | "topdown"
    | "ppob_purchase"
    | "refund" = "voucher_purchase";
  let status = "success";
  let amount = 0;

  if (ketLower === "topup" || (topUp > 0 && beliVoucher === 0)) {
    txType = "topup";
    status = "success";
    amount = topUp;
  } else if (ketLower === "topdown" || topUp < 0) {
    txType = "topdown";
    status = "success";
    amount = topUp < 0 ? topUp : -Math.abs(beliVoucher || saldoAwal - saldoAkhir);
  } else if (ketLower === "gagal" || ketLower === "gagalprint") {
    txType = "voucher_failed";
    status = "failed";
    amount = 0;
  } else if (
    ketLower === "successnonsaldo" ||
    ketLower === "nonsaldo" ||
    ketLower === "success_nonsaldo"
  ) {
    txType = "voucher_nonsaldo";
    status = "success";
    amount = 0;
  } else {
    txType = "voucher_purchase";
    status = "success";
    // In legacy Mikbotam belivoucher(), beli_voucher is already the net amount debited from saldo_awal
    amount = -Math.abs(beliVoucher);
  }

  const createdAt = parseIndonesianDateTime(
    pickField(row, ["Tanggal", "tanggal", "date"]),
    pickField(row, ["Waktu", "waktu", "time"])
  );

  return {
    legacy_no: legacyNo,
    reseller_id: resellerIdByTelegramId.get(telegramId) ?? null,
    telegram_id: telegramId,
    seller_name: sellerName,
    tx_type: txType,
    amount,
    voucher_price: beliVoucher,
    markup_amount: markup,
    balance_before: saldoAwal,
    balance_after: saldoAkhir,
    topup_by:
      pickString(row, ["top_up_fromid", "topup_by", "admin"]) || null,
    voucher_username:
      pickString(row, ["Username_voucher", "username_voucher", "username"]) ||
      null,
    voucher_password:
      pickString(row, ["Password_voucher", "password_voucher", "password"]) ||
      null,
    voucher_profile:
      pickString(row, [
        "Profile_voucher",
        "profile_voucher",
        "profile",
        "exp_voucher",
      ]) || null,
    router_name: pickString(row, ["Router", "router_name"]) || null,
    status,
    notes: keteranganRaw ? `legacy:${keteranganRaw}` : null,
    created_at: createdAt,
  };
}

export function mapVoucherPackagesJson(
  jsonText: string | null | undefined,
  mode: "saldo" | "nonsaldo",
  routerId: string | null
): TablesInsert<"voucher_packages">[] {
  if (!jsonText || !jsonText.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const items: LegacyRow[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? Object.values(parsed as Record<string, LegacyRow>)
      : [];

  const result: TablesInsert<"voucher_packages">[] = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const name = pickString(item, ["Voucher", "voucher", "name"]);
    const profile = pickString(item, ["profile", "Profile", "mikrotik_profile"]);
    if (!name && !profile) return;

    const rawLogin = pickString(item, ["type", "login_type"], "vc").toLowerCase();
    const loginType: "vc" | "up" = rawLogin === "up" ? "up" : "vc";

    const rawLen = Math.round(
      parseNumericValue(pickField(item, ["length", "code_length"]))
    );
    const codeLength = rawLen >= 3 && rawLen <= 16 ? rawLen : 5;

    result.push({
      router_id: routerId,
      legacy_slot_id: pickString(item, ["id", "slot_id"], String(index)),
      mode,
      name: name || profile,
      menu_label:
        pickString(item, ["Text_List", "text_list", "menu_label"]) ||
        `Voucher ${name || profile}`,
      price: parseNumericValue(pickField(item, ["Harga", "harga", "price"])),
      markup: parseNumericValue(pickField(item, ["markup", "Markup"])),
      mikrotik_server:
        pickString(item, ["server", "Server", "mikrotik_server"], "all") ||
        "all",
      mikrotik_profile: profile || "default",
      limit_uptime:
        pickString(
          item,
          ["Limit", "limit_uptime", "uptime", "Limit_uptime"],
          "00:00:00"
        ) || "00:00:00",
      limit_download_mb: parseLimitMb(
        pickField(item, ["limit_download", "limit_download_mb"])
      ),
      limit_upload_mb: parseLimitMb(
        pickField(item, ["limit_upload", "limit_upload_mb"])
      ),
      limit_total_mb: parseLimitMb(
        pickField(item, ["limit_total", "limit_total_mb"])
      ),
      login_type: loginType,
      char_type:
        pickString(item, ["typechar", "type_char", "char_type"], "6") || "6",
      code_length: codeLength,
      card_color:
        normalizeHexColor(
          pickString(item, ["Color", "color", "warna", "card_color"], ""),
          "#20a8d8"
        ) ?? "#20a8d8",
      sort_order: index,
      is_active: true,
    });
  });

  return result;
}

export function mapPpobRow(
  row: LegacyRow,
  resellerIdByTelegramId: Map<number, string>
): TablesInsert<"ppob_transactions"> | null {
  const legacyId = parseBigIntId(pickField(row, ["id", "ID", "no"]));
  const trxId =
    pickString(row, ["trxid", "trx_id", "ref_id"]) ||
    (legacyId !== null ? `LEGACY_PPOB_${legacyId}` : "");
  if (!trxId) return null;

  const telegramId =
    parseBigIntId(pickField(row, ["id_user", "user_id", "telegram_id"])) ?? 0;

  const costPrice = parseNumericValue(
    pickField(row, ["harga_asli", "cost_price", "modal"])
  );
  const sellPrice = parseNumericValue(
    pickField(row, ["harga_jual", "sell_price", "harga", "jumlah"])
  );
  const rawProfit = pickField(row, ["profit", "laba"]);
  const profit =
    rawProfit !== undefined && rawProfit !== null && rawProfit !== ""
      ? parseNumericValue(rawProfit)
      : sellPrice - costPrice;

  const statusRaw = pickString(row, ["status"], "SUCCESS").toUpperCase();
  const status: "SUCCESS" | "PROCESSED" | "PENDING" | "FAILED" =
    statusRaw === "FAILED" || statusRaw === "GAGAL"
      ? "FAILED"
      : statusRaw === "PENDING"
        ? "PENDING"
        : statusRaw === "PROCESSED" || statusRaw === "PROSES"
          ? "PROCESSED"
          : "SUCCESS";

  let rawResponse: Json | null = null;
  const detailRaw = pickField(row, ["detail", "raw_response", "response"]);
  if (typeof detailRaw === "string" && detailRaw.trim()) {
    try {
      rawResponse = JSON.parse(detailRaw) as Json;
    } catch {
      rawResponse = { raw: detailRaw };
    }
  } else if (detailRaw && typeof detailRaw === "object") {
    rawResponse = detailRaw as Json;
  }

  const createdAt = parseIndonesianDateTime(
    pickField(row, ["tanggal", "Tanggal", "created_at", "waktu"]),
    pickField(row, ["jam", "Waktu"])
  );

  return {
    legacy_id: legacyId,
    trx_id: trxId,
    reseller_id: resellerIdByTelegramId.get(telegramId) ?? null,
    telegram_id: telegramId,
    product_code: pickString(
      row,
      ["kode_produk", "code", "kode", "product_code"],
      "UNKNOWN"
    ),
    target_number: pickString(
      row,
      ["no_hp", "phone", "target", "target_number", "tujuan"],
      ""
    ),
    customer_id:
      pickString(row, ["id_pelanggan", "customer_id", "no_meter"]) || null,
    cost_price: costPrice,
    sell_price: sellPrice,
    profit,
    status,
    serial_number: pickString(row, ["sn", "serial_number"], ""),
    description:
      pickString(row, ["keterangan", "description", "note", "produk"]) || null,
    source:
      pickString(row, ["source"]).toLowerCase() === "manual_web"
        ? "manual_web"
        : "telegram_bot",
    raw_response: rawResponse,
    created_at: createdAt,
  };
}

export interface TransformedBatch {
  batch: TablesInsert<"voucher_batches">;
  vouchers: Omit<TablesInsert<"vouchers">, "batch_id">[];
}

export function mapBatchJsonFile(
  fileName: string,
  rawJson: unknown,
  resellerIdByTelegramId: Map<number, string>,
  routerId: string | null
): TransformedBatch | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const obj = rawJson as LegacyRow;

  const fallbackCode = fileName.replace(/\.json$/i, "");
  const batchCode =
    pickString(obj, ["batch_id", "batch_code", "id"], fallbackCode) ||
    fallbackCode;

  const telegramId = parseBigIntId(
    pickField(obj, ["id_user", "reseller_telegram_id", "telegram_id", "user_id"])
  );
  const resellerId =
    telegramId !== null ? (resellerIdByTelegramId.get(telegramId) ?? null) : null;

  const rawVouchers = pickField(obj, ["vouchers", "data", "items"]);
  const voucherItems: LegacyRow[] = Array.isArray(rawVouchers)
    ? rawVouchers
    : [];

  const unitPrice = parseNumericValue(
    pickField(obj, ["price", "harga", "unit_price"]) ??
      (voucherItems[0]
        ? pickField(voucherItems[0], ["price", "harga"])
        : 0)
  );

  const packageName =
    pickString(obj, [
      "vouchername",
      "package_name",
      "profile",
      "paket",
      "voucher_name",
    ]) ||
    (voucherItems[0]
      ? pickString(
          voucherItems[0],
          ["vouchername", "profile", "paket"],
          "Legacy Batch"
        )
      : "Legacy Batch");

  const createdAt = parseIndonesianDateTime(
    pickField(obj, ["created_at", "timestamp", "tanggal", "date"]),
    pickField(obj, ["waktu", "time"])
  );

  const dnsName =
    pickString(obj, ["dnsname", "dns", "dns_name", "hotspot_dns"]) || null;
  const cardColor = normalizeHexColor(
    pickString(obj, ["color", "warna", "card_color"], ""),
    null
  );

  const batch: TablesInsert<"voucher_batches"> = {
    batch_code: batchCode,
    reseller_id: resellerId,
    router_id: routerId,
    source: "web_batch",
    package_name: packageName,
    unit_price: unitPrice,
    quantity: voucherItems.length || Math.round(parseNumericValue(pickField(obj, ["qty", "quantity"]))) || 1,
    deducted_balance: Boolean(pickField(obj, ["deducted_balance", "potong_saldo"])),
    telegram_sent: Boolean(
      pickField(obj, ["telegram_sent", "sent"]) ?? true
    ),
    created_at: createdAt,
  };

  const vouchers: Omit<TablesInsert<"vouchers">, "batch_id">[] = voucherItems
    .map((v) => {
      const username = pickString(v, ["username", "user", "code", "kode"]);
      if (!username) return null;
      const password =
        pickString(v, ["password", "pass", "pwd"]) || username;
      const vPrice = parseNumericValue(pickField(v, ["price", "harga"])) || unitPrice;
      const vMarkup = parseNumericValue(pickField(v, ["markup"]));
      const rawUsermode = pickString(v, ["usermode", "login_type"]).toLowerCase();
      const loginType =
        rawUsermode === "up" || rawUsermode === "vc"
          ? rawUsermode
          : username === password
            ? "vc"
            : "up";

      return {
        reseller_id: resellerId,
        mikrotik_api_id: pickString(v, ["id_api", "id", "mikrotik_id"]) || null,
        username,
        password,
        login_type: loginType,
        profile:
          pickString(v, ["profile", "paket", "vouchername"]) || packageName,
        time_limit:
          pickString(v, ["timelimit", "time_limit", "uptime", "limit_uptime"]) ||
          null,
        data_limit_label:
          pickString(v, ["datalimit", "data_limit", "kuota"]) || null,
        price: vPrice,
        markup: vMarkup,
        net_cost: Math.max(vPrice - vMarkup, 0),
        dns_name: pickString(v, ["dnsname", "dns", "dns_name"]) || dnsName,
        card_color:
          normalizeHexColor(pickString(v, ["color", "warna"], ""), null) ??
          cardColor,
        status: "success",
        created_at: createdAt,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return { batch, vouchers };
}
