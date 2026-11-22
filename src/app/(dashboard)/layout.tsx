import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveServer,
  listAccessibleServers,
} from "@/lib/server-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("username, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/login");
  }

  const staffRef = {
    userId: user.id,
    role: profile.role as "super_admin" | "admin" | "operator",
  };

  const [servers, activeServer] = await Promise.all([
    listAccessibleServers(staffRef),
    getActiveServer(undefined, staffRef),
  ]);

  return (
    <DashboardShell
      user={{
        email: user.email ?? "",
        username: profile.username,
        fullName: profile.full_name,
        role: profile.role,
      }}
      servers={servers}
      activeServerId={activeServer.id}
    >
      {children}
    </DashboardShell>
  );
}
