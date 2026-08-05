"use client";

/**
 * Grafik Beranda (recharts).
 *
 * ── Apa yang BERUBAH di issue #194, dan apa yang sengaja TIDAK ─────────────
 * Yang berubah: seluruh `className` Tailwind — keadaan kosong, legenda, dan
 * tooltip arus kas — kini token AntD. Tooltip itu bukan sekadar kerapian:
 * "Uang masuk"/"Uang keluar" dulu memakai `--success`/`--destructive`, yang
 * sebagai teks 12px berada di 3,30:1 dan 4,83:1. Sekarang keduanya memakai
 * `colorMoneyPositive`/`colorMoneyNegative` (#186, 5,12:1 dan 6,00:1) lewat
 * `moneyPalette` — pembantu yang sama yang dipakai `Money`, jadi angka di
 * tooltip dan angka di tabel tidak bisa berbeda warna. Kalimatnya sendiri
 * tetap menyebut arahnya, jadi warnanya penanda KEDUA, bukan satu-satunya.
 *
 * Yang TIDAK berubah: warna SERI (`fill`, `stroke`, `tick`) masih variabel
 * `--success`/`--chart-1`/`--border` dari `globals.css`. Memindahkannya adalah
 * issue #202, yang di epik #206 terdaftar sebagai KEPUTUSAN tersendiri —
 * palet kategorikal sebuah grafik bukan turunan mekanis dari token teks, dan
 * memilihnya diam-diam di dalam issue permukaan berarti mengambil keputusan
 * itu tanpa mengukurnya. Variabel-variabel itu masih hidup sampai #203.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Flex, theme, Typography } from "antd";
import { useT } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";

const CHART_HEIGHT = 260;

/** Tinggi minimum kotak "belum ada data" — setara `min-h-[200px]` sebelumnya. */
const EMPTY_MIN_HEIGHT = 200;

// Warna per POSISI, bukan per label. Sebelum multibahasa peta ini berkunci
// teks Indonesia ("Sah", "Aman"); begitu labelnya ikut bahasa pengguna, kunci
// seperti itu tak pernah cocok lagi dan semua irisan jadi abu-abu. Urutannya
// sama dengan urutan data yang dikirim Beranda — sah/menunggu/dibatalkan dan
// aman/menipis/habis. Legenda & label persen tetap berteks, jadi kategori
// tidak pernah dibedakan oleh warna saja.
const CONTRACT_COLORS = ["var(--success)", "var(--warning)", "var(--destructive)"];

const STOCK_COLORS = ["var(--success)", "var(--warning)", "var(--destructive)"];

