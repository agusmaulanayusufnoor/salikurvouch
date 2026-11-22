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
  User,
  Hash,
} from "lucide-react";
import {
  requestPasswordResetAction,
  resetPasswordViaTelegramAction,
  type AuthActionState,
} from "../login/actions";
import { GlassAuthShell } from "@/components/auth/glass-auth-shell";

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
    <GlassAuthShell>
      <section className="relative overflow-hidden rounded-[28px] border border-white/[0.16] bg-white/[0.065] shadow-[0_32px_90px_-20px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-2xl">
        {/* Specular top edge reflection */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent"
        />

        {/* Header */}
        <div className="px-7 pt-8 pb-5 text-center">
          <div className="relative mx-auto mb-4 inline-flex items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-125 rounded-full bg-cyan-400/25 blur-xl"
            />
            <Image
              src="/logo.png"
              alt="Logo SalikurVouch"
              width={64}
              height={64}
              priority
              className="relative size-16 rounded-2xl ring-1 ring-white/30 shadow-[0_14px_36px_-8px_rgba(6,182,212,0.55)]"
            />
            <span className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full border-2 border-[#081730] bg-sky-500 text-white shadow-lg">
              <KeyRound className="size-3.5" />
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white">
            Reset Password
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300/85">
            Pilih metode reset melalui Telegram Owner atau tautan Email admin.
          </p>
        </div>

        {/* Frosted Segmented Method Switcher */}
        <div className="px-7 pb-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/[0.12] bg-black/25 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMethod("telegram")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                method === "telegram"
                  ? "bg-gradient-to-r from-blue-600/90 to-cyan-500/90 text-white shadow-md"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Send className="size-3.5" />
              Telegram Admin
            </button>
            <button
              type="button"
              onClick={() => setMethod("email")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                method === "email"
                  ? "bg-gradient-to-r from-blue-600/90 to-cyan-500/90 text-white shadow-md"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Mail className="size-3.5" />
              Via Email
            </button>
          </div>
        </div>

        {method === "telegram" ? (
          <form action={tgFormAction} className="space-y-4 px-7 pb-7">
            {tgState.error ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-rose-100 backdrop-blur-md">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                <span>{tgState.error}</span>
              </div>
            ) : null}

            {tgState.success ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-100 backdrop-blur-md">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <span>{tgState.success}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="tg-email"
                className="block text-xs font-medium tracking-wide text-slate-200/90"
              >
                Email Admin
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="tg-email"
                  name="email"
                  type="email"
                  placeholder="Masukan Email"
                  required
                  disabled={isTgPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-4 pl-10 text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="owner-username"
                className="block text-xs font-medium tracking-wide text-slate-200/90"
              >
                Username Telegram Owner
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="owner-username"
                  name="owner_username"
                  type="text"
                  placeholder="Username owner (tanpa @)"
                  required
                  disabled={isTgPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-4 pl-10 text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="owner-id"
                className="block text-xs font-medium tracking-wide text-slate-200/90"
              >
                ID Telegram Owner
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="owner-id"
                  name="owner_telegram_id"
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 123456789"
                  required
                  disabled={isTgPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-4 pl-10 font-mono text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
                />
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-300/75">
              Password acak baru akan di-generate otomatis dan dikirim langsung
              ke chat Telegram Owner yang terdaftar di Pengaturan.
            </p>

            <button
              type="submit"
              disabled={isTgPending}
              className="relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(6,182,212,0.6)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
              />
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
            </button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              Kembali ke halaman login
            </Link>
          </form>
        ) : (
          <form action={emailFormAction} className="space-y-4 px-7 pb-7">
            {emailState.error ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-rose-100 backdrop-blur-md">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                <span>{emailState.error}</span>
              </div>
            ) : null}

            {emailState.success ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-100 backdrop-blur-md">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <span>{emailState.success}</span>
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
                  placeholder="Masukan Email"
                  required
                  disabled={isEmailPending}
                  className="glass-input h-11 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] pr-4 pl-10 text-sm text-white placeholder:text-slate-400/80 transition-all outline-none focus:border-cyan-400/75 focus:bg-white/[0.09] focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
                />
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-300/75">
              Tautan pengaturan ulang password akan dikirim ke alamat email
              admin yang terdaftar.
            </p>

            <button
              type="submit"
              disabled={isEmailPending}
              className="relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(6,182,212,0.6)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
              />
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
            </button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              Kembali ke halaman login
            </Link>
          </form>
        )}
      </section>
    </GlassAuthShell>
  );
}
