/**
 * Jalan masuk Kamus Istilah dari BERANDA (issue #355).
 *
 * Kamus Istilah adalah aset terbaik aplikasi ini bagi pengguna awam akuntansi —
 * 40 istilah dalam bahasa sehari-hari, masing-masing dengan contoh nyata dan
 * tautan "Buka di aplikasi". Sampai audit produksi 13 Agustus 2026 ia hanya
 * punya DUA pintu: satu item menu di bawah "Bantuan & Pengaturan", dan ikon "?"
 * di samping label formulir. Keduanya baru ditemukan oleh orang yang sudah tahu
 * ia mencari sesuatu — yaitu justru bukan orang yang paling membutuhkannya.
 *
 * Beranda adalah layar yang PASTI dilihat setiap hari, jadi satu baris tenang
 * di sini menutup jarak itu tanpa menambah kebisingan.
 *
 * ── Kalimatnya DIPAKAI ULANG, bukan dikarang ulang ─────────────────────────
 * `settings.helpDescription` + `settings.openGlossary` sudah hidup di ketiga
 * kamus dan sudah dipakai kartu Bantuan di Pengaturan. Menulis kalimat kedua
 * yang artinya sama berarti dua teks yang harus bergerak bersama selamanya —
 * dan satu di antaranya pasti tertinggal.
 *
 * Server component (beranda tetap server component, dijaga
 * `tests/rsc-boundary.test.ts`): tanpa `antd`, warnanya `var(--ant-…)`.
 */

import { ArrowRightOutlined, BookOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";

const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--ant-margin-xs)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-fill-quaternary)",
};

const TEXT: React.CSSProperties = {
  margin: 0,
  flex: "1 1 260px",
  minWidth: 0,
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const CTA: React.CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  /* Tinggi 44: ambang target sentuh yang sama dengan ikon "?" di
     `term-tooltip.tsx`. Ini tautan di beranda ponsel, bukan tombol meja. */
  minHeight: 44,
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-link)",
};

export async function GlossaryHint() {
  const t = await getT();

  return (
    <section style={ROW} aria-labelledby="kamus-istilah-ajakan">
      <BookOutlined
        aria-hidden="true"
        style={{ fontSize: 20, flexShrink: 0, color: "var(--ant-color-link)" }}
      />
      <p id="kamus-istilah-ajakan" style={TEXT}>
        {t("settings.helpDescription")}
      </p>
      {/* `/glossary` apa adanya: `app-link` menambahkan awalan
          `/t/{tenant}/{company}` sendiri di jalur bertenant. */}
      <Link href="/glossary" style={CTA}>
        {t("settings.openGlossary")}
        <ArrowRightOutlined aria-hidden="true" style={{ fontSize: 16 }} />
      </Link>
    </section>
  );
}
