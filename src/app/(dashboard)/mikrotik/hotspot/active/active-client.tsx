"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { UserX } from "lucide-react";
import type { HotspotActiveSession } from "@/lib/mikrotik/types";
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
import { kickHotspotActiveAction } from "../../actions";

export function HotspotActiveClient({
  sessions,
}: {
  sessions: HotspotActiveSession[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleKick(s: HotspotActiveSession) {
    if (!confirm(`Putuskan sesi aktif user "${s.user}" (${s.address})?`)) return;
    startTransition(async () => {
      const res = await kickHotspotActiveAction(s.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>MAC Address</TableHead>
          <TableHead>Server</TableHead>
          <TableHead>Uptime / Sisa</TableHead>
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
              Tidak ada sesi Hotspot aktif saat ini.
            </TableCell>
          </TableRow>
        ) : (
          sessions.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs font-semibold">
                {s.user}
              </TableCell>
              <TableCell className="font-mono text-xs">{s.address}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {s.macAddress}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{s.server}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {s.uptime}{" "}
                {s.sessionTimeLeft ? (
                  <span className="text-muted-foreground">
                    ({s.sessionTimeLeft})
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleKick(s)}
                  disabled={isPending}
                >
                  <UserX className="size-3.5" />
                  Kick
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
