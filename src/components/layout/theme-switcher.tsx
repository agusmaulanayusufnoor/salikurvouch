"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ThemePreference = "auto" | "light" | "dark";

const STORAGE_KEY = "salikur-theme-mode";
const CHANGE_EVENT = "salikur-theme-change";

export function isNightHour(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 18 || hour < 6;
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "auto") return saved;
  return "auto";
}

function applyThemeToDocument(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const shouldBeDark =
    pref === "dark" || (pref === "auto" && isNightHour(new Date()));
  document.documentElement.classList.toggle("dark", shouldBeDark);
}

function setPreference(next: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, next);
  applyThemeToDocument(next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Mounted once in root layout. Automatically switches to Dark Mode at 18:00
 * and back to the default warm theme at 06:00 when preference is "auto".
 */
export function ThemeAutoScheduler() {
  const pref = useSyncExternalStore<ThemePreference>(
    subscribe,
    readPreference,
    () => "auto"
  );

  useEffect(() => {
    applyThemeToDocument(pref);
    if (pref !== "auto") return;
    const timer = setInterval(() => {
      applyThemeToDocument("auto");
    }, 30_000);
    return () => clearInterval(timer);
  }, [pref]);

  return null;
}

/**
 * Compact header switcher: cycles Auto (18:00) -> Gelap -> Terang.
 */
export function ThemeModeToggle() {
  const pref = useSyncExternalStore<ThemePreference>(
    subscribe,
    readPreference,
    () => "auto"
  );

  function cycleMode() {
    const order: ThemePreference[] = ["auto", "dark", "light"];
    const next = order[(order.indexOf(pref) + 1) % order.length];
    setPreference(next);
  }

  const label =
    pref === "auto"
      ? "Auto (18:00)"
      : pref === "dark"
        ? "Dark Mode"
        : "Tema Siang";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={cycleMode}
      title="Klik untuk ganti mode tema (Auto gelap otomatis pukul 18:00 / Manual Gelap / Manual Siang)"
      className="h-8 gap-1.5 text-xs"
    >
      {pref === "auto" ? (
        <Clock className="size-3.5 text-primary" />
      ) : pref === "dark" ? (
        <Moon className="size-3.5" />
      ) : (
        <Sun className="size-3.5 text-amber-600" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
