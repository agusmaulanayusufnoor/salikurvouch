import { createClient } from "@/lib/supabase/server";
import { formatDateTimeID } from "@/lib/utils";
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
import { BroadcastClient } from "./broadcast-client";

export const metadata = {
  title: "Broadcast Telegram",
};

export default async function BroadcastPage() {
  const supabase = await createClient();
  const [resellersRes, logsRes] = await Promise.all([
    supabase
      .from("resellers")
      .select("id, telegram_id, username")
      .eq("status", "active")
      .order("username", { ascending: true }),
    supabase
      .from("broadcast_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Broadcast Pesan &amp; Foto Telegram
        </h2>
        <p className="text-sm text-muted-foreground">
          Kirim pengumuman teks HTML maupun gambar promo ke satu atau seluruh
          reseller aktif.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BroadcastClient resellers={resellersRes.data ?? []} />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Riwayat Broadcast</CardTitle>
            <CardDescription>20 pengiriman terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Terkirim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logsRes.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Belum ada riwayat broadcast.
                    </TableCell>
                  </TableRow>
                ) : (
                  (logsRes.data ?? []).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeID(log.created_at)}
                        <p className="mt-0.5 line-clamp-1 text-foreground">
                          {log.content || `(${log.message_type})`}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.target_scope}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span className="text-emerald-600">{log.success_count}</span>
                        {log.failed_count > 0 ? (
                          <span className="text-destructive">
                            /{log.failed_count} fail
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
