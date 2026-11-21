"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateOtpCode,
  generateReadablePassword,
  hashOtpCode,
  maskTelegramTarget,
  verifyOtpHash,
} from "@/lib/auth-security";
import {
  escapeHtml,
  getBotTokenFromSettings,
  sendTelegramMessage,
} from "@/lib/telegram/api";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const RESET_COOLDOWN_MS = 60 * 1000; // 60 seconds

const loginSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
  password: z.string().min(6, "Password minimal 6 karakter."),
  next: z.string().optional(),
});

const verifyOtpSchema = z.object({
  challenge_id: z.string().uuid("Sesi OTP tidak valid. Silakan login ulang."),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kode OTP harus 6 digit angka."),
  next: z.string().optional(),
});

const resetEmailSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
});

const resetTelegramSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
  owner_username: z
    .string()
    .trim()
    .min(2, "Username Telegram Owner wajib diisi."),
  owner_telegram_id: z
    .string()
    .trim()
    .regex(/^\d{5,20}$/, "ID Telegram Owner harus berupa angka valid."),
});

export type AuthActionState = {
  step?: "credentials" | "otp";
  challengeId?: string;
  email?: string;
  next?: string;
  maskedTarget?: string;
  info?: string;
  error?: string;
  success?: string;
};

function sanitizeNextPath(raw?: string): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}

async function recordAuthAudit(params: {
  userId: string | null;
  usernameAttempted: string;
  status: "success" | "failed";
}) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    const hdrs = await headers();
    const forwardedFor = hdrs.get("x-forwarded-for");
    const ipAddress =
      forwardedFor?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null;
    const userAgent = hdrs.get("user-agent");

    const admin = createAdminClient();
    await admin.from("auth_audit_logs").insert({
      user_id: params.userId,
      username_attempted: params.usernameAttempted,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: params.status,
    });
  } catch (err) {
    console.error("[auth_audit_logs] failed to write audit log:", err);
  }
}

/**
 * Step 1 of Login: verifies email + password using an ephemeral (non-cookie)
 * Supabase client, then sends a 6-digit OTP to the admin's Telegram.
 * Browser session cookies are NOT set until OTP verification passes.
 */
export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return {
      step: "credentials",
      error: parsed.error.issues[0]?.message ?? "Input login tidak valid.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePubKey) {
    return {
      step: "credentials",
      error: "Konfigurasi Supabase belum lengkap.",
    };
  }

  // Ephemeral verification client — does NOT write session cookies
  const ephemeral = createSupabaseJsClient(supabaseUrl, supabasePubKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await ephemeral.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await recordAuthAudit({
      userId: null,
      usernameAttempted: parsed.data.email,
      status: "failed",
    });
    return {
      step: "credentials",
      error: "Email atau password salah. Silakan coba lagi.",
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("admin_profiles")
    .select("id, username, role, telegram_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await recordAuthAudit({
      userId: data.user.id,
      usernameAttempted: parsed.data.email,
      status: "failed",
    });
    return {
      step: "credentials",
      error:
        "Akun Anda tidak memiliki profil admin/operator. Hubungi Super Admin.",
    };
  }

  const bot = await getBotTokenFromSettings();
  const targetChatId = profile.telegram_id ?? bot?.ownerTelegramId ?? null;

  // If Telegram Bot & target chat ID are configured (default production state),
  // require 2FA OTP via Telegram before creating the browser session.
  if (bot?.token && targetChatId) {
    const challengeId = crypto.randomUUID();
    const otp = generateOtpCode();
    const otpHash = hashOtpCode(challengeId, otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error: insertErr } = await admin
      .from("auth_otp_challenges")
      .insert({
        id: challengeId,
        user_id: data.user.id,
        email: parsed.data.email.toLowerCase(),
        purpose: "login_otp",
        otp_hash: otpHash,
        telegram_chat_id: targetChatId,
        attempts: 0,
        max_attempts: 5,
        expires_at: expiresAt,
      });

    if (insertErr) {
      return {
        step: "credentials",
        error: `Gagal menyiapkan sesi OTP: ${insertErr.message}`,
      };
    }

    const tgRes = await sendTelegramMessage({
      token: bot.token,
      chatId: targetChatId,
      text: [
        `🔐 <b>Kode OTP Login SalikurVouch</b>`,
        `<code>========================</code>`,
        `Akun   : <code>${escapeHtml(parsed.data.email)}</code>`,
        `Kode   : <code>${otp}</code>`,
        `Berlaku: 5 menit`,
        `<code>========================</code>`,
        `<i>Jangan bagikan kode OTP ini kepada siapa pun.</i>`,
      ].join("\n"),
    });

    if (!tgRes.ok) {
      await admin
        .from("auth_otp_challenges")
        .delete()
        .eq("id", challengeId);
      return {
        step: "credentials",
        error: `Gagal mengirim kode OTP ke Telegram: ${tgRes.description ?? "Telegram API error"}. Pastikan Anda sudah /start bot Telegram.`,
      };
    }

    const maskedTarget = maskTelegramTarget(
      profile.telegram_id ? profile.username : bot.ownerUsername,
      targetChatId
    );

    return {
      step: "otp",
      challengeId,
      email: parsed.data.email,
      next: parsed.data.next ?? "",
      maskedTarget,
      info: `Kode OTP 6 digit telah dikirim ke Telegram ${maskedTarget}. Berlaku 5 menit.`,
    };
  }

  // Fallback only if Telegram bot / owner Telegram ID is not configured at all
  const ssrSupabase = await createClient();
  const { error: ssrErr } = await ssrSupabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (ssrErr) {
    return { step: "credentials", error: ssrErr.message };
  }

  await recordAuthAudit({
    userId: data.user.id,
    usernameAttempted: parsed.data.email,
    status: "success",
  });

  redirect(sanitizeNextPath(parsed.data.next));
}

