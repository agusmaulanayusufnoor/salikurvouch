# PRD v2.0 — SalikurVouch Multi-Server (Multi-Router & Multi-Bot)

**Status:** Draft untuk Review & Persetujuan  
**Tanggal:** 22 November 2026  
**Target:** Upgrade SalikurVouch v1.0 (`https://app.salikur.net`) dari single-server menjadi **Multi-Server / Multi-Router / Multi-Bot** dalam **1 database Supabase** dan **1 deploy Vercel**, tanpa downtime bagi Server 1 produksi.

---

## 1. Latar Belakang & Hasil Audit Data Real (`Server 1` vs `Server 2`)

Berdasarkan inspeksi langsung terhadap database SQLite legacy Server 1 (`backup_mikbotam/config/mibotam.db`) dan Server 2 (`backup_mikbotam2/server2/config/mibotam.db`), ditemukan fakta operasional penting yang menjadi dasar arsitektur v2.0:

| Komponen | Server 1 (Existing di Produksi) | Server 2 (`backup_mikbotam2/server2`) |
|---|---|---|
| **Router MikroTik** | `167.99.68.60:11224` (`SalikurNet`) | `167.99.68.60:11095` |
| **DNS Hotspot** | `wifi.salikur.net` | `wifi.salikur.net` |
| **Bot Telegram** | `@MikSalikurBot` (Token terpisah) | `@salikurnetbot` (Token terpisah) |
| **Jumlah Reseller (`re_settings`)** | 14 reseller (Total saldo Rp 1.192.323) | **6 reseller** (Total saldo **Rp 419.261**) |
| **Overlap Telegram ID Reseller** | Ada 3 Telegram ID yang **identik** dengan Server 2 | `150377182` (`agusmyn`, saldo Rp 158.311), `979761904` (`@Azminaura`, Rp 0), `156967748` (`Goessmyn`, Rp 51.950) |
| **Mutasi Saldo (`re_operating`)** | 31.390 baris | **37.602 baris** |
| **Transaksi PPOB (`log_trans_pulsa`)** | 39 baris | **269 baris** |
| **PortalPulsa** | Aktif via relay `bprku.com/ppob-relay.php` | Memiliki `Saldo/portalpulsa.php` (bisa berbagi akun/relay yang sama atau berbeda per server) |

> **Temuan Kunci:** 3 akun reseller (termasuk Owner `150377182`) terdaftar di **kedua server dengan saldo yang terpisah**. Oleh karena itu, **isolasi data per server (`server_id`) wajib diterapkan hingga ke level tabel `resellers`, `wallet_transactions`, `voucher_packages`, `ppob_transactions`, `bot_user_states`, dan `bot_message_templates`**.

---

## 2. Perbandingan Arsitektur: 2 Panel Login Terpisah vs 1 Panel dengan Server Switcher

### Opsi A — 2 Panel Terpisah per Login (`admin@salikur.net` vs `admin2@salikur.net`)
- Setiap admin hanya terikat permanen pada 1 server; untuk pindah melihat Server 1 ↔ Server 2, Owner harus **Logout → Login ulang + verifikasi OTP Telegram lagi**.
- Penambahan Server 3, 4, dst. memaksa pembuatan akun email baru setiap kali ada router baru.

### Opsi B — Single Panel + Server Switcher + RBAC per Server *(DIREKOMENDASIKAN)*
- **1 Login, 1 Dashboard, 1 APK Android** (`https://app.salikur.net`).
- Di bagian atas Sidebar terdapat **Server Switcher** (seperti Mikhmon / Vercel Project Switcher):
  - `SalikurNet (Server 1)` ⇄ `Server 2 (@salikurnetbot)` ⇄ **`+ Tambah Server Baru`**.
- **Konteks Aktif via Cookie `salikur_active_server`** (server-side readable di Next.js App Router, tidak mengotori URL, aman terhadap refresh & bookmark).
- **Tetap mendukung skenario Opsi A secara otomatis melalui RBAC (`admin_server_access`)**:
  - **Super Admin** (`admin@salikur.net`): bebas switch ke semua server + menambah/mengedit/menghapus server baru + melihat ringkasan gabungan.
  - **Admin / Operator Khusus** (misal nanti dibuat `admin2@salikur.net`): jika hanya diberi akses ke Server 2 di `admin_server_access`, maka saat login ia **hanya melihat Server 2** dan tidak bisa mengakses data Server 1.

