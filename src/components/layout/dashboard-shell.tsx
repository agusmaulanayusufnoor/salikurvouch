"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Ticket,
  List,
  Package,
  History,
  Send,
  Smartphone,
  BarChart3,
  Tag,
  Wifi,
  Network,
  Activity,
  Settings,
  MessageSquareText,
  Webhook,
  LogOut,
  Menu,
  X,
  ScrollText,
  FileClock,
  Terminal,
  Laptop,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/app/(auth)/login/actions";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Utama",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Reseller & Saldo",
    items: [
      { label: "Daftar Reseller", href: "/resellers", icon: Users },
      { label: "Top Up / Top Down", href: "/resellers/topup", icon: Wallet },
      { label: "Antrean Deposit", href: "/resellers/deposits", icon: History },
    ],
  },
  {
    title: "Voucher Hotspot",
    items: [
      { label: "List Semua Voucher", href: "/vouchers/list", icon: List },
      { label: "Voucher Aktif Login", href: "/vouchers/active", icon: Wifi },
      { label: "Generate & Kirim", href: "/vouchers/send", icon: Ticket },
      { label: "Riwayat Batch & PDF", href: "/vouchers/batches", icon: Package },
      { label: "Paket Voucher", href: "/vouchers/packages", icon: Tag },
      { label: "Riwayat Mutasi", href: "/vouchers/history", icon: History },
      { label: "Broadcast Telegram", href: "/broadcast", icon: Send },
    ],
  },
  {
    title: "Log",
    items: [
      { label: "Hotspot Log", href: "/logs/hotspot", icon: ScrollText },
      { label: "User Log", href: "/logs/users", icon: FileClock },
    ],
  },
  {
    title: "Portal Pulsa (PPOB)",
    items: [
      { label: "Transaksi PPOB", href: "/ppob/transactions", icon: Smartphone },
      { label: "Laporan Laba", href: "/ppob/reports", icon: BarChart3 },
      { label: "Katalog Harga", href: "/ppob/catalog", icon: Tag },
    ],
  },
  {
    title: "MikroTik RouterOS",
    items: [
      { label: "PPP Secrets", href: "/mikrotik/ppp/secrets", icon: Network },
      { label: "PPP Active", href: "/mikrotik/ppp/active", icon: Activity },
      { label: "PPP Profiles", href: "/mikrotik/ppp/profiles", icon: Tag },
      { label: "Traffic & Netwatch", href: "/mikrotik/traffic", icon: Activity },
      { label: "DHCP Leases", href: "/mikrotik/dhcp-leases", icon: Laptop },
      { label: "IP Bindings", href: "/mikrotik/ip-bindings", icon: Link2 },
      { label: "Ping & Traceroute", href: "/mikrotik/tools", icon: Terminal },
    ],
  },
  {
    title: "Konfigurasi",
    items: [
      {
        label: "Router, Bot & PPOB",
        href: "/settings",
        icon: Settings,
        adminOnly: true,
      },
      {
        label: "Template Pesan",
        href: "/settings/templates",
        icon: MessageSquareText,
        adminOnly: true,
      },
      {
        label: "Webhook Telegram",
        href: "/settings/webhook",
        icon: Webhook,
        adminOnly: true,
      },
    ],
  },
];

export interface DashboardUser {
  email: string;
  username: string;
  fullName: string | null;
  role: string;
}

export function DashboardShell({
  user,
  children,
}: {
  user: DashboardUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user.role === "super_admin" || user.role === "admin";

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-5">
        <Image
          src="/logo.png"
          alt="Logo SalikurVouch"
          width={36}
          height={36}
          priority
          className="size-9 shrink-0 rounded-lg shadow-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">
            SalikurVouch
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            MikroTik &amp; PPOB Suite
          </p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || isAdmin
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {group.title}
              </p>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {user.fullName || user.username}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {user.email}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
            {user.role.replace("_", " ")}
          </Badge>
        </div>

        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            Keluar
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[80vw] shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Tutup menu"
            >
              <X className="size-5" />
            </Button>
            {sidebarContent}
          </div>
        </div>
      ) : null}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu navigasi"
            >
              <Menu className="size-5" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-foreground sm:text-base">
                Panel Operasional SalikurVouch
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success">Supabase Connected</Badge>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
