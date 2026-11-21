# SalikurVouch Android (WebView)

Project Android WebView ringan untuk membuka panel web **SalikurVouch** langsung sebagai aplikasi Android (`.apk`), lengkap dengan:
- Persistensi cookie login Supabase Auth & OTP Telegram
- Swipe-to-refresh & progress bar
- Dukungan tombol Back Android
- Dukungan download file ekspor CSV/PDF via Android DownloadManager
- Layar error offline dengan tombol Muat Ulang

## Cara Build APK Otomatis (1 Klik di GitHub Actions — Tanpa Install Android Studio)
1. Buka repository GitHub Anda → tab **Actions** → pilih workflow **Build Android APK (WebView)**.
2. Klik **Run workflow**, masukkan URL Vercel produksi Anda (contoh: `https://salikurvouch.vercel.app`), lalu klik **Run workflow**.
3. Dalam ~1 menit, GitHub Actions akan otomatis meng-compile, menandatangani, dan menerbitkan `SalikurVouch.apk` ke **GitHub Releases (latest)**.
4. Tombol **Download APK** di bawah form login (`/login`) otomatis mengarah ke rilis APK terbaru tersebut.

## Cara Build Lokal (Opsional jika punya Android Studio / SDK)
```bash
cd android-webview
gradle assembleRelease -PAPP_URL="https://domain-vercel-anda.vercel.app"
```
Lalu salin hasil build `app/build/outputs/apk/release/app-release.apk` ke `public/downloads/salikurvouch.apk`.
