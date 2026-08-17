/**
 * Strip fakta — tiga angka yang menjawab "seberapa banyak", DI HERO.
 *
 * ══ KENAPA PINDAH KE SINI DARI `LandingModules` ════════════════════════════
 * Ketiga angka ini adalah bukti terbaik yang dimiliki halaman ini: semuanya
 * DIHITUNG dari registri (`BUSINESS_MODULES.length`, `LOCALES.length`,
 * `CURRENCIES`), jadi tak satu pun bisa berbohong. Sampai perubahan ini
 * letaknya di dalam pita "Apa saja yang ada di dalam" — sekitar sepertiga
 * halaman ke bawah, yaitu SESUDAH orang memutuskan untuk terus menggulung atau
 * tidak.
 *
 * Pola pendaratan untuk produk seperti ini (Trust & Authority) menaruh bukti
 * TEPAT SESUDAH hero, sebelum penjelasan apa pun. Di sinilah ia sekarang.
 *
 * ══ DAN KENAPA BENTUKNYA BERUBAH ═══════════════════════════════════════════
 * Di tempat lamanya ketiga kotak ini berukuran, berjari-jari, dan berirama
 * sama persis dengan sepuluh kartu modul di bawahnya — sehingga terbaca sebagai
 * TIGA MODUL LAGI, bukan sebagai angka. Nilainya pun `fontSizeHeading3` (24px)
 * dengan label di ATAS angka.
 *
 * Yang berubah di sini: angkanya naik ke skala seksi (satu tingkat di bawah
 * hero, masih di atas langit-langit app), label pindah ke BAWAH angka. Sampai
 * #402 ketiganya berdiri tanpa kotak, dengan alasan "kotak bernada di atas
 * nada saling meniadakan" — alasan yang benar untuk `fill` (14%, 1,03:1) dan
 * TERUKUR tidak berlaku untuk pil `chip` (28%): lihat catatan di `NILAI`.
 *
 * ══ INI SATU-SATUNYA STRIP (#397) ══════════════════════════════════════════
 * Sampai #397 ketiga angka ini muncul DUA KALI identik — di sini dan sebagai
 * `<dl>` "Semua paket mendapat" di seksi harga. Yang tersisa di harga kini
 * satu kalimat (`pricingAllNote`, angkanya tetap dihitung dari registri yang
 * sama). Jangan menghidupkan salinan keduanya: bukti yang diulang berhenti
 * terbaca sebagai bukti dan mulai terbaca sebagai pengisi.
 */
import {
  AppstoreOutlined,
  DollarOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import type { CSSProperties } from "react";

import {
  LANDING_NOTE,
  landingChip,
  landingGlyph,
} from "@/components/landing/landing-scale";
import { BUSINESS_MODULES } from "@/lib/business-modules";
import { CURRENCIES } from "@/lib/constants";
import { LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

/**
 * Nilai fakta — `fontSizeHeading2` (30px), tebal, `tabular-nums`.
 *
 * ══ #402: PIL BERNADA, IKON + ANGKA BESAR ══════════════════════════════════
 * Tiga angka teks polos adalah bobot visual paling lemah di halaman ini
 * (tinjauan visual 2026-08-17). Kini tiap fakta berdiri di dalam PIL
 * `chip-brand` (28%) berisi ikon di kiri dan angka besar + label di kanan,
 * ketiganya SATU baris tepat di atas garis bawah hero.
 *
 * ⚠ Nada di atas nada — DIUKUR, bukan dilarang mentah. `landing.md` §"warnai
 * pitanya ATAU kartunya" lahir dari kartu `fill` (14%) di atas pita sehue
 * (1,03:1). Pil ini `chip` (28%), dan terhadap gradien hero terukur
 * 1,22–1,31:1 (terang) · 1,23–1,31:1 (gelap) — di atas lantai 1,05 "nada ini
 * benar-benar ada di layar", dan JUSTRU lebih terlihat daripada permukaan
 * `surface` yang di tema gelap hanya 1,01:1 terhadap `band-brand`. Teks di
 * atas `chip-brand` 11,89 / 9,43:1, glif `colorPrimary` 7,82 / 4,16:1
 * (`tests/landing-colors.test.ts`). Pil ini tidak memikul tombol, jadi batas
 * "tanpa tombol primer di atas chip-*" tidak tersentuh.
 *
 * Angkanya tetap satu tingkat di bawah hero: yang paling besar di halaman ini
 * tetap kalimat hero (`landing.md` §"Nominal paket tidak dibesarkan ke skala
 * hero" berlaku dengan alasan yang sama untuk angka mana pun).
 */
const NILAI: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-2)",
  fontWeight:
    "var(--sai-landing-font-weight-display)" as CSSProperties["fontWeight"],
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
};

