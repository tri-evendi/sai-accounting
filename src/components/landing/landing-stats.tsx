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
 * hero, masih di atas langit-langit app), label pindah ke BAWAH angka, dan
 * ketiganya berdiri tanpa kotak — di atas pita hero yang sudah berwarna,
 * kotak bernada di atas nada hanya saling meniadakan (`landing.md` §"warnai
 * pitanya ATAU kartunya, tidak keduanya").
 */
import { LANDING_NOTE, landingGrid } from "@/components/landing/landing-scale";
import { BUSINESS_MODULES } from "@/lib/business-modules";
import { CURRENCIES } from "@/lib/constants";
import { LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

/**
 * Nilai fakta — `--sai-landing-font-size-section`, sama dengan judul `<h2>`.
 *
 * Sengaja tidak lebih besar: yang paling besar di halaman ini tetap kalimat
 * hero (`landing.md` §"Nominal paket tidak dibesarkan ke skala hero" berlaku
 * dengan alasan yang sama untuk angka mana pun).
 */
const NILAI: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-section)",
  fontWeight:
    "var(--sai-landing-font-weight-display)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.2,
};

/**
 * Nilai yang BUKAN bilangan (daftar mata uang) — satu tingkat di bawah, dan
 * tanpa `tabular-nums`: angka bertabel untuk teks yang bukan angka hanya
 * merenggangkan hurufnya tanpa menyejajarkan apa pun.
 */
const NILAI_DAFTAR: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: "var(--ant-font-weight-strong)",
  lineHeight: 1.2,
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
   */
  const facts = [
    {
      value: String(BUSINESS_MODULES.length),
      label: t("landing.factModules"),
      numeric: true,
    },
    {
      value: String(LOCALES.length),
      label: t("landing.factLanguages"),
      numeric: true,
    },
    {
      value: CURRENCIES.join(" · "),
      label: t("landing.factCurrencies"),
      numeric: false,
    },
  ];

  return (
    <dl style={{ ...landingGrid(3, 160), margin: 0 }}>
      {facts.map((fact) => (
        /* Urutan SUMBER tetap `<dt>` lalu `<dd>` — itu yang membuat daftar
           definisi sah bagi pembaca layar (istilah dulu, penjelasannya
           sesudahnya). Yang membalik urutan TAMPAK adalah `column-reverse`:
           di layar angka berdiri di atas labelnya, sebab itu urutan yang
           dibaca mata di strip bukti. */
        <div
          key={fact.label}
          style={{ display: "flex", flexDirection: "column-reverse" }}
        >
          <dt style={{ ...LANDING_NOTE, fontSize: "var(--ant-font-size)" }}>
            {fact.label}
          </dt>
          <dd style={fact.numeric ? NILAI : NILAI_DAFTAR}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
