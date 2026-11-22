# SalikurVouch

Platform manajemen voucher Hotspot **MikroTik RouterOS (v6 & v7)**, saldo reseller (**GoVoucher**), **Bot Telegram**, dan **Portal Pulsa (PPOB)** — dibangun dengan **Next.js 16.4.6 (App Router, TypeScript)**, **Tailwind CSS v4 + shadcn/ui**, dan **Supabase (PostgreSQL 17, Auth, Storage)**.

---

## Fitur Utama (v1.0 Full Scope)
- **Dual-Version MikroTik Adapter**: Mendukung **RouterOS v6** (Binary TCP/SSL API) dan **RouterOS v7** (REST API HTTPS + Binary TCP/SSL API) yang dapat dipilih di menu `/settings` dengan tombol **Test Connection Live**.
- **Manajemen Reseller & Saldo Atomik**: CRUD reseller, Top Up / Top Down menggunakan PostgreSQL `FOR UPDATE` RPC (`rpc_reserve_balance`, `rpc_refund_balance`, `rpc_adjust_balance`), Antrean Deposit, Riwayat Mutasi server-side pagination (31.000+ baris), dan Export `.xlsx` / `.csv`.
- **Paket & Generator Voucher Hotspot**: CRUD paket dinamis (Saldo & Non-Saldo), Batch Generator 1–100 voucher dengan opsi potong saldo reseller, pengiriman Telegram, Arsip Batch, dan **Cetak Kartu PDF A4 (4 kolom)** dengan **QR Code lokal** (tanpa API eksternal).
- **Bot Telegram Webhook Terpadu** (`/api/telegram/webhook`): Validasi `X-Telegram-Bot-Api-Secret-Token`, deduplikasi `update_id`, mode `saldo_only`/`nonsaldo_only`/`hybrid`, transaksi voucher & PPOB dengan auto-rollback, serta Broadcast Pesan/Foto Telegram.
- **Portal Pulsa (PPOB)**: Katalog PULSA/PLN/GAME dengan cache 10 menit, cek saldo live, transaksi manual + lookup API, laporan laba per reseller/produk, Export `.xlsx`, Cetak PDF A4 Landscape, serta dukungan opsional static-IP proxy (`PORTALPULSA_PROXY_URL`) untuk Vercel.
- **MikroTik Manager**: Hotspot Users/Active/Profiles (`on-login` script v6/v7), PPP Secrets/Active/Profiles (`on-up` auto-move), Live Traffic Monitor (TX/RX), dan Netwatch.

---

## Pengembangan Lokal

```bash
# 1. Salin template environment dan isi rahasia
cp .env.example .env.local

# 2. Instal dependensi
npm install

# 3. Jalankan dev server
npm run dev
```

Buka `http://localhost:3000/login` dan masuk dengan akun admin Supabase Auth.

### Skrip Tersedia
| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Menjalankan Next.js 16.4.6 (Turbopack) lokal |
| `npm run build` | Build produksi Next.js |
| `npm run lint` | Menjalankan ESLint |
| `npm run typecheck` | Verifikasi TypeScript (`tsc --noEmit`) |
| `npm run test` | Menjalankan seluruh unit tests (Vitest) |
| `npm run migrate:sqlite -- --inspect` | Inspeksi skema & jumlah baris `mibotam.db` |
| `npm run migrate:sqlite -- --dry-run` | Simulasi ekstraksi & transformasi tanpa menulis ke Supabase |
| `npm run migrate:sqlite` | Eksekusi migrasi idempoten SQLite → Supabase + rekonsiliasi |
| `npm run verify:m5` | Uji konkurensi RPC atomik, idempotensi webhook, benchmark paginasi & konektivitas |

---

## Panduan Deployment Produksi (Vercel + GitHub Actions)

### 1. Environment Variables di Vercel (Production & Preview)
Tambahkan variabel berikut di **Vercel Project Settings → Environment Variables**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(Server-only)*
- `APP_ENCRYPTION_KEY` *(wajib sama dengan kunci yang dipakai saat migrasi SQLite agar password router & bot token dapat didekripsi)*
- `PORTALPULSA_USERID`, `PORTALPULSA_KEY`, `PORTALPULSA_SECRET`
- `PORTALPULSA_PROXY_URL` *(opsional — isi jika memakai static-IP HTTP CONNECT proxy untuk IP Whitelist PortalPulsa.com)*
- `CRON_SECRET` *(kunci rahasia untuk mengamankan endpoint keep-alive `/api/health/keep-alive`)*

### 2. GitHub Repository Secrets (CI/CD & Keep-Alive Anti Auto-Pause)
Tambahkan secrets di **GitHub → Settings → Secrets and variables → Actions**:
- `APP_URL` *(contoh: `https://app.salikur.net` — dipakai workflow `.github/workflows/supabase-keepalive.yml` setiap 3 hari)*
- `CRON_SECRET` *(wajib sama dengan `CRON_SECRET` di Vercel)*
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` *(opsional jika deploy via GitHub Actions CLI)*
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`

### 3. Checklist Cutover Produksi
1. Pastikan **Allow new users to sign up** dinonaktifkan di Supabase Auth → Providers → Email, dan aktifkan **Leaked Password Protection** di Auth → Password Security.
2. Jalankan migrasi final `npm run migrate:sqlite` bila masih ada transaksi baru di `mibotam.db` sebelum cutover (aman dijalankan ulang karena idempoten).
3. Login ke panel produksi Vercel → `/settings` → klik **Test Connection Live** untuk memverifikasi koneksi MikroTik dari Vercel.
4. Buka `/settings/webhook` → klik **Set Webhook** untuk memindahkan `@MikSalikurBot` dari PHP legacy ke `https://<domain-vercel>/api/telegram/webhook` beserta `secret_token`.
5. Uji `/ceksaldo`, `/menu`, `/isipulsa`, dan cetak kartu voucher A4.
