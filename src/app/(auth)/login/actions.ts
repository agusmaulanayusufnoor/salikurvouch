"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const loginSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
  password: z.string().min(6, "Password minimal 6 karakter."),
  next: z.string().optional(),
});

const resetSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
});

export type AuthActionState = {
  error?: string;
  success?: string;
};

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
      error: parsed.error.issues[0]?.message ?? "Input login tidak valid.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
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
      error: "Email atau password salah. Silakan coba lagi.",
    };
  }

  // Verify the authenticated user has an admin/operator profile
  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      userId: data.user.id,
      usernameAttempted: parsed.data.email,
      status: "failed",
    });
    return {
      error:
        "Akun Anda tidak memiliki profil admin/operator. Hubungi Super Admin.",
    };
  }

  await recordAuthAudit({
    userId: data.user.id,
    usernameAttempted: parsed.data.email,
    status: "success",
  });

  const safeNext =
    parsed.data.next &&
    parsed.data.next.startsWith("/") &&
    !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : "/";

  redirect(safeNext);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({
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
