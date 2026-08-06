/**
 * Panel "Aksi Cepat" (issue #2) — enam pekerjaan tersering, satu klik dari Beranda.
 *
 * Server component (async): daftar aksinya sudah disaring per peran di server
 * (`quickActionsForRole`), jadi tombol yang tidak boleh dipakai peran tersebut
 * tidak ikut dikirim ke browser — bukan disembunyikan dengan CSS.
 *
 * Arah uang ditandai ikon + TEKS ("Uang masuk" / "Uang keluar"), tidak pernah
 * warna saja, sesuai aturan semantik uang di MASTER.md.
 *
 * ── Tanpa satu kelas Tailwind pun (issue #240, fase C9) ────────────────────
 * Berkas ini **tidak boleh mengimpor `antd`**: beranda harus tetap server
 * component (dijaga `tests/rsc-boundary.test.ts`). Warnanya `var(--ant-…)`,
 * sah di server component sejak #227.
 *
 * Dua hal HILANG bersama kelasnya, keduanya keadaan `:hover`/`:focus` yang tidak
 * bisa ditulis sebagai gaya sebaris: bayangan yang naik saat kursor menyentuh
 * kartu, dan cincin fokus rakitan. Yang kedua bukan kemunduran a11y — tanpa
 * `focus:outline-none` yang mematikannya, garis fokus BAWAAN peramban kembali
 * berlaku. Yang pertama dicatat sebagai calon issue untuk primitif `Card`
 * (`hoverable` AntD), bukan ditambal dengan `<style>` sisipan.
 */

import { Link } from "@/components/ui/app-link";
import {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { QuickAction, QuickActionTone } from "@/lib/quick-actions";

const ICONS: Record<string, LucideIcon> = {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
};

/**
 * Latar TIPIS + teks anak tangga uang (#186) — aturan `Tag` (#187). Warna pekat
 * (`colorSuccess`) sebagai teks hanya 2,21:1 pada ukuran ini; sebagai ISIAN
 * kotak ikon ia sah, tapi kotak dan tulisan "Uang masuk" memakai pasangan yang
 * sama supaya keduanya tidak bisa berpisah warna.
 */
const TONE_STYLES: Record<
  QuickActionTone,
  { background: string; color: string; labelKey: DictionaryKey }
> = {
  in: {
    background: "var(--ant-color-success-bg)",
    color: "var(--ant-color-money-positive)",
    labelKey: "quickActions.tone.in",
  },
  out: {
    background: "var(--ant-color-error-bg)",
    color: "var(--ant-color-money-negative)",
    labelKey: "quickActions.tone.out",
  },
  stock: {
    background: "var(--ant-color-warning-bg)",
    color: "var(--ant-color-money-pending)",
    labelKey: "quickActions.tone.stock",
  },
  neutral: {
    background: "var(--ant-color-primary-bg)",
    color: "var(--ant-color-link)",
    labelKey: "quickActions.tone.neutral",
  },
};

/** `mb-3 flex items-center gap-2` — baris judul seksi. */
const HEAD_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xs)",
  marginBottom: "var(--ant-margin-sm)",
};

const TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const SUBTITLE: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

/**
 * Baris kartu yang membagi lebarnya sendiri — pengganti
 * `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Kartunya turun sendiri saat tak
 * muat, jadi 375px memberi satu kolom tanpa satu pun titik patah yang harus
 * dijaga tetap sama dengan titik patah lain.
 */
const GRID: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
};

/** `min-h-[6.5rem]` = 104px; `rounded-xl border bg-card p-4 shadow-sm`. */
const CARD: React.CSSProperties = {
  display: "flex",
  minHeight: 104,
  alignItems: "flex-start",
  gap: "var(--ant-margin)",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  boxShadow: "var(--ant-box-shadow-tertiary)",
  color: "var(--ant-color-text)",
};

/** Kotak ikon `h-12 w-12 rounded-lg`. */
const ICON_BOX: React.CSSProperties = {
  display: "flex",
  width: 48,
  height: 48,
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--ant-border-radius-lg)",
};

const ACTION_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const ACTION_DESC: React.CSSProperties = {
  display: "block",
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.375,
  color: "var(--ant-color-text-secondary)",
};

export async function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  // Server component: kamus diambil langsung di server, jadi panel ini tidak
  // menambah satu byte pun ke bundel client.
  const t = await getT();

  return (
    <section data-tour="aksi-cepat" aria-labelledby="aksi-cepat-judul">
      <div style={HEAD_ROW}>
        <Zap size={20} style={{ color: "var(--ant-color-link)" }} aria-hidden="true" />
        <h2 id="aksi-cepat-judul" style={TITLE}>
          {t("quickActions.title")}
        </h2>
      </div>
      <p style={SUBTITLE}>{t("quickActions.subtitle")}</p>

      <div style={GRID}>
        {actions.map((action) => {
          const Icon = ICONS[action.icon] ?? FileText;
          const tone = TONE_STYLES[action.tone];
          return (
            <Link key={action.key} href={action.href} style={CARD}>
              <span style={{ ...ICON_BOX, background: tone.background, color: tone.color }}>
                <Icon size={24} aria-hidden="true" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={ACTION_LABEL}>{t(action.labelKey)}</span>
                {/* Arah uang sebagai KATA, bukan warna saja. */}
                <span
                  style={{
                    display: "block",
                    marginTop: "var(--ant-margin-xxs)",
                    fontSize: "var(--ant-font-size-sm)",
                    fontWeight: 500,
                    color: tone.color,
                  }}
                >
                  {t(tone.labelKey)}
                </span>
                <span style={ACTION_DESC}>{t(action.descriptionKey)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
