# Product Requirements Document (PRD)
## Refactor & Migrasi Mikbotam → SalikurVouch (Next.js 16.4.6 + Supabase)

| Atribut | Detail |
| :--- | :--- |
| **Nama Produk** | **SalikurVouch** (Refactor dari Mikbotam v1.8 PHP/SQLite) |
| **Versi Dokumen** | 1.1 (Finalized Decisions) |
| **Tanggal** | 21 November 2026 |
| **Target Tech Stack** | Next.js `16.4.6` (App Router, TypeScript) + Supabase (PostgreSQL, Auth, Storage) |
| **Target Hosting & CI/CD** | Vercel + GitHub Actions (CI/CD otomatis) |
| **Lokasi Proyek Baru** | `/Users/agusmac/Nextjs/salikurvouch` |
| **Sumber Sistem Legacy** | `/Users/agusmac/Nextjs/backup_mikbotam` (PHP 7/8, SQLite `mibotam.db`, Medoo ORM, jQuery/Bootstrap) |
| **Status** | Approved Architecture — Siap Tahap Implementasi |

---

## 1. Ringkasan Eksekutif

### 1.1 Latar Belakang
Aplikasi **Mikbotam** saat ini berjalan menggunakan PHP prosedural legacy dengan database lokal SQLite (`config/mibotam.db`), antarmuka jQuery/Bootstrap lama, dan file bot Telegram (`Saldo/Core.php`) yang tercampur antara logika bisnis, query database, dan integrasi API. Sistem ini telah digunakan secara aktif di produksi (**SalikurNet**, `wifi.salikur.net`, `@MikSalikurBot`) sejak **November 2021 hingga November 2026**, dengan volume data historis lebih dari **31.390 transaksi mutasi voucher/saldo**, **30.488 catatan laporan pendapatan**, **14 reseller aktif**, **39 transaksi Portal Pulsa**, dan **10 arsip batch voucher JSON**.

Seiring pertumbuhan transaksi dan kebutuhan pemeliharaan jangka panjang, sistem legacy menghadapi berbagai keterbatasan:
- **Skalabilitas & Performa**: SQLite berbasis file rentan *database lock* saat transaksi konkuren; halaman riwayat me-render puluhan ribu baris langsung ke DOM HTML tanpa *server-side pagination*.
- **Keamanan**: Password admin tersimpan *plaintext* di SQLite, password router hanya memakai enkripsi kustom lemah (`encrypturl`), kredensial API Portal Pulsa di-hardcode di source code, tidak ada validasi secret token pada webhook Telegram, serta rawan XSS/CSRF.
- **Keandalan Transaksi**: Pengurangan saldo reseller tidak seluruhnya atomik (rawan *race condition / double spend*), dan terdapat `sleep(20)` sinkron di dalam webhook Telegram yang berisiko menyebabkan timeout dan eksekusi ganda.
- **Maintainability**: Banyak duplikasi kode antara `Core.php`, `Core_Nonsaldo.php`, dan `Core_Saldo_Nonsaldo.php`, JavaScript yang di-obfuscate (`_0x...`), serta beberapa bug logika yang teridentifikasi pada kode legacy.

### 1.2 Tujuan Refactor
1. **Modernisasi Full-Stack**: Membangun ulang aplikasi menggunakan **Next.js 16.4.6** (App Router, React 19, TypeScript strict, Tailwind CSS, shadcn/ui) dengan arsitektur modular, aman, dan mudah dirawat.
2. **Migrasi Database ke Supabase (PostgreSQL)**: Memindahkan skema & seluruh data historis dari SQLite (`mibotam.db`) dan file JSON lokal (`config/voucher_batches/*.json`) ke PostgreSQL terstruktur di Supabase dengan transaksi atomik (RPC/SQL Transactions) dan Row Level Security (RLS).
3. **Paritas Fitur + Perbaikan Bug Legacy**: Mempertahankan seluruh fitur operasional yang berjalan (Bot Telegram Voucher Saldo/Non-Saldo, Batch Generator & Cetak PDF, Manajemen Reseller & Saldo, Portal Pulsa PPOB, Hotspot Manager, PPP Manager, Monitoring Traffic MikroTik) sekaligus memperbaiki seluruh bug dan celah keamanan dari versi lama.

---

## 2. Audit & Inventaris Sistem Legacy

Berdasarkan analisis seluruh file pada folder `backup_mikbotam`, berikut pemetaan modul existing beserta volume datanya:

### 2.1 Pemetaan Modul & File Legacy
| Domain | File Legacy Utama | Fungsi Saat Ini |
| :--- | :--- | :--- |
| **Autentikasi & Admin** | `index.php`, `admin/login.php`, `admin/Autentifikasi.php`, `admin/forgot_id.php`, `admin/verificationid.php`, `admin/resetreal.php`, `admin/sessionedit.php`, `admin/myservernew.php`, `admin/captcha.php` | Login admin berbasis PHP session, reset password via CAPTCHA + 8-digit PIN yang dikirim ke Telegram Owner, onboarding setup server awal, edit profil login. |
| **Dashboard & Monitoring** | `pages/dashboard.php`, `pages/graphmikbotam.php`, `Graph/Getactive.php`, `Graph/Graph.php` | 4 kartu KPI bulanan, tabel transaksi 1 bulan terakhir, info hardware RouterOS + polling 10 detik (Uptime, CPU Load, Free RAM, AP Neighbor, User Active), grafik live traffic interface (TX/RX tiap 3 detik dengan Highcharts). |
| **Reseller & Saldo (GoVoucher)** | `pages/nusercounter.php`, `pages/userlist.php`, `pages/topup.php`, `pages/topdown.php`, `pages/recordcounter.php`, `Prosses/newuser_id.php`, `Prosses/saldo.php`, `Prosses/exportuser.php` | Tambah reseller manual, daftar reseller, Top Up saldo (+ notifikasi Telegram), Top Down/refund saldo, seluruh riwayat mutasi, laporan mutasi per reseller (filter rentang tanggal / bulan + export DataTables), hapus reseller beserta riwayatnya. |
| **Generator Voucher & Cetak PDF** | `pages/sendvoc.php`, `Prosses/Broadcast_y.php`, `Prosses/Broadcast_z.php`, `Prosses/export_voucher_pdf.php`, `config/voucher_batches/*.json` | 1) Custom & Send Voucher (username/password manual ke MikroTik + kirim QR via Telegram). 2) Create & Send Voucher berbasis paket (1–50 voucher batch), kirim single QR atau list grup ke Telegram, simpan batch ke session & JSON file, cetak PDF layout kartu 4 kolom A4 dengan QR code & warna sesuai nominal. |
| **Broadcast Telegram** | `pages/sendmess.php`, `Prosses/Broadcast_x.php`, `uploads/` | Kirim pesan teks HTML atau foto ber-caption ke 1 reseller tertentu atau broadcast ke seluruh reseller (`Alluser`). |
| **Pengaturan Voucher & Sistem** | `pages/settings.php`, `pages/settingsvoc.php`, `pages/settingsvocnonsaldo.php`, `pages/settingstext.php`, `Prosses/conntest.php`, `tools/setwebhook.php` | Konfigurasi RouterOS (IP, port, user, pass, DNS hotspot, nama router), konfigurasi Bot Telegram (token, username, owner), test koneksi TCP/API MikroTik, pengaturan hingga 6 paket voucher Saldo & 6 paket Non-Saldo (disimpan sebagai JSON di `st_mikbotam`), kelola Set/Unset/Info Webhook Telegram. |
| **Portal Pulsa (PPOB)** | `Saldo/portalpulsa.php`, `include/portalpulsa_db.php`, `pages/transaksipulsa.php`, `pages/laporanpulsa.php`, `pages/portalpulsaharga.php`, `Prosses/transaksi_pulsa_action.php`, `Prosses/export_pulsa_excel.php`, `Prosses/export_pulsa_pdf.php` | Integrasi API `portalpulsa.com` (Pulsa, Token PLN, Voucher Game), cek saldo API live, katalog harga + markup otomatis, transaksi via Bot Telegram dengan state machine multi-langkah, pencatatan transaksi manual, laporan laba/margin per periode/reseller/produk, export Excel (`.xls`) & cetak PDF. |
| **Hotspot Manager** | `hotspot/user.php`, `hotspot/user_active.php`, `hotspot/user_edit.php`, `hotspot/add_profile.php` | Daftar user Hotspot MikroTik, tambah/edit/enable/disable/hapus user, lihat user aktif, tambah Hotspot Profile lengkap dengan script `on-login` auto-expired & MAC lock. |
| **PPP Manager** | `ppp/ppp_user.php`, `ppp/ppp_active.php`, `ppp/ppp_profile.php` | Daftar PPP Secret, tambah/enable/disable/hapus PPP Secret, monitor PPP Active, kelola PPP Profile (termasuk fitur *Move Profile After Expired* via scheduler `on-up`). |
| **Bot Telegram Engine** | `Saldo/Core.php`, `Saldo/Core_Nonsaldo.php`, `Saldo/Core_Saldo_Nonsaldo.php`, `Saldo/src/FrameBot.php`, `Saldo/src/Bot.php` | Penanganan webhook & long-polling Telegram: `/start`, `/daftar`, `/cekid`, `/ceksaldo`, `/menu`, `/menus`, `/deposit`, `/isipulsa`, `/pulsa`, `/pln`, `/game`, `/saldoportal`, `/qrcode`, `#konfirmasi deposit`, serta perintah admin (`/topup`, `/topdown`, `/daftarid`, `/resource`, `/hotspot`, `?user`, `/netwatch`, `/report`, `/see_*`, `/rEm0vid*`, `dbg`). |
| **RouterOS API & Util** | `Api/routeros_api.class.php`, `config/system.byte.php`, `config/system.database.php` | Koneksi socket TCP ke MikroTik RouterOS API, generator karakter voucher (`make_string` tipe 1–7), konversi unit bytes/uptime (`formatBytes`, `formatDTM`, `toBytes`). |

