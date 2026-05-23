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

const CONTRACT_COLORS: Record<string, string> = {
  Signed: "#22c55e",
  Pending: "#eab308",
  Canceled: "#ef4444",
};

const STOCK_COLORS: Record<string, string> = {
  "In Stock": "#22c55e",
  "Low Stock": "#f59e0b",
  Empty: "#ef4444",
};

interface PieDatum {
  name: string;
  value: number;
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <p className="text-sm text-gray-400">{message}</p>
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
            <Cell key={entry.name} fill={colors[entry.name] || "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
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
      emptyMessage="No contracts recorded yet"
    />
  );
}

export function StockStatusChart({ data }: { data: PieDatum[] }) {
  return (
    <DonutChart
      data={data}
      colors={STOCK_COLORS}
      emptyMessage="No inventory items yet"
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
    return <ChartEmpty message="No activity in the last 6 months" />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="contracts" fill="#3b82f6" name="Contracts" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="invoices" fill="#8b5cf6" name="Invoices" radius={[4, 4, 0, 0]} maxBarSize={40} />
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
    return <ChartEmpty message="No stock on hand" />;
  }

  const chartHeight = Math.max(CHART_HEIGHT, topItems.length * 36 + 48);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={topItems}
        layout="vertical"
        margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11, fill: "#374151" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, item: any) => {
            const unit = (item?.payload as StockLevelData)?.unit;
            return [`${formatFull(Number(value ?? 0))}${unit ? ` ${unit}` : ""}`, "On hand"];
          }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="stock" fill="#16a34a" name="Quantity" radius={[0, 4, 4, 0]} maxBarSize={28} />
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
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-gray-900 mb-1.5">{label}</p>
      <p className="text-green-600">Income: {formatMoney(income, currency)}</p>
      <p className="text-red-600">Expense: {formatMoney(expense, currency)}</p>
      <p className="mt-1.5 font-medium text-gray-800 border-t border-gray-100 pt-1.5">
        Net: {formatMoney(income - expense, currency)}
      </p>
    </div>
  );
}

export function CashFlowChart({ data, currency }: CashFlowChartProps) {
  if (data.length === 0 || data.every((d) => d.debit === 0 && d.credit === 0)) {
    return <ChartEmpty message={`No ${currency} cash flow in the last 6 months`} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickFormatter={formatCompact}
          width={52}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CashFlowTooltip currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="debit" fill="#22c55e" name="Income" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="credit" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