| Kriteria | Opsi A (2 Login Terpisah) | Opsi B (Switcher + RBAC) |
|---|---|---|
| Kemudahan operasional Owner (pantau 2+ router) | Repot (harus logout & OTP ulang) | **1 klik pindah server tanpa logout** |
| Skalabilitas (tambah Server 3, 4, 5...) | Harus buat akun baru terus | **Klik "+ Tambah Server Baru" dari UI** |
| Isolasi akses staf per lokasi | Bisa | **Bisa juga (via `admin_server_access`)** |
| Kemudahan pengembangan & maintenance | Sama-sama butuh `server_id` di DB | **1 codebase, 1 Vercel, 1 Supabase, 1 APK** |
| Risiko error / duplikasi kode | Lebih tinggi jika bikin route terpisah | **Sangat rendah (cukup 1 helper `getActiveServerId()`)** |

**Keputusan Rekomendasi:** Gunakan **Opsi B (Single Panel + Server Switcher + Tambah Server Baru + RBAC per Server)**.

---

## 3. Arsitektur Database Supabase (1 Database, Multi-Server)

### 3.1 Entitas Pusat Baru: `public.servers` (atau Unified Tenant Table)
Membuat tabel **`public.servers`** sebagai akar kepemilikan (*tenant root*) yang menyatukan 1 Router MikroTik + 1 Bot Telegram + konfigurasi PPOB-nya:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | ID unik server (`server_id`) |
| `slug` | `TEXT UNIQUE NOT NULL` | Slug URL aman, misal `server1`, `server2` (dipakai untuk webhook `/api/telegram/webhook/[slug]`) |
| `name` | `TEXT NOT NULL` | Nama tampil, misal `SalikurNet (Server 1)`, `SalikurNet 2` |
| `router_id` | `UUID REFERENCES routers(id)` | Link 1-to-1 ke konfigurasi router MikroTik (ROS v6/v7) |
| `bot_token_encrypted` | `TEXT` | Token bot Telegram terenkripsi AES-256-GCM |
| `bot_username` | `TEXT` | Username bot (`MikSalikurBot`, `salikurnetbot`) |
| `bot_mode` | `TEXT` | `saldo_only` \| `nonsaldo_only` \| `hybrid` |
| `webhook_secret` | `TEXT` | Secret token unik per bot (`X-Telegram-Bot-Api-Secret-Token`) |
| `owner_username` | `TEXT` | Username Telegram owner server ini |
| `owner_telegram_id` | `BIGINT` | Chat ID Telegram owner server ini |
| `max_deposit_amount` | `NUMERIC(14,2)` | Batas maksimal deposit |
| `low_balance_threshold` | `NUMERIC(14,2)` | Ambang alert saldo rendah |
| `ppob_enabled` | `BOOLEAN` | Aktif/nonaktif fitur PPOB di bot server ini |
| `ppob_markup_small_pct` | `NUMERIC(5,2)` | Markup < threshold |
| `ppob_markup_large_pct` | `NUMERIC(5,2)` | Markup ≥ threshold |
| `ppob_markup_threshold` | `NUMERIC(14,2)` | Threshold markup |
| `ppob_proxy_url` | `TEXT` | Relay/Proxy URL PortalPulsa (fallback ke env `PORTALPULSA_PROXY_URL`) |
| `is_default` | `BOOLEAN` | `TRUE` untuk Server 1 |
| `is_active` | `BOOLEAN` | Soft-disable server tanpa hapus riwayat |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | Audit timestamp |

### 3.2 Tabel Akses Admin (RBAC Opsional per Server): `public.admin_server_access`
- `(admin_id UUID REFERENCES admin_profiles(id), server_id UUID REFERENCES servers(id), role TEXT)` — PRIMARY KEY `(admin_id, server_id)`.
- `super_admin` otomatis memiliki akses penuh ke seluruh `servers`.
- `admin` / `operator` hanya melihat dan mengakses server yang terdaftar di `admin_server_access`.

### 3.3 Penambahan `server_id` & Perubahan Unique Constraints (Zero Data Loss)
Seluruh tabel data bisnis ditambahkan kolom `server_id UUID NOT NULL REFERENCES public.servers(id)` (data eksisting otomatis di-backfill ke `server1` sebelum `SET NOT NULL`):

