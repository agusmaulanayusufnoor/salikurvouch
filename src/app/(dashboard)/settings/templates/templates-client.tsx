"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteTemplateAction, upsertTemplateAction } from "../actions";

export interface BotTemplateItem {
  key: string;
  label: string;
  content: string;
  updated_at: string;
}

const PLACEHOLDERS = [
  "{{username}}",
  "{{saldo}}",
  "{{voucher_code}}",
  "{{profile}}",
  "{{dns_name}}",
  "{{owner_username}}",
  "{{max_deposit}}",
];

function renderPreview(content: string): string {
  return content
    .replaceAll("{{username}}", "@agusmyn")
    .replaceAll("{{saldo}}", "Rp 150.000")
    .replaceAll("{{voucher_code}}", "x7k9m")
    .replaceAll("{{profile}}", "5000")
    .replaceAll("{{dns_name}}", "wifi.salikur.net")
    .replaceAll("{{owner_username}}", "agusmyn")
    .replaceAll("{{max_deposit}}", "Rp 1.000.000");
}

export function TemplatesClient({
  initialTemplates,
}: {
  initialTemplates: BotTemplateItem[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedKey, setSelectedKey] = useState(
    initialTemplates[0]?.key ?? ""
  );
  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  const [editTitle, setEditTitle] = useState(selected?.label ?? "");
  const [editContent, setEditContent] = useState(selected?.content ?? "");
  const [showPreview, setShowPreview] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [isPending, startTransition] = useTransition();

  function selectTemplate(tpl: BotTemplateItem) {
    setSelectedKey(tpl.key);
    setEditTitle(tpl.label);
    setEditContent(tpl.content);
  }

  function handleSaveCurrent(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const fd = new FormData();
    fd.set("key", selected.key);
    fd.set("label", editTitle);
    fd.set("content", editContent);

    startTransition(async () => {
      const res = await upsertTemplateAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setTemplates((prev) =>
          prev.map((t) =>
            t.key === selected.key
              ? {
                  ...t,
                  label: editTitle,
                  content: editContent,
                  updated_at: new Date().toISOString(),
                }
              : t
          )
        );
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("key", newKey);
    fd.set("label", newTitle);
    fd.set("content", newContent);

    startTransition(async () => {
      const res = await upsertTemplateAction(fd);
      if (res.ok) {
        toast.success(res.message);
        const created: BotTemplateItem = {
          key: newKey.trim(),
          label: newTitle.trim(),
          content: newContent.trim(),
          updated_at: new Date().toISOString(),
        };
        setTemplates((prev) => [...prev, created]);
        selectTemplate(created);
        setNewKey("");
        setNewTitle("");
        setNewContent("");
        setNewOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleDelete(key: string) {
    if (!confirm(`Hapus template "${key}"?`)) return;
    startTransition(async () => {
      const res = await deleteTemplateAction(key);
      if (res.ok) {
        toast.success(res.message);
        const remaining = templates.filter((t) => t.key !== key);
        setTemplates(remaining);
        if (remaining[0]) {
          selectTemplate(remaining[0]);
        } else {
          setSelectedKey("");
        }
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Daftar Template</CardTitle>
            <CardDescription>{templates.length} template aktif</CardDescription>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Baru
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Template Pesan</DialogTitle>
                <DialogDescription>
                  Buat template kustom yang dapat dipakai oleh bot Telegram.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tpl-key">Key Unik (snake_case)</Label>
                  <Input
                    id="tpl-key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="promo_weekend"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-title">Judul</Label>
                  <Input
                    id="tpl-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Pesan Promo Akhir Pekan"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-content">Isi Pesan (HTML Telegram)</Label>
                  <Textarea
                    id="tpl-content"
                    rows={5}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    Simpan Template
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => selectTemplate(tpl)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                tpl.key === selectedKey
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/60"
              }`}
            >
              <p className="text-sm font-medium">{tpl.label}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {tpl.key}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Editor Template Pesan</CardTitle>
              <CardDescription>
                Mendukung format HTML Telegram (`&lt;b&gt;`, `&lt;i&gt;`,
                `&lt;code&gt;`, `&lt;a&gt;`).
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
            >
              <Eye className="size-4" />
              {showPreview ? "Sembunyikan Preview" : "Preview"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selected ? (
            <form onSubmit={handleSaveCurrent} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Variabel cepat:
                </span>
                {PLACEHOLDERS.map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => setEditContent((c) => `${c}${ph}`)}
                    className="rounded border bg-muted/60 px-2 py-0.5 font-mono text-xs hover:bg-muted"
                  >
                    {ph}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Key</Label>
                  <Input value={selected.key} disabled className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Judul Template</Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-content">Konten Pesan</Label>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {editContent.length} / 4096
                  </Badge>
                </div>
                <Textarea
                  id="edit-content"
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="font-mono text-xs"
                  required
                />
              </div>

              {showPreview ? (
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Simulasi Tampilan Pesan Telegram
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {renderPreview(editContent)}
                  </pre>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(selected.key)}
                  disabled={isPending}
                >
                  <Trash2 className="size-4" />
                  Hapus
                </Button>

                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Pilih template di sebelah kiri atau buat template baru.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
