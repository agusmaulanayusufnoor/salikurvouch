"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { HotspotProfile } from "@/lib/mikrotik/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import {
  addHotspotProfileAction,
  removeHotspotProfileAction,
} from "../../actions";

export function HotspotProfilesClient({
  profiles,
  queues,
}: {
  profiles: HotspotProfile[];
  queues: string[];
}) {
  const [open, setOpen] = useState(false);
  const [lockMac, setLockMac] = useState(true);
  const [transparentProxy, setTransparentProxy] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("lock_mac", String(lockMac));
    fd.set("transparent_proxy", String(transparentProxy));

    startTransition(async () => {
      const res = await addHotspotProfileAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleRemove(p: HotspotProfile) {
    if (!confirm(`Hapus profile Hotspot "${p.name}"?`)) return;
    startTransition(async () => {
      const res = await removeHotspotProfileAction(p.id);
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
              Tambah Profile Hotspot
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah Hotspot User Profile</DialogTitle>
              <DialogDescription>
                Otomatis menyisipkan script `on-login` untuk validity &amp; lock MAC
                (kompatibel ROS v6 &amp; v7).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nama Profile</Label>
                  <Input name="name" placeholder="5000-2d" required />
                </div>
                <div className="space-y-2">
                  <Label>Rate Limit (TX/RX)</Label>
                  <Input name="rate_limit" placeholder="2M/5M" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Shared Users</Label>
                  <Input name="shared_users" type="number" min={1} defaultValue={1} />
                </div>
                <div className="space-y-2">
                  <Label>Validity (Masa Tenggang)</Label>
                  <Input name="validity" placeholder="1d / 7d / 30d" />
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Lock MAC Address</span>
                  <Switch checked={lockMac} onCheckedChange={setLockMac} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Transparent Proxy</span>
                  <Switch
                    checked={transparentProxy}
                    onCheckedChange={setTransparentProxy}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Simpan Profile
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
            <TableHead>Rate Limit</TableHead>
            <TableHead>Shared Users</TableHead>
            <TableHead>Parent Queue</TableHead>
            <TableHead>Script `on-login`</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-semibold">{p.name}</TableCell>
              <TableCell className="font-mono text-xs">
                {p.rateLimit || "Unlimited"}
              </TableCell>
              <TableCell className="font-mono text-xs">{p.sharedUsers}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.parentQueue || "none"}
              </TableCell>
              <TableCell>
                <Badge variant={p.onLogin ? "success" : "secondary"}>
                  {p.onLogin ? "Configured" : "None"}
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
