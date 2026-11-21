"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Unplug } from "lucide-react";
import type { PppActiveSession } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { disconnectPppActiveAction } from "../../actions";

export function PppActiveClient({
  sessions,
}: {
  sessions: PppActiveSession[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleDisconnect(s: PppActiveSession) {
    if (!confirm(`Putuskan koneksi PPP "${s.name}" (${s.address})?`)) return;
    startTransition(async () => {
      const res = await disconnectPppActiveAction(s.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Caller ID</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>Uptime</TableHead>
          <TableHead className="text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={6}
              className="py-8 text-center text-muted-foreground"
            >
              Tidak ada koneksi PPP aktif saat ini.
            </TableCell>
          </TableRow>
        ) : (
          sessions.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs font-semibold">
                {s.name}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{s.service}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {s.callerId || "-"}
              </TableCell>
              <TableCell className="font-mono text-xs">{s.address}</TableCell>
              <TableCell className="font-mono text-xs">{s.uptime}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDisconnect(s)}
                  disabled={isPending}
                >
                  <Unplug className="size-3.5" />
                  Disconnect
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
