"use client";

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

const CHART_HEIGHT = 260;

// Kunci peta warna = label yang dikirim halaman (bahasa Indonesia, issue #1).
// Legenda & label persen memakai teks itu juga, jadi kategori tidak pernah
// dibedakan oleh warna saja.
const CONTRACT_COLORS: Record<string, string> = {
  Sah: "var(--success)",
  Menunggu: "var(--warning)",
  Dibatalkan: "var(--destructive)",
};

const STOCK_COLORS: Record<string, string> = {
  Aman: "var(--success)",
  Menipis: "var(--warning)",
  Habis: "var(--destructive)",
};

interface PieDatum {
  name: string;
  value: number;
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
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
  colors: Record<string, string>;
  emptyMessage: string;
}) {
  const filtered = data.filter((d) => d.value > 0);
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
            <Cell key={entry.name} fill={colors[entry.name] || "var(--muted-foreground)"} />
          ))}
        </Pie>
        <Tooltip />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ContractStatusChart({ data }: { data: PieDatum[] }) {
  return (
    <DonutChart
      data={data}
      colors={CONTRACT_COLORS}
      emptyMessage="Belum ada kontrak tercatat"
    />
  );
}

export function StockStatusChart({ data }: { data: PieDatum[] }) {
  return (
    <DonutChart
      data={data}
      colors={STOCK_COLORS}
      emptyMessage="Belum ada barang di stok"
    />
  );
}

interface MonthlyData {
  month: string;
  contracts: number;
  invoices: number;
}

export function MonthlyActivityChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) {
    return <ChartEmpty message="Belum ada aktivitas dalam 6 bulan terakhir" />;
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
        <Bar dataKey="contracts" fill="var(--chart-1)" name="Kontrak" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="invoices" fill="var(--chart-3)" name="Tagihan Penjualan" radius={[4, 4, 0, 0]} maxBarSize={40} />
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
  const topItems = [...data]
    .filter((d) => d.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 8);

  if (topItems.length === 0) {
    return <ChartEmpty message="Belum ada stok tersisa" />;
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
            return [`${formatFull(Number(value ?? 0))}${unit ? ` ${unit}` : ""}`, "Stok saat ini"];
          }}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Bar dataKey="stock" fill="var(--success)" name="Jumlah" radius={[0, 4, 4, 0]} maxBarSize={28} />
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
  if (!active || !payload?.length) return null;
  const income = payload.find((p: { dataKey: string }) => p.dataKey === "debit")?.value ?? 0;
  const expense = payload.find((p: { dataKey: string }) => p.dataKey === "credit")?.value ?? 0;

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      <p className="text-success">Uang masuk: {formatMoney(income, currency)}</p>
      <p className="text-destructive">Uang keluar: {formatMoney(expense, currency)}</p>
      <p className="mt-1.5 font-medium text-foreground border-t border-border pt-1.5">
        Selisih: {formatMoney(income - expense, currency)}
      </p>
    </div>
  );
}

export function CashFlowChart({ data, currency }: CashFlowChartProps) {
  if (data.length === 0 || data.every((d) => d.debit === 0 && d.credit === 0)) {
    return <ChartEmpty message={`Belum ada pergerakan kas ${currency} dalam 6 bulan terakhir`} />;
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
        <Bar dataKey="debit" fill="var(--success)" name="Uang Masuk" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="credit" fill="var(--destructive)" name="Uang Keluar" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
