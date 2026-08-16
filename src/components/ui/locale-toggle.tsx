"use client";

/**
 * Pemilih bahasa untuk layar PRA-APLIKASI — di atas Ant Design `Segmented`
 * (issue #191).
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
 * ── Kenapa kelompok sakelar, bukan dropdown seperti di UserMenu ───────────
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
 * dibawa `title` dan teks visual-tersembunyi, jadi tidak ada yang harus menebak
 * arti singkatannya dan pembaca layar tetap mengumumkan "Bahasa Indonesia",
 * bukan "I D".
 *
 * ── Yang TIDAK berubah: jalur pindah bahasanya ───────────────────────────
 * Kamus dipilih di SERVER (root layout membaca cookie), jadi menulis cookie
 * saja tidak mengubah apa pun di layar. Urutannya tetap `setLocale()` lalu
 * `router.refresh()` — dan `AntdProvider` ikut berpindah karena locale AntD
 * datang sebagai prop dari root layout yang baru saja dirender ulang. Satu
 * penulisan cookie, satu sumber kebenaran, dua lapisan berpindah bersama.
 */

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "antd";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";
import { useLocale, useT } from "@/lib/i18n/client";

/** Singkatan sesudut-layar. Sengaja bukan bendera: bahasa bukan negara. */
const SHORT: Record<Locale, string> = {
  id: "ID",
  en: "EN",
  zh: "中",
};

/** Terbaca pembaca layar, tak memakan ruang di layar. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function LocaleToggle({
  locale,
  label,
}: {
  /**
   * Bahasa aktif & nama kelompoknya sebagai PROP — untuk pemanggil yang
   * berdiri di luar `LocaleProvider` (issue #399): halaman pendaratan hidup di
   * root layout pemasaran yang SENGAJA tidak memasang provider itu, sebab
   * provider itu menyerialkan seluruh kamus ke setiap pengunjung anonim.
   * `useLocale()` di luar provider jatuh ke bahasa BAWAAN (pengunjung Inggris
   * melihat "ID" tersorot) dan `useT()` mengembalikan kuncinya sendiri — jadi
   * di sana keduanya wajib diberikan. Di dalam app keduanya dibiarkan kosong
   * dan konteks yang menjawab.
   */
  locale?: Locale;
  label?: string;
} = {}) {
  const contextLocale = useLocale();
  const active = locale ?? contextLocale;
  const router = useRouter();
  const t = useT();
  const name = useId();
  const [switching, startSwitching] = useTransition();

  return (
    <Segmented<Locale>
      /* Nama kelompoknya diganti karena bawaan rc-segmented adalah string
         Inggris yang ditanam di kodenya ("segmented control") — ia akan
         diumumkan apa adanya justru di pemilih BAHASA. */
      aria-label={label ?? t("userMenu.language")}
      name={name}
      value={active}
      disabled={switching}
      onChange={(locale) =>
        startSwitching(async () => {
          await setLocale(locale);
          /*
           * `refresh`, bukan `location.reload()`: server merender ulang dengan
           * kamus yang baru tanpa memuat ulang halaman penuh, sehingga apa
           * yang sudah diketik di formulir masuk tidak hilang.
           */
          router.refresh();
        })
      }
      options={LOCALES.map((locale) => ({
        value: locale,
        label: (
          <>
            <span aria-hidden="true">{SHORT[locale]}</span>
            <span style={VISUALLY_HIDDEN}>{LOCALE_LABELS[locale]}</span>
          </>
        ),
        title: LOCALE_LABELS[locale],
      }))}
    />
  );
}
