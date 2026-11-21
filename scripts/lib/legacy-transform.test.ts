import { describe, expect, it } from "vitest";
import {
  decryptLegacyMikbotamUrl,
  mapBatchJsonFile,
  mapOperatingRowToWalletTx,
  mapPpobRow,
  mapResellerRow,
  mapVoucherPackagesJson,
  parseIndonesianDateTime,
  parseLimitMb,
  parseNumericValue,
} from "./legacy-transform";

function encryptLegacyMikbotamUrlForTest(
  plain: string,
  key = "mikbotam"
): string {
  const input = Buffer.from(plain, "utf8");
  const keyBytes = Buffer.from(key, "latin1");
  const out = Buffer.alloc(input.length);

  for (let i = 0; i < input.length; i++) {
    const keyIdx = ((i % keyBytes.length) - 1 + keyBytes.length) % keyBytes.length;
    out[i] = (input[i] + keyBytes[keyIdx]) & 0xff;
  }

  return out
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, ",");
}

describe("legacy-transform", () => {
  it("parses Indonesian & ISO date/time with +07:00 timezone", () => {
    expect(parseIndonesianDateTime("04-11-2021", "08:30:15")).toBe(
      "2021-11-04T08:30:15+07:00"
    );
    expect(parseIndonesianDateTime("2026-11-21 19:05:00")).toBe(
      "2026-11-21T19:05:00+07:00"
    );
  });

  it("parses numeric strings with Rp prefix and thousand separators", () => {
    expect(parseNumericValue("Rp 50.000")).toBe(50000);
    expect(parseNumericValue("1.250.000,50")).toBe(1250000.5);
    expect(parseNumericValue("")).toBe(0);
    expect(parseNumericValue(null)).toBe(0);
  });

  it("parses legacy quota units into MB", () => {
    expect(parseLimitMb("500M")).toBe(500);
    expect(parseLimitMb("2G")).toBe(2048);
    expect(parseLimitMb(104857600)).toBe(100);
    expect(parseLimitMb("0")).toBe(0);
  });

  it("decrypts legacy Mikbotam encrypturl passwords accurately", () => {
    const plain = "RouterPass!2026#Salikur";
    const encoded = encryptLegacyMikbotamUrlForTest(plain, "4ku4ll");
    expect(decryptLegacyMikbotamUrl(encoded)).toBe(plain);
  });

  it("maps re_settings row to resellers insert", () => {
    const res = mapResellerRow({
      id_user: "123456789",
      Nama_seller: "AgenSalikur",
      nomer_tlp: "08123456789",
      saldo: "150000",
      Voucher_terjual: "420",
      Tanggal: "15-03-2022",
      Waktu: "10:15:00",
    });

    expect(res).toMatchObject({
      telegram_id: 123456789,
      username: "AgenSalikur",
      phone: "08123456789",
      balance: 150000,
      vouchers_sold: 420,
      status: "active",
      joined_at: "2022-03-15T10:15:00+07:00",
    });
  });

  it("maps re_operating rows for Success, gagal, and topup accurately", () => {
    const map = new Map<number, string>([[123456789, "uuid-reseller-1"]]);

    const vcTx = mapOperatingRowToWalletTx(
      {
        No: 101,
        id_user: "123456789",
        Nama_seller: "AgenSalikur",
        beli_voucher: "3000",
        markup_voucher: "2000",
        exp_voucher: "5000",
        saldo_awal: "50000",
        saldo_akhir: "47000",
        keterangan: "Success",
        Tanggal: "21-11-2026",
        Waktu: "14:00:00",
      },
      map
    );
    expect(vcTx).toMatchObject({
      legacy_no: 101,
      reseller_id: "uuid-reseller-1",
      tx_type: "voucher_purchase",
      amount: -3000,
      voucher_price: 3000,
      markup_amount: 2000,
      voucher_profile: "5000",
      status: "success",
    });

    const topupTx = mapOperatingRowToWalletTx(
      {
        No: 102,
        id_user: "123456789",
        Nama_seller: "AgenSalikur",
        top_up: "100000",
        saldo_awal: "48000",
        saldo_akhir: "148000",
        keterangan: "topup",
        Tanggal: "21-11-2026",
        Waktu: "14:05:00",
      },
      map
    );
    expect(topupTx).toMatchObject({
      legacy_no: 102,
      tx_type: "topup",
      amount: 100000,
      status: "success",
    });

    const failedTx = mapOperatingRowToWalletTx(
      {
        No: 103,
        id_user: "123456789",
        keterangan: "gagalprint",
        beli_voucher: "3000",
        Tanggal: "21-11-2026",
        Waktu: "14:10:00",
      },
      map
    );
    expect(failedTx).toMatchObject({
      legacy_no: 103,
      tx_type: "voucher_failed",
      amount: 0,
      status: "failed",
    });
  });

  it("maps Voucher_1 JSON into voucher_packages rows", () => {
    const json = JSON.stringify([
      {
        id: "0",
        Voucher: "3.000",
        Text_List: "voucher 3.000",
        price: "3000",
        markup: "1000",
        server: "all",
        profile: "3000",
        Limit: "1d",
        limit_total: "10000",
        type: "userpass",
        typechar: "6",
        length: "5",
        Color: "FF20A3",
      },
    ]);

    const pkgs = mapVoucherPackagesJson(json, "saldo", "router-uuid");
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({
      router_id: "router-uuid",
      legacy_slot_id: "0",
      mode: "saldo",
      name: "3.000",
      price: 3000,
      markup: 1000,
      mikrotik_profile: "3000",
      limit_uptime: "1d",
      limit_total_mb: 10000,
      login_type: "vc",
      char_type: "6",
      card_color: "#FF20A3",
      code_length: 5,
    });
  });

  it("maps log_trans_pulsa row with JSON detail", () => {
    const map = new Map<number, string>([[123456789, "uuid-reseller-1"]]);
    const tx = mapPpobRow(
      {
        id: 7,
        trxid: "TRX999",
        id_user: "123456789",
        kode_produk: "S10",
        tujuan: "081234567890",
        harga_asli: "10500",
        harga_jual: "10815",
        profit: "315",
        status: "SUCCESS",
        sn: "SN12345",
        detail: '{"result":"success","rc":"00"}',
        tanggal: "2026-11-20 11:22:33",
      },
      map
    );

    expect(tx).toMatchObject({
      legacy_id: 7,
      trx_id: "TRX999",
      product_code: "S10",
      target_number: "081234567890",
      cost_price: 10500,
      sell_price: 10815,
      profit: 315,
      status: "SUCCESS",
      serial_number: "SN12345",
      raw_response: { result: "success", rc: "00" },
    });
  });

  it("maps voucher batch JSON file into batch + vouchers", () => {
    const map = new Map<number, string>([[123456789, "uuid-reseller-1"]]);
    const transformed = mapBatchJsonFile(
      "BATCH_20261119_203005_205.json",
      {
        batch_id: "BATCH_20261119_203005_205",
        id_user: "123456789",
        vouchername: "15.000",
        price: 15000,
        created_at: "2026-11-19 20:30:05",
        vouchers: [
          {
            id_api: "*27066",
            username: "abc12",
            password: "abc12",
            price: 15000,
            usermode: "vc",
            dnsname: "wifi.salikur.net",
            color: "FFFFFF",
          },
          {
            id_api: "*27067",
            username: "def34",
            password: "def34",
            price: 15000,
            usermode: "vc",
            dnsname: "wifi.salikur.net",
            color: "FFFFFF",
          },
        ],
      },
      map,
      "router-uuid"
    );

    expect(transformed?.batch.batch_code).toBe("BATCH_20261119_203005_205");
    expect(transformed?.batch.package_name).toBe("15.000");
    expect(transformed?.batch.quantity).toBe(2);
    expect(transformed?.vouchers).toHaveLength(2);
    expect(transformed?.vouchers[0]).toMatchObject({
      mikrotik_api_id: "*27066",
      login_type: "vc",
      dns_name: "wifi.salikur.net",
      card_color: "#FFFFFF",
    });
  });
});
