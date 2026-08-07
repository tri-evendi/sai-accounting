"use client";

/**
 * Grafik (recharts) — SELURUH warnanya dari token AntD.
 *
 * ── Keputusan issue #202: bertahan dengan recharts (opsi A) ────────────────
 * Pemilik menolak pindah ke `@ant-design/charts`: G2/G2Plot adalah dependensi
 * besar untuk empat grafik yang sudah bekerja, sementara yang benar-benar
 * dituntut epik #206 hanyalah **warna grafik berhenti datang dari sumbernya
 * sendiri**. Jadi mesinnya tetap, paletnya yang pindah.
 *
 * Yang berubah di berkas ini: `--success`/`--warning`/`--destructive`/
 * `--chart-1`/`--chart-3`/`--border`/`--muted-foreground`/`--foreground` dari
 * `globals.css` — variabel yang mati bersama Tailwind di #203 — diganti token
 * AntD lewat `theme.useToken()`. Tidak ada satu hex pun yang lahir di sini.
 *
 * ── Kenapa `useToken()` dan bukan `var(--ant-…)` ──────────────────────────
 * Sejak #227 keduanya sah, juga di server component. Di sini dipilih
 * `useToken()` karena berkas ini **sudah** client (recharts butuh DOM) dan
 * karena warnanya bukan cuma dituliskan ke SVG: `moneyPalette()` harus MEMBACA
 * `colorBgContainer` untuk menyimpulkan tema pada jalur cadangan di luar
 * provider, dan sebuah string `var(--ant-…)` tidak bisa dibaca. MASTER.md
 * menyebut kasus ini apa adanya: "`useToken()` hanya untuk yang memang butuh
 * NILAINYA — menghitung, membandingkan, meneruskan ke pustaka chart".
 * Konsekuensinya nol: tidak ada satu modul pun yang menyeberang jadi client
 * karena perubahan ini (`ChartCard` tetap server, beranda tetap server).
 *
 * ── Kenapa token UANG, bukan `colorSuccess`/`colorWarning`/`colorError` ───
 * Karena warna seri di recharts **bukan hanya isian**. Terukur pada paket yang
 * terpasang (recharts 3.8.0, dikunci `tests/chart-tokens.test.ts`):
 *
 *  • `Pie` menggambar label irisannya lewat `renderLabelItem`, yang menyalin
 *    `entry.fill` — jadi "Aman 62%" adalah TEKS berwarna seri, di atas latar
 *    kartu.
 *  • `DefaultTooltipContent` mewarnai setiap barisnya `entry.color`, yaitu
 *    warna seri lagi — TEKS di atas `colorBgElevated`.
 *
 * Dengan `colorSuccess` bawaan (#52c41a) kedua teks itu berada di **2,27:1**.
 * Itu persis kegagalan yang #186 ukur dan cegah, hanya di dalam SVG di mana
 * tidak ada yang mengira ada teks. Token uang #186 (green-8/gold-9/red-8/
 * blue-7 dari palet AntD sendiri) lolos 4,5:1 di kedua tema, di ketiga latar —
 * jadi ia yang dipakai, dan `colorSuccess` dkk. tetap tinggal di perannya
 * sebagai isian pekat.
 *
 * ── Warna tidak pernah penanda tunggal ────────────────────────────────────
 * Donat: setiap irisan >5% memuat NAMA-nya di labelnya, dan semuanya bernama
 * di legenda. Batang: legenda menamai tiap seri, tooltip menyebut namanya lagi
 * saat disentuh, dan pada batang berkelompok urutan di dalam kelompok tetap
 * (kontrak kiri, tagihan kanan) — posisi adalah kanal kedua yang bertahan di
 * cetakan hitam-putih. Arus kas menambah kanal ketiga: kalimat tooltip-nya
 * sendiri berbunyi "Uang masuk"/"Uang keluar".
 *
 * ── Jebakan yang tidak boleh dilupakan ────────────────────────────────────
 * `statusTones` dipasangkan per POSISI, bukan per teks label (peta berkunci
 * teks Indonesia pernah membuat SEMUA irisan abu-abu begitu labelnya ikut
 * bahasa pengguna). Mengurutkan ulang datanya di pemanggil menukar artinya
 * tanpa satu galat pun. Urutannya: aman/sah → menipis/menunggu →
 * habis/dibatalkan. Lihat `lib/chart-data.ts`.
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

/** Token seperti yang diberikan `theme.useToken()` di dalam `AntdProvider`. */
export type ChartToken = ReturnType<typeof theme.useToken>["token"];

/**
 * SATU tempat yang memutuskan warna grafik — supaya "grafik apa memakai warna
 * apa" bisa dibaca (dan diuji) tanpa menelusuri empat komponen.
 *
 * Pemetaannya sengaja bernama PERAN, bukan warna: yang boleh dipilih pemanggil
 * adalah "ini uang masuk" atau "ini sekadar hitungan", bukan "ini hijau".
 */
