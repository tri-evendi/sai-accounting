/**
 * Kulit halaman pendaratan — akar `[data-landing]`, dan satu-satunya tempat
 * blok skala pemasaran dipasang.
 *
 * ══ KENAPA AKARNYA SEBUAH ATRIBUT, BUKAN SEKADAR `<div>` ═══════════════════
 * Seluruh skala pemasaran (`--sai-landing-*`) dideklarasikan pada selektor
 * `[data-landing]`, bukan `:root`. Akibatnya satu kalimat, dan itulah inti
 * issue #245: **skala itu tidak ada di dokumen mana pun yang tidak merender
 * komponen ini.** Halaman internal yang menyalin `fontSize:
 * "var(--sai-landing-font-size-hero)"` tidak mendapat hero — ia mendapat
 * properti yang tidak pernah teratasi. Untuk benar-benar mendapatkannya ia
 * harus mengimpor berkas ini, dan impor itu ditolak
 * `tests/landing-boundary.test.ts`.
 *
 * ══ `<style>`, BUKAN KELAS UTILITAS ════════════════════════════════════════
 * Empat hal yang gaya sebaris memang tidak bisa lakukan dipikul satu elemen
 * `<style href precedence>` (React 19 meniadakan gandanya dan menaikkannya ke
 * `<head>`): titik patah `@media`, `:hover`/`:focus`, `details[open]`, dan
 * `prefers-reduced-motion`. Isinya ada di `landing-scale.ts` supaya skala dan
 * aturannya dibaca sebagai satu keputusan.
 *
 * ══ TETAP SERVER COMPONENT ═════════════════════════════════════════════════
 * Halaman ini yang pertama dilihat orang yang belum punya akun. Memindahkan
 * apa pun di sini ke peramban berarti membayar hidrasi untuk pengunjung yang
 * mungkin tidak pernah mendaftar — `AMBANG_KLIEN` di
 * `tests/rsc-boundary.test.ts` yang menguncinya. Dua daun yang memang client
 * (`LocaleToggle`, `ThemeToggle`) dirender sebagai daun, tidak menarik apa pun
 * di atasnya.
 */
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { LANDING_STYLE } from "@/components/landing/landing-scale";
import { LandingWhatsappFab } from "@/components/landing/landing-whatsapp";
import { getT } from "@/lib/i18n/server";

export async function LandingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getT();

  return (
    <div
      data-landing=""
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--ant-color-bg-container)",
        color: "var(--ant-color-text)",
      }}
    >
      <style href="sai-landing" precedence="default">
        {LANDING_STYLE}
      </style>

      {/* Pengguna keyboard mendarat di tautan ini lebih dulu — tanpa itu ia
          harus menyusuri seluruh bilah atas sebelum sampai ke isi. Ia tak
          terlihat sampai difokuskan; keduanya keadaan CSS, jadi keduanya di
          blok gaya, bukan di sini. */}
      <a href="#isi" data-landing-skip="">
        {t("landing.skipToContent")}
      </a>

      <LandingNav />

      <main id="isi" style={{ flex: 1 }}>
        {children}
      </main>

      <LandingFooter />

      {/* Tombol WhatsApp melayang (#402) — di kulit, bukan di halaman, supaya
          `/` dan `/pricing` sama-sama memilikinya; ia `null` bila nomornya tidak
          disetel/sah, dan `display:none` di bawah 576px (`landing-scale.ts`). */}
      <LandingWhatsappFab />
    </div>
  );
}
