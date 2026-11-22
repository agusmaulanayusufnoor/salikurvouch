import { redirect } from "next/navigation";
import { getAuthenticatedStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DatabaseMaintenancePanel,
  type CutoffPreview,
  type DatabaseStorageStats,
} from "@/components/settings/database-maintenance-panel";

export const metadata = {
  title: "Database, Storage Free Tier & Backup",
};

export const dynamic = "force-dynamic";

export default async function DatabaseSettingsPage() {
  const staff = await getAuthenticatedStaff();
  if (!staff || (staff.role !== "super_admin" && staff.role !== "admin")) {
    redirect("/");
  }

  let initialStats: DatabaseStorageStats | null = null;
  let initialCutoffPreview: CutoffPreview | null = null;
  try {
    const admin = createAdminClient();
    const [statsRes, previewRes] = await Promise.all([
      admin.rpc("rpc_get_database_storage_stats"),
      admin.rpc("rpc_preview_cutoff_data", { p_months: 12 }),
    ]);
    if (statsRes.data && typeof statsRes.data === "object") {
      initialStats = statsRes.data as unknown as DatabaseStorageStats;
    }
    if (previewRes.data && typeof previewRes.data === "object") {
      initialCutoffPreview = previewRes.data as unknown as CutoffPreview;
    }
  } catch (err) {
    console.error("[settings/database] failed to fetch initial stats:", err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Database, Storage Free Tier &amp; Backup
        </h2>
        <p className="text-sm text-muted-foreground">
          Pantau kuota Supabase Free Tier (Database 500 MB &amp; Storage 1 GB),
          status Keep-Alive anti auto-pause 7 hari, backup/restore snapshot, dan
          pembersihan data cutoff (6 bulan / 1 tahun).
        </p>
      </div>

      <DatabaseMaintenancePanel
        initialStats={initialStats}
        initialCutoffPreview={initialCutoffPreview}
      />
    </div>
  );
}