export function chartPalette(token: ChartToken) {
  const money = moneyPalette(token);
  return {
    /**
     * Tiga nada status donat — **per POSISI**: [aman/sah, menipis/menunggu,
     * habis/dibatalkan]. Jangan diurutkan ulang; lihat kepala berkas.
     */
    statusTones: [
      money.colorMoneyPositive,
      money.colorMoneyPending,
      money.colorMoneyNegative,
    ] as const,
    /** Arah uang — nada yang sama dengan `Money` dan tooltip arus kas. */
    moneyIn: money.colorMoneyPositive,
    moneyOut: money.colorMoneyNegative,
    /**
     * Hitungan & kuantitas: angka TANPA arah. Sengaja bukan hijau — hijau di
     * aplikasi ini berarti "uang masuk / sehat", dan stok terbanyak bukan
     * kabar baik maupun buruk. Biru & emas adalah pasangan yang tetap terpisah
     * pada deuteranopia, dan keduanya anak tangga AntD yang sudah diukur
     * sebagai TEKS (blue-7 / gold-9) — dibutuhkan karena legenda dan tooltip
     * recharts menulis namanya dengan warna serinya.
     */
    countPrimary: money.colorMoneyInfo,
    countSecondary: money.colorMoneyPending,
    /** Irisan ke-4 dst. yang tak pernah diharapkan ada — netral, bukan warna berarti. */
    unknownTone: token.colorTextSecondary,
    /** Kisi bantu baca nilai — sederajat kisi tabel (#208, 3:1 non-teks). */
    grid: token.colorBorderSecondary,
    /** Angka sumbu = teks penjelas; nama kategori = isi. */
    tick: token.colorTextSecondary,
    tickStrong: token.colorText,
    /** Pita sorot di belakang batang saat disentuh. */
    cursor: token.colorFillSecondary,
  } as const;
}

/**
 * Permukaan tooltip bawaan recharts — HARUS disebut, tidak boleh dibiarkan.
 * Bawaannya `backgroundColor: '#fff'` + `border: 1px solid #ccc` + label hitam,
 * ditulis mati di `DefaultTooltipContent`: di tema gelap itu kotak putih
 * menyilaukan di tengah halaman gelap, dan tidak ada tema yang bisa
 * memperbaikinya sendiri. Kuncinya ditulis persis seperti kunci bawaannya
 * (`backgroundColor`, bukan `background`) supaya benar-benar menimpa.
 */
export function tooltipSurface(token: ChartToken): React.CSSProperties {
  return {
    margin: 0,
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    borderRadius: token.borderRadiusLG,
    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
    backgroundColor: token.colorBgElevated,
    boxShadow: token.boxShadowSecondary,
    fontSize: token.fontSizeSM,
    color: token.colorText,
  };
}

function tooltipLabelStyle(token: ChartToken): React.CSSProperties {
  return {
    color: token.colorText,
    fontWeight: token.fontWeightStrong,
    marginBottom: token.marginXXS,
  };
}

/**
 * Teks legenda dibuat NETRAL, bukan sewarna serinya seperti bawaan recharts
 * (`DefaultLegendContent` menyalin `entry.color` ke label). Legenda adalah
 * KUNCI — tugasnya menempelkan nama pada sebuah kotak warna, dan namanya
 * terbaca paling baik sebagai teks biasa. Warna serinya tetap muncul dua kali:
 * pada kotak legenda dan pada baris tooltip.
 */
function legendLabelStyle(token: ChartToken): React.CSSProperties {
  return { fontSize: token.fontSizeSM, color: token.colorTextSecondary };
}

interface PieDatum {
  name: string;
  value: number;
}

/**
 * Memasang nada pada tiap irisan, lalu membuang yang bernilai nol.
 *
 * Urutan kedua langkah itu adalah SELURUH isi fungsi ini, dan ia tidak boleh
 * dibalik: kalau baris nol disaring lebih dulu, satu status yang kebetulan
 * kosong akan menggeser warna semua status SESUDAHNYA — "habis" mewarisi
 * kuning "menipis", dan grafiknya tetap terlihat wajar. Dikunci
 * `tests/chart-tokens.test.tsx`.
 */
