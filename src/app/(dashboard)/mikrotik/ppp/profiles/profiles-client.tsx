"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { PppProfile } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addPppProfileAction, removePppProfileAction } from "../../actions";

export function PppProfilesClient({
  profiles,
  pools,
  queues,
}: {
  profiles: PppProfile[];
  pools: string[];
  queues: string[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addPppProfileAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleRemove(p: PppProfile) {
    if (!confirm(`Hapus PPP Profile "${p.name}"?`)) return;
    startTransition(async () => {
      const res = await removePppProfileAction(p.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Tambah PPP Profile
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah PPP Profile</DialogTitle>
              <DialogDescription>
                Mendukung auto-move ke profile isolir via script `on-up`
                scheduler.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nama Profile</Label>
                  <Input name="name" placeholder="paket-10mbps" required />
                </div>
                <div className="space-y-2">
                  <Label>Rate Limit</Label>
                  <Input name="rate_limit" placeholder="5M/10M" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Local Address</Label>
                  <Input name="local_address" placeholder="10.10.0.1" />
                </div>
                <div className="space-y-2">
                  <Label>Remote Address Pool</Label>
                  {pools.length > 0 ? (
                    <Select name="remote_address" defaultValue="">
                      <option value="">(Kosong)</option>
                      {pools.map((pool) => (
                        <option key={pool} value={pool}>
                          {pool}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input name="remote_address" placeholder="pool-pppoe" />
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>DNS Server</Label>
                  <Input name="dns_server" placeholder="8.8.8.8,1.1.1.1" />
                </div>
                <div className="space-y-2">
                  <Label>Parent Queue</Label>
                  <Select name="parent_queue" defaultValue="none">
                    <option value="none">none</option>
                    {queues.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Auto-Move Validity (Opsional)</Label>
                  <Input name="validity" placeholder="30d" />
                </div>
                <div className="space-y-2">
                  <Label>Target Profile Expired (Opsional)</Label>
                  <Input name="expired_profile" placeholder="isolir" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Comment</Label>
                <Input name="comment" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Simpan PPP Profile
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama Profile</TableHead>
            <TableHead>Local / Remote</TableHead>
            <TableHead>Rate Limit</TableHead>
            <TableHead>DNS</TableHead>
            <TableHead>Auto-Move `on-up`</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-semibold">{p.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {p.localAddress || "-"} → {p.remoteAddress || "-"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {p.rateLimit || "Unlimited"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {p.dnsServer || "-"}
              </TableCell>
              <TableCell>
                <Badge variant={p.onUp ? "success" : "secondary"}>
                  {p.onUp ? "Configured" : "None"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(p)}
                  disabled={isPending}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
