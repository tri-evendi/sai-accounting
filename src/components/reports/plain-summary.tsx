/**
 * Plain-language summary banner for a report page (issue #19).
 *
 * Renders a `ReportSummary` (built by `@/lib/report-summary` straight from the
 * report's own totals) as one lay sentence plus a compact row of the headline
 * figures. It computes nothing — every number is handed in, so it cannot disagree
 * with the table beneath it. This is the report-page counterpart to the dashboard
 * `SummaryCard` from issue #3, sharing its money-direction vocabulary: colour is
 * never the only signal — each figure also carries an icon, a word and, where it
 * can go either way, an explicit +/− sign.
 *
 * ── Server component, tanpa satu kelas Tailwind (issue #240, fase C9) ────────
 * Halaman laporan membaca buku besar lewat Prisma dan merender tabelnya sebagai
 * HTML, jadi berkas ini **tidak boleh mengimpor `antd`** (dijaga
 * `tests/rsc-boundary.test.ts`). Warnanya `var(--ant-…)`, sah di server
 * component sejak #227; warna angkanya anak tangga uang #186, bukan
 * `colorSuccess`/`colorError` bawaan yang gagal 4,5:1 sebagai teks.
 */
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  BulbOutlined,
  FallOutlined,
  RiseOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from "@ant-design/icons";
import type { IconComponent } from "@/lib/icons";
import type { ReportSummary, SummaryDirection } from "@/lib/report-summary";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

interface DirStyle {
  Icon: IconComponent;
  word: DictionaryKey;
  value: string;
  sign: "" | "+" | "−";
}

const DIR: Record<SummaryDirection, DirStyle> = {
  in: {
    Icon: VerticalAlignBottomOutlined,
    word: "moneyDirection.in",
    value: "var(--ant-color-money-positive)",
    sign: "",
  },
  out: {
    Icon: VerticalAlignTopOutlined,
    word: "moneyDirection.out",
    value: "var(--ant-color-money-negative)",
    sign: "",
  },
  profit: {
    Icon: RiseOutlined,
    word: "moneyDirection.profit",
    value: "var(--ant-color-money-positive)",
    sign: "+",
  },
  loss: {
    Icon: FallOutlined,
    word: "moneyDirection.loss",
    value: "var(--ant-color-money-negative)",
    sign: "−",
  },
  receivable: {
    Icon: VerticalAlignBottomOutlined,
    word: "moneyDirection.receivable",
    value: "var(--ant-color-text)",
    sign: "",
  },
  payable: {
    Icon: VerticalAlignTopOutlined,
    word: "moneyDirection.payable",
    value: "var(--ant-color-text)",
    sign: "",
  },
};

/**
 * Spanduk ini permukaan PENJELAS, jadi ia berdiri di atas latar merek tipis
 * (`colorPrimaryBg`) dengan tepi `colorInfoBorder` — bukan `colorPrimaryBorder`,
 * yang di app ini sengaja digelapkan menjadi warna cincin fokus (#187) dan
 * sebagai tepi kartu akan terbaca seperti keadaan terfokus.
 */
const CARD: React.CSSProperties = {
  marginBottom: "var(--ant-margin-lg)",
  borderColor: "var(--ant-color-info-border)",
  background: "var(--ant-color-primary-bg)",
};

const BODY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin)",
  padding: "var(--ant-padding-md)",
};

/**
 * Kartu angka membagi lebarnya sendiri — pengganti `sm:grid-cols-3` /
 * `sm:grid-cols-2 lg:grid-cols-4` yang harus dipilih menurut JUMLAH kartunya
 * supaya kartu keempat tidak yatim di baris kedua. `auto-fit` menjawab keduanya
 * dengan satu aturan: tiga kartu jadi tiga kolom, empat jadi empat, dan di
 * 375px keduanya jadi satu kolom.
 */
const GRID: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin-sm)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
};

const FIGURE_CARD: React.CSSProperties = {
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-info-border)",
  background: "var(--ant-color-bg-container)",
  padding: "var(--ant-padding-sm)",
};

const FIGURE_LABEL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 500,
  color: "var(--ant-color-text-secondary)",
};

const FIGURE_VALUE: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

export async function PlainSummary({ summary }: { summary: ReportSummary }) {
  const t = await getT();
  return (
    <Card style={CARD}>
      <div style={BODY}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ant-margin-sm)" }}>
          <BulbOutlined
            aria-hidden="true"
            style={{ fontSize: 20, flexShrink: 0, marginTop: 2, color: "var(--ant-color-link)" }}
          />
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "var(--ant-font-size)",
                fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                color: "var(--ant-color-link)",
              }}
            >
              {t("dashboard.plainTitle")}
            </h2>
            <p
              style={{
                margin: 0,
                marginTop: "var(--ant-margin-xxs)",
                fontSize: "var(--ant-font-size)",
                lineHeight: 1.375,
                color: "var(--ant-color-text)",
              }}
            >
              {summary.narrative}
            </p>
          </div>
        </div>

        <div style={GRID}>
          {summary.cards.map((c) => {
            const s = DIR[c.direction];
            const { Icon } = s;
            return (
              <div key={c.title} style={FIGURE_CARD} title={c.explanation}>
                <div style={FIGURE_LABEL}>
                  <Icon aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }} />
                  <span>{c.title}</span>
                </div>
                <p style={{ ...FIGURE_VALUE, color: s.value }}>
                  {s.sign}
                  {formatCurrency(c.amount, "IDR")}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