/**
 * Nilai yang BUKAN bilangan (daftar mata uang) — satu tingkat di bawah, dan
 * tanpa `tabular-nums`: angka bertabel untuk teks yang bukan angka hanya
 * merenggangkan hurufnya tanpa menyejajarkan apa pun.
 */
const NILAI_DAFTAR: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: "var(--ant-font-weight-strong)",
  lineHeight: 1.2,
};

/** Kotak ikon di dalam pil — 40px, glif `colorPrimary` di atas chip merek. */
const IKON: CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "var(--sai-landing-surface)",
  color: landingGlyph("brand"),
  fontSize: "var(--ant-font-size-xl)",
};

export async function LandingStats() {
  const t = await getT();

  /*
   * ⚠ `numeric: false` untuk mata uang, dan itu memperbaiki cacat nyata.
   *
   * Ketiga nilai ini dulu memakai satu gaya yang sama — skala judul seksi,
   * tebal. Untuk "10" dan "3" itu benar; untuk "USD · CNY · IDR" tidak: rangkai
   * tiga kode mata uang di ukuran itu menjadi elemen TERLEBAR dan paling
   * berteriak di seluruh strip, sehingga yang paling menarik mata justru fakta
   * yang paling tidak penting di antara ketiganya. Hierarkinya terbalik.
   *
   * Yang membedakannya bukan warna melainkan PERAN: dua yang pertama adalah
   * bilangan (dan karena itu `tabular-nums`, sesuai MASTER.md), yang ketiga
   * adalah daftar. Daftar diturunkan satu tingkat ke skala isi.
   *
   * ══ SLOT KELAK: lencana PSE Komdigi ═══════════════════════════════════════
   * Barisnya `flex-wrap`, tiap pil `flex: 1 1 <basis>` — butir KEEMPAT (mis.
   * lencana pendaftaran PSE) tinggal ditambahkan ke daftar ini dan barisnya
   * melebar atau patah dengan sendirinya, tanpa kolom mati. Lencana itu TIDAK
   * ditampilkan sebelum pendaftarannya ada (`landing.md` §KLAIM HARUS PUNYA
   * SUMBER) — yang disiapkan di sini hanya tata letaknya.
   */
  const facts = [
    {
      icon: AppstoreOutlined,
      value: String(BUSINESS_MODULES.length),
      label: t("landing.factModules"),
      numeric: true,
    },
    {
      icon: TranslationOutlined,
      value: String(LOCALES.length),
      label: t("landing.factLanguages"),
      numeric: true,
    },
    {
      icon: DollarOutlined,
      value: CURRENCIES.join(" · "),
      label: t("landing.factCurrencies"),
      numeric: false,
    },
  ];

  return (
    <dl
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--ant-margin-sm)",
        margin: 0,
      }}
    >
      {facts.map((fact) => (
        /* Urutan SUMBER tetap `<dt>` lalu `<dd>` — itu yang membuat daftar
           definisi sah bagi pembaca layar (istilah dulu, penjelasannya
           sesudahnya). Yang membalik urutan TAMPAK adalah `column-reverse`:
           di layar angka berdiri di atas labelnya, sebab itu urutan yang
           dibaca mata di strip bukti. */
        <div
          key={fact.label}
          style={{
            /* Basis 200px: pil paling lebar ("USD · CNY · IDR" + label) ±190px.
               Di 320px (288 tersedia) ketiganya bertumpuk; di 576px (528)
               dua + satu; mulai ~660px sebaris. Terukur, bukan diperkirakan. */
            flex: "1 1 200px",
            display: "flex",
            alignItems: "center",
            gap: "var(--ant-margin-sm)",
            minWidth: 0,
            paddingInline: "var(--ant-padding-sm)",
            paddingBlock: "var(--ant-padding-xs)",
            borderRadius: "var(--sai-landing-radius-control)",
            background: landingChip("brand"),
          }}
        >
          <span aria-hidden="true" style={IKON}>
            <fact.icon />
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column-reverse",
              minWidth: 0,
            }}
          >
            <dt style={{ ...LANDING_NOTE, fontSize: "var(--ant-font-size)" }}>
              {fact.label}
            </dt>
            <dd style={fact.numeric ? NILAI : NILAI_DAFTAR}>{fact.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
