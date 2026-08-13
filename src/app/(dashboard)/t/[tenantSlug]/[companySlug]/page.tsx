import { auth } from "@/lib/auth";
import { requireUnlockedCompany } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { statusColumn } from "@/components/ui/status-column";
import { Money } from "@/components/ui/money";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/components/ui/app-link";
import { formatDateShort, formatNumber } from "@/lib/utils";
import {
  countStockHealth,
  stockLevelsFromTotals,
  toLowStockAlerts,
} from "@/lib/inventory";
import { LOW_STOCK_THRESHOLD, type CashType } from "@/lib/constants";
import { effectivePermissionsFor } from "@/lib/authz-effective";
import { enterCompanyFromRoute } from "@/lib/company-route";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { quickActionsForRole } from "@/lib/quick-actions";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { visibleWorkflows } from "@/lib/workflows";
import { WorkflowGuide } from "@/components/dashboard/workflow-guide";
import {
  isFirstRun,
  visibleFirstSteps,
  type FirstStepProgress,
} from "@/lib/first-steps";
import { FirstStepsPanel } from "@/components/dashboard/first-steps-panel";
import {
  formatMonthYear,
  isRoutineDue,
  monthBounds,
  previousMonth,
  visibleMonthlySteps,
  type MonthlyRoutineProgress,
} from "@/lib/monthly-routine";
import { MonthlyRoutinePanel } from "@/components/dashboard/monthly-routine-panel";
import { GlossaryHint } from "@/components/dashboard/glossary-hint";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { ContainerOutlined, FileTextOutlined } from "@ant-design/icons";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { StatCard } from "@/components/dashboard/stat-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  InventoryExportAction,
  FinanceExportAction,
} from "@/components/dashboard/dashboard-export-actions";
import type { FinanceBalanceRow } from "@/lib/pdf/finance-report-pdf";
import { getIncomeStatement } from "@/lib/reports";
import { getReceivables, getPayables } from "@/lib/receivables";
import { monthRange, summarizeByCurrency, toISODate } from "@/lib/dashboard-summary";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { cashTypeLabels } from "@/lib/i18n/labels";

export const dynamic = "force-dynamic";

/*
 * ── Kenapa berkas ini penuh angka dan bukan token (issue #199) ─────────────
 *
 * Beranda TETAP server component, dan itu bukan kebetulan: ia menjalankan
 * belasan kueri Prisma (saldo kas, piutang, utang, gerakan stok, kontrak) dan
 * merender tabelnya sebagai HTML. Konsekuensinya ia **tidak boleh mengimpor
 * `antd`** (dijaga `tests/rsc-boundary.test.ts`), jadi `theme.useToken()` tidak
 * tersedia di sini.
 *
 * Yang dipakai sebagai gantinya, urut dari yang paling disukai:
 *
 *  1. **Primitif yang mewarnai dirinya sendiri** — `Money`/`moneyColumn` (token
 *     uang #186), `Badge` (token `Tag`), `Card`, `EmptyState`. Semuanya
 *     komponen client yang dirender sebagai DAUN, jadi batas RSC tidak bergeser.
 *  2. **Variabel `--ant-…`**, TAPI hanya untuk simpul yang berada DI DALAM
 *     sebuah komponen AntD (di berkas ini: di dalam `Card`). `ConfigProvider`
 *     v6 memasang variabelnya pada elemen yang digambar komponen AntD sendiri,
 *     bukan pada `:root` — di luar pohon itu warnanya jatuh diam-diam ke
 *     warisan. Aturan yang sama dengan `components/shared/aging.tsx` (#194).
 *  3. **Konstanta piksel di bawah** untuk JARAK dan LEBAR — bukan warna. Setiap
 *     nilainya sama dengan token yang seharusnya dipakai, dan token itu disebut
 *     namanya supaya #203 bisa menukarnya tanpa menebak.
 */
/** `space-y-10` antar-seksi beranda. Bukan token AntD: `marginXXL` hanya 48. */
const SECTION_GAP = 40;
/** `gap-4` di dalam seksi = `margin` (16). */
const CARD_GAP = 16;
/** `pb-3` kepala kartu tabel = `paddingSM` (12). */
const CARD_HEADER_BOTTOM = 12;
/** `pb-1` kepala kartu saldo = `paddingXXS` (4). */
const TIGHT_HEADER_BOTTOM = 4;
/** `text-base` judul kartu di dalam seksi = `fontSize` (14 -> 16 di app ini). */
const CARD_TITLE_SIZE = 16;
/** `text-2xl` saldo bersih = `fontSizeHeading3` (24); tebal = ambang teks besar. */
const BALANCE_SIZE = 24;
/** `border-l-4` garis aksen kartu saldo. */
const ACCENT_BORDER = 4;
/** `py-10` badan kartu "belum ada kas" = `paddingXL` (32) dibulatkan dari 40. */
const EMPTY_CARD_PADDING = 40;
/** Ukuran ikon `EmptyState` — bekas `h-12 w-12`. */
const EMPTY_ICON = 48;
/**
 * Lebar dasar satu kartu dalam baris yang membagi diri sendiri. Menggantikan
 * `sm:grid-cols-2 lg:grid-cols-3` dan `grid-cols-2 lg:grid-cols-4`: kartunya
 * turun sendiri saat tak muat, satu kolom di 375px tanpa satu pun media query.
 */
