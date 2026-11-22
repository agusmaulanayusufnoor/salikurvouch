import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { getActiveServer } from "@/lib/server-context";
import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "./templates-client";

export const metadata = {
  title: "Template Pesan Bot Telegram",
};

export default async function TemplatesPage() {
  const staff = await getAuthenticatedStaff();
  if (!staff || (staff.role !== "super_admin" && staff.role !== "admin")) {
    redirect("/");
  }

  const activeServer = await getActiveServer(undefined, staff);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_message_templates")
    .select("key, label, content, updated_at")
    .eq("server_id", activeServer.id)
    .order("key", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Template Pesan Bot Telegram — {activeServer.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Kustomisasi pesan sapaan, info promo, footer voucher, dan instruksi
          deposit bot{" "}
          {activeServer.bot_username ? `@${activeServer.bot_username}` : ""}{" "}
          secara dinamis.
        </p>
      </div>

      <TemplatesClient key={activeServer.id} initialTemplates={data ?? []} />
    </div>
  );
}
