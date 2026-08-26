/**
 * KALIMAT DASBOR (issue #472) — angka yang menjelaskan dirinya sendiri.
 *
 * Server component: beranda membaca buku besar lewat Prisma, jadi berkas ini
 * **tidak boleh mengimpor `antd`** (dijaga `tests/rsc-boundary.test.ts`).
 * Warnanya `var(--ant-…)`, sah di server component sejak #227.
 *
 * ── Panel ini tidak menghitung apa pun ─────────────────────────────────────
 * Aturannya (ambang, urutan, kapan DIAM) hidup di `lib/dashboard-insights.ts`
 * dan diuji di sana tanpa basis data. Yang di bawah hanya merender.
 *
 * ── Tidak pernah warna saja ────────────────────────────────────────────────
 * Nada `warn` dibedakan warna DAN ikon DAN bunyi kalimatnya sendiri; sebuah
 * peringatan yang hanya berwarna hilang bagi pembaca yang tak membedakannya.
 *
 * ── Diam tanpa membekas ────────────────────────────────────────────────────
 * Daftar kosong memulangkan `null` — bukan panel kosong berjudul "Yang perlu
 * diperhatikan" yang justru mengumumkan ketiadaan beritanya.
 */
import { Link } from "@/components/ui/app-link";
import { WarningOutlined, InfoCircleOutlined } from "@ant-design/icons";

import type { DashboardInsight } from "@/lib/dashboard-insights";
import { formatMoney } from "@/lib/money-format";
import { getT } from "@/lib/i18n/server";

const PANEL: React.CSSProperties = {
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
};

const TITLE: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
  fontWeight: 500,
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--ant-margin-xs)",
  flexWrap: "wrap",
  fontSize: "var(--ant-font-size)",
  lineHeight: "var(--ant-line-height)",
};

/**
 * Nominal dirakit di SINI, bukan di modul aturannya.
 *
 * `buildDashboardInsights` memulangkan angka mentah supaya bisa diuji tanpa
 * peduli tempat; yang tahu cara menuliskannya dalam `id-ID` adalah lapisan
 * tampilan. Nama medan `amount` sengaja seragam di seluruh kalimat.
 */
function display(values: Record<string, string | number>) {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values)) {
    out[name] = name === "amount" ? formatMoney(Number(value)) : value;
  }
  return out;
}

export async function InsightPanel({ insights }: { insights: DashboardInsight[] }) {
  if (insights.length === 0) return null;
  const t = await getT();

  return (
    <section style={PANEL} aria-label={t("dashboard.insightsTitle")}>
      <span style={TITLE}>{t("dashboard.insightsTitle")}</span>
      {insights.map((insight) => {
        const warn = insight.tone === "warn";
        const Icon = warn ? WarningOutlined : InfoCircleOutlined;
        return (
          <p key={insight.id} style={ROW}>
            <Icon
              aria-hidden
              style={{
                /* Sebagai GRAFIS ambangnya 3:1, bukan 4,5:1 — jadi warna pekat
                   boleh dipakai di sini meski tidak boleh untuk teks 14px. */
                color: warn ? "var(--ant-color-warning)" : "var(--ant-color-text-tertiary)",
                fontSize: "var(--ant-font-size)",
              }}
            />
            <span style={{ color: "var(--ant-color-text)" }}>
              {t(insight.key, display(insight.values))}
            </span>{" "}
            <Link href={insight.href} style={{ fontSize: "var(--ant-font-size-sm)" }}>
              {t("dashboard.insightsMore")}
            </Link>
          </p>
        );
      })}
    </section>
  );
}
