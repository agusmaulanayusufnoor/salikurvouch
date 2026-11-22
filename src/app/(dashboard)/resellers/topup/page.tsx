import { createClient } from "@/lib/supabase/server";
import { getActiveServer } from "@/lib/server-context";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TopupClient } from "./topup-client";

export const metadata = {
  title: "Top Up & Top Down Saldo",
};

export default async function TopupPage({
  searchParams,
}: {
  searchParams: Promise<{ tid?: string }>;
}) {
  const sp = await searchParams;
  const [supabase, activeServer] = await Promise.all([
    createClient(),
    getActiveServer(),
  ]);
  const serverId = activeServer?.id ?? "";

  const [resellersRes, recentRes] = await Promise.all([
    supabase
      .from("resellers")
      .select("id, telegram_id, username, balance, status")
      .eq("server_id", serverId)
      .order("username", { ascending: true }),
    supabase
      .from("wallet_transactions")
      .select(
        "id, seller_name, telegram_id, tx_type, amount, balance_after, topup_by, notes, created_at"
      )
      .eq("server_id", serverId)
      .in("tx_type", ["topup", "topdown"])
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const resellers = (resellersRes.data ?? []).map((r) => ({
    ...r,
    balance: Number(r.balance),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Top Up &amp; Top Down Saldo
        </h2>
        <p className="text-sm text-muted-foreground">
          Tambah atau tarik saldo reseller secara atomik dengan notifikasi
          Telegram otomatis.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopupClient resellers={resellers} initialTelegramId={sp.tid} />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Riwayat Top Up / Down Terbaru</CardTitle>
            <CardDescription>15 transaksi saldo terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reseller</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentRes.data ?? []).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        @{tx.seller_name || tx.telegram_id}
                      </p>
                      <Badge
                        variant={tx.tx_type === "topup" ? "success" : "warning"}
                        className="mt-0.5 text-[10px]"
                      >
                        {tx.tx_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {Number(tx.amount) >= 0 ? "+" : ""}
                      {formatIDR(Number(tx.amount))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeID(tx.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
