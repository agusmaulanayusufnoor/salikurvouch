import { createClient } from "@/lib/supabase/server";

export interface AuthenticatedStaff {
  userId: string;
  email: string;
  username: string;
  fullName: string | null;
  role: "super_admin" | "admin" | "operator";
  telegramId: number | null;
}

export async function getAuthenticatedStaff(): Promise<AuthenticatedStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("username, full_name, role, telegram_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role as AuthenticatedStaff["role"],
    telegramId: profile.telegram_id,
  };
}

export async function requireStaff(): Promise<AuthenticatedStaff> {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    throw new Error("UNAUTHORIZED");
  }
  return staff;
}

export async function requireAdmin(): Promise<AuthenticatedStaff> {
  const staff = await requireStaff();
  if (staff.role !== "super_admin" && staff.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return staff;
}
