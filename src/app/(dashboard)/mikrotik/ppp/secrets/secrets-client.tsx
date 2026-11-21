"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Power, Loader2 } from "lucide-react";
import type { PppSecret } from "@/lib/mikrotik/types";
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
  removePppSecretAction,
  savePppSecretAction,
  togglePppSecretAction,
} from "../../actions";

const PPP_SERVICES = ["any", "pppoe", "l2tp", "ovpn", "pptp", "sstp", "async"];

export function PppSecretsClient({
  secrets,
  profiles,
}: {
  secrets: PppSecret[];
  profiles: string[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PppSecret | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = secrets.filter((s) => {
    const kw = q.trim().toLowerCase();
    if (!kw) return true;
    return (
      s.name.toLowerCase().includes(kw) ||
      s.profile.toLowerCase().includes(kw) ||
      s.comment.toLowerCase().includes(kw)
    );
  });

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await savePppSecretAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleToggle(s: PppSecret) {
    startTransition(async () => {
      const res = await togglePppSecretAction(s.id, !s.disabled);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  function handleRemove(s: PppSecret) {
    if (!confirm(`Hapus PPP secret "${s.name}"?`)) return;
    startTransition(async () => {
      const res = await removePppSecretAction(s.id);
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
            placeholder="Cari secret, profile, comment..."
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
          Tambah PPP Secret
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name / Password</TableHead>
            <TableHead>Service &amp; Profile</TableHead>
            <TableHead>Local / Remote IP</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <p className="font-mono text-xs font-semibold">{s.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {s.password}
                </p>
              </TableCell>
              <TableCell className="text-xs">
                <Badge variant="outline">{s.service}</Badge>{" "}
                <Badge variant="secondary">{s.profile}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {s.localAddress || "-"} → {s.remoteAddress || "-"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {s.comment || "-"}
              </TableCell>
              <TableCell>
                <Badge variant={s.disabled ? "destructive" : "success"}>
                  {s.disabled ? "disabled" : "active"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(s);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggle(s)}
                    disabled={isPending}
                  >
                    <Power className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(s)}
                    disabled={isPending}
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
              {editing ? `Edit PPP Secret ${editing.name}` : "Tambah PPP Secret"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  name="password"
                  defaultValue={editing?.password ?? ""}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Service</Label>
                <Select name="service" defaultValue={editing?.service ?? "pppoe"}>
                  {PPP_SERVICES.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </Select>
              </div>
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
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Local Address (Opsional)</Label>
                <Input
                  name="local_address"
                  defaultValue={editing?.localAddress ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label>Remote Address (Opsional)</Label>
                <Input
                  name="remote_address"
                  defaultValue={editing?.remoteAddress ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Comment</Label>
              <Input name="comment" defaultValue={editing?.comment ?? ""} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Simpan Secret
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
