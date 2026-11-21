import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SalikurVouch — Manajemen Voucher MikroTik, Reseller & PPOB",
    template: "%s | SalikurVouch",
  },
  description:
    "Platform manajemen voucher Hotspot MikroTik (ROS v6 & v7), reseller saldo, bot Telegram, dan Portal Pulsa PPOB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