### 2.2 Inventaris Tabel SQLite Existing (`config/mibotam.db`)
| Nama Tabel Legacy | Jumlah Baris | Status Pemakaian | Keterangan |
| :--- | ---: | :--- | :--- |
| `mikhbotam_id` | 1 | Aktif | Akun admin panel, token reset password, log login terakhir. |
| `st_mikbotam` | 1 | Aktif | Konfigurasi router, bot Telegram, owner, serta JSON `Voucher_1` & `Voucher_nonsaldo`. |
| `re_settings` | 14 | Aktif | Master data reseller/agen, nomor telepon, saldo berjalan, total voucher terjual. |
| `re_operating` | 31.390 | Aktif | Ledger transaksi voucher (`Success`: 30.492, `gagal`: 129, `gagalprint`: 71) & `topup` (698). Rentang: `2021-11-04` s/d `2026-11-21`. |
| `st_reportdata` | 30.488 | Aktif | Ringkasan pendapatan penjualan voucher (duplikat dari `re_operating` untuk `keterangan='Success'`). |
| `log_trans_pulsa` | 39 | Aktif | Riwayat transaksi Portal Pulsa (modal, jual, profit, trxid, SN, status, raw detail JSON). |
| `temp_transaksi` | 9 | Aktif | State machine percakapan `/isipulsa` (`waiting_phone`, `waiting_code`, `confirming_pulsa`). |
| `log_portalpulsa_api` | 0 | Schema Ada | Log API mentah Portal Pulsa (siap dimanfaatkan kembali di versi baru). |
| `transaksi_counter` | 0 | Schema Ada | Counter harian anti-duplikat per `code_phone` (saat ini dihitung via query `log_trans_pulsa`). |
| `re_customer`, `st_graffic`, `st_monitoring`, `st_ppp`, `st_smsgateway`, `st_voucher` | 0 | Tidak Aktif / Unused | Tabel bawaan template Mikbotam lama yang tidak terisi data (kecuali `st_monitoring` untuk fitur opsional Netwatch/Ping). |

### 2.3 Daftar Bug & Celah Keamanan Legacy yang Wajib Diperbaiki
1. **Keamanan Kredensial**:
   - Password admin disimpan *plaintext* di `mikhbotam_id.u_pass`.
   - Password MikroTik hanya di-obfuscate dengan fungsi `encrypturl()` berkunci hardcoded.
   - Kredensial API Portal Pulsa (`portal-userid`, `portal-key`, `portal-secret`) ter-hardcode langsung di `Saldo/portalpulsa.php`.
   - Webhook Telegram tidak memverifikasi `X-Telegram-Bot-Api-Secret-Token`.
2. **Bug Logika Bot Telegram (`Saldo/Core.php`)**:
   - Perintah `/report` mengecek `$idtelegram == $id_own`, padahal variabel yang didefinisikan adalah `$iduser`, sehingga admin pun ditolak.
   - Perintah `/deposit <nominal>` menampilkan variabel undefined `$usernamepelanggan` dan `$cek` pada pesan balasan ke user.
   - Tombol inline Quick Top Up `300.000` di `/deposit` mengirim `callback_data` sebesar `350000` (`tp|350000|...`).
   - Fungsi `sisasaldo()` menggunakan `max($saldo - $harga, 0) == 0`, menyebabkan reseller gagal membeli jika `saldo == harga` (sisa 0 dianggap tidak cukup).
   - Terdapat `sleep(20)` sinkron di callback `process_pulsa` sebelum cek saldo API akhir; di arsitektur serverless/webhook hal ini dapat memicu timeout Telegram dan pengiriman ulang update (*duplicate transaction*).
   - Fungsi `belivoucher()` tidak menggunakan transaksi database atomik sehingga rentan *double-click / race condition* saat beli voucher.
3. **Bug Web UI & RouterOS**:
   - Di `pages/settingsvoc.php` & `settingsvocnonsaldo.php`, input `limit_download_1` keliru membaca nilai `$datajson[0]['limit_total']`.
   - Ketidakkonsistenan mapping `limit-bytes-in` (upload) vs `limit-bytes-out` (download) antara `Core.php`, `Core_Saldo_Nonsaldo.php`, dan `hotspot/user.php`.
   - Di `Prosses/Broadcast_z.php`, pembuatan voucher batch oleh admin belum memiliki opsi pemotongan saldo reseller / pencatatan ke ledger `re_operating`.
   - Di `pages/userlist.php` + `Prosses/exportuser.php?profile=yes`, modal edit profil reseller tidak memproses `POST` save dan tombolnya salah memanggil fungsi `topupsaldo()`.
   - Dashboard memanggil `file_get_contents('https://download.mikbotam.net/scari.php?...')` secara sinkron pada setiap load halaman (memperlambat loading / gagal jika domain mati).
   - Ketergantungan pada layanan QR eksternal HTTP (`http://qrickit.com/api/qr.php` dan `api.qrserver.com`) yang rawan lambat/down.
   - File kosong / belum selesai: `pages/boteditor.php`, `pages/comingson.php`, `pages/settingstext.php`, `Graph/Liveping.php`.

---

## 3. User Personas & Hak Akses (RBAC)

| Role | Kanal Akses | Hak Akses & Tanggung Jawab |
| :--- | :--- | :--- |
| **Owner / Super Admin** | Web Dashboard + Telegram Bot | Akses penuh ke seluruh pengaturan sistem, kredensial RouterOS & Bot, manajemen reseller & saldo, generate/cetak voucher, manajemen Hotspot & PPP, laporan keuangan Voucher & Portal Pulsa, broadcast, serta perintah admin di Telegram. |
| **Operator / Staff** *(Opsional)* | Web Dashboard | Mengelola reseller, top up/top down, generate & cetak batch voucher, melihat laporan, serta memantau Hotspot/PPP, tanpa akses mengubah kredensial sistem/API. |
| **Reseller / Agen** | Telegram Bot | Mendaftar akun (`/daftar`), cek saldo (`/ceksaldo`), request deposit + kirim bukti foto, membeli voucher Hotspot (saldo/non-saldo), cek harga & transaksi Portal Pulsa (Pulsa, PLN, Game). |

---

## 4. Target Arsitektur & Tech Stack

### 4.1 Stack Teknologi
- **Framework**: **Next.js `16.4.6`** (App Router, React 19, TypeScript strict mode, Turbopack, Server Components, Server Actions, Route Handlers).
- **UI & Styling**: Tailwind CSS v4, shadcn/ui, Lucide Icons, TanStack Table (server-side pagination/sort/filter), Recharts (grafik traffic real-time & analitik omset/laba).
- **Database & Auth**: **Supabase**
  - **PostgreSQL 15+** sebagai database utama (menggantikan SQLite `mibotam.db` & file JSON batch).
  - **Supabase Auth** untuk autentikasi admin/operator (email/password + proteksi sesi via cookie SSR `@supabase/ssr`).
  - **Supabase Storage** untuk penyimpanan gambar broadcast Telegram dan bukti transfer deposit reseller (private bucket + signed URL).
  - **PostgreSQL RPC Functions** untuk mutasi saldo atomik (*row-level locking* `SELECT ... FOR UPDATE`).
- **Validasi & Form**: Zod + React Hook Form.
- **Integrasi MikroTik RouterOS (Dual Support v6 & v7)**:
  - Menggunakan **Adapter Pattern** (`MikroTikAdapter`) yang dapat dipilih per router di menu Pengaturan:
    - **RouterOS v6 (`v6_api`)**: Koneksi TCP Binary API (port 8728 / custom port / API-SSL 8729) melalui `node-routeros`, mendukung autentikasi pre-6.43 (MD5 challenge) maupun post-6.43 (plaintext over TCP/TLS).
    - **RouterOS v7 (`v7_rest` & `v7_api`)**: Mendukung **RouterOS v7 REST API** (`https://<host>:<port>/rest/...`, HTTP Basic Auth — sangat optimal & stabil untuk Vercel Serverless) sekaligus fallback ke **Binary TCP API** (`v7_api`) dengan normalisasi perbedaan schema response (misal format array `/system/health` pada v7 vs flat object pada v6).