| Tabel | Perubahan Constraint / Index |
|---|---|
| `routers` | Menambahkan `server_id` (atau direferensikan langsung oleh `servers.router_id`) |
| `voucher_packages` | Tambah `server_id`; index `(server_id, mode, is_active, sort_order)` |
| `resellers` | Tambah `server_id`; ubah `UNIQUE(telegram_id)` → **`UNIQUE(server_id, telegram_id)`** *(agar `150377182` dll. punya saldo terpisah di Server 1 & Server 2!)* |
| `voucher_batches` | Tambah `server_id`; index `(server_id, created_at DESC)` |
| `vouchers` | Tambah `server_id`; index `(server_id, created_at DESC)` |
| `wallet_transactions` | Tambah `server_id`; ubah `uq_wallet_transactions_legacy_no` → **`UNIQUE(server_id, legacy_no)`** |
| `deposit_requests` | Tambah `server_id`; index `(server_id, status, created_at DESC)` |
| `ppob_transactions` | Tambah `server_id`; ubah `uq_ppob_transactions_legacy_id` → **`UNIQUE(server_id, legacy_id)`** |
| `ppob_daily_counters` | Tambah `server_id`; PK → `(server_id, tx_date, telegram_id, product_code, target_number)` |
| `bot_message_templates` | Tambah `server_id`; PK → **`(server_id, key)`** |
| `bot_user_states` | Tambah `server_id`; PK → **`(server_id, telegram_id)`** |
| `telegram_processed_updates` | Tambah `server_id`; PK → **`(server_id, update_id)`** |
| `broadcast_logs` | Tambah `server_id`; index `(server_id, created_at DESC)` |

### 3.4 Pembaruan 4 Atomic PostgreSQL RPC Functions
Keempat fungsi atomik diperbarui menerima parameter `p_server_id UUID` (dengan default fallback ke server default agar backward-compatible):
- `rpc_reserve_balance(p_server_id, p_telegram_id, p_amount, p_tx_type, p_meta)`
- `rpc_refund_balance(p_tx_id, p_reason)` *(otomatis mewarisi `server_id` dari transaksi induk)*
- `rpc_adjust_balance(p_server_id, p_telegram_id, p_delta, p_actor, p_notes)`
- `rpc_next_ppob_counter(p_server_id, p_tx_date, p_telegram_id, p_product_code, p_target_number)`

---

## 4. Arsitektur Multi-Bot Webhook & Routing

1. **Endpoint Webhook Baru per Server**:
   - **`POST /api/telegram/webhook/[slug]`**
     - Server 1 (`@MikSalikurBot`): `https://app.salikur.net/api/telegram/webhook/server1`
     - Server 2 (`@salikurnetbot`): `https://app.salikur.net/api/telegram/webhook/server2`
     - Server N (`slug`): `https://app.salikur.net/api/telegram/webhook/<slug>`
   - Setiap request memverifikasi `X-Telegram-Bot-Api-Secret-Token` terhadap `servers.webhook_secret` milik `slug` tersebut, lalu menjalankan `handleTelegramUpdate(serverId, update)` yang terisolasi 100% ke router, paket voucher, reseller, dan saldo milik `serverId` tersebut!
2. **Backward Compatibility (Zero Downtime)**:
   - Endpoint lama **`POST /api/telegram/webhook`** tetap dipertahankan dan otomatis memproses update ke server dengan `is_default = TRUE` (`server1`). Jadi `@MikSalikurBot` yang sudah aktif hari ini **tidak terganggu sedikit pun** saat upgrade dirilis!
3. **Callback PortalPulsa (`/api/ppob/callback`)**:
   - Mencocokkan `trx_id` yang unik secara global (prefiks `PP-<slug>-...`), lalu membaca `server_id` dari baris `ppob_transactions` agar notifikasi Telegram sukses/gagal dikirim lewat **bot milik server asal transaksi**!

---

## 5. Pengalaman Pengguna (UX) di Panel Web

1. **Server Switcher di Sidebar (Atas, tepat di bawah Logo SalikurVouch)**:
   - Dropdown bersih menampilkan server aktif (nama server + badge status/ROS + `@bot_username`).
   - Klik untuk berpindah cepat antar server (`SalikurNet` ⇄ `Server 2`) → mengubah cookie `salikur_active_server` (HTTP-only / SameSite=Lax) dan memanggil `router.refresh()` sehingga seluruh data halaman aktif langsung berganti ke server tujuan.
   - Opsi **`+ Tambah Server Baru`** di bagian bawah dropdown (khusus `super_admin` / `admin`) → membuka halaman/modal **Manajemen Server (`/settings/servers`)**.
2. **Halaman Manajemen Server (`/settings/servers`)**:
   - Daftar seluruh server beserta status router (`Online/Offline`), bot Telegram, jumlah reseller, dan tombol:
     - **Tambah Server Baru** (wizard: Nama Server, Slug, Koneksi MikroTik ROS v6/v7 + tombol Tes Koneksi, Token Bot Telegram + Owner, Pengaturan PPOB, otomatis seed template pesan default!).
     - **Jadikan Default** / **Edit** / **Nonaktifkan**.
