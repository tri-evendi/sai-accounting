/**
 * Hero — dimensi pertama dari "pemasaran" (lihat `landing-scale.ts`).
 *
 * ══ INILAH SATU-SATUNYA TEKS SEBESAR INI DI SELURUH APLIKASI ═══════════════
 * Ukurannya `--sai-landing-font-size-hero`: 30px di ponsel, ≈53px di ≥576px —
 * di atas `fontSizeHeading1` AntD (38px), yang merupakan langit-langit setiap
 * kepala halaman internal. Itu disengaja dan itu yang membuatnya hero. Karena
 * variabelnya hanya dideklarasikan di dalam `[data-landing]`, ukuran ini tidak
 * bisa dicapai halaman lain dengan menyalin `style`-nya; ia harus mengimpor
 * `LandingShell`, dan impor itu ditolak penjaga.
 *
 * ══ DUA PINTU, DAN URUTANNYA DISENGAJA ═════════════════════════════════════
 * Daftar (primer) lebih dulu, Masuk (garis) sesudahnya — halaman ini ditulis
 * untuk orang yang BELUM punya akun; yang sudah punya tahu jalannya dan tetap
 * menemukannya di bilah atas. Keduanya `size="lg"` (48px), melebar penuh di
 * layar sempit karena kolomnya `flex-direction: column` di bawah 576px.
 */
import {
  LANDING_HERO_TITLE,
  LANDING_LEAD,
  LANDING_NOTE,
} from "@/components/landing/landing-scale";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function LandingHero() {
  const t = await getT();

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        /* Pita merek yang sama dengan panel brand layar masuk: satu token
           (`colorPrimaryBg`), lembut di kedua tema, dan tanpa satu pun elemen
           berlapis yang bisa memakan klik. */
        background: "var(--ant-color-primary-bg)",
        paddingBlock: "var(--sai-landing-rhythm)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
        }}
      >
        <div style={{ maxWidth: "var(--sai-landing-measure-copy)" }}>
          <h1 style={LANDING_HERO_TITLE}>{t("landing.heroHeading")}</h1>
          <p style={{ ...LANDING_LEAD, marginTop: "var(--ant-margin)" }}>
            {t("landing.heroBody")}
          </p>
          <div data-landing-actions="" style={{ marginTop: "var(--sai-landing-cta-space)" }}>
            <Button href="/register" size="lg">
              {t("landing.heroPrimary")}
            </Button>
            <Button href="/login" size="lg" variant="outline">
              {t("landing.heroSecondary")}
            </Button>
          </div>
          {/* Orang yang diundang rekan kerja TIDAK boleh mendaftar sendiri:
              akun kedua membuatnya jadi tenant baru, bukan anggota tim yang
              mengundangnya. Kalimat ini menahannya sebelum ia menekan tombol
              yang salah. */}
          <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin)" }}>
            {t("landing.heroNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