- **Integrasi Telegram Bot**:
  - Webhook Route Handler `/api/telegram/webhook` (`export const runtime = 'nodejs'`), diamankan dengan `secret_token` header (`X-Telegram-Bot-Api-Secret-Token`) dan idempotency check berbasis `update_id`.
- **QR Code & Export Dokumen**:
  - **QR Code**: Generasi lokal server-side/client-side via package `qrcode` (SVG/PNG Data URL / Buffer untuk `sendPhoto` Telegram), menghilangkan ketergantungan pada `qrickit.com`.
  - **Export Excel**: `exceljs` menghasilkan file `.xlsx` asli (bukan HTML-as-XLS).
  - **Cetak / PDF**: Halaman print-optimized CSS `@media print` (A4 portrait untuk kartu voucher 4 kolom, A4 landscape untuk laporan keuangan) + opsi download PDF via browser print.

### 4.2 Arsitektur Deployment Vercel, CI/CD GitHub Actions & Persyaratan Jaringan
Proyek **SalikurVouch** akan di-deploy di **Vercel** dengan pipeline **CI/CD GitHub Actions**. Karena Vercel berjalan di lingkungan *serverless*, arsitektur wajib menangani 3 hal berikut sejak awal:

1. **Node.js Runtime & Timeout Management**:
   - Semua Route Handlers yang berkomunikasi dengan MikroTik TCP API, Telegram Webhook, dan Export Excel wajib mendeklarasikan `export const runtime = 'nodejs'` (bukan Edge Runtime).
   - Koneksi RouterOS wajib memiliki timeout ketat (connect timeout 5 detik, command timeout 8 detik) dan selalu menutup socket di blok `finally` agar tidak terjadi kebocoran koneksi di Vercel Function.
   - Tidak ada `sleep()` blocking di dalam webhook Telegram; operasi pasca-transaksi (seperti notifikasi saldo API Portal Pulsa ke admin) dijalankan tanpa delay sinkron atau menggunakan `after()` dari `next/server` (fitur stabil Next.js 15/16) agar response webhook selalu `< 3 detik`.
2. **Aksesibilitas Router MikroTik dari Vercel**:
   - Router MikroTik harus dapat dijangkau dari internet publik melalui **IP Publik / DDNS / Port Forwarding / VPN Tunnel Gateway**.
   - Untuk **RouterOS v7**, disarankan mengaktifkan **REST API (HTTPS `www-ssl`)** karena protokol HTTPS stateless paling handal di serverless Vercel dibanding raw TCP socket.
3. **IP Whitelist PortalPulsa.com di Vercel**:
   - API `portalpulsa.com` menerapkan **IP Whitelist**, sementara outbound IP Vercel standar bersifat dinamis.
   - Aplikasi akan menyediakan konfigurasi opsional **`PORTALPULSA_PROXY_URL`** (HTTP/HTTPS static-IP proxy atau micro-relay ber-IP statis seperti Fixie/QuotaGuard/VPS relay) di `lib/portalpulsa/client.ts` dan menu Settings. Jika kosong → request langsung ke `https://portalpulsa.com/api/connect/`; jika diisi → seluruh request Portal Pulsa otomatis diarahkan melalui static-IP proxy tersebut.
4. **Pipeline CI/CD GitHub Actions (`.github/workflows/ci-cd.yml`)**:
   - **On Pull Request / Push ke branch dev**: Jalankan `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run test`, dan `npm run build` + Vercel Preview Deployment.
   - **On Push ke `main`**: Jalankan seluruh check kualitas + deploy otomatis ke Vercel Production (via Vercel CLI / GitHub Action) + optional verifikasi migrasi Supabase.

---

## 5. Kebutuhan Fungsional (Functional Requirements)

### FR-01: Autentikasi, Profil Admin & Reset Password
- **FR-01.1**: Login ke dashboard menggunakan Supabase Auth (`email` + `password`) dengan proteksi rute menggunakan middleware/proxy Next.js 16.
- **FR-01.2**: Pencatatan audit log setiap percobaan login (berhasil/gagal, IP address, user-agent, timestamp) di tabel `auth_audit_logs`.
- **FR-01.3**: Pengaturan profil admin (ganti nama/email/password) langsung melalui Supabase Auth.
- **FR-01.4**: Mendukung alur **Lupa Password** standar email Supabase Auth dan opsi **Verifikasi PIN 8-digit via Telegram Owner** (seperti legacy `forgot_id.php` → `verificationid.php` → `resetreal.php`, dengan masa berlaku OTP 10 menit dan rate-limit 3 percobaan).
- **FR-01.5**: Wizard onboarding awal (*Initial Setup*) jika konfigurasi RouterOS & Bot Telegram belum diisi (menggantikan `myservernew.php`).

### FR-02: Dashboard Eksekutif & Monitoring Router Real-Time
- **FR-02.1**: Menampilkan 4+ kartu KPI dinamis (dapat difilter bulan ini / hari ini / rentang tanggal):
  - Total Voucher Terjual (qty).
  - Total Top Up Debit Reseller (Rp).
  - Total Mutasi / Omset Voucher (Rp) & Estimasi Laba Portal Pulsa (Rp).
  - Total Reseller Baru & Reseller Aktif.
- **FR-02.2**: Grafik tren penjualan Voucher & Portal Pulsa (harian/bulanan).
- **FR-02.3**: Panel status RouterOS real-time (auto-refresh dapat dikonfigurasi, default 10 detik, menggunakan API route `/api/mikrotik/status`):
  - Router Identity, Board Model, RouterOS Version, Uptime, Temperature (jika tersedia).
  - CPU Model, Freq, Core Count, CPU Load (%).
  - Free/Total Memory, Free/Total Disk, Bad Blocks (%).
  - Jumlah AP Neighbor Online (`/ip/neighbor/print`) dan Jumlah User Hotspot Aktif (`/ip/hotspot/active/print`).
- **FR-02.4**: Tabel transaksi terbaru (10–25 transaksi terakhir) dengan tautan cepat ke halaman riwayat lengkap.
- **FR-02.5**: Halaman **Traffic Monitor** (`/monitoring/traffic`): memilih interface MikroTik (`/interface/print`), menampilkan grafik area real-time **TX & RX (bps/kbps/Mbps)** setiap 3 detik via `/api/mikrotik/traffic?interface=...`, plus panel status **Netwatch / Host Monitoring** (`/tool/netwatch/print`).

### FR-03: Manajemen Reseller & Saldo (GoVoucher)
- **FR-03.1**: Daftar reseller (`/resellers`) dengan pencarian, filter status, saldo saat ini, total voucher terjual, nomor telepon/WA, tanggal bergabung & update terakhir.
- **FR-03.2**: Tambah reseller baru secara manual (Telegram User ID unik, nama/username, no HP/WA, saldo awal, status aktif/nonaktif).
- **FR-03.3**: Edit profil reseller (nama, no HP/WA, status aktif/suspend) — memperbaiki fitur edit yang rusak di legacy.
- **FR-03.4**: **Top Up Saldo** (`/resellers/topup` atau modal aksi cepat): menambah saldo secara atomik, mencatat ke `wallet_transactions`, dan mengirim notifikasi konfirmasi + inline keyboard (`Beli Voucher`) ke Telegram reseller.
- **FR-03.5**: **Top Down / Refund Saldo**: mengurangi saldo secara atomik (validasi saldo tidak boleh minus), mencatat alasan ke `wallet_transactions`, dan opsional mengirim notifikasi ke Telegram reseller.
- **FR-03.6**: **Riwayat Mutasi Lengkap** (`/transactions/vouchers`) dan **Mutasi per Reseller** (`/resellers/[id]`): server-side pagination, filter rentang tanggal / bulan / tipe transaksi (`voucher`, `topup`, `topdown`, `pulsa`, `failed`), ringkasan total debit/kredit/markup, serta export ke **Excel (`.xlsx`)**, **CSV**, dan **PDF**.
- **FR-03.7**: Hapus / Nonaktifkan reseller: default menggunakan **soft-delete / suspend** agar data historis akuntansi 5 tahun tidak hilang; hard-delete hanya diperbolehkan dengan konfirmasi eksplisit jika reseller tidak memiliki transaksi.

