"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Send,
} from "lucide-react";
import {
  requestPasswordResetAction,
  resetPasswordViaTelegramAction,
  type AuthActionState,
} from "../login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export default function ResetPasswordPage() {
  const [method, setMethod] = useState<"email" | "telegram">("telegram");

  const [emailState, emailFormAction, isEmailPending] = useActionState(
    requestPasswordResetAction,
    initialState
  );
  const [tgState, tgFormAction, isTgPending] = useActionState(
    resetPasswordViaTelegramAction,
    initialState
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg border-border/80">
        <CardHeader className="space-y-3 text-center">
          <div className="relative mx-auto flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Logo SalikurVouch"
              width={64}
              height={64}
              priority
              className="size-16 rounded-2xl shadow-md"
            />
            <span className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm">
              <KeyRound className="size-3.5" />
            </span>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription>
              Pilih metode reset password melalui Email atau kirim password baru
              otomatis ke Telegram Owner.
            </CardDescription>
          </div>
        </CardHeader>

        {/* Method Selector Tabs */}
        <div className="px-6 pb-2">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMethod("telegram")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                method === "telegram"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Send className="size-3.5 text-sky-600" />
              Telegram Admin
            </button>
            <button
              type="button"
              onClick={() => setMethod("email")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                method === "email"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="size-3.5 text-primary" />
              Via Email
            </button>
          </div>
        </div>

        {method === "telegram" ? (
          <form action={tgFormAction}>
            <CardContent className="space-y-4 pt-2">
              {tgState.error ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{tgState.error}</span>
                </div>
              ) : null}

              {tgState.success ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>{tgState.success}</span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="tg-email">Email Admin</Label>
                <Input
                  id="tg-email"
                  name="email"
                  type="email"
                  placeholder="Masukan Email"
                  required
                  disabled={isTgPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="owner-username">Username Telegram Owner</Label>
                <Input
                  id="owner-username"
                  name="owner_username"
                  type="text"
                  placeholder="Username owner (tanpa @)"
                  required
                  disabled={isTgPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="owner-id">ID Telegram Owner</Label>
                <Input
                  id="owner-id"
                  name="owner_telegram_id"
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 123456789"
                  className="font-mono"
                  required
                  disabled={isTgPending}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Sistem akan memverifikasi Username &amp; ID Telegram Owner yang
                terdaftar di Pengaturan, lalu men-generate password baru dan
                mengirimkannya langsung ke Telegram Owner.
              </p>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button type="submit" className="w-full" disabled={isTgPending}>
                {isTgPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Memproses &amp; Mengirim...
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Generate &amp; Kirim ke Telegram
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" asChild className="w-full">
                <Link href="/login">
                  <ArrowLeft className="size-4" />
                  Kembali ke halaman login
                </Link>
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form action={emailFormAction}>
            <CardContent className="space-y-4 pt-2">
              {emailState.error ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{emailState.error}</span>
                </div>
              ) : null}

              {emailState.success ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>{emailState.success}</span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email Admin</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Masukan Email"
                  required
                  disabled={isEmailPending}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Tautan pengaturan ulang password akan dikirim ke alamat email
                admin yang terdaftar.
              </p>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full"
                disabled={isEmailPending}
              >
                {isEmailPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    Kirim Tautan Reset ke Email
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" asChild className="w-full">
                <Link href="/login">
                  <ArrowLeft className="size-4" />
                  Kembali ke halaman login
                </Link>
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