/**
 * Step 2 of Login: verifies the 6-digit Telegram OTP and establishes an
 * official HTTP-only Supabase Auth session via magiclink token_hash.
 */
export async function verifyLoginOtpAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const challengeId = String(
    formData.get("challenge_id") ?? prevState.challengeId ?? ""
  ).trim();
  const nextRaw = String(formData.get("next") ?? prevState.next ?? "");

  const parsed = verifyOtpSchema.safeParse({
    challenge_id: challengeId,
    otp: formData.get("otp"),
    next: nextRaw || undefined,
  });

  if (!parsed.success) {
    return {
      ...prevState,
      step: "otp",
      challengeId,
      next: nextRaw,
      error: parsed.error.issues[0]?.message ?? "Kode OTP tidak valid.",
    };
  }

  const admin = createAdminClient();
  const { data: challenge } = await admin
    .from("auth_otp_challenges")
    .select("*")
    .eq("id", parsed.data.challenge_id)
    .eq("purpose", "login_otp")
    .maybeSingle();

  if (!challenge || challenge.consumed_at) {
    return {
      step: "credentials",
      challengeId,
      error: "Sesi OTP sudah tidak berlaku atau telah digunakan. Silakan login ulang.",
    };
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await admin
      .from("auth_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);
    return {
      step: "credentials",
      challengeId,
      error: "Kode OTP telah kedaluwarsa (lebih dari 5 menit). Silakan login ulang.",
    };
  }

  if (challenge.attempts >= challenge.max_attempts) {
    await admin
      .from("auth_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);
    return {
      step: "credentials",
      challengeId,
      error: "Terlalu banyak percobaan OTP salah. Silakan login ulang.",
    };
  }

  const isValid = verifyOtpHash(
    challenge.id,
    parsed.data.otp,
    challenge.otp_hash
  );

  if (!isValid) {
    const nextAttempts = challenge.attempts + 1;
    const remaining = Math.max(challenge.max_attempts - nextAttempts, 0);
    await admin
      .from("auth_otp_challenges")
      .update({
        attempts: nextAttempts,
        ...(remaining === 0 ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq("id", challenge.id);

    if (remaining === 0) {
      await recordAuthAudit({
        userId: challenge.user_id,
        usernameAttempted: challenge.email,
        status: "failed",
      });
      return {
        step: "credentials",
        challengeId,
        error: "Kode OTP salah melebihi batas percobaan. Silakan login ulang.",
      };
    }

    return {
      ...prevState,
      step: "otp",
      challengeId: challenge.id,
      email: challenge.email,
      next: nextRaw,
      error: `Kode OTP salah. Sisa percobaan: ${remaining}x.`,
    };
  }

  // Atomically consume the challenge so it can never be replayed
  const { data: consumed } = await admin
    .from("auth_otp_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (!consumed) {
    return {
      step: "credentials",
      challengeId,
      error: "Kode OTP sudah pernah digunakan. Silakan login ulang.",
    };
  }

  // Mint official Supabase Auth session via admin magiclink hashed_token
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: challenge.email,
    });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    return {
      step: "credentials",
      challengeId,
      error: `Gagal membuat sesi login: ${linkErr?.message ?? "token kosong"}`,
    };
  }

  const ssrSupabase = await createClient();
  const { error: verifyErr } = await ssrSupabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (verifyErr) {
    return {
      step: "credentials",
      challengeId,
      error: `Verifikasi sesi gagal: ${verifyErr.message}`,
    };
  }

  await recordAuthAudit({
    userId: challenge.user_id,
    usernameAttempted: challenge.email,
    status: "success",
  });

  redirect(sanitizeNextPath(parsed.data.next));
}

export async function resendLoginOtpAction(
  challengeId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!challengeId) {
      return { ok: false, message: "Sesi OTP tidak ditemukan." };
    }
    const admin = createAdminClient();
    const { data: challenge } = await admin
      .from("auth_otp_challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("purpose", "login_otp")
      .is("consumed_at", null)
      .maybeSingle();

    if (!challenge) {
      return {
        ok: false,
        message: "Sesi OTP sudah tidak aktif. Silakan login ulang.",
      };
    }

    const elapsedMs = Date.now() - new Date(challenge.created_at).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
      return {
        ok: false,
        message: `Tunggu ${waitSec} detik sebelum meminta OTP baru.`,
      };
    }

    const bot = await getBotTokenFromSettings();
    if (!bot?.token) {
      return { ok: false, message: "Bot Telegram belum dikonfigurasi." };
    }

    const otp = generateOtpCode();
    const otpHash = hashOtpCode(challenge.id, otp);
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await admin
      .from("auth_otp_challenges")
      .update({
        otp_hash: otpHash,
        attempts: 0,
        created_at: nowIso,
        expires_at: expiresAt,
      })
      .eq("id", challenge.id);

    const tgRes = await sendTelegramMessage({
      token: bot.token,
      chatId: challenge.telegram_chat_id,
      text: [
        `🔐 <b>Kode OTP Login Baru — SalikurVouch</b>`,
        `<code>========================</code>`,
        `Akun   : <code>${escapeHtml(challenge.email)}</code>`,
        `Kode   : <code>${otp}</code>`,
        `Berlaku: 5 menit`,
        `<code>========================</code>`,
        `<i>Jangan bagikan kode OTP ini kepada siapa pun.</i>`,
      ].join("\n"),
    });

    if (!tgRes.ok) {
      return {
        ok: false,
        message: `Gagal kirim ulang OTP: ${tgRes.description ?? "Telegram API error"}`,
      };
    }

    return {
      ok: true,
      message: "Kode OTP baru telah dikirim ke Telegram Anda.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Gagal mengirim ulang OTP.",
    };
  }
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Option 1 Password Reset: sends standard Supabase recovery email.
 */
