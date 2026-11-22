import type { ReactNode } from "react";

export function GlassAuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#040b18] px-4 py-10 text-slate-100 selection:bg-cyan-400/30 selection:text-white">
      {/* Layered optical depth background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        {/* Base directional ocean-slate illumination */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(29,78,216,0.34),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(6,182,212,0.28),_transparent_55%),linear-gradient(160deg,#030816_0%,#07152e_48%,#041224_100%)]" />

        {/* Luminous floating refractive orbs anchored to Salikur 21 palette */}
        <div className="animate-glass-orb absolute -top-28 -left-24 h-[460px] w-[460px] rounded-full bg-blue-600/35 blur-[110px]" />
        <div className="animate-glass-orb-reverse absolute -right-24 -bottom-28 h-[440px] w-[440px] rounded-full bg-cyan-400/30 blur-[120px]" />
        <div className="animate-glass-orb absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/15 blur-[95px]" />

        {/* Bespoke subtle WiFi signal arcs etched in background */}
        <svg
          className="absolute top-1/2 left-1/2 h-[980px] w-[980px] -translate-x-1/2 -translate-y-1/2 opacity-[0.14]"
          viewBox="0 0 800 800"
          fill="none"
        >
          <circle
            cx="400"
            cy="400"
            r="170"
            stroke="url(#salikurArc)"
            strokeWidth="1"
            strokeDasharray="6 10"
          />
          <circle
            cx="400"
            cy="400"
            r="265"
            stroke="url(#salikurArc)"
            strokeWidth="1"
          />
          <circle
            cx="400"
            cy="400"
            r="360"
            stroke="url(#salikurArc)"
            strokeWidth="0.75"
            strokeDasharray="3 12"
          />
          <defs>
            <linearGradient
              id="salikurArc"
              x1="120"
              y1="120"
              x2="680"
              y2="680"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#38BDF8" stopOpacity="0.65" />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.18" />
              <stop offset="1" stopColor="#2563EB" stopOpacity="0.5" />
            </linearGradient>
          </defs>
        </svg>

        {/* Fine architectural micro-dot grid */}
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(186, 230, 253, 0.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Foreground content */}
      <div className="relative z-10 w-full max-w-[430px]">{children}</div>
    </main>
  );
}
