"use client";

/**
 * Pemilih tema — tiga tombol berdampingan, bukan satu tombol yang berputar.
 *
 * Tombol berputar (terang → gelap → sistem → terang) hemat ruang dan menyimpan
 * dua kebiasaan buruk sekaligus: pilihannya tidak terlihat sebelum ditekan,
 * dan mencapai pilihan ketiga menuntut menekan dua kali sambil menghafal
 * urutannya. Tiga tombol menunjukkan seluruh pilihan dan mana yang aktif.
 *
 * `aria-pressed` per tombol (bukan `aria-current`): ini kelompok sakelar, dan
 * pembaca layar mengumumkan "ditekan" untuk yang aktif. Keadaan aktif tidak
 * pernah disampaikan warna saja — tombol aktif memakai varian `secondary`
 * yang berbeda BIDANG-nya, dan tiap tombol membawa `aria-label` berteks.
 */

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { useTheme } from "@/lib/theme/client";
import { THEMES, type Theme } from "@/lib/theme/config";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

const ICONS: Record<Theme, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<Theme, DictionaryKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, changeTheme } = useTheme();
  const t = useT();

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t("theme.label")}
    >
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const active = theme === option;
        return (
          <Button
            key={option}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon"
            aria-pressed={active}
            aria-label={t(LABELS[option])}
            title={t(LABELS[option])}
            onClick={() => changeTheme(option)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
