"use client";

import { useActionState, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Smartphone,
  Download,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import {
  loginAction,
  verifyLoginOtpAction,
  resendLoginOtpAction,
  type AuthActionState,
} from "./actions";
import { GlassAuthShell } from "@/components/auth/glass-auth-shell";

const initialCredState: AuthActionState = { step: "credentials" };
const initialOtpState: AuthActionState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";
  const apkBuilding = searchParams.get("apk") === "building";

  const [credState, credFormAction, isCredPending] = useActionState(
    loginAction,
    initialCredState
  );
  const [otpState, otpFormAction, isOtpPending] = useActionState(
    verifyLoginOtpAction,
    initialOtpState
  );

  const [showPassword, setShowPassword] = useState(false);
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
    <div className="space-y-4">
      {/* Main Optical Frosted Glass Panel */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/[0.16] bg-white/[0.065] shadow-[0_32px_90px_-20px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-2xl">
        {/* Specular top glass edge highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent"
        />

        {/* Header */}
        <div className="px-7 pt-8 pb-6 text-center">
          <div className="relative mx-auto mb-4 inline-flex items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-125 rounded-full bg-cyan-400/25 blur-xl"
            />
            <Image
              src="/logo-round.png"
              alt="Logo SalikurVouch"
              width={76}
              height={76}
              priority
              className="relative size-[76px] rounded-full ring-2 ring-white/25 shadow-[0_14px_36px_-8px_rgba(6,182,212,0.6)]"
            />
            {isOtpStep ? (
              <span className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full border-2 border-[#081730] bg-emerald-500 text-white shadow-lg">
                <KeyRound className="size-3.5" />
              </span>
            ) : null}
          </div>

          <h1 className="text-[26px] font-bold tracking-tight text-white">
            {isOtpStep ? "Verifikasi OTP" : "SalikurVouch"}
          </h1>
          {isOtpStep ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300/85">
              Masukkan 6 digit kode OTP yang dikirim ke Telegram{" "}
              {credState.maskedTarget ?? "Admin"}
            </p>
          ) : null}
        </div>

        {/* Form Area */}
        {!isOtpStep ? (
          <form
            key={backToCredKey}
            action={credFormAction}
            className="space-y-4 px-7 pb-7"
          >
            <input type="hidden" name="next" value={nextPath} />

            {activeError ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-rose-100 backdrop-blur-md">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                <span>{activeError}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium tracking-wide text-slate-200/90"
              >
                Email Admin
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Masukan Email"
                  required
                  disabled={isCredPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-4 pl-10 text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium tracking-wide text-slate-200/90"
                >
                  Password
                </label>
                <Link
                  href="/reset-password"
                  className="text-xs font-medium text-cyan-300 transition-colors hover:text-cyan-200 hover:underline"
                >
                  Lupa password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  disabled={isCredPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-11 pl-10 text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Sembunyikan password" : "Tampilkan password"
                  }
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isCredPending}
                className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(6,182,212,0.6)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
                />
                {isCredPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengirim OTP ke Telegram...
                  </>
                ) : (
                  <>
                    Masuk ke Dashboard
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form action={otpFormAction} className="space-y-4 px-7 pb-7">
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

            {credState.info && !resendFeedback ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-cyan-400/30 bg-cyan-500/12 px-3.5 py-2.5 text-xs leading-relaxed text-cyan-100 backdrop-blur-md">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                <span>{credState.info}</span>
              </div>
            ) : null}

            {resendFeedback ? (
              <div
                className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed backdrop-blur-md ${
                  resendFeedback.ok
                    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                    : "border-rose-400/35 bg-rose-500/15 text-rose-100"
                }`}
              >
                {resendFeedback.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                )}
                <span>{resendFeedback.message}</span>
              </div>
            ) : null}

            {activeError ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-rose-100 backdrop-blur-md">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                <span>{activeError}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="otp"
                className="block text-xs font-medium tracking-wide text-slate-200/90"
              >
                Kode OTP Telegram (6 Digit)
              </label>
              <input
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
                className="h-14 w-full rounded-xl border border-white/[0.18] bg-white/[0.07] px-4 text-center font-mono text-2xl font-bold tracking-[0.45em] text-white placeholder:text-slate-500 transition-all outline-none focus:border-cyan-400/80 focus:bg-white/[0.11] focus:ring-2 focus:ring-cyan-400/25 disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={isOtpPending}
              className="relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(6,182,212,0.6)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
              />
              {isOtpPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Memverifikasi OTP...
                </>
              ) : (
                "Verifikasi & Masuk"
              )}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDismissedChallengeId(activeChallengeId);
                  setResendFeedback(null);
                  setBackToCredKey((k) => k + 1);
                }}
                disabled={isOtpPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" />
                Kembali
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resending || isOtpPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
              >
                {resending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Kirim Ulang OTP
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Frosted Glass Android APK Download Dock */}
      {apkBuilding ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100 backdrop-blur-md">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <span>
            File APK Android sedang dalam proses build &amp; rilis. Silakan
            coba unduh kembali beberapa menit lagi.
          </span>
        </div>
      ) : null}

      <a
        href="/api/download/apk"
        download="SalikurVouch.apk"
        className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[0.13] bg-white/[0.05] px-4 py-3 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.16)] backdrop-blur-xl transition-all hover:border-cyan-400/40 hover:bg-white/[0.09]"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/15 text-emerald-300">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              SalikurVouch Android
            </p>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-all group-hover:border-cyan-300/50 group-hover:bg-cyan-400/20 group-hover:text-white">
          <Download className="size-3.5" />
          Download APK
        </span>
      </a>
    </div>
  );
}

export default function LoginPage() {
  return (
    <GlassAuthShell>
      <Suspense
        fallback={
          <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-10 text-center text-sm text-slate-300 backdrop-blur-2xl">
            Memuat panel login...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </GlassAuthShell>
  );
}
