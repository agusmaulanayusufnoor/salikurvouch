import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_APK_RELEASE_URL =
  "https://github.com/agusmaulanayusufnoor/salikurvouch/releases/latest/download/SalikurVouch.apk";

export async function GET() {
  // 1. If a local APK exists in public/downloads/salikurvouch.apk, serve it directly
  const localPath = path.join(
    process.cwd(),
    "public",
    "downloads",
    "salikurvouch.apk"
  );
  if (fs.existsSync(localPath)) {
    const buffer = fs.readFileSync(localPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="SalikurVouch.apk"',
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 2. Otherwise redirect to configured APK URL or latest GitHub Release APK
  const externalUrl =
    process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL?.trim() || DEFAULT_APK_RELEASE_URL;
  return NextResponse.redirect(externalUrl, 302);
}