### FR-04: Konfigurasi Paket Voucher (Saldo & Non-Saldo)
- **FR-04.1**: Menggantikan form statis 6 slot (`settingsvoc.php` & `settingsvocnonsaldo.php`) dengan **CRUD dinamis** tabel `voucher_packages` (jumlah paket tidak terbatas, bisa diurutkan `sort_order` dan di-toggle aktif/nonaktif).
- **FR-04.2**: Setiap paket memiliki mode `saldo` (berbayar potong saldo reseller) atau `nonsaldo` (gratis / khusus admin), dengan atribut lengkap:
  - Nama Paket / Label Tombol (misal: `3.000`, `15.000`), Teks Daftar Menu (`Text_List`).
  - Harga Jual (`price`), Markup / Komisi Reseller (`markup`, sehingga pemotongan saldo reseller = `price - markup`, misal Harga Rp 3.000, Markup Rp 1.000 → Saldo terpotong Rp 2.000).
  - Server Hotspot (`all` atau nama server dari MikroTik) dan Hotspot Profile MikroTik.
  - Limit Uptime (format RouterOS misal `1d`, `7d`, `30d`, `3h`, atau `00:00:00` untuk unlimited).
  - Limit Kuota: Download, Upload, dan Total (satuan MB/GB yang dikonversi akurat ke bytes untuk `limit-bytes-in` / `limit-bytes-out` / `limit-bytes-total` — memperbaiki bug tertukar di legacy).
  - Format Kode Voucher: Mode Login (`vc` = Username sama dengan Password; `up` = Username & Password terpisah), Tipe Karakter (`1`: angka, `2`: HURUF BESAR, `3`: huruf kecil, `4`: Campuran huruf, `5`: Campuran huruf+angka, `6`: kecil+angka, `7`: BESAR+angka), Panjang Karakter (`3–12`).
  - Warna Kartu / QR Code (Hex color picker).

### FR-05: Generator Voucher Web, Batch & Cetak PDF
- **FR-05.1**: **Custom & Send Voucher (Single)**: Admin menentukan reseller penerima, username, password, profile MikroTik, server, limit uptime/kuota → sistem membuat user di MikroTik (`/ip/hotspot/user/add`) lalu mengirim gambar QR Code + detail akun ke Telegram reseller. Jika pengiriman Telegram gagal, user MikroTik otomatis di-rollback (dihapus) atau ditandai sesuai pilihan admin.
- **FR-05.2**: **Batch Create & Send Voucher (1–100 voucher)**: Admin memilih reseller, paket voucher, jumlah voucher (default maks 50, dapat dikonfigurasi hingga 100), dan opsi **Potong Saldo Reseller (Ya/Tidak)** serta **Kirim ke Telegram (Ya/Tidak)**.
  - Membuat voucher secara batch ke MikroTik dengan comment terstruktur: `vc-bot|<seller>|<price>|<dd-mm-yyyy>|<batch_id>`.
  - Menyimpan metadata batch ke tabel `voucher_batches` dan setiap kode voucher ke tabel `vouchers` di Supabase (menggantikan file `config/voucher_batches/*.json`).
  - Pengiriman Telegram: jika `qty === 1`, kirim foto QR Code lokal; jika `qty > 1`, kirim daftar voucher terformat rapi (otomatis dipecah per 25 baris jika mendekati batas 4096 karakter Telegram).
- **FR-05.3**: **Riwayat Batch & Cetak PDF Voucher** (`/vouchers/batches` dan `/vouchers/print/[batchId]`):
  - Melihat daftar seluruh batch voucher yang pernah dibuat beserta status pengiriman Telegram.
  - Halaman cetak **A4 Portrait (4 kolom kartu)** mempertahankan desain kartu khas Mikbotam (badge harga berwarna sesuai nominal, nomor urut `[#]`, kode voucher / member `Us`/`Ps`, masa aktif & kuota, QR Code login otomatis `http://<dns>/login?username=...&password=...` yang di-render lokal tanpa API eksternal, dan footer login DNS).

### FR-06: Broadcast Pesan & Foto Telegram
- **FR-06.1**: Mengirim pesan teks HTML (maks 4096 karakter dengan live counter & live preview format `<b>`, `<i>`, `<code>`, `<a>`) ke 1 reseller atau seluruh reseller aktif.
- **FR-06.2**: Mengirim foto (upload ke Supabase Storage maks 5 MB, format PNG/JPG/WEBP) beserta caption HTML ke 1 atau seluruh reseller.
- **FR-06.3**: Eksekusi broadcast dengan *throttling* (~20–25 pesan/detik agar tidak terkena HTTP 429 Telegram), menampilkan laporan hasil per penerima (berhasil / gagal / bot diblokir user) dan menyimpan log broadcast di `broadcast_logs`.

### FR-07: Telegram Bot Interaktif (`/api/telegram/webhook`)
Bot berjalan melalui **satu endpoint webhook terpadu** dengan konfigurasi mode operasi di database (`saldo_only`, `nonsaldo_only`, `hybrid`) sehingga tidak perlu lagi mengganti file `Core.php` / `Core_Nonsaldo.php` / `Core_Saldo_Nonsaldo.php`.

#### A. Perintah & Alur Reseller
| Perintah / Event | Deskripsi Fungsional |
| :--- | :--- |
| `/start` | Menyapa user baru (instruksi `/daftar` & `/help`) atau reseller terdaftar. |
| `/daftar` | Registrasi mandiri reseller baru ke tabel `resellers` (wajib memiliki username Telegram atau fallback `first_name` sesuai konfigurasi). |
| `/cekid` | Menampilkan Telegram User ID, username, dan status pendaftaran. |
| `/ceksaldo`, `/lihatsaldo` | Menampilkan saldo aktif reseller saat ini. |
| `/help` | Menampilkan daftar perintah sesuai role (Reseller vs Admin). |
| `/menu` | Menampilkan daftar paket voucher **Saldo** aktif beserta inline keyboard + tombol `Cek Saldo` & `Informasi`. |
| Callback `vcr:<package_id>` | Validasi saldo cukup (`saldo >= price - markup`), kunci saldo atomik via Supabase RPC, buat user Hotspot di MikroTik, kirim kode voucher (+ opsi QR Code & tombol `Go to Login`), catat di `wallet_transactions` & `vouchers`, tampilkan tombol `History/Rincian Markup`, `Cek Saldo` (popup alert), dan `Kembali ke Menu`. **Auto-rollback** saldo & user MikroTik jika terjadi error! |
| `/deposit [nominal]` | Request deposit saldo custom atau via pilihan tombol nominal preset (`100rb` – `1jt`, batas nominal dapat dikonfigurasi). Mengirim notifikasi ke Admin dengan inline keyboard **Approve Nominal**, **Nominal Custom**, atau **Reject**. |
| Kirim Foto `#konfirmasi deposit <nominal>` | Meneruskan foto bukti transfer (resolusi terbaik dari array `photo`) + caption terformat ke Admin untuk verifikasi. |
| `/pulsa`, `/pln`, `/game` | Menampilkan katalog harga produk Portal Pulsa (untuk `/pulsa` dikelompokkan per Operator via inline keyboard; `/pln` & `/game` mendukung argumen filter keyword). |
| `/isipulsa` + State Text + Callback | Alur transaksi PPOB interaktif via `bot_user_states`: 1) Input No HP/ID Pelanggan (`waiting_phone`), 2) Input Kode Produk (`waiting_code`) + validasi produk & kalkulasi harga markup, 3) Konfirmasi detail & saldo (`confirming_pulsa`) dengan tombol `Lanjutkan` / `Batal`, 4) Pre-check saldo user & saldo API Portal Pulsa → eksekusi API → potong saldo atomik & catat di `ppob_transactions` → kirim notifikasi sukses/gagal ke user & admin (cek saldo API akhir dilakukan asinkron tanpa `sleep(20)`). |
| `/qrcode` (reply foto) | Membaca/decode gambar QR Code dari pesan foto yang dibalas menggunakan decoder server-side (misal `jsqr` + `sharp`/`jimp`) tanpa API HTTP eksternal. |

#### B. Perintah Khusus Admin (`telegram_id === owner_telegram_id` / terdaftar sebagai admin)
| Perintah | Deskripsi Fungsional |
| :--- | :--- |
| `/menus` | Menu voucher **Non-Saldo** (mode `nonsaldo` atau `hybrid`) untuk membuat voucher gratis/internal. |
| `/daftarid <id> <nama> <telp> <saldo>` | Mendaftarkan reseller secara manual dari Telegram. |
| `/topup <id> <nominal>` | Top up saldo reseller + kirim notifikasi ke reseller. |
| `/topdown <id> <nominal>` | Penarikan/pengurangan saldo reseller. |
| Callback `tp:<amount>:<user_id>` / `tp:reject:<user_id>` | Menyetujui atau menolak request deposit reseller langsung dari tombol pesan Telegram. |
| `/resource` | Menampilkan informasi health & resource Router MikroTik (Board, Uptime, CPU, RAM, HDD, Temp). |
| `/hotspot [aktif\|user] [server]` | Melihat daftar user hotspot atau user aktif (termasuk filter server `/see_<server>` dan hapus user `/rEm0vid<id>`). |
| `?user <username>` / `!user <username>` | Mencari detail 1 user hotspot beserta jadwal scheduler expired-nya dan tombol hapus. |
| `/netwatch` | Menampilkan status seluruh host di `/tool/netwatch/print` (UP/DOWN & since). |
| `/report` | Menampilkan ringkasan laporan bulan berjalan (total voucher, top up, omset voucher, omset/laba pulsa, user baru) — memperbaiki bug `$idtelegram` di legacy. |
| `/saldoportal` | Cek saldo API PortalPulsa.com secara langsung. |
| `/dbg` | Menampilkan payload JSON mentah pesan Telegram untuk debugging. |

