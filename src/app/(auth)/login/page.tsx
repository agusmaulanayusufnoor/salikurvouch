"use client";

import { useActionState, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  Wifi,
  Loader2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Smartphone,
  Download,
} from "lucide-react";
import {
  loginAction,
  verifyLoginOtpAction,
  resendLoginOtpAction,
  type AuthActionState,
} from "./actions";
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

const initialCredState: AuthActionState = { step: "credentials" };
const initialOtpState: AuthActionState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";

  const [credState, credFormAction, isCredPending] = useActionState(
    loginAction,
    initialCredState
  );
  const [otpState, otpFormAction, isOtpPending] = useActionState(
    verifyLoginOtpAction,
    initialOtpState
  );

  // Track if user clicked "Kembali" from OTP screen to restart credentials step
  const [backToCredKey, setBackToCredKey] = useState(0);
  const [dismissedChallengeId, setDismissedChallengeId] = useState<
    string | null
  >(null);
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const otpReturnedToCredForCurrentChallenge =
    otpState.step === "credentials" &&
    otpState.challengeId === credState.challengeId;

  const activeChallengeId =
    credState.step === "otp" &&
    credState.challengeId &&
    credState.challengeId !== dismissedChallengeId &&
    !otpReturnedToCredForCurrentChallenge
      ? credState.challengeId
      : null;

  const isOtpStep = Boolean(activeChallengeId);
  const activeError = isOtpStep
    ? otpState.challengeId === activeChallengeId
      ? otpState.error
      : undefined
    : otpReturnedToCredForCurrentChallenge
      ? otpState.error
      : credState.error;

  async function handleResendOtp() {
    if (!activeChallengeId) return;
    setResending(true);
    setResendFeedback(null);
    try {
      const res = await resendLoginOtpAction(activeChallengeId);
      setResendFeedback(res);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <Card className="w-full shadow-lg border-border/80">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            {isOtpStep ? (
              <KeyRound className="size-6" />
            ) : (
              <Wifi className="size-6" />
            )}
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              {isOtpStep ? "Verifikasi OTP Telegram" : "SalikurVouch"}
            </CardTitle>
            <CardDescription>
              {isOtpStep
                ? `Masukkan 6 digit kode OTP yang dikirim ke Telegram ${credState.maskedTarget ?? "Admin"}`
                : "Masuk ke panel admin Voucher MikroTik, Reseller & PPOB"}
            </CardDescription>
          </div>
        </CardHeader>

        {!isOtpStep ? (
          <form key={backToCredKey} action={credFormAction}>
            <input type="hidden" name="next" value={nextPath} />
            <CardContent className="space-y-4">
              {activeError ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{activeError}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Email Admin</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Masukan Email"
                  required
                  disabled={isCredPending}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/reset-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Lupa password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  disabled={isCredPending}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button type="submit" className="w-full" disabled={isCredPending}>
                {isCredPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengirim OTP ke Telegram...
                  </>
                ) : (
                  "Masuk ke Dashboard"
                )}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                Dilindungi Supabase Auth, OTP Telegram &amp; Audit Log
              </p>
            </CardFooter>
          </form>
        ) : (
          <form action={otpFormAction}>
            <input
              type="hidden"
              name="challenge_id"
              value={activeChallengeId ?? ""}
            />
            <input
              type="hidden"
              name="next"
              value={credState.next ?? nextPath}
            />
            <CardContent className="space-y-4">
              {credState.info && !resendFeedback ? (
                <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>{credState.info}</span>
                </div>
              ) : null}

              {resendFeedback ? (
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                    resendFeedback.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {resendFeedback.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{resendFeedback.message}</span>
                </div>
              ) : null}

              {activeError ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{activeError}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="otp">Kode OTP (6 Digit)</Label>
                <Input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  required
                  disabled={isOtpPending}
                  className="text-center font-mono text-2xl tracking-[0.45em]"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button type="submit" className="w-full" disabled={isOtpPending}>
                {isOtpPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Memverifikasi OTP...
                  </>
                ) : (
                  "Verifikasi & Masuk"
                )}
              </Button>

              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDismissedChallengeId(activeChallengeId);
                    setResendFeedback(null);
                    setBackToCredKey((k) => k + 1);
                  }}
                  disabled={isOtpPending}
                >
                  <ArrowLeft className="size-3.5" />
                  Kembali
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResendOtp}
                  disabled={resending || isOtpPending}
                >
                  {resending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Kirim Ulang OTP
                </Button>
              </div>
            </CardFooter>
          </form>
        )}
      </Card>

      {/* Download Android APK Card below Login Form */}
      <div className="rounded-xl border border-border/80 bg-card/85 p-3.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Smartphone className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                SalikurVouch Android
              </p>
              <p className="text-xs text-muted-foreground">
                Aplikasi WebView ringan untuk HP Android (.APK)
              </p>
            </div>
          </div>

          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href="/api/download/apk" download="SalikurVouch.apk">
              <Download className="size-4" />
              Download APK
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Memuat...</div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