const SUMMARY_CARD_BASIS = 260;
const STAT_CARD_BASIS = 150;

/** Baris kartu yang membagi lebarnya sendiri — pengganti kelas `grid …-cols-*`. */
function autoGrid(basis: number): React.CSSProperties {
  return {
    display: "grid",
    gap: CARD_GAP,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${basis}px), 1fr))`,
  };
}

/*
 * Beranda = permukaan MENGERJAKAN, bukan melihat.
 *
 * Grafik pernah tinggal di sini dan sudah pindah ke halaman yang angkanya
 * dijelaskan: kondisi stok & stok terbanyak → /inventory, uang masuk/keluar
 * per mata uang → /reports/cash-flow, status kontrak & aktivitas bulanan →
 * /contracts. Dua alasan, keduanya masih berlaku kalau nanti ada yang
 * tergoda mengembalikannya:
 *
 *  • Beranda adalah titik BERANGKAT pekerjaan — Aksi Cepat paling atas,
 *    lalu urutan alur kerja. Grafik adalah permukaan melihat, dan di
 *    halaman tujuannya ia berdiri tepat di sebelah baris yang bisa dicek.
 *  • `components/shared/dashboard-charts.tsx` adalah SATU-SATUNYA pemakai
 *    recharts. Selama ia diimpor dari sini, seluruh pustaka grafik ikut
 *    termuat di halaman pertama yang dibuka SETIAP pengguna — termasuk
 *    yang datang cuma untuk menekan satu tombol Aksi Cepat.
 *
 * Konsekuensinya beranda tidak lagi MENGHITUNG apa pun untuk grafik: kueri
 * 6 bulan (kas, kontrak, tagihan) dan hitungan status sah/dibatalkan ikut
 * hilang, bukan sekadar tidak dirender. Lihat
 * design-system/sai-accounting/pages/dashboard.md.
 */
/*
 * Tiga jenis gerakan stok, bukan dua (issue #111). Sebelumnya barisnya dibaca
 * "masuk, kalau bukan berarti keluar" — sehingga `process` (barang yang sedang
 * disortir/diolah, MASIH milik perusahaan) muncul sebagai "Barang Keluar"
 * berwarna merah, padahal ia tidak mengurangi saldo sama sekali. Warnanya
 * netral karena memang tidak ada uang/barang yang berpindah.
 *
 * Yang dikembalikan adalah VARIAN `Badge`, bukan seuntai kelas: sebelumnya
 * fungsi ini menyalin persis isi varian `success`/`danger`/`default` milik
 * primitifnya ke dalam sebuah `<span>` rakitan tangan. Salinan itu tidak ikut
 * berubah ketika pasangan soft/strong diperbaiki di `badge.tsx` — dan padding,
 * `gap`, serta `whitespace-nowrap`-nya pun sudah menyimpang.
 */
function movementVariant(type: string): "success" | "danger" | "default" {
  if (type === "in") return "success";
  if (type === "out") return "danger";
  return "default";
}

function movementLabelKey(type: string) {
  if (type === "in") return "dashboard.stockIn" as const;
  if (type === "out") return "dashboard.stockOut" as const;
  return "dashboard.stockProcess" as const;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  /*
   * Beranda menjaga dirinya sendiri (terdaftar di tests/authz-coverage.test.ts):
   * ia terbuka untuk SEMUA peran, jadi tidak ada satu izin yang bisa ia
   * deklarasikan ke `requirePagePermission`. Konsekuensinya ia juga harus
   * memasang konteks perusahaannya sendiri — dan sejak issue #157 konteks itu
   * datang dari JALUR, bukan dari sesi.
   *
   * `enterCompanyFromRoute` melakukan keduanya sekaligus: memverifikasi
   * keanggotaan di permintaan ini dan menanamkan konteksnya. Gagal apa pun =
   * 404 yang identik, sama seperti halaman berizin di sebelahnya; tanpa sesi =
   * halaman masuk. Yang TIDAK boleh terjadi di sini adalah jatuh ke perusahaan
   * di sesi — beranda menampilkan saldo, piutang, dan stok, dan angka milik PT
   * lain di layar berjudul PT ini adalah kesalahan yang tidak berbunyi.
   */
  const scoped = await enterCompanyFromRoute({
    tenantSlug: (await params).tenantSlug,
    companySlug: (await params).companySlug,
    userId: session.user.id,
  });
  if (!scoped.ok) {
    if (scoped.reason === "no-session") redirect("/login");
    notFound();
  }

  /*
   * Kunci buku — WAJIB di sini juga, dan justru di sini yang paling penting.
   *
   * Halaman ini menjaga dirinya sendiri (lihat catatan di atas), jadi ia tidak
   * lewat `gateAfterCompany` tempat gerbang ini berdiri untuk semua halaman
   * lain. Tanpa baris ini, pintu PERTAMA sesudah masuk — dan satu-satunya yang
   * memajang saldo, piutang, dan stok di satu layar — adalah satu-satunya
   * pintu yang tidak menuntut bukti kehadiran.
   */
  await requireUnlockedCompany(session.user.id, scoped.companyId, {
    tenantSlug: scoped.tenantSlug,
    companySlug: scoped.companySlug,
  });

  const t = await getT();
  /* Dipegang sebagai variabel: dipakai dua kali sekarang — kamus, dan nama
     bulan di panel Rutinitas Bulanan (issue #355). */
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);

  /*
   * Peran DI PERUSAHAAN JALUR — bukan `session.user.role`, yang menyimpan peran
   * di perusahaan yang TERAKHIR dibuka. Beranda menyusun menu, aksi cepat, dan
   * panduan langkah pertama dari peran ini; memakai peran perusahaan lain akan
   * menawarkan tindakan yang halamannya justru menolaknya.
   */
  const role = scoped.role;
  const user = { ...session.user, role, accountantMode: scoped.accountantMode };
  // issue #73/#75 — semua keputusan tampilan beranda membaca set izin FINAL
  // si pengguna (bawaan + override peran + izin khusus pengguna), sekali muat
  // per render.
  const allowed = new Set(await effectivePermissionsFor(user));
  // issue #2 — Aksi Cepat disaring PER PERAN di server: tombol yang tidak boleh
  // dipakai peran ini tidak ikut dirender sama sekali (bukan disembunyikan CSS).
  const quickActions = quickActionsForRole(role, allowed);
  // issue: panduan urutan "mulai dari mana" — alur bernomor per pekerjaan,
  // disaring izin efektif seperti Aksi Cepat.
  const workflows = visibleWorkflows(role, allowed);
  // audit RBAC fase 4 — keputusan tampilan per-seksi membaca matriks izin,
  // bukan membandingkan string peran.
  const canViewFinance = allowed.has("cash.read");
  const canViewContracts = canViewFinance;
  /*
   * issue #103 — permukaan STOK milik modul `inventory`, dan modul itu mati di
   * preset "Jasa" maupun "Distribusi tanpa gudang". Sampai sekarang seksinya
   * tetap dirender tanpa syarat: perusahaan jasa melihat kartu stok berisi nol,
   * empty state yang mengajak "Tambah/Kurangi Stok", dan spanduk stok menipis —
   * yang semuanya bermuara ke /inventory dan memantul ke "fitur belum aktif".
   *
   * `allowed` sudah disaring modul (`effectivePermissionsFor`), jadi satu cek
   * izin menutup keduanya: modul mati ATAU peran memang tak boleh melihat stok.
   */
  const canViewInventory = allowed.has("inventory.read");
  const canUpdateInventory = allowed.has("inventory.write");
  // Ajakan "buat kontrak" di empty state kontrak: seksinya masih dibuka izin
  // KAS (lihat `canViewContracts` di atas — warisan, bukan keputusan baru),
  // jadi tombolnya perlu izinnya sendiri agar tidak mengajak ke modul `trading`
  // yang mungkin mati.
  const canCreateContract = allowed.has("contract.write");

  /*
   * ── Perusahaan yang belum bertransaksi mendapat beranda yang berbeda ──────
   *
   * Sampai audit ini, hari pertama sebuah PT terlihat begini: tiga kartu
   * Ringkasan berisi Rp 0, sembilan kartu angka berisi 0, dan dua empty state
   * yang terkubur di dalam badan tabel. Yang dibaca pengguna baru dari layar
   * itu bukan "belum ada apa-apa" melainkan "ada yang rusak" — dan tak satu
   * pun dari angka nol itu memberitahunya apa yang harus dikerjakan.
   *
   * Probe-nya sengaja MURAH dan dijalankan LEBIH DULU: tiga `count()` tanpa
   * baris. Bila ternyata perusahaan ini baru, seluruh kueri berat di bawah
   * (ringkasan laba/rugi, piutang, utang, saldo kas, gerakan stok, kontrak)
   * tidak pernah berjalan — aturan yang sama dengan "kueri seksi tersembunyi
   * tidak dijalankan" di design-system/sai-accounting/pages/dashboard.md.
   *
   * Keputusannya membaca keadaan PERUSAHAAN, bukan keadaan pengguna, jadi
   * ketiga hitungan berjalan tanpa penyaringan izin — tak satu pun ANGKA-nya
   * sampai ke layar. Yang disaring izin adalah daftar langkahnya
   * (`visibleFirstSteps`), sehingga tiap orang hanya diminta mengerjakan yang
   * memang boleh ia kerjakan.
   */
  const [saleCount, cashCount, stockCount] = await Promise.all([
    prisma.invoice.count(),
    prisma.cashMovement.count(),
    prisma.stockMovement.count(),
  ]);

  const firstStepProgress: FirstStepProgress = {
    penjualan: saleCount > 0,
    terima_uang: cashCount > 0,
    stok_awal: stockCount > 0,
  };
  const firstSteps = visibleFirstSteps(role, allowed);

  /*
   * Peran tanpa satu pun langkah yang boleh dikerjakan (mis. peran baca-saja)
   * TIDAK dibawa ke sini: panelnya akan kosong dan yang tersisa hanyalah
   * halaman hampa. Mereka tetap mendapat beranda biasa, yang setidaknya
   * menjelaskan kekosongannya lewat empty state tiap seksi.
   */
  if (isFirstRun(firstStepProgress) && firstSteps.length > 0) {
    const [customerCount, supplierCount] = await Promise.all([
      prisma.customer.count(),
      prisma.supplier.count(),
    ]);

    return (
      /*
       * `data-tour-suppress` mematikan pemutaran OTOMATIS tur Beranda di sini
       * (lihat `components/help/guided-tour.tsx`). Tur itu menjelaskan
       * Ringkasan dan seksi-seksi angka yang justru tidak dirender di halaman
       * ini; memainkannya berarti menyorot kotak yang tidak ada, di atas layar
       * yang sudah punya penjelasannya sendiri. Pemutaran dari menu Bantuan
       * tetap bisa dilakukan kapan saja.
       */
      <div
        style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP }}
        data-tour-suppress="beranda"
      >
        <PageHeader
          title={t("nav.items.dashboard")}
          description={t("dashboard.description", { name: session.user.name })}
        />

        <QuickActions actions={quickActions} />

        <FirstStepsPanel
          steps={firstSteps}
          progress={{
            ...firstStepProgress,
            pelanggan: customerCount > 0,
            pemasok: supplierCount > 0,
          }}
        />

        {/* Hari pertama justru saat istilahnya paling asing — jadi ajakan ke
            kamus ikut di layar sambutan, bukan hanya di beranda biasa. */}
        {allowed.has("glossary.read") && <GlossaryHint />}
      </div>
    );
  }

  // Jumlah tagihan sudah dihitung oleh probe di atas — dihitung ulang di sini
  // berarti dua kueri identik pada setiap pembukaan beranda.
  const invoiceCount = canViewContracts ? saleCount : 0;

  const [
    contractCount,
    supplierCount,
    items,
    movementTotals,
    latestMovements,
    pendingContracts,
    pendingInvoices,
    cashTotals,
    latestContracts,
  ] = await Promise.all([
    canViewContracts ? prisma.contract.count() : Promise.resolve(0),
    canViewContracts ? prisma.supplier.count() : Promise.resolve(0),
    /*
     * RINGKASAN, BUKAN SELURUH GERAKAN STOK.
     *
     * Sebelumnya baris ini memuat setiap barang BESERTA seluruh riwayat
     * gerakannya, lalu menjumlahkannya di JavaScript — pekerjaan yang tumbuh
     * seumur perusahaan dan diulang pada SETIAP pembukaan beranda, padahal yang
     * ditampilkan hanya empat angka kesehatan stok dan daftar stok menipis.
     * Penjumlahannya kini dilakukan basis data.
     */
    prisma.item.findMany({ select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
    prisma.stockMovement.groupBy({ by: ["itemId", "type"], _sum: { quantity: true } }),
    prisma.stockMovement.findMany({
      orderBy: { date: "desc" },
      take: 5,
      select: {
        type: true,
        quantity: true,
        date: true,
        item: { select: { name: true, unit: true } },
      },
    }),
    canViewContracts ? prisma.contract.count({ where: { status: "pending" } }) : Promise.resolve(0),
    canViewContracts ? prisma.invoice.count({ where: { status: "pending" } }) : Promise.resolve(0),
    /*
     * SALDO DIJUMLAHKAN BASIS DATA, bukan dengan menarik seluruh buku kas.
     *
     * Beranda hanya menampilkan saldo per (jenis × mata uang) dan per mata uang.
     * Versi sebelumnya memuat SETIAP baris kas — 18.000+ baris pada pemasangan
     * yang berjalan setahun — hanya untuk menjumlahkan dua kolom. Angkanya sama
     * persis; yang hilang cuma pekerjaannya.
     */
    canViewFinance
      ? prisma.cashMovement.groupBy({
          by: ["type", "currency"],
          _sum: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    canViewContracts
      ? prisma.contract.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
      : Promise.resolve([]),
  ]);

  /*
   * Plain-language summary layer (issue #3).
   *
   * Nothing is aggregated here: the three month figures come straight from
   * `getIncomeStatement`, and the two outstanding figures from `getReceivables` /
   * `getPayables`, so each card shows the very number its "Lihat detail" link
   * opens. `period` supplies both the query bounds and the link's `?from=&to=`,
   * which is what makes the income-statement cards reproducible by clicking.
   *
   * The AR/AP as-of instant mirrors `/receivables`'s own default (end of today),
   * for the same reason.
   *
   * Role split: `/reports/*` is bos-only while `/receivables` and `/payables`
   * admit core too, so staff get the two cards whose source they can actually
   * open. Showing staff a profit figure they cannot verify would break the
   * "every number is traceable" criterion rather than serve it.
   */
  const period = monthRange(new Date());
  const arAsOf = new Date(`${toISODate(new Date())}T23:59:59.999`);
  const canViewReports = allowed.has("report.read");

  const [incomeStatement, receivables, payables] = await Promise.all([
    canViewReports ? getIncomeStatement(period.from, period.to) : Promise.resolve(null),
    canViewFinance ? getReceivables({ asOf: arAsOf }) : Promise.resolve(null),
    canViewFinance ? getPayables({ asOf: arAsOf }) : Promise.resolve(null),
  ]);

  const incomeStatementHref = `/reports/income-statement?from=${period.fromISO}&to=${period.toISO}`;

  // Saldo per barang dari hasil GROUP BY — aturan yang sama dengan
  // `calculateStockTotals`, dibuktikan tes (tests/inventory-value.test.ts).
  const stockLevels = stockLevelsFromTotals(
    items,
    movementTotals.map((row) => ({
      itemId: row.itemId,
      type: row.type,
      quantity: Number(row._sum.quantity ?? 0),
    }))
  );

  const stockHealth = countStockHealth(stockLevels);
  const lowStockItems = toLowStockAlerts(stockLevels);

  const recentMovements = latestMovements.map((m) => ({
    itemName: m.item.name,
    type: m.type,
    quantity: Number(m.quantity),
    unit: m.item.unit,
    date: m.date,
  }));

  const financeBalances: FinanceBalanceRow[] = cashTotals.map((row) => {
    const debit = Number(row._sum.debit ?? 0);
    const credit = Number(row._sum.credit ?? 0);
    return { type: row.type, currency: row.currency, debit, credit, balance: debit - credit };
  });

  const balanceByCurrency = new Map<string, number>();
  for (const row of financeBalances) {
    balanceByCurrency.set(
      row.currency,
      (balanceByCurrency.get(row.currency) || 0) + row.balance
    );
  }

  /*
   * ── Tiga tabel beranda memakai `StaticTable`, bukan `DataTable` ───────────
   * Ketiganya hanya MENAMPILKAN lima baris terakhir yang sudah dipilih kueri
   * (`take: 5`) — tak ada yang bisa disortir atau disaring di sini, dan
   * pengurutannya memang pekerjaan basis data. `DataTable` akan menyalin
   * barisnya ke bundel peramban dan menghidrasi rc-table di atas HTML yang
   * sudah jadi, untuk tampilan yang identik. Lihat kepala `static-table.tsx`.
   */
  const movementColumns: SaiColumns<(typeof recentMovements)[number]> = [
    textColumn({ dataIndex: "itemName", title: t("common.item") }),
    {
      key: "type",
      dataIndex: "type",
      title: t("suppliers.colType"),
      // Badge BERTEKS: arah gerakan dibaca dari katanya, warnanya penanda kedua.
      render: (_value, m) => (
        <Badge variant={movementVariant(m.type)}>
          <span>{t(movementLabelKey(m.type))}</span>
        </Badge>
      ),
    },
    {
      key: "quantity",
      dataIndex: "quantity",
      title: t("common.quantity"),
      align: "right",
      /* Kuantitas = angka + SATUAN, diformat id-ID seperti setiap angka lain di
         app ini. "1500.5" telanjang tidak memberitahu pembacanya itu 1.500,5 kg
         atau 1.500,5 ton. Bukan `qtyColumn`, yang tidak membawa satuan. */
      render: (_value, m) => (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {formatNumber(m.quantity)}
          {m.unit ? ` ${m.unit}` : ""}
        </span>
      ),
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      render: (_value, m) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {formatDateShort(m.date)}
        </span>
      ),
    },
  ];

  /*
   * ── Kolom uang: token #186, BUKAN pasangan `-strong` lama ─────────────────
   * Kolomnya berwarna menurut ARAH yang dinyatakan judulnya ("Uang Masuk" /
   * "Uang Keluar"), bukan menurut tanda angkanya — jadi `tone` dipasang tetap,
   * dan penanda non-warnanya adalah judul kolom itu sendiri.
   *
   * Yang berubah dari audit kontras sebelumnya: `--success-strong` (#166534,
   * 7,13:1) dan `--destructive-strong` (#991B1B, 8,31:1) diganti
   * `colorMoneyPositive` (#237804) dan `colorMoneyNegative` (#b32430) — 5,59:1
   * dan 6,54:1 di atas `colorBgContainer` tema terang, 9,23:1 dan 7,86:1 di
   * tema gelap (terburuk dari ketiga latar). Angkanya turun tapi tetap jauh di
   * atas 4,5:1, dan sekarang ia SATU sumber dengan seluruh nominal aplikasi —
   * itulah yang dulu tidak berlaku: `-strong` hanya dipakai di beranda.
   *
   * Saldo memakai `signed`, bukan `tone` tetap: arahnya memang datang dari
   * TANDA angkanya, dan `Money` menulis tanda minusnya sebagai penanda kedua.
   */
  const balanceColumns: SaiColumns<FinanceBalanceRow> = [
    {
      key: "type",
      dataIndex: "type",
      title: t("common.account"),
      render: (_value, b) => cashTypeLabels(dictionary)[b.type as CashType] || b.type,
    },
    {
      key: "currency",
      dataIndex: "currency",
      title: t("common.currency"),
      render: (_value, b) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{b.currency}</span>
      ),
    },
    moneyColumn<FinanceBalanceRow>({
      dataIndex: "debit",
      title: t("finance.colMoneyIn"),
      currency: (row) => row.currency,
      tone: "positive",
    }),
    moneyColumn<FinanceBalanceRow>({
      dataIndex: "credit",
      title: t("finance.colMoneyOut"),
      currency: (row) => row.currency,
      tone: "negative",
    }),
    moneyColumn<FinanceBalanceRow>({
      dataIndex: "balance",
      title: t("common.balance"),
      currency: (row) => row.currency,
      signed: true,
    }),
  ];

  const contractRows = latestContracts.map((c) => ({
    id: c.id,
    contractNo: c.contractNo,
    buyer: c.buyer,
    date: c.date,
    status: c.status,
  }));

  const contractColumns: SaiColumns<(typeof contractRows)[number]> = [
    {
      key: "contractNo",
      dataIndex: "contractNo",
      title: <TermTooltip term="kontrak">{t("contracts.colNo")}</TermTooltip>,
      render: (_value, c) => (
        // `--ant-color-link` (= `colorBrandText`, 5,65:1), bukan
        // `--ant-color-primary` yang sebagai teks hanya 4,10:1. Ia teratasi di
        // sini karena selnya berada di DALAM sebuah `Card` AntD.
        <Link href={`/contracts/${c.id}`} style={{ color: "var(--ant-color-link)", fontWeight: 500 }}>
          {c.contractNo}
        </Link>
      ),
    },
    textColumn({ dataIndex: "buyer", title: t("contracts.colBuyer") }),
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      render: (_value, c) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {formatDateShort(c.date)}
        </span>
      ),
    },
    statusColumn({ dataIndex: "status", title: t("common.status") }),
  ];

  /*
   * ── Rutinitas Bulanan (issue #355) ────────────────────────────────────────
   *
   * Panel Langkah Pertama menghilang untuk selamanya begitu transaksi pertama
   * tercatat, dan sampai audit 13 Agustus 2026 tak ada penggantinya: pengguna
   * awam akuntansi tak pernah diberi tahu bahwa sebuah bulan perlu DITUTUP,
   * apalagi kenapa. `/periods` duduk di menu tanpa satu pun jalan ke sana.
   *
   * Probe-nya SATU kueri dan dijalankan lebih dulu: cukup tahu bulan lalu sudah
   * terkunci atau belum. Kalau sudah, dua hitungan sisanya tidak pernah
   * berjalan — beranda yang tenang tidak boleh membayar untuk panel yang tidak
   * dirender. Aturan yang sama dengan probe Langkah Pertama di atas.
   */
  const monthlySteps = visibleMonthlySteps(role, allowed);
  const lastMonth = previousMonth(new Date());
  const closedPeriod =
    monthlySteps.length > 0
      ? await prisma.period.findUnique({
          where: { year_month: { year: lastMonth.year, month: lastMonth.month } },
          select: { status: true },
        })
      : null;

  let monthlyProgress: MonthlyRoutineProgress | null = null;
  if (monthlySteps.length > 0) {
    const progress: MonthlyRoutineProgress = {
      tutup_bulan: closedPeriod?.status === "closed",
    };
    if (isRoutineDue(progress)) {
      const bounds = monthBounds(lastMonth.year, lastMonth.month);
      const [spendCount, statementCount] = await Promise.all([
        /* Uang KELUAR = sisi kredit buku kas (lihat api/finance/route.ts:71). */
        prisma.cashMovement.count({
          where: { date: { gte: bounds.start, lte: bounds.end }, credit: { gt: 0 } },
        }),
        /* Rekening koran yang sudah DIKUNCI, bukan yang masih draft: draft
           berarti pencocokannya sedang berjalan, belum selesai. */
        prisma.bankStatement.count({
          where: {
            status: "locked",
            periodStart: { gte: bounds.start },
            periodEnd: { lte: bounds.end },
          },
        }),
      ]);
      progress.pengeluaran = spendCount > 0;
      progress.cocokkan_bank = statementCount > 0;
      monthlyProgress = progress;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP }}>
      <PageHeader
        title={t("nav.items.dashboard")}
        description={t("dashboard.description", { name: session.user.name })}
      />

      {/* ─── Aksi Cepat (issue #2) ───
          Paling atas karena beranda lebih sering dipakai untuk MENGERJAKAN
          sesuatu daripada untuk membaca angka. */}
      <QuickActions actions={quickActions} />

      {/* ─── Rutinitas Bulanan (issue #355) ───
          Di ATAS Alur Kerja karena ia PUNYA TENGGAT: alur kerja menjelaskan
          urutan kerja harian yang selalu berlaku, sedangkan panel ini muncul
          hanya selama ada bulan yang belum dikunci — dan hilang sendiri begitu
          dikunci. Yang berbatas waktu didahulukan. */}
      {monthlyProgress && (
        <MonthlyRoutinePanel
          steps={monthlySteps}
          progress={monthlyProgress}
          monthLabel={formatMonthYear(lastMonth.year, lastMonth.month, locale)}
        />
      )}

      {/* ─── Alur Kerja (panduan urutan) ───
          Tepat di bawah Aksi Cepat: setelah tombol "kerjakan sekarang", tunjukkan
          URUTAN kerjanya bagi yang belum tahu mulai dari mana. */}
      <WorkflowGuide workflows={workflows} t={t} />

      {canViewInventory && <StockAlertBanner items={lowStockItems} />}

      {/* ─── Ringkasan bahasa awam (issue #3) ───
          Sits above the standard reports on purpose: an owner should get the
          five answers first and only descend into the ledger if they want to.
          Every card links to the report that owns its number. */}
      {(incomeStatement || receivables || payables) && (
        // Pembungkus ini hanya penanda sasaran tur panduan (issue #21).
        <div data-tour="ringkasan">
        <DashboardSection
          title={t("dashboard.plainTitle")}
          description={t("dashboard.plainDescription")}
        >
          <div style={autoGrid(SUMMARY_CARD_BASIS)}>
            {incomeStatement && (
              <>
                <SummaryCard
                  title={t("finance.colMoneyIn")}
                  amount={incomeStatement.totalRevenue}
                  direction="in"
                  period={period.label}
                  explanation={t("dashboard.moneyInExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
                <SummaryCard
                  title={t("finance.colMoneyOut")}
                  amount={incomeStatement.totalExpense}
                  direction="out"
                  period={period.label}
                  explanation={t("dashboard.moneyOutExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
                <SummaryCard
                  title={t("dashboard.profitLoss")}
                  amount={Math.abs(incomeStatement.netIncome)}
                  direction={incomeStatement.netIncome >= 0 ? "profit" : "loss"}
                  period={period.label}
                  explanation={t("dashboard.profitLossExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
              </>
            )}

            {receivables && (
              <SummaryCard
                title={t("receivables.title")}
                amount={receivables.aging.total}
                direction="receivable"
                period={t("dashboard.asOf", { date: formatDateShort(arAsOf) })}
                explanation={t("dashboard.receivablesExplanation")}
                href="/receivables"
                hrefLabel={t("dashboard.receivablesLink")}
                note={
                  receivables.overdueCount > 0
                    ? t("common.overdueDocs", { count: receivables.overdueCount })
                    : undefined
                }
                unresolved={receivables.aging.unresolved}
                breakdown={summarizeByCurrency(receivables.rows)}
              />
            )}

            {payables && (
              <SummaryCard
                title={t("payables.title")}
                amount={payables.aging.total}
                direction="payable"
                period={t("dashboard.asOf", { date: formatDateShort(arAsOf) })}
                explanation={t("dashboard.payablesExplanation")}
                href="/payables"
                hrefLabel={t("dashboard.payablesLink")}
                note={
                  payables.overdueCount > 0
                    ? t("dashboard.overdueBills", { count: payables.overdueCount })
                    : undefined
                }
                unresolved={payables.aging.unresolved}
                breakdown={summarizeByCurrency(payables.rows)}
              />
            )}
          </div>
        </DashboardSection>
        </div>
      )}

      {/* ─── Stok ─── */}
      {canViewInventory && (
      <DashboardSection
        title={t("nav.items.inventory")}
        description={t("dashboard.stockDescription", { threshold: LOW_STOCK_THRESHOLD })}
        href="/inventory"
        hrefLabel={t("dashboard.stockHrefLabel")}
        actions={<InventoryExportAction />}
      >
        {/*
          * Warna kartu kondisi stok KEMBALI (issue #229), dan berkas ini tetap
          * server component tanpa satu pun kelas Tailwind: `tone` mewarnai
          * dirinya sendiri dari token uang AntD di dalam `StatCard`. Lihat
          * kepala `components/dashboard/stat-card.tsx` — termasuk kenapa ia
          * masih boleh dirender di server.
          *
          * Warnanya tetap BUKAN penanda tunggal: judul kartunya sendiri
          * menyebut keadaannya ("Stok Sehat" / "Stok Menipis" / "Stok Habis"),
          * dan tiap kartu menaut ke halaman yang bisa menindaklanjutinya.
          */}
        <div style={autoGrid(STAT_CARD_BASIS)}>
          <StatCard title={t("dashboard.statItems")} value={stockHealth.totalItems} href="/inventory" />
          <StatCard
            title={t("dashboard.statHealthy")}
            value={stockHealth.healthy}
            href="/inventory"
            tone="success"
          />
          <StatCard
            title={t("dashboard.statLow")}
            value={stockHealth.lowStock}
            href="/inventory/opname"
            tone="warning"
          />
          <StatCard
            title={t("dashboard.statEmpty")}
            value={stockHealth.empty}
            href="/inventory/opname"
            tone="danger"
          />
        </div>

        <Card>
          <CardHeader style={{ paddingBottom: CARD_HEADER_BOTTOM }}>
            <CardTitle style={{ fontSize: CARD_TITLE_SIZE }}>
              {t("dashboard.recentMovementsTitle")}
            </CardTitle>
          </CardHeader>
          <StaticTable
            columns={movementColumns}
            rows={recentMovements}
            rowKey={(_row, index) => index ?? 0}
            empty={
              <EmptyState
                icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON }} />}
                title={t("dashboard.emptyMovementsTitle")}
                description={t("dashboard.emptyMovementsDescription")}
                actionLabel={canUpdateInventory ? t("common.addRemoveStock") : undefined}
                actionHref={canUpdateInventory ? "/inventory/update" : undefined}
              />
            }
          />
        </Card>
      </DashboardSection>
      )}

      {/* ─── Finance ─── */}
      {canViewFinance && (
        <DashboardSection
          title={t("nav.groups.cash")}
          description={t("dashboard.financeDescription")}
          href="/finance"
          hrefLabel={t("dashboard.financeHrefLabel")}
          actions={
            <FinanceExportAction />
          }
        >
          {balanceByCurrency.size > 0 ? (
            <div style={autoGrid(SUMMARY_CARD_BASIS)}>
              {Array.from(balanceByCurrency.entries()).map(([cur, balance]) => (
                /* Garis aksen kiri = `--ant-color-primary`, dan sekarang ia
                   benar-benar ikut bertema. Kelas `border-l-primary` lama lolos
                   gerbang lint karena polanya belum mengenal sisi arah, lalu
                   tetap #3B82F6 saat tema gelap menyala — satu-satunya bidang di
                   beranda yang tidak ikut berganti. Variabelnya teratasi karena
                   yang memakainya adalah elemen `Card` AntD itu sendiri. */
                <Card
                  key={cur}
                  style={{
                    borderInlineStartWidth: ACCENT_BORDER,
                    borderInlineStartColor: "var(--ant-color-primary)",
                  }}
                >
                  <CardHeader style={{ paddingBottom: TIGHT_HEADER_BOTTOM }}>
                    <CardTitle
                      style={{
                        fontSize: "var(--ant-font-size)",
                        color: "var(--ant-color-text-secondary)",
                      }}
                    >
                      {t("dashboard.netBalance", { currency: cur })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/*
                     * Angka besar tebal — ambang teks besar 3:1 — tapi warnanya
                     * tetap token uang #186 lewat `Money`, bukan `--success`
                     * penuh. Satu sumber warna untuk seluruh nominal aplikasi;
                     * `signed` memberi hijau pada saldo positif, dan tanda minus
                     * pada yang negatif adalah penanda non-warnanya.
                     */}
                    <Money
                      value={balance}
                      currency={cur}
                      signed
                      style={{
                        display: "block",
                        fontSize: BALANCE_SIZE,
                        fontWeight: "var(--ant-font-weight-strong)",
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent
                style={{
                  paddingBlock: EMPTY_CARD_PADDING,
                  textAlign: "center",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("dashboard.noCashBefore")}{" "}
                <Link href="/finance/new" style={{ color: "var(--ant-color-link)" }}>
                  {t("dashboard.noCashLink")}
                </Link>
              </CardContent>
            </Card>
          )}

          {financeBalances.length > 0 && (
            <Card>
              <CardHeader style={{ paddingBottom: CARD_HEADER_BOTTOM }}>
                <CardTitle style={{ fontSize: CARD_TITLE_SIZE }}>
                  {t("dashboard.balancePerAccount")}
                </CardTitle>
              </CardHeader>
              <StaticTable
                columns={balanceColumns}
                rows={financeBalances}
                rowKey={(b) => `${b.type}_${b.currency}`}
              />
            </Card>
          )}

        </DashboardSection>
      )}

      {/* ─── Contracts ─── */}
      {canViewContracts && (
        <DashboardSection
          title={t("dashboard.contractsTitle")}
          description={t("dashboard.contractsDescription")}
          href="/contracts"
          hrefLabel={t("dashboard.contractsHrefLabel")}
        >
          <div style={autoGrid(STAT_CARD_BASIS)}>
            <StatCard title={t("nav.items.contracts")} value={contractCount} href="/contracts" />
            {/* "Menunggu" = amber, lewat `tone` (issue #229). Katanya tetap
                "Menunggu" dan kartunya menaut ke daftar yang sudah tersaring,
                jadi warnanya menambah hierarki — bukan memikul maknanya. */}
            <StatCard
              title={t("dashboard.statPendingContracts")}
              value={pendingContracts}
              href="/contracts?status=pending"
              tone="warning"
            />
            <StatCard title={t("nav.items.invoices")} value={invoiceCount} href="/invoices" />
            <StatCard
              title={t("dashboard.statPendingInvoices")}
              value={pendingInvoices}
              href="/invoices?status=pending"
              tone="warning"
            />
            <StatCard title={t("nav.items.suppliers")} value={supplierCount} href="/suppliers" />
          </div>

          <Card>
            <CardHeader style={{ paddingBottom: CARD_HEADER_BOTTOM }}>
              <CardTitle style={{ fontSize: CARD_TITLE_SIZE }}>
                {t("dashboard.latestContracts")}
              </CardTitle>
            </CardHeader>
            <StaticTable
              columns={contractColumns}
              rows={contractRows}
              rowKey={(c) => c.id}
              empty={
                <EmptyState
                  icon={<FileTextOutlined style={{ fontSize: EMPTY_ICON }} />}
                  title={t("contracts.emptyTitle")}
                  description={t("dashboard.emptyContractsDescription")}
                  actionLabel={canCreateContract ? t("contracts.addNew") : undefined}
                  actionHref={canCreateContract ? "/contracts/new" : undefined}
                />
              }
            />
          </Card>
        </DashboardSection>
      )}

      {/* ─── Kamus Istilah (issue #355) ───
          Paling BAWAH dan sengaja tenang: ini jaring pengaman, bukan tugas.
          Yang mencarinya menemukannya setiap hari di tempat yang sama; yang
          tidak membutuhkannya tidak pernah terganggu olehnya. */}
      {allowed.has("glossary.read") && <GlossaryHint />}
    </div>
  );
}
