"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, ImageIcon, Users, User, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  sendBroadcastAction,
  type BroadcastActionResult,
} from "./actions";

export function BroadcastClient({
  resellers,
}: {
  resellers: Array<{ id: string; telegram_id: number; username: string }>;
}) {
  const [targetType, setTargetType] = useState<"all" | "single">("all");
  const [targetResellerId, setTargetResellerId] = useState(
    resellers[0]?.id ?? ""
  );
  const [messageText, setMessageText] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [result, setResult] = useState<BroadcastActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxChars = hasPhoto ? 1024 : 4096;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("target_type", targetType);
    if (targetType === "single") {
      fd.set("target_reseller_id", targetResellerId);
    }

    startTransition(async () => {
      const res = await sendBroadcastAction(fd);
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Kirim Pesan / Foto Broadcast</CardTitle>
          <CardDescription>
            Throttling otomatis (~20 pesan/detik) mencegah error HTTP 429 Telegram.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((v) => !v)}
        >
          <Eye className="size-4" />
          {showPreview ? "Tutup Preview" : "Preview"}
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setTargetType("all")}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left ${
                targetType === "all"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <Users className="size-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Semua Reseller Aktif</p>
                <p className="text-xs text-muted-foreground">
                  {resellers.length} penerima aktif
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTargetType("single")}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left ${
                targetType === "single"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <User className="size-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Satu Reseller Tertentu</p>
                <p className="text-xs text-muted-foreground">
                  Pesan langsung (personal)
                </p>
              </div>
            </button>
          </div>

          {targetType === "single" ? (
            <div className="space-y-2">
              <Label htmlFor="bc-reseller">Pilih Reseller</Label>
              <Select
                id="bc-reseller"
                value={targetResellerId}
                onChange={(e) => setTargetResellerId(e.target.value)}
              >
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.username} ({r.telegram_id})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="bc-photo" className="flex items-center gap-1.5">
              <ImageIcon className="size-4" />
              Lampiran Foto Opsional (PNG/JPG/WEBP, maks 5 MB)
            </Label>
            <Input
              id="bc-photo"
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) =>
                setHasPhoto(Boolean(e.target.files && e.target.files.length > 0))
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bc-msg">
                {hasPhoto
                  ? "Caption Foto (HTML Telegram)"
                  : "Isi Pesan Broadcast (HTML Telegram)"}
              </Label>
              <Badge
                variant={messageText.length > maxChars ? "destructive" : "outline"}
                className="font-mono text-[11px]"
              >
                {messageText.length} / {maxChars}
              </Badge>
            </div>
            <Textarea
              id="bc-msg"
              name="message_text"
              rows={6}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Contoh: <b>Info Pemeliharaan Jaringan</b>&#10;Jaringan akan restart pukul 02:00 WIB."
            />
          </div>

          {showPreview ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Preview Teks
              </p>
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {messageText || "(kosong)"}
              </pre>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isPending || messageText.length > maxChars}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Kirim Broadcast
          </Button>
        </form>

        {result?.failures && result.failures.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Penerima gagal ({result.failures.length}):</p>
            <ul className="mt-1 list-disc pl-4">
              {result.failures.map((f) => (
                <li key={f.username}>
                  @{f.username}: {f.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
