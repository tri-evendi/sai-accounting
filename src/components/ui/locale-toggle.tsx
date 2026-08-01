"use client";

/**
 * Pemilih bahasa untuk layar PRA-APLIKASI.
 *
 * ── Kenapa ada di sini sama sekali ─────────────────────────────────────────
 * Pemilih bahasa sudah lama ada, tetapi hidup di dalam `UserMenu` — chrome
 * yang baru muncul SETELAH masuk. Akibatnya orang yang tidak membaca bahasa
 * Indonesia tidak bisa mengganti bahasa layar masuk, satu-satunya layar yang
 * harus ia lewati untuk sampai ke tempat pemilihnya berada. Server actionnya
 * bahkan sudah ditulis dengan keadaan ini di kepala — komentarnya berbunyi
 * "halaman login pun berhak berganti bahasa" — hanya UI-nya yang tak pernah
 * dipasang di sana.
 *
 * ── Kenapa chip, bukan dropdown seperti di UserMenu ────────────────────────
 * Tiga bahasa. Dropdown menyembunyikan tiga pilihan di balik satu ketukan dan
 * menuntut mesin overlay (fokus, Escape, klik-di-luar) yang di sini tidak
 * membeli apa pun. Kodenya juga tidak dibagi dengan UserMenu dengan sengaja:
 * yang di sana adalah baris menu `menuitemradio` di dalam dropdown akun, yang
 * di sini kelompok sakelar berdiri sendiri — bentuk yang sama-sama benar di
 * tempatnya masing-masing, dan menyatukannya hanya melahirkan satu komponen
 * bercabang dua.
 *
 * Kodenya DITULIS PENDEK (`ID`/`EN`/`中`) karena berdiri di sudut layar, tapi
 * nama panjang bahasanya — dalam bahasanya sendiri, `LOCALE_LABELS` — tetap
 * dibawa `aria-label` dan `title`, jadi tidak ada yang harus menebak arti
 * singkatannya.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";
import { useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Singkatan sesudut-layar. Sengaja bukan bendera: bahasa bukan negara. */
const SHORT: Record<Locale, string> = {
  id: "ID",
  en: "EN",
  zh: "中",
};

export function LocaleToggle({ className }: { className?: string }) {
  const active = useLocale();
  const router = useRouter();
  const t = useT();
  const [switching, startSwitching] = useTransition();

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t("userMenu.language")}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <Button
            key={locale}
            type="button"
            variant={isActive ? "secondary" : "ghost"}
            size="icon"
            disabled={switching}
            aria-pressed={isActive}
            aria-label={LOCALE_LABELS[locale]}
            title={LOCALE_LABELS[locale]}
            onClick={() =>
              startSwitching(async () => {
                await setLocale(locale);
                /*
                 * Kamus dipilih di SERVER (root layout membaca cookie), jadi
                 * menulis cookie saja tidak mengubah apa pun di layar. `refresh`
                 * meminta server merender ulang dengan kamus yang baru —
                 * tanpa memuat ulang halaman penuh, sehingga apa yang sudah
                 * diketik di formulir masuk tidak hilang.
                 */
                router.refresh();
              })
            }
          >
            <span className="text-xs font-semibold">{SHORT[locale]}</span>
          </Button>
        );
      })}
    </div>
  );
}