export function tonedSlices(
  data: readonly PieDatum[],
  palette: ReturnType<typeof chartPalette>
): (PieDatum & { fill: string })[] {
  return data
    .map((d, i) => ({ ...d, fill: palette.statusTones[i] ?? palette.unknownTone }))
    .filter((d) => d.value > 0);
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

/**
 * Donat status. Nada warnanya dipasangkan per POSISI data — dan itu satu-satunya
 * cara yang bertahan multibahasa, karena label irisannya diterjemahkan.
 *
 * Dulu setiap pemanggil menitipkan larik warnanya sendiri lewat prop `colors`;
 * keduanya mengirim larik yang PERSIS sama, jadi prop itu hanya menambah satu
 * tempat lagi di mana urutan bisa tergeser diam-diam. Sekarang tangga nadanya
 * satu, di `chartPalette`, dan yang tersisa bagi pemanggil hanyalah urutan
 * datanya.
 */
function DonutChart({ data, emptyMessage }: { data: PieDatum[]; emptyMessage: string }) {
  const { token } = theme.useToken();
  const palette = chartPalette(token);
  const filtered = tonedSlices(data, palette);
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
        <Tooltip
          contentStyle={tooltipSurface(token)}
          labelStyle={tooltipLabelStyle(token)}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: React.ReactNode) => (
            <span style={legendLabelStyle(token)}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ContractStatusChart({ data }: { data: PieDatum[] }) {
  const t = useT();
  return <DonutChart data={data} emptyMessage={t("charts.noContracts")} />;
}

export function StockStatusChart({ data }: { data: PieDatum[] }) {
  const t = useT();
  return <DonutChart data={data} emptyMessage={t("charts.noItems")} />;
}

interface MonthlyData {
  month: string;
  contracts: number;
  invoices: number;
}

export function MonthlyActivityChart({ data }: { data: MonthlyData[] }) {
  const t = useT();
  const { token } = theme.useToken();
  const palette = chartPalette(token);
  if (data.length === 0) {
    return <ChartEmpty message={t("charts.noActivity")} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: palette.tick }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: palette.tick }} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ fill: palette.cursor }}
          contentStyle={tooltipSurface(token)}
          labelStyle={tooltipLabelStyle(token)}
        />
        <Legend
          wrapperStyle={{ paddingTop: token.paddingXS }}
          formatter={(value: React.ReactNode) => (
            <span style={legendLabelStyle(token)}>{value}</span>
          )}
        />
        {/* Dua hitungan tanpa arah: biru & emas, bukan hijau/merah. */}
        <Bar dataKey="contracts" fill={palette.countPrimary} name={t("nav.items.contracts")} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="invoices" fill={palette.countSecondary} name={t("nav.items.invoices")} radius={[4, 4, 0, 0]} maxBarSize={40} />
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
  const { token } = theme.useToken();
  const palette = chartPalette(token);
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
        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: palette.tick }} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11, fill: palette.tickStrong }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, item: any) => {
            const unit = (item?.payload as StockLevelData)?.unit;
            return [`${formatFull(Number(value ?? 0))}${unit ? ` ${unit}` : ""}`, t("charts.tooltipCurrentStock")];
          }}
          cursor={{ fill: palette.cursor }}
          contentStyle={tooltipSurface(token)}
          labelStyle={tooltipLabelStyle(token)}
        />
        {/* Sisa stok adalah KUANTITAS, bukan arah — lihat `countPrimary`. */}
        <Bar dataKey="stock" fill={palette.countPrimary} name={t("charts.seriesQuantity")} radius={[0, 4, 4, 0]} maxBarSize={28} />
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
  const palette = chartPalette(token);
  if (!active || !payload?.length) return null;
  const income = payload.find((p: { dataKey: string }) => p.dataKey === "debit")?.value ?? 0;
  const expense = payload.find((p: { dataKey: string }) => p.dataKey === "credit")?.value ?? 0;

  return (
    /*
     * Masuk/keluar TIDAK dibedakan warna saja: kalimatnya sendiri menyebutkan
     * "Uang masuk"/"Uang keluar" (`charts.tooltipMoneyIn/Out`). Warnanya
     * `colorMoneyPositive`/`colorMoneyNegative` (#186) — nada yang sama dengan
     * batangnya dan dengan `Money` di tabel, jadi angka di tooltip dan angka di
     * baris tidak bisa berbeda warna.
     */
    <div style={tooltipSurface(token)}>
      <div style={tooltipLabelStyle(token)}>{label}</div>
      <div style={{ color: palette.moneyIn }}>
        {t("charts.tooltipMoneyIn", { amount: formatMoney(income, currency) })}
      </div>
      <div style={{ color: palette.moneyOut }}>
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
  const { token } = theme.useToken();
  const palette = chartPalette(token);
  if (data.length === 0 || data.every((d) => d.debit === 0 && d.credit === 0)) {
    return <ChartEmpty message={t("charts.noCashMovement", { currency })} />;
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: palette.tick }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: palette.tick }}
          tickFormatter={formatCompact}
          width={52}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: palette.cursor }} content={<CashFlowTooltip currency={currency} />} />
        <Legend
          wrapperStyle={{ paddingTop: token.paddingXS }}
          formatter={(value: React.ReactNode) => (
            <span style={legendLabelStyle(token)}>{value}</span>
          )}
        />
        <Bar dataKey="debit" fill={palette.moneyIn} name={t("finance.colMoneyIn")} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="credit" fill={palette.moneyOut} name={t("finance.colMoneyOut")} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
