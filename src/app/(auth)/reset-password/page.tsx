"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { requestPasswordResetAction, type AuthActionState } from "../login/actions";
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
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg border-border/80">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription>
              Masukkan email akun admin untuk menerima tautan pengaturan ulang
              password.
            </CardDescription>
          </div>
        </CardHeader>

        <form action={formAction}>
          <CardContent className="space-y-4">
            {state.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}

            {state.success ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{state.success}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email Admin</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                disabled={isPending}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                "Kirim Tautan Reset"
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
      </Card>
    </main>
  );
}