3. **Semua Menu Otomatis Mengikuti Server Aktif**:
   - Dashboard (`/`) + Kartu Live MikroTik + Grafik Penjualan 14 Hari
   - Reseller, Top Up/Down, Antrean Deposit
   - List Semua Voucher, Voucher Aktif Login, Generate & Kirim, Riwayat Batch & PDF, Paket Voucher, Riwayat Mutasi, Broadcast Telegram
   - Hotspot Log & User Log
   - Transaksi PPOB, Laporan Laba, Katalog Harga
   - PPP Secrets/Active/Profiles, Traffic & Netwatch, DHCP Leases, IP Bindings, Ping & Traceroute
   - Pengaturan Router/Bot/PPOB, Template Pesan, & Webhook Telegram (URL webhook otomatis menampilkan `https://app.salikur.net/api/telegram/webhook/<slug>`!).

---

## 6. Rencana Migrasi Data Server 2 (`backup_mikbotam2/server2`)

Setelah skema multi-server diterapkan:
1. Membuat skrip migrasi **`npm run migrate:server2`** (`scripts/migrate-sqlite-to-supabase.ts` diperbarui mendukung argumen `--slug=server2 --backup-dir=/Users/agusmac/Nextjs/backup_mikbotam2/server2`).
2. Skrip bersifat **idempotent** (aman dijalankan ulang tanpa duplikat) dan akan:
   - Membuat entri `servers` (`slug = 'server2'`, bot `@salikurnetbot`) & `routers` (`167.99.68.60:11095`, password didekripsi dari kunci legacy lalu dienkripsi ulang dengan AES-256-GCM).
   - Memigrasi 6 reseller (total saldo **Rp 419.261** — termasuk 3 reseller overlap yang kini terisolasi rapi di `server2`), 37.602 baris `wallet_transactions`, 269 baris `ppob_transactions`, serta seluruh paket voucher dari folder `server2/Saldo/`.
   - Mencetak **laporan rekonsiliasi angka (Diff = Rp 0)** untuk Server 1 (tetap utuh) dan Server 2 (100% cocok dengan SQLite).
3. Verifikasi koneksi live ke Router Server 2 (`167.99.68.60:11095`).
4. Cutover webhook `@salikurnetbot` di **`/settings/webhook`** (saat Server 2 dipilih) ke `https://app.salikur.net/api/telegram/webhook/server2`.

---

## 7. Pembagian Milestone Eksekusi (Estimasi Terstruktur)

| Milestone | Ruang Lingkup | Hasil Verifikasi |
|---|---|---|
| **M1 — Database Multi-Server & Atomic RPC** | Migrasi SQL (`servers`, `admin_server_access`, penambahan `server_id` + backfill Server 1 + update unique constraints & 4 RPC + RLS), regenerasi `types.ts` | Server 1 tetap 100% normal & rekonsiliasi saldo = Rp 0 diff |
| **M2 — Konteks Server Aktif & Multi-Server UI** | Helper `getActiveServer()`, `ServerSwitcher` di Sidebar, halaman `/settings/servers` (Tambah/Edit/Hapus server), scoping semua halaman Dashboard, MikroTik, Voucher, Reseller, Logs, PPOB, Settings | Bisa switch Server 1 ↔ Server 2 mulus & tambah server baru |
| **M3 — Multi-Bot Webhook Engine** | Route `/api/telegram/webhook/[slug]` + backward-compatible `/api/telegram/webhook`, refactor `bot-engine.ts` agar scoped ke `serverId`, update `/api/ppob/callback` & `/settings/webhook` | Kedua bot (`@MikSalikurBot` & `@salikurnetbot`) bekerja terpisah & paralel |
| **M4 — Migrasi Data Server 2 & Uji End-to-End** | Jalankan migrasi `backup_mikbotam2/server2`, rekonsiliasi 100% data (6 reseller, 37.602 mutasi, 269 PPOB), tes koneksi Router 2, lint + typecheck + test + build + deploy Vercel | Kedua server & bot jalan penuh di `https://app.salikur.net` |

---

## 8. Poin Konfirmasi Sebelum Eksekusi

Mohon konfirmasi 3 hal singkat sebelum kita mulai eksekusi M1:
1. **Arsitektur**: Setuju menggunakan **Opsi B (1 Panel + Server Switcher + Fitur Tambah Server Baru + dukungan RBAC opsional per server)**?
2. **Nama Tampilan Server 2 & Slug**: Misal **Server 1** = `SalikurNet` (`server1`), **Server 2** = mau diberi nama apa (misal `SalikurNet 2` / nama lokasi router ke-2) dan slug `server2`?
3. **PortalPulsa Server 2**: Apakah Server 2 memakai **akun PortalPulsa & relay `bprku.com` yang sama** dengan Server 1, atau punya kredensial PortalPulsa yang berbeda?