### FR-08: Integrasi & Manajemen Portal Pulsa (PPOB)
- **FR-08.1**: Kredensial Portal Pulsa (`PORTALPULSA_USERID`, `PORTALPULSA_KEY`, `PORTALPULSA_SECRET`) disimpan aman melalui environment variables / pengaturan terenkripsi, bukan hardcoded.
- **FR-08.2**: Aturan markup harga dapat dikonfigurasi di Settings (default mengikuti produksi saat ini: `< Rp 100.000` markup `+3%`, `>= Rp 100.000` markup `+1%`, pembulatan ke atas `Math.ceil`).
- **FR-08.3**: **Pencatatan & Riwayat Transaksi Pulsa** (`/ppob/transactions`):
  - 4 KPI Cards (Total Transaksi Sukses/Gagal, Total Penjualan, Total Modal API, Laba Bersih & Margin %).
  - Filter rentang tanggal, reseller, status (`SUCCESS`, `PROCESSED`, `PENDING`, `FAILED`), pencarian keyword (TRX ID, kode produk, no tujuan).
  - Form tambah/edit transaksi manual (dilengkapi tombol **Cek API** untuk auto-fill harga modal, harga jual markup, dan deskripsi produk) + preview laba otomatis.
  - Modal detail transaksi (info lengkap + raw payload JSON) & tombol Cek Status Transaksi ulang ke API (`inquiry: 'status'`).
  - Export **Excel (`.xlsx`)** dan **Cetak / PDF** (A4 landscape + blok tanda tangan).
- **FR-08.4**: **Laporan Laba Pendapatan** (`/ppob/reports`):
  - Filter Bulan/Tahun/Rentang Tanggal & Reseller.
  - Rekapitulasi Laba per Reseller dan Rekapitulasi Laba per Kode Produk (diurutkan dari laba tertinggi).
- **FR-08.5**: **Katalog Harga & Cek Saldo API** (`/ppob/catalog`):
  - Menampilkan saldo API Portal Pulsa secara live.
  - Katalog produk kategori **PULSA**, **PLN**, dan **GAME** (memperluas legacy yang hanya menampilkan PULSA di web), di-cache 5–15 menit untuk kecepatan, dengan kolom Harga Modal, Harga Jual, Estimasi Laba, dan Status.
- **FR-08.6**: Counter harian anti-duplikat (`no` parameter Portal Pulsa) dikelola oleh tabel `ppob_daily_counters` (`date`, `user_id`, `code`, `target_phone`).

### FR-09: MikroTik Hotspot Manager
- **FR-09.1**: **Hotspot Users** (`/mikrotik/hotspot/users`): Daftar user dari `/ip/hotspot/user/print` (ID, Username, Password, Limit Uptime, Uptime Used, Bytes In/Out, Profile, Status, Comment ter-parse), pencarian, tambah user, edit user (memperbaiki form `user_edit.php`), Enable/Disable, dan Delete.
- **FR-09.2**: **Hotspot Active** (`/mikrotik/hotspot/active`): Daftar sesi aktif (`/ip/hotspot/active/print`) dengan opsi refresh dan tombol **Kick / Disconnect** sesi aktif.
- **FR-09.3**: **Hotspot Profiles** (`/mikrotik/hotspot/profiles`): Menampilkan daftar profile dan form tambah/hapus profile (`/ip/hotspot/user/profile/add`) dengan konfigurasi Rate Limit (`TX/RX`), Shared Users, Parent Queue (diambil dari `/queue/simple/print`), Validity (`1d`, `12h`, `30m`), Lock MAC Address, Transparent Proxy, dan injeksi script `on-login` otomatis (memperbaiki bug di legacy di mana cabang `enable` dan `disable` lock MAC menghasilkan script yang identik!).

### FR-10: MikroTik PPP Manager
- **FR-10.1**: **PPP Users / Secrets** (`/mikrotik/ppp/secrets`): Daftar `/ppp/secret/print`, tambah/edit/enable/disable/hapus secret (Name, Password, Service: `any/async/l2tp/ovpn/pppoe/pptp/sstp`, Profile, Local/Remote Address, Comment).
- **FR-10.2**: **PPP Active** (`/mikrotik/ppp/active`): Daftar koneksi aktif (`/ppp/active/print`) + aksi disconnect.
- **FR-10.3**: **PPP Profiles** (`/mikrotik/ppp/profiles`): Daftar `/ppp/profile/print`, tambah/hapus profile (Local Address, Remote Address Pool dari `/ip/pool/print`, DNS Server, Rate Limit, Parent Queue, Comment, dan fitur *Move Profile After Expired* via scheduler `on-up`).

### FR-11: Pengaturan Sistem, Router (ROS v6 & v7), Template Pesan & Tools Webhook
- **FR-11.1**: **Router & Bot Settings** (`/settings`):
  - **Pengaturan MikroTik RouterOS (v6 & v7)**: Host/IP, Port API / Port REST, **Pilihan Versi RouterOS (`v6` / `v7`)**, **Mode Koneksi (`api_tcp` / `api_ssl` / `rest_api`)**, opsi `allow_self_signed_tls` (untuk REST API HTTPS self-signed di v7), Username, Password terenkripsi AES-256-GCM, DNS Hotspot, Nama Router, dan tombol **Test Connection** live yang menampilkan deteksi versi RouterOS aktual & identity router.
  - **Pengaturan Bot Telegram**: Token terenkripsi, Username Bot, Owner Username & Telegram ID, Mode Bot (`saldo_only` / `nonsaldo_only` / `hybrid`).
  - **Pengaturan Portal Pulsa (PPOB)**: Konfigurasi aturan markup, toggle aktif/nonaktif PPOB, dan konfigurasi opsional **Outbound Proxy URL** (untuk static IP whitelist di Vercel).
- **FR-11.2**: **Text & Message Templates** (`/settings/templates`): Mengimplementasikan halaman `settingstext.php` yang sebelumnya belum selesai — admin dapat mengkustomisasi teks welcome (terdaftar & belum terdaftar), teks informasi promo/saldo rendah, footer voucher, dan pesan deposit dengan variabel placeholder (`{{username}}`, `{{saldo}}`, `{{voucher_code}}`, dll.).
- **FR-11.3**: **Webhook Manager** (`/settings/webhook`): Menampilkan URL webhook Next.js otomatis (`https://<domain>/api/telegram/webhook`), tombol **Set Webhook** (otomatis mendaftarkan `secret_token`), **Unset Webhook**, dan status live dari `getWebhookInfo` (status aktif, URL aktif, `pending_update_count`, `last_error_message`).
- **FR-11.4**: **Database, Storage Free-Tier, Keep-Alive, Backup/Restore & Data Cutoff** (`/settings/database`):
  - **Status Storage Supabase Free Tier**: Memantau pemakaian PostgreSQL Database (kuota 500 MB) beserta rincian ukuran & estimasi baris tiap tabel, serta pemakaian Supabase Storage (kuota 1 GB) per bucket (`broadcast-media`, `deposit-proofs`).
  - **Proteksi Auto-Pause Supabase (7 Hari)**: Endpoint `/api/health/keep-alive` (diamankan dengan `CRON_SECRET`) yang dipanggil otomatis setiap 3 hari oleh GitHub Actions (`.github/workflows/supabase-keepalive.yml`) dan Vercel Cron (`vercel.json`), lengkap dengan indikator timestamp ping terakhir dan tombol test ping manual di UI.
  - **Backup & Restore Database**: Download snapshot terkompresi (`.json.gz`) lengkap dengan checksum SHA-256 (kredensial tetap terenkripsi AES-256-GCM), serta Restore dari file `.json` / `.json.gz` dengan preview isi, validasi checksum, dan pilihan mode **Merge/Upsert** atau **Replace** (wajib konfirmasi eksplisit).
  - **Hapus Data Cutoff (Retensi Data)**: Memangkas data historis lama dengan pilihan **Sisakan 1 Tahun Terakhir (12 Bulan)** atau **Sisakan 6 Bulan Terakhir (6 Bulan)** untuk menghemat kuota Free Tier 500 MB — didahului **Simulasi Dry-Run** jumlah baris per tabel dan konfirmasi eksplisit tanpa menghapus master data (`resellers`, saldo berjalan, `routers`, `voucher_packages`, `app_settings`).

---

## 6. Desain Database Supabase (PostgreSQL) & Rencana Migrasi

### 6.1 Skema Target PostgreSQL (Supabase)

