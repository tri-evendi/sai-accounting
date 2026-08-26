/**
 * LABA RUGI PER PROYEK (issue #495, butir 2 — job costing untuk jasa).
 *
 * ══ APA YANG SEBENARNYA KURANG ═════════════════════════════════════════════
 * Laba rugi SATU proyek sudah bisa dibaca sejak #98: `getIncomeStatement`
 * menerima `costCenter`, dan katalog laporan sudah memasang penyaringnya. Yang
 * tidak bisa dijawab halaman itu adalah pertanyaan yang justru paling sering
 * ditanyakan pemilik: *proyek mana yang menghasilkan, dan mana yang merugi.*
 * Menjawabnya hari ini berarti membuka laporan yang sama berkali-kali, sekali
 * per proyek, lalu membandingkannya di kepala sendiri.
 *
 * ══ SATU KUERI, BUKAN SATU PER PROYEK ══════════════════════════════════════
 * Bentuk yang paling mudah ditulis adalah memanggil `getIncomeStatement` sekali
 * untuk tiap pusat biaya. Ia benar, dan ia salah bentuk: jumlah kuerinya tumbuh
 * bersama jumlah proyek, dan — jauh lebih penting — tidak ada satu pun yang
 * MEMAKSA hasilnya berdamai dengan laporan perusahaan.
 *
 * Yang di bawah mengelompokkan SEKALI menurut `[accountId, costCenterId]` lalu
 * melipatnya di memori. Rekonsiliasinya jadi sifat KONSTRUKSI, bukan kebetulan
 * yang diulang tiap laporan:
 *
 *     Σ semua proyek + tanpa proyek ≡ laba rugi perusahaan
 *
 * Catatan yang sama sudah berdiri di `accountNets` (`reports.ts`), dan berkas
 * ini meneruskannya alih-alih membangun aturan kedua.
 *
 * ══ TANPA MESIN ANGKA KEDUA ════════════════════════════════════════════════
 * Penggolongan akun (`incomeStatementSectionFor`) dan arah tandanya
 * (`accountCategoryFor`) DIIMPOR, tidak ditulis ulang. Sebuah salinan aturan
 * tanda — "pendapatan itu kredit−debit, beban itu debit−kredit" — adalah cara
 * paling halus bagi dua laporan untuk menyimpang: keduanya benar sendiri-
 * sendiri, dan hanya berbeda saat sebuah akun kontra muncul.
 *
 * ══ "TANPA PROYEK" SELALU IKUT, DAN ITU BUKAN HIASAN ═══════════════════════
 * Baris terakhir memuat jurnal yang tidak menyebut pusat biaya. Tanpanya
 * daftar ini tidak pernah berjumlah sama dengan laba rugi perusahaan, dan
 * pembacanya tidak punya cara membedakan "proyek ini tidak punya biaya" dari
 * "biayanya ada tapi lupa diberi proyek" — dua keadaan yang menuntut tindakan
 * berlawanan.
 */
import { prisma } from "@/lib/prisma";
import { accountCategoryFor } from "@/lib/accounting";
import { incomeStatementSectionFor } from "@/lib/reports";

/** Satu baris hasil `groupBy([accountId, costCenterId])`. */
export interface ProjectProfitInput {
  accountId: number;
  /** null = jurnal tanpa pusat biaya. */
  costCenterId: number | null;
  debit: number;
  credit: number;
}

export interface ProjectAccount {
  id: number;
  /** Tipe akun — digolongkan aturan yang SAMA dengan laba rugi perusahaan. */
  type: string;
}

export interface ProjectCenter {
  id: number;
  code: string;
  name: string;
}

export interface ProjectProfitRow {
  /** `null` untuk baris "tanpa proyek". */
  costCenterId: number | null;
  code: string | null;
  name: string | null;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpense: number;
  otherIncome: number;
  otherExpense: number;
  profit: number;
  /**
   * Laba ÷ pendapatan, 0–1. `null` bila pendapatannya nol.
   *
   * BUKAN 0: sebuah proyek berbiaya Rp 40 juta tanpa satu rupiah pendapatan
   * punya margin yang tidak terdefinisi, bukan margin nol persen — dan "0%"
   * di kolom itu terbaca sebagai impas, yaitu kebalikan dari keadaannya.
   */
  margin: number | null;
}

export interface ProjectProfitReport {
  rows: ProjectProfitRow[];
  /** Jumlah seluruh baris — harus sama dengan laba rugi perusahaan. */
  total: Omit<ProjectProfitRow, "costCenterId" | "code" | "name" | "margin"> & {
    margin: number | null;
  };
}

const kosong = () => ({
  revenue: 0,
  cogs: 0,
  operatingExpense: 0,
  otherIncome: 0,
  otherExpense: 0,
});

type Ember = ReturnType<typeof kosong>;

function marginOf(profit: number, revenue: number): number | null {
  return revenue === 0 ? null : profit / revenue;
}

