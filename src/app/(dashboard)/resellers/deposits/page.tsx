import { createClient } from "@/lib/supabase/server";
import { DepositsClient } from "./deposits-client";

export const metadata = {
  title: "Antrean Request Deposit",
};

export default async function DepositsPage() {
  const supabase = await createClient();

  const [reqRes, resellersRes] = await Promise.all([
    supabase
      .from("deposit_requests")
      .select(
        "id, amount, approved_amount, status, proof_file_path, processed_by, processed_at, created_at, resellers(username, telegram_id)"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("resellers")
      .select("id, username, telegram_id")
      .eq("status", "active")
      .order("username", { ascending: true }),
  ]);

  const requests = (reqRes.data ?? []).map((row) => {
    const r = Array.isArray(row.resellers) ? row.resellers[0] : row.resellers;
    return {
      id: row.id,
      amount: Number(row.amount),
      approved_amount:
        row.approved_amount !== null ? Number(row.approved_amount) : null,
      status: row.status,
      proof_file_path: row.proof_file_path,
      processed_by: row.processed_by,
      processed_at: row.processed_at,
      created_at: row.created_at,
      reseller_username: r?.username ?? "unknown",
      reseller_telegram_id: r?.telegram_id ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Antrean Request Deposit
        </h2>
        <p className="text-sm text-muted-foreground">
          Verifikasi bukti transfer reseller dan setujui penambahan saldo secara
          atomik.
        </p>
      </div>

      <DepositsClient
        requests={requests}
        resellers={resellersRes.data ?? []}
      />
    </div>
  );
}