Semua tabel berada di schema `public` dengan `Row Level Security (RLS)` aktif. Akses server-side dari Route Handlers / Server Actions / Webhook menggunakan `service_role` atau client terautentikasi sesuai peran.

```sql
-- 1. Profil Admin & Role (terhubung dengan Supabase Auth)
CREATE TABLE admin_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'operator')),
  telegram_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Audit Log Login & Reset PIN Telegram
CREATE TABLE auth_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username_attempted TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_otps (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Konfigurasi Router MikroTik (mendukung RouterOS v6 & v7, siap multi-router)
CREATE TABLE routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INT NOT NULL DEFAULT 8728,
  ros_version TEXT NOT NULL DEFAULT 'v6' CHECK (ros_version IN ('v6', 'v7')),
  connection_mode TEXT NOT NULL DEFAULT 'api_tcp' CHECK (connection_mode IN ('api_tcp', 'api_ssl', 'rest_api')),
  allow_self_signed_tls BOOLEAN NOT NULL DEFAULT TRUE,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL, -- AES-256-GCM
  dns_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Pengaturan Sistem, Bot Telegram & PPOB
CREATE TABLE app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token_encrypted TEXT,
  bot_username TEXT,
  bot_mode TEXT NOT NULL DEFAULT 'saldo_only' CHECK (bot_mode IN ('saldo_only', 'nonsaldo_only', 'hybrid')),
  webhook_secret TEXT,
  owner_username TEXT,
  owner_telegram_id BIGINT,
  max_deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 1000000,
  low_balance_threshold NUMERIC(14,2) NOT NULL DEFAULT 10000,
  ppob_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ppob_markup_small_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00, -- < 100.000
  ppob_markup_large_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00, -- >= 100.000
  ppob_markup_threshold NUMERIC(14,2) NOT NULL DEFAULT 100000,
  ppob_proxy_url TEXT, -- opsional static-IP proxy untuk Vercel → PortalPulsa
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Template Pesan Bot Telegram
CREATE TABLE bot_message_templates (
  key TEXT PRIMARY KEY, -- 'welcome_unregistered', 'welcome_registered', 'info_promo', 'voucher_footer', dll.
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Master Paket Voucher (menggantikan JSON Voucher_1 & Voucher_nonsaldo)
CREATE TABLE voucher_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id UUID REFERENCES routers(id) ON DELETE CASCADE,
  legacy_slot_id TEXT, -- '0'..'5' untuk kompatibilitas callback/migrasi
  mode TEXT NOT NULL DEFAULT 'saldo' CHECK (mode IN ('saldo', 'nonsaldo')),
  name TEXT NOT NULL,               -- e.g. '3.000', '15.000'
  menu_label TEXT NOT NULL,         -- e.g. 'voucher 3.000'
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup NUMERIC(14,2) NOT NULL DEFAULT 0, -- potongan/komisi reseller
  mikrotik_server TEXT NOT NULL DEFAULT 'all',
  mikrotik_profile TEXT NOT NULL,
  limit_uptime TEXT DEFAULT '00:00:00',
  limit_download_mb INT NOT NULL DEFAULT 0,
  limit_upload_mb INT NOT NULL DEFAULT 0,
  limit_total_mb INT NOT NULL DEFAULT 0,
  login_type TEXT NOT NULL DEFAULT 'vc' CHECK (login_type IN ('vc', 'up')), -- vc: user=pass, up: user&pass
  char_type TEXT NOT NULL DEFAULT '6', -- '1'..'7'
  code_length INT NOT NULL DEFAULT 5 CHECK (code_length BETWEEN 3 AND 16),
  card_color TEXT NOT NULL DEFAULT '#20a8d8',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Master Reseller / Agen (migrasi dari re_settings)
CREATE TABLE resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  vouchers_sold INT NOT NULL DEFAULT 0,
  reseller_type TEXT DEFAULT 'agent',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  notes TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resellers_telegram_id ON resellers(telegram_id);

-- 8. Batch Pembuatan Voucher (migrasi dari config/voucher_batches/*.json)
CREATE TABLE voucher_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT UNIQUE NOT NULL, -- e.g. 'BATCH_20261119_203005_205'
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES voucher_packages(id) ON DELETE SET NULL,
  router_id UUID REFERENCES routers(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'web_batch' CHECK (source IN ('bot_saldo', 'bot_nonsaldo', 'web_custom', 'web_batch')),
  package_name TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  deducted_balance BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_sent BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Detail Kode Voucher yang Pernah Dibuat
CREATE TABLE vouchers (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID REFERENCES voucher_batches(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES voucher_packages(id) ON DELETE SET NULL,
  mikrotik_api_id TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  login_type TEXT NOT NULL DEFAULT 'vc',
  profile TEXT,
  time_limit TEXT,
  data_limit_label TEXT,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  dns_name TEXT,
  card_color TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed_router', 'failed_telegram', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vouchers_batch_id ON vouchers(batch_id);
CREATE INDEX idx_vouchers_username ON vouchers(username);
CREATE INDEX idx_vouchers_created_at ON vouchers(created_at DESC);

-- 10. Ledger Mutasi Saldo Reseller (migrasi dari re_operating + st_reportdata)
CREATE TABLE wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  legacy_no INT, -- referensi re_operating.No
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  telegram_id BIGINT NOT NULL,
  seller_name TEXT,
  tx_type TEXT NOT NULL CHECK (tx_type IN (
    'voucher_purchase', 'voucher_nonsaldo', 'voucher_failed',
    'topup', 'topdown', 'ppob_purchase', 'refund'
  )),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,          -- nilai mutasi (+/-)
  voucher_price NUMERIC(14,2) DEFAULT 0,
  markup_amount NUMERIC(14,2) DEFAULT 0,
  balance_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  topup_by TEXT,
  voucher_username TEXT,
  voucher_password TEXT,
  voucher_profile TEXT,
  router_name TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_tx_reseller_date ON wallet_transactions(reseller_id, created_at DESC);
CREATE INDEX idx_wallet_tx_telegram_date ON wallet_transactions(telegram_id, created_at DESC);
CREATE INDEX idx_wallet_tx_type_date ON wallet_transactions(tx_type, created_at DESC);

-- 11. Request Deposit Reseller (Audit trail untuk /deposit & konfirmasi bukti transfer)
CREATE TABLE deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  proof_file_path TEXT, -- path di Supabase Storage / Telegram file_id
  approved_amount NUMERIC(14,2),
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Transaksi Portal Pulsa / PPOB (migrasi dari log_trans_pulsa)
CREATE TABLE ppob_transactions (
  id BIGSERIAL PRIMARY KEY,
  legacy_id INT,
  trx_id TEXT UNIQUE NOT NULL,
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  telegram_id BIGINT NOT NULL,
  product_code TEXT NOT NULL,
  target_number TEXT NOT NULL,
  customer_id TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0, -- harga_asli (modal API)
  sell_price NUMERIC(14,2) NOT NULL DEFAULT 0, -- harga_jual
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,     -- sell_price - cost_price
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'PROCESSED', 'PENDING', 'FAILED')),
  serial_number TEXT DEFAULT '',
  description TEXT,
  source TEXT NOT NULL DEFAULT 'telegram_bot' CHECK (source IN ('telegram_bot', 'manual_web')),
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ppob_tx_created_at ON ppob_transactions(created_at DESC);
CREATE INDEX idx_ppob_tx_reseller ON ppob_transactions(reseller_id);
CREATE INDEX idx_ppob_tx_status ON ppob_transactions(status);

-- 13. Counter Harian Anti-Duplikat PPOB (migrasi dari transaksi_counter)
CREATE TABLE ppob_daily_counters (
  tx_date DATE NOT NULL,
  telegram_id BIGINT NOT NULL,
  product_code TEXT NOT NULL,
  target_number TEXT NOT NULL,
  tx_count INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tx_date, telegram_id, product_code, target_number)
);

-- 14. State Machine Percakapan Bot & Idempotency Update Telegram
CREATE TABLE bot_user_states (
  telegram_id BIGINT PRIMARY KEY,
  step TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Log Broadcast Telegram
CREATE TABLE broadcast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_scope TEXT NOT NULL, -- 'all' atau telegram_id spesifik
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'photo')),
  content TEXT,
  media_path TEXT,
  total_targets INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.2 Fungsi Atomik PostgreSQL (RPC) untuk Transaksi Saldo
Untuk menghilangkan *race condition* dan *double-spend* yang ada pada versi PHP/SQLite:
1. `rpc_reserve_balance(p_telegram_id, p_amount, p_tx_type, p_meta)`:
   - Melakukan `SELECT balance FROM resellers WHERE telegram_id = p_telegram_id FOR UPDATE`.
   - Memvalidasi `balance >= p_amount` (memperbaiki bug `saldo == harga` di legacy).
   - Mengurangi saldo dan memasukkan entri `wallet_transactions` secara atomik dalam 1 transaksi SQL.
2. `rpc_refund_balance(p_tx_id, p_reason)`:
   - Mengembalikan saldo secara atomik jika pembuatan user MikroTik atau pengiriman API Portal Pulsa gagal.
3. `rpc_adjust_balance(p_telegram_id, p_delta, p_tx_type, p_actor, p_notes)`:
   - Untuk Top Up (`+delta`) dan Top Down (`-delta`, dengan validasi saldo akhir `>= 0`).

### 6.3 Rencana Migrasi Data SQLite → Supabase
Sebuah skrip migrasi khusus (`scripts/migrate-sqlite-to-supabase.ts`) akan dibangun dan dijalankan sekali saat cutover:
1. **Extract & Transform**:
   - Baca `config/mibotam.db` via `better-sqlite3`.
   - `st_mikbotam` → migrasi ke `routers` (enkripsi ulang `Pass_router` dari `decrypturl()` ke AES-256-GCM), `app_settings` (enkripsi `Token_bot`), dan parse JSON `Voucher_1` / `Voucher_nonsaldo` menjadi baris-baris di `voucher_packages`.
   - `re_settings` (14 baris) → migrasi ke `resellers` (cast `id_user` ke `BIGINT`, cast `saldo` string ke `NUMERIC`, gabungkan `Tanggal` + `Waktu` dengan zona waktu `+07:00`).
   - `re_operating` (31.390 baris) → migrasi batch per 500–1000 baris ke `wallet_transactions` dengan pemetaan `keterangan`:
     - `'Success'` → `tx_type = 'voucher_purchase'`, `status = 'success'`
     - `'SuccessNonSaldo'` → `tx_type = 'voucher_nonsaldo'`, `status = 'success'`
     - `'gagal'` / `'gagalprint'` → `tx_type = 'voucher_failed'`, `status = 'failed'`
     - `'topup'` → `tx_type = 'topup'`, `status = 'success'`
   - `log_trans_pulsa` (39 baris) → migrasi ke `ppob_transactions` (normalisasi `harga_asli`, `harga_jual`, `profit`, parse `detail` menjadi `JSONB`).
   - `config/voucher_batches/*.json` (10 file) → migrasi ke `voucher_batches` dan `vouchers`.
   - `mikhbotam_id` → buat akun admin pertama di Supabase Auth secara aman (tidak memigrasi password plaintext; gunakan password baru dari env saat seed).
2. **Verifikasi & Rekonsiliasi**:
   - Bandingkan jumlah baris tiap tabel sumber vs target (`14` reseller, `31.390` wallet_transactions, `39` ppob_transactions, `10` voucher_batches).
   - Bandingkan `SUM(balance)` seluruh reseller, `SUM(top_up)`, `SUM(beli_voucher)` (Success), dan `SUM(profit)` PPOB antara SQLite dan PostgreSQL — selisih harus `0`.

---

## 7. Kebutuhan Non-Fungsional (Non-Functional Requirements)

| Kategori | Persyaratan |
| :--- | :--- |
| **Keamanan** | - Seluruh kredensial rahasia (MikroTik password, Telegram Bot Token, Portal Pulsa key/secret) wajib disimpan terenkripsi (AES-256-GCM dengan master key di env) atau di server environment variables.<br>- Webhook Telegram wajib memverifikasi header `X-Telegram-Bot-Api-Secret-Token`.<br>- Proteksi RLS aktif di seluruh tabel Supabase.<br>- Validasi ketat semua input API & Server Action dengan Zod; sanitasi output HTML Telegram. |
| **Performa** | - Semua tabel riwayat besar (`wallet_transactions` 31k+ baris, `vouchers`, `ppob_transactions`) wajib menggunakan **server-side pagination, filtering, dan indexing** (target respons < 300ms).<br>- Katalog harga Portal Pulsa di-cache di memory/DB selama 5–15 menit agar tidak memukul API eksternal pada setiap klik tombol operator di Telegram. |
| **Keandalan & Idempotensi** | - Webhook Telegram harus merespons HTTP 200 cepat (< 5 detik) dan mengecek `telegram_processed_updates` berdasarkan `update_id` untuk mencegah transaksi ganda akibat retry Telegram.<br>- Tidak boleh ada `sleep()` blocking di dalam request handler.<br>- Mekanisme rollback otomatis: jika saldo sudah dipotong tetapi MikroTik / Portal Pulsa gagal, saldo otomatis dikembalikan; jika user MikroTik sudah dibuat tetapi Telegram gagal kirim, user MikroTik dihapus. |
| **Observabilitas** | - Logging terstruktur (JSON logs) untuk semua panggilan RouterOS API, Telegram API, dan Portal Pulsa API (tanpa mencetak password/secret).<br>- Status kesehatan koneksi MikroTik & Telegram Webhook terlihat jelas di dashboard. |
| **Responsivitas & UX** | - Desain responsif (*mobile-friendly* & *desktop-first* untuk operasional admin), dark/light mode opsional, feedback toast real-time, dan halaman cetak A4 yang presisi di Chrome/Safari/Edge. |

---

## 8. Arsitektur Aplikasi Next.js 16.4.6 (`salikurvouch`)

Lokasi repositori proyek baru: `/Users/agusmac/Nextjs/salikurvouch` (folder `/Users/agusmac/Nextjs/backup_mikbotam` dipertahankan utuh sebagai backup dan sumber migrasi data).

```text
/Users/agusmac/Nextjs/salikurvouch/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                         # GitHub Actions: Lint, Typecheck, Test, Build, Vercel Deploy
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                    # Sidebar, Header, Auth guard
│   │   │   ├── page.tsx                      # Dashboard KPI + Router Status + Recent Tx
│   │   │   ├── resellers/
│   │   │   │   ├── page.tsx                  # Daftar Reseller + Add/Edit/Delete
│   │   │   │   ├── [id]/page.tsx             # Detail Reseller + Laporan Mutasi + Export
│   │   │   │   ├── topup/page.tsx            # Top Up & Top Down Saldo
│   │   │   │   └── deposits/page.tsx         # Antrean Request Deposit & Bukti Transfer
│   │   │   ├── vouchers/
│   │   │   │   ├── send/page.tsx             # Custom Single & Batch Create/Send Voucher
│   │   │   │   ├── batches/page.tsx          # Riwayat Batch Voucher
│   │   │   │   ├── packages/page.tsx         # CRUD Paket Voucher (Saldo & Non-Saldo)
│   │   │   │   └── history/page.tsx          # Riwayat Seluruh Transaksi Voucher/Saldo
│   │   │   ├── broadcast/page.tsx            # Kirim Pesan & Foto Telegram
│   │   │   ├── ppob/
│   │   │   │   ├── transactions/page.tsx     # Catat & Riwayat Transaksi Portal Pulsa
│   │   │   │   ├── reports/page.tsx          # Laporan Laba per Periode/Reseller/Produk
│   │   │   │   └── catalog/page.tsx          # Katalog Harga & Saldo API Live
│   │   │   ├── mikrotik/
│   │   │   │   ├── hotspot/
│   │   │   │   │   ├── users/page.tsx
│   │   │   │   │   ├── active/page.tsx
│   │   │   │   │   └── profiles/page.tsx
│   │   │   │   ├── ppp/
│   │   │   │   │   ├── secrets/page.tsx
│   │   │   │   │   ├── active/page.tsx
│   │   │   │   │   └── profiles/page.tsx
│   │   │   │   └── traffic/page.tsx          # Live Traffic Chart + Netwatch
│   │   │   └── settings/
│   │   │       ├── page.tsx                  # RouterOS (v6/v7), Bot, Owner, PPOB Markup & Proxy, Test Conn
│   │   │       ├── templates/page.tsx        # Custom Teks Bot Telegram
│   │   │       ├── webhook/page.tsx          # Set/Unset/Info Webhook Telegram
│   │   │       └── database/page.tsx         # Storage Free Tier, Keep-Alive, Backup/Restore & Cutoff 6/12 Bln
│   │   ├── print/
│   │   │   ├── vouchers/[batchCode]/page.tsx # Print Layout 4-Kolom A4 Kartu Voucher
│   │   │   └── ppob-report/page.tsx          # Print Layout A4 Landscape Laporan Pulsa
│   │   └── api/
│   │       ├── health/keep-alive/route.ts    # Cron Keep-Alive Anti Auto-Pause Supabase (7 Hari)
│   │       ├── admin/database/               # API Storage Stats, Backup (.json.gz), Restore & Cutoff 6/12 Bln
│   │       ├── telegram/webhook/route.ts     # Endpoint Webhook Telegram Bot (Node.js runtime)
│   │       ├── mikrotik/
│   │       │   ├── status/route.ts           # Live CPU/RAM/Uptime/Active
│   │       │   ├── traffic/route.ts          # Live Interface TX/RX
│   │       │   └── test/route.ts             # Test Connection (ROS v6 & v7)
│   │       └── exports/
│   │           ├── vouchers/route.ts         # Export Excel/CSV Mutasi Reseller
│   │           └── ppob/route.ts             # Export Excel (.xlsx) Laporan Pulsa
│   ├── lib/
│   │   ├── supabase/                         # Server, Client, Admin (service_role) clients
│   │   ├── mikrotik/
│   │   │   ├── adapter.ts                    # Interface MikroTikAdapter & Factory (v6 vs v7)
│   │   │   ├── ros-v6-api.ts                 # Binary TCP/SSL API client (ROS v6 & v7 TCP)
│   │   │   ├── ros-v7-rest.ts                # REST API HTTPS client (ROS v7 native)
│   │   │   └── scripts.ts                    # Generator script on-login Hotspot & on-up PPP (v6/v7)
│   │   ├── telegram/                         # Bot dispatcher, commands, callbacks, QR sender
│   │   ├── portalpulsa/                      # PortalPulsa HTTP Client (optional proxy), cache, markup
│   │   ├── crypto.ts                         # AES-256-GCM encrypt/decrypt secrets
│   │   └── voucher-generator.ts              # Generator kode karakter (tipe 1-7) & formatter
│   ├── components/                           # Reusable UI (shadcn/ui, DataTable, Charts, VoucherCard)
│   └── proxy.ts                              # Auth session refresh & route protection (Next.js 16)
├── supabase/
│   └── migrations/                           # SQL Migrations + RPC Functions + RLS Policies
├── scripts/
│   └── migrate-sqlite-to-supabase.ts         # Skrip ETL migrasi backup_mikbotam/config/mibotam.db
└── vercel.json                               # Konfigurasi maxDuration & region Vercel
```

---

## 9. Roadmap Implementasi Rilis Awal (v1.0 Full Scope)

Seluruh fitur utama termasuk **Voucher Saldo/Non-Saldo**, **Bot Telegram**, **Portal Pulsa PPOB**, **Hotspot Manager**, **PPP Manager**, dan **Monitoring Traffic** masuk ke dalam target **Rilis Awal v1.0** yang dieksekusi dalam 5 milestone terstruktur:

### Milestone 1: Fondasi `salikurvouch`, Supabase Schema, Auth & CI/CD
- Inisialisasi proyek **Next.js `16.4.6`** di `/Users/agusmac/Nextjs/salikurvouch` (TypeScript, Tailwind CSS v4, shadcn/ui, `vercel.json`, `.github/workflows/ci-cd.yml`).
- Pembuatan migrasi SQL Supabase lengkap (seluruh tabel, index, RLS, dan RPC atomik saldo).
- Implementasi Supabase Auth, layout dashboard, proteksi rute (`proxy.ts`), audit log login, dan modul enkripsi kredensial (`crypto.ts`).
- Implementasi & uji coba skrip migrasi ETL dari `/Users/agusmac/Nextjs/backup_mikbotam/config/mibotam.db` + JSON batches → Supabase beserta verifikasi rekonsiliasi data.

### Milestone 2: Dual-Version MikroTik Adapter (ROS v6 & v7), Settings & Reseller
- Implementasi `MikroTikAdapter` dengan dukungan **RouterOS v6 (TCP/SSL API)** dan **RouterOS v7 (REST API HTTPS + TCP API fallback)** termasuk normalisasi data health/resource/hotspot/PPP.
- Halaman Settings (`/settings` untuk konfigurasi ROS v6/v7, Bot, Owner, PPOB Markup & Proxy, Test Connection), Template Pesan (`/settings/templates`), dan Webhook Manager (`/settings/webhook`).
- Manajemen Reseller lengkap (CRUD, Top Up/Top Down atomik, Antrean Deposit, Riwayat Mutasi server-side pagination, Export `.xlsx`/CSV) + CRUD Paket Voucher dinamis (Saldo & Non-Saldo).

### Milestone 3: Generator Voucher Web, Cetak PDF A4 & Telegram Bot Engine
- Implementasi Generator Voucher Single & Batch (1–100) dengan opsi pemotongan saldo reseller + pengiriman Telegram + penyimpanan batch di Supabase.
- Halaman Cetak Kartu Voucher A4 (4 kolom, QR Code lokal tanpa API eksternal, pewarnaan dinamis) & Riwayat Batch untuk cetak ulang.
- Implementasi penuh Telegram Bot Webhook (`/api/telegram/webhook`) dengan `secret_token`, idempotency `update_id`, `bot_user_states`, seluruh command reseller & admin, serta Broadcast Pesan/Foto Telegram.

### Milestone 4: Portal Pulsa (PPOB), Hotspot Manager, PPP Manager & Traffic Monitor
- Integrasi Portal Pulsa client (cek saldo live, katalog PULSA/PLN/GAME dengan cache, transaksi + cek status, dukungan optional static-IP proxy untuk Vercel) di Bot Telegram maupun Web UI.
- Halaman Transaksi Pulsa (CRUD manual + lookup API), Laporan Laba per Reseller/Produk, Katalog Harga, serta Export `.xlsx` & Cetak PDF A4 Landscape.
- Modul Hotspot Manager (Users, Active + Kick, Profiles + script `on-login` v6/v7) dan PPP Manager (Secrets, Active + Disconnect, Profiles + script `on-up` auto-move).
- Dashboard Eksekutif Real-time Monitoring + Grafik Traffic Interface TX/RX & Netwatch.

### Milestone 5: Pengujian End-to-End, Security Hardening & Cutover Produksi Vercel
- Pengujian unit & integrasi (termasuk uji konkurensi RPC saldo atomik & simulasi ROS v6/v7).
- Uji deployment Vercel via GitHub Actions, verifikasi koneksi MikroTik & IP Whitelist Portal Pulsa.
- Eksekusi migrasi data final dari `mibotam.db` terbaru, cutover Telegram Webhook ke domain Vercel produksi, dan monitoring pasca-rilis.

---

## 10. Kriteria Penerimaan (Acceptance Criteria)

1. **Integritas Migrasi Data**: 100% data historis dari `mibotam.db` (reseller, 31.390+ mutasi, 39 transaksi pulsa, 10 batch JSON) termigrasi ke Supabase dengan total saldo akhir dan total omset identik (selisih Rp 0).
2. **Keamanan**: Tidak ada kredensial/API key/password yang ter-hardcode di repositori atau tersimpan *plaintext* di database; webhook Telegram menolak request tanpa `secret_token` valid.
3. **Atomisitas Transaksi**: Dua klik bersamaan pada pembelian voucher/pulsa oleh reseller yang sama tidak pernah menghasilkan saldo negatif atau voucher ganda tanpa pemotongan saldo.
4. **Paritas Bot & Web**: Seluruh perintah aktif di `@MikSalikurBot` (`/menu`, `/ceksaldo`, `/deposit`, `/isipulsa`, `/pulsa`, `/pln`, `/game`, perintah admin) dan fitur Web UI (Dashboard, Batch Voucher + Cetak PDF, Portal Pulsa + Export, Hotspot/PPP, Traffic) berjalan stabil tanpa error.
5. **Performa**: Halaman riwayat mutasi (31.000+ baris) terbuka dalam `< 1 detik` menggunakan server-side pagination; webhook Telegram merespons `< 3 detik`.

---

## 11. Keputusan Arsitektur Terkunci (Locked Decisions)

Berdasarkan konfirmasi stakeholder (21 November 2026), keputusan berikut telah dikunci sebagai acuan implementasi:

| No | Area | Keputusan Final |
| :--- | :--- | :--- |
| 1 | **Hosting & CI/CD** | Deploy di **Vercel** dengan pipeline **GitHub Actions** (CI/CD otomatis). Seluruh API MikroTik/Telegram menggunakan `runtime = 'nodejs'` + dukungan opsional `PORTALPULSA_PROXY_URL` untuk static IP whitelist Portal Pulsa. |
| 2 | **Dukungan MikroTik RouterOS** | Mendukung **RouterOS v6** (Binary TCP/SSL API) dan **RouterOS v7** (REST API HTTPS + Binary TCP/SSL API) yang dapat dipilih langsung di menu Pengaturan Router. |
| 3 | **Lokasi & Nama Proyek** | Folder baru **`/Users/agusmac/Nextjs/salikurvouch`** (Nama produk: **SalikurVouch**). Folder `/Users/agusmac/Nextjs/backup_mikbotam` dipertahankan utuh sebagai arsip & sumber migrasi SQLite. |
| 4 | **Cakupan Rilis v1.0** | **Full Scope** — seluruh fitur masuk ke rilis awal: Voucher Saldo & Non-Saldo, Batch Generator + Cetak PDF A4, Bot Telegram lengkap, Broadcast, Portal Pulsa PPOB (Pulsa/PLN/Game, transaksi, katalog, laporan laba, export Excel/PDF), Hotspot Manager, PPP Manager, dan Traffic Monitor. |
| 5 | **Batch Generator Web** | Menyediakan checkbox opsional **"Potong Saldo Reseller"** (default non-aktif untuk kompatibilitas perilaku legacy `Broadcast_z.php`, namun dapat diaktifkan admin saat dibutuhkan). |