interface PieDatum {
  name: string;
  value: number;
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <Flex
      align="center"
      justify="center"
      style={{ height: "100%", minHeight: EMPTY_MIN_HEIGHT }}
    >
      <Typography.Text type="secondary">{message}</Typography.Text>
    </Flex>
  );
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function formatFull(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatMoney(value: number, currency: string): string {
  try {
    const localeMap: Record<string, string> = { IDR: "id-ID", USD: "en-US", CNY: "zh-CN" };
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${formatFull(value)}`;
  }
}

function DonutChart({
  data,
  colors,
  emptyMessage,
}: {
  data: PieDatum[];
  /** Warna per posisi data, dipasangkan SEBELUM baris nol disaring. */
  colors: readonly string[];
  emptyMessage: string;
}) {
  const { token } = theme.useToken();
  const filtered = data
    .map((d, i) => ({ ...d, fill: colors[i] ?? "var(--muted-foreground)" }))
    .filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return <ChartEmpty message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={filtered}
          cx="50%"
          cy="48%"
          innerRadius={56}
          outerRadius={88}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) =>
            (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ""
          }
          labelLine={false}
        >
          {filtered.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => (
            <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ContractStatusChart({ data }: { data: PieDatum[] }) {
  const t = useT();
  return (
    <DonutChart
      data={data}
      colors={CONTRACT_COLORS}
      emptyMessage={t("charts.noContracts")}
    />
  );
}

export function StockStatusChart({ data }: { data: PieDatum[] }) {
  const t = useT();
  return (
    <DonutChart
      data={data}
      colors={STOCK_COLORS}
      emptyMessage={t("charts.noItems")}
    />
  );
}

interface MonthlyData {
  month: string;
  contracts: number;
  invoices: number;
}

export function MonthlyActivityChart({ data }: { data: MonthlyData[] }) {
  const t = useT();
  if (data.length === 0) {
    return <ChartEmpty message={t("charts.noActivity")} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="contracts" fill="var(--chart-1)" name={t("nav.items.contracts")} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="invoices" fill="var(--chart-3)" name={t("nav.items.invoices")} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface StockLevelData {
  name: string;
  stock: number;
  unit?: string | null;
}

export function StockLevelChart({ data }: { data: StockLevelData[] }) {
  const t = useT();
  const topItems = [...data]
    .filter((d) => d.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 8);

  if (topItems.length === 0) {
    return <ChartEmpty message={t("charts.noStockLeft")} />;
  }

  const chartHeight = Math.max(CHART_HEIGHT, topItems.length * 36 + 48);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={topItems}
        layout="vertical"
        margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, item: any) => {
            const unit = (item?.payload as StockLevelData)?.unit;
            return [`${formatFull(Number(value ?? 0))}${unit ? ` ${unit}` : ""}`, t("charts.tooltipCurrentStock")];
          }}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Bar dataKey="stock" fill="var(--success)" name={t("charts.seriesQuantity")} radius={[0, 4, 4, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface CashFlowData {
  month: string;
  debit: number;
  credit: number;
}

interface CashFlowChartProps {
  data: CashFlowData[];
  currency: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CashFlowTooltip({ active, payload, label, currency }: any) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  if (!active || !payload?.length) return null;
  const income = payload.find((p: { dataKey: string }) => p.dataKey === "debit")?.value ?? 0;
  const expense = payload.find((p: { dataKey: string }) => p.dataKey === "credit")?.value ?? 0;

  return (
    /*
     * Masuk/keluar TIDAK dibedakan warna saja: kalimatnya sendiri menyebutkan
     * "Uang masuk"/"Uang keluar" (`charts.tooltipMoneyIn/Out`). Warnanya kini
     * `colorMoneyPositive`/`colorMoneyNegative` (#186) — bukan `--success`/
     * `--destructive` lama, yang sebagai teks 12px hanya 3,30:1 dan 4,83:1.
     */
    <div
      style={{
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorBgElevated,
        boxShadow: token.boxShadowSecondary,
        fontSize: token.fontSizeSM,
      }}
    >
      <div style={{ fontWeight: token.fontWeightStrong, marginBottom: token.marginXXS }}>
        {label}
      </div>
      <div style={{ color: money.colorMoneyPositive }}>
        {t("charts.tooltipMoneyIn", { amount: formatMoney(income, currency) })}
      </div>
      <div style={{ color: money.colorMoneyNegative }}>
        {t("charts.tooltipMoneyOut", { amount: formatMoney(expense, currency) })}
      </div>
      <div
        style={{
          marginTop: token.marginXXS,
          paddingTop: token.marginXXS,
          borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          fontWeight: token.fontWeightStrong,
        }}
      >
        {t("charts.tooltipDifference", { amount: formatMoney(income - expense, currency) })}
      </div>
    </div>
  );
}

export function CashFlowChart({ data, currency }: CashFlowChartProps) {
  const t = useT();
  if (data.length === 0 || data.every((d) => d.debit === 0 && d.credit === 0)) {
    return <ChartEmpty message={t("charts.noCashMovement", { currency })} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickFormatter={formatCompact}
          width={52}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CashFlowTooltip currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="debit" fill="var(--success)" name={t("finance.colMoneyIn")} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="credit" fill="var(--destructive)" name={t("finance.colMoneyOut")} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
