import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface AuthenticatedAdmin {
  userId: string;
  email: string;
  username: string;
  role: "super_admin" | "admin";
}

/**
 * Verifies the current request has an authenticated Supabase session
 * AND belongs to a `super_admin` or `admin` in `admin_profiles`.
 */
export async function requireAdminApi(): Promise<
  { ok: true; admin: AuthenticatedAdmin } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized: silakan login terlebih dahulu." },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("username, role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    (profile.role !== "super_admin" && profile.role !== "admin")
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Forbidden: fitur ini hanya dapat diakses oleh Super Admin atau Admin.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    admin: {
      userId: user.id,
      email: user.email ?? "",
      username: profile.username,
      role: profile.role,
    },
  };
}
