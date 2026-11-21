"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  Loader2,
} from "lucide-react";
import type { HotspotUser } from "@/lib/mikrotik/types";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  removeHotspotUserAction,
  saveHotspotUserAction,
  toggleHotspotUserAction,
} from "../../actions";

function fmtBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = b;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

export function HotspotUsersClient({
  users,
  profiles,
  servers,
}: {
  users: HotspotUser[];
  profiles: string[];
  servers: string[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HotspotUser | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      u.name.toLowerCase().includes(s) ||
      u.profile.toLowerCase().includes(s) ||
      u.comment.toLowerCase().includes(s)
    );
  });

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveHotspotUserAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleToggle(u: HotspotUser) {
    startTransition(async () => {
      const res = await toggleHotspotUserAction(u.id, !u.disabled);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleRemove(u: HotspotUser) {
    if (!confirm(`Hapus user Hotspot "${u.name}" dari MikroTik?`)) return;
    startTransition(async () => {
      const res = await removeHotspotUserAction(u.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari username, profile, comment..."
            className="pl-9"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Tambah User Hotspot
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username / Pass</TableHead>
            <TableHead>Profile &amp; Server</TableHead>
            <TableHead>Limit / Uptime</TableHead>
            <TableHead>Traffic (In / Out)</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.slice(0, 200).map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <p className="font-mono text-xs font-semibold">{u.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {u.password || "(kosong)"}
                </p>
              </TableCell>
              <TableCell className="text-xs">
                <Badge variant="secondary">{u.profile}</Badge>
                <p className="mt-0.5 text-muted-foreground">{u.server}</p>
              </TableCell>
              <TableCell className="font-mono text-xs">
                <p>{u.limitUptime || "∞"}</p>
                <p className="text-[11px] text-muted-foreground">
                  used: {u.uptime}
                </p>
              </TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">
                {fmtBytes(u.bytesIn)} / {fmtBytes(u.bytesOut)}
              </TableCell>
              <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                {u.comment || "-"}
              </TableCell>
              <TableCell>
                <Badge variant={u.disabled ? "destructive" : "success"}>
                  {u.disabled ? "disabled" : "active"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(u);
                      setOpen(true);
                    }}
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggle(u)}
                    disabled={isPending}
                    title={u.disabled ? "Aktifkan" : "Nonaktifkan"}
                  >
                    <Power className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(u)}
                    disabled={isPending}
                    title="Hapus"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit User ${editing.name}` : "Tambah User Hotspot"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  name="password"
                  defaultValue={editing?.password ?? ""}
                  placeholder="Kosongkan = sama dengan username"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Profile</Label>
                {profiles.length > 0 ? (
                  <Select
                    name="profile"
                    defaultValue={editing?.profile ?? profiles[0]}
                  >
                    {profiles.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    name="profile"
                    defaultValue={editing?.profile ?? "default"}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Server</Label>
                <Select name="server" defaultValue={editing?.server ?? "all"}>
                  <option value="all">all</option>
                  {servers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Limit Uptime</Label>
                <Input
                  name="limit_uptime"
                  defaultValue={editing?.limitUptime ?? ""}
                  placeholder="1d / 7d / 3h"
                />
              </div>
              <div className="space-y-2">
                <Label>Comment</Label>
                <Input name="comment" defaultValue={editing?.comment ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
