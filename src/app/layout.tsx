import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeAutoScheduler } from "@/components/layout/theme-switcher";
import "./globals.css";

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var mode = localStorage.getItem('salikur-theme-mode') || 'auto';
    var h = new Date().getHours();
    var isDark = mode === 'dark' || (mode === 'auto' && (h >= 18 || h < 6));
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: "SalikurVouch — Manajemen Voucher MikroTik, Reseller & PPOB",
    template: "%s | SalikurVouch",
  },
  description:
    "Platform manajemen voucher Hotspot MikroTik (ROS v6 & v7), reseller saldo, bot Telegram, dan Portal Pulsa PPOB.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeAutoScheduler />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