function selesaikan(e: Ember) {
  const grossProfit = e.revenue - e.cogs;
  const profit = grossProfit - e.operatingExpense + e.otherIncome - e.otherExpense;
  return { ...e, grossProfit, profit, margin: marginOf(profit, e.revenue) };
}

/**
 * Lipat baris jurnal menjadi laba per proyek.
 *
 * MURNI — tanpa Prisma, supaya sifat rekonsiliasinya bisa diuji tanpa basis
 * data. Pusat biaya yang tidak punya satu pun jurnal TETAP muncul, bernilai
 * nol: sebuah proyek yang hilang dari daftar terbaca sebagai proyek yang tidak
 * ada, padahal ia proyek yang belum dibukukan.
 */
export function foldProjectProfit(
  lines: readonly ProjectProfitInput[],
  accounts: readonly ProjectAccount[],
  centers: readonly ProjectCenter[]
): ProjectProfitReport {
  const tipe = new Map(accounts.map((a) => [a.id, a.type]));
  const ember = new Map<number | null, Ember>();
  for (const c of centers) ember.set(c.id, kosong());
  ember.set(null, kosong());

  for (const line of lines) {
    const type = tipe.get(line.accountId);
    if (type === undefined) continue;
    const section = incomeStatementSectionFor(type);
    if (!section) continue; // neraca — bukan urusan laporan ini

    const cat = accountCategoryFor(type);
    /* Arah tanda per KATEGORI, bukan per bagian — persis `getIncomeStatement`.
       Itu yang membuat Retur Penjualan mengurangi pendapatannya sendiri. */
    const amount = cat === "revenue" ? line.credit - line.debit : line.debit - line.credit;

    /* Pusat biaya yang sudah dinonaktifkan tetap punya jurnal, dan jurnal itu
       tidak boleh menguap: ia mendarat di embernya sendiri kalau masih terdaftar,
       dan di "tanpa proyek" kalau tidak. Yang tidak boleh terjadi adalah ia
       hilang dari kedua-duanya — jumlahnya akan berhenti berdamai dengan laba
       rugi perusahaan, dan tak ada yang bisa melihat ke mana perginya. */
    const kunci = line.costCenterId !== null && ember.has(line.costCenterId)
      ? line.costCenterId
      : null;
    const e = ember.get(kunci)!;

    if (section === "sales") e.revenue += amount;
    else if (section === "cogs") e.cogs += amount;
    else if (section === "operating_expense") e.operatingExpense += amount;
    else if (section === "other_income") e.otherIncome += amount;
    else e.otherExpense += amount;
  }

  const rows: ProjectProfitRow[] = centers.map((c) => ({
    costCenterId: c.id,
    code: c.code,
    name: c.name,
    ...selesaikan(ember.get(c.id)!),
  }));
  rows.push({
    costCenterId: null,
    code: null,
    name: null,
    ...selesaikan(ember.get(null)!),
  });

  const jumlah = kosong();
  for (const r of rows) {
    jumlah.revenue += r.revenue;
    jumlah.cogs += r.cogs;
    jumlah.operatingExpense += r.operatingExpense;
    jumlah.otherIncome += r.otherIncome;
    jumlah.otherExpense += r.otherExpense;
  }

  return { rows, total: selesaikan(jumlah) };
}

/**
 * Baca laba per proyek dari buku besar — SATU kueri.
 *
 * Bentuk yang lebih mudah ditulis adalah memanggil `getIncomeStatement` sekali
 * per pusat biaya. Ia benar dan ia salah bentuk: jumlah kuerinya tumbuh bersama
 * jumlah proyek, dan tidak ada satu pun yang MEMAKSA hasilnya berdamai dengan
 * laporan perusahaan. Satu `groupBy` menurut `[accountId, costCenterId]`
 * membuat rekonsiliasinya menjadi sifat konstruksi.
 *
 * Pusat biaya NONAKTIF ikut diambil. Jurnalnya sudah terlanjur ada, dan sebuah
 * proyek yang ditutup tahun lalu tetap harus muncul di laporan tahun lalu;
 * menyaringnya di sini akan memindahkan angkanya diam-diam ke "tanpa proyek".
 */
export async function getProjectProfit(
  from?: Date,
  to?: Date,
  client = prisma
): Promise<ProjectProfitReport> {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = from;
  if (to) range.lte = to;

  const [grouped, accounts, centers] = await Promise.all([
    client.journalLine.groupBy({
      by: ["accountId", "costCenterId"],
      _sum: { baseDebit: true, baseCredit: true },
      where: from || to ? { journal: { date: range } } : undefined,
    }),
    client.account.findMany({ select: { id: true, type: true } }),
    client.costCenter.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return foldProjectProfit(
    grouped.map((g) => ({
      accountId: g.accountId,
      costCenterId: g.costCenterId,
      debit: Number(g._sum.baseDebit ?? 0),
      credit: Number(g._sum.baseCredit ?? 0),
    })),
    accounts,
    centers
  );
}
