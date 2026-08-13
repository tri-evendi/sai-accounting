/**
 * ChartCard — pembungkus satu grafik di halaman yang angkanya dijelaskan
 * (`/inventory`, `/contracts`, `/reports/cash-flow`).
 *
 * ── Tetap SERVER component (issue #240, fase C9) ───────────────────────────
 * Grafiknya sendiri client (recharts); yang di sini hanya bingkainya, jadi
 * berkas ini **tidak boleh mengimpor `antd`** (dijaga `tests/rsc-boundary.test.ts`).
 * Warna & jaraknya karena itu ditulis sebagai `var(--ant-…)` biasa — sah di
 * server component sejak #227: blok variabelnya berdiri di HTML pertama dan
 * dipikul kelas di `<html>`.
 *
 * Prop `className` DICABUT: tidak ada satu pun dari empat pemanggilnya yang
 * mengisinya, dan sebuah jalan lewat untuk kelas Tailwind adalah persis yang
 * dihapus fase ini.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Kartu adalah wadah tata letak grafiknya sendiri — badan `Card` `display:contents`. */
const CARD: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

/** `pb-2` kepala kartu = `paddingXS` (8). */
const HEADER: React.CSSProperties = { paddingBottom: "var(--ant-padding-xs)" };

/** `text-base font-semibold` = `fontSizeLG` (16) + `fontWeightStrong`. */
const TITLE: React.CSSProperties = {
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

/** `text-xs … mt-0.5 font-normal` — penjelas di bawah judul. */
const DESCRIPTION: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: "normal",
  color: "var(--ant-color-text-secondary)",
};

/** `flex-1 pt-0 pb-4` — badan mengisi sisa tinggi kartu. */
const CONTENT: React.CSSProperties = {
  flex: 1,
  paddingTop: 0,
  paddingBottom: "var(--ant-padding)",
};

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  chartMinHeight?: number;
}

export function ChartCard({
  title,
  description,
  children,
  chartMinHeight = 280,
}: ChartCardProps) {
  return (
    <Card style={CARD}>
      <CardHeader style={HEADER}>
        <CardTitle level={2} style={TITLE}>{title}</CardTitle>
        {description && <p style={DESCRIPTION}>{description}</p>}
      </CardHeader>
      <CardContent style={CONTENT}>
        <div style={{ minHeight: chartMinHeight }}>{children}</div>
      </CardContent>
    </Card>
  );
}