export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetEmailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Masukkan email yang valid.",
    };
  }

  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    origin ? { redirectTo: `${origin}/reset-password` } : undefined
  );

  if (error) {
    return { error: error.message };
  }

  return {
    success:
      "Jika email terdaftar, tautan reset password telah dikirim ke kotak masuk Anda.",
  };
}

/**
 * Option 2 Password Reset: verifies configured Telegram Owner (username + chat ID),
 * generates a strong random password, updates Supabase Auth, and delivers the new
 * password directly to the Owner's Telegram chat.
 */
export async function resetPasswordViaTelegramAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetTelegramSchema.safeParse({
    email: formData.get("email"),
    owner_username: formData.get("owner_username"),
    owner_telegram_id: formData.get("owner_telegram_id"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Lengkapi email, username Telegram Owner, dan ID Telegram Owner.",
    };
  }

  const bot = await getBotTokenFromSettings();
  if (!bot?.token || !bot.ownerTelegramId) {
    return {
      error:
        "Bot Telegram atau ID Telegram Owner belum dikonfigurasi di Pengaturan.",
    };
  }

  const inputOwnerId = Number(parsed.data.owner_telegram_id);
  const inputOwnerUsername = parsed.data.owner_username
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const configuredOwnerUsername = (bot.ownerUsername ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  if (
    inputOwnerId !== bot.ownerTelegramId ||
    (configuredOwnerUsername && inputOwnerUsername !== configuredOwnerUsername)
  ) {
    return {
      error:
        "Username Owner atau ID Telegram Owner tidak cocok dengan pengaturan sistem.",
    };
  }

  const admin = createAdminClient();
  const targetEmail = parsed.data.email.trim().toLowerCase();

  // Enforce 60-second cooldown against reset spam
  const { data: recentReset } = await admin
    .from("auth_otp_challenges")
    .select("created_at")
    .eq("email", targetEmail)
    .eq("purpose", "password_reset")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentReset) {
    const elapsed = Date.now() - new Date(recentReset.created_at).getTime();
    if (elapsed < RESET_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESET_COOLDOWN_MS - elapsed) / 1000);
      return {
        error: `Mohon tunggu ${waitSec} detik sebelum melakukan reset password kembali.`,
      };
    }
  }

  // Locate target admin user in Supabase Auth
  const { data: usersList, error: listErr } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (listErr) {
    return { error: `Gagal memeriksa akun admin: ${listErr.message}` };
  }

  const targetUser = usersList.users.find(
    (u) => (u.email ?? "").toLowerCase() === targetEmail
  );

  if (!targetUser) {
    return { error: "Email admin tidak ditemukan di sistem." };
  }

  // Ensure the target account is actually an admin/staff profile
  const { data: adminProfile } = await admin
    .from("admin_profiles")
    .select("id, username, role")
    .eq("id", targetUser.id)
    .maybeSingle();

  if (!adminProfile) {
    return { error: "Akun tersebut tidak terdaftar sebagai admin/operator." };
  }

  const newPassword = generateReadablePassword(12);
  const { error: updateErr } = await admin.auth.admin.updateUserById(
    targetUser.id,
    { password: newPassword }
  );

  if (updateErr) {
    return { error: `Gagal memperbarui password: ${updateErr.message}` };
  }

  const nowStr = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });

  const tgRes = await sendTelegramMessage({
    token: bot.token,
    chatId: bot.ownerTelegramId,
    text: [
      `🔑 <b>Reset Password Admin SalikurVouch</b>`,
      `<code>========================</code>`,
      `Email         : <code>${escapeHtml(targetEmail)}</code>`,
      `Role          : <code>${escapeHtml(adminProfile.role)}</code>`,
      `Password Baru : <code>${escapeHtml(newPassword)}</code>`,
      `Waktu         : ${escapeHtml(nowStr)} WIB`,
      `<code>========================</code>`,
      `<i>Gunakan password baru ini untuk login ke panel SalikurVouch.</i>`,
    ].join("\n"),
  });

  if (!tgRes.ok) {
    return {
      error: `Password sudah digenerate namun gagal dikirim ke Telegram: ${tgRes.description ?? "Telegram API error"}. Coba lagi atau gunakan opsi Email.`,
    };
  }

  await admin.from("auth_otp_challenges").insert({
    user_id: targetUser.id,
    email: targetEmail,
    purpose: "password_reset",
    otp_hash: hashOtpCode(targetUser.id, String(Date.now())),
    telegram_chat_id: bot.ownerTelegramId,
    attempts: 1,
    max_attempts: 1,
    expires_at: new Date().toISOString(),
    consumed_at: new Date().toISOString(),
  });

  return {
    success:
      "Password baru berhasil di-generate dan dikirim ke Telegram Owner. Silakan cek pesan Telegram Anda lalu login.",
  };
}
