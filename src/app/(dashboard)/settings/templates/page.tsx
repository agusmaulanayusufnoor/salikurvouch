import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
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

  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_message_templates")
    .select("key, label, content, updated_at")
    .order("key", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Template Pesan Bot Telegram
        </h2>
        <p className="text-sm text-muted-foreground">
          Kustomisasi pesan sapaan, info promo, footer voucher, dan instruksi
          deposit bot secara dinamis.
        </p>
      </div>

      <TemplatesClient initialTemplates={data ?? []} />
    </div>
  );
}
