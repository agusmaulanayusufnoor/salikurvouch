import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_OWNER = "agusmaulanayusufnoor";
const GITHUB_REPO = "salikurvouch";
const APK_FILENAME = "SalikurVouch.apk";
const DEFAULT_APK_RELEASE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${APK_FILENAME}`;

async function resolveLatestGithubReleaseApkUrl(): Promise<string | null> {
  try {
    const apiRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "SalikurVouch-Web",
        },
        next: { revalidate: 300 },
      }
    );

    if (!apiRes.ok) {
      return null;
    }

    const data = (await apiRes.json()) as {
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const apkAsset = (data.assets ?? []).find(
      (a) =>
        a.name?.toLowerCase() === APK_FILENAME.toLowerCase() ||
        a.name?.toLowerCase().endsWith(".apk")
    );
    return apkAsset?.browser_download_url ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
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
        "Content-Disposition": `attachment; filename="${APK_FILENAME}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 2. If a custom APK URL is explicitly configured via env, redirect to it
  const customUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL?.trim();
  if (customUrl) {
    return NextResponse.redirect(customUrl, 302);
  }

  // 3. Resolve verified GitHub Release APK asset URL so users never hit a raw GitHub 404
  const resolvedReleaseUrl = await resolveLatestGithubReleaseApkUrl();
  if (resolvedReleaseUrl) {
    return NextResponse.redirect(resolvedReleaseUrl, 302);
  }

  // 4. Fallback HEAD check on latest release URL (in case GitHub API rate-limited)
  try {
    const headRes = await fetch(DEFAULT_APK_RELEASE_URL, {
      method: "HEAD",
      redirect: "follow",
    });
    if (headRes.ok) {
      return NextResponse.redirect(DEFAULT_APK_RELEASE_URL, 302);
    }
  } catch {
    // fall through to clean error page
  }

  // Never send user to a raw GitHub 404 page
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("apk", "building");
  return NextResponse.redirect(loginUrl, 302);
}
