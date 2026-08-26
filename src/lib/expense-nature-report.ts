/**
 * BEBAN MENURUT SIFAT (issue #446) — bahan CALK PSAK 118.
 *
 * == Kenapa laporan ini ada =================================================
 * PSAK 118 meminta beban disajikan menurut SIFATNYA di Catatan atas Laporan
 * Keuangan bila Laba Rugi disajikan menurut fungsi. #445 sudah memasang
 * substratnya — kolom `accounts.expense_nature`, taksonomi `EXPENSE_NATURES`,
 * semaian di templat COA, dan pemeriksaan `beban-tanpa-sifat`. Yang belum ada
 * adalah permukaannya.
 *
 * == TOTALNYA SAMA SECARA KONSTRUKSI, BUKAN SECARA KEBETULAN ===============
 * Syarat paling keras di issue ini: total laporan ini WAJIB sama dengan total
 * beban di Laba Rugi untuk rentang yang sama. Dua laporan yang menjumlah beban
 * dengan hasil berbeda adalah cacat yang paling mahal di sini — bukan karena
 * salah satunya salah, melainkan karena tidak ada yang tahu yang mana.
 *
 * Cara paling murah untuk melanggarnya adalah menghitung ulang dari
 * `journal_lines` dengan penyaring yang "kurang lebih sama". Karena itu modul
 * ini TIDAK menghitung ulang apa pun: ia mengambil `expense` milik
 * `getIncomeStatement()` — baris yang PERSIS dijumlahkan menjadi `totalExpense`
 * di sana — lalu MENGELOMPOKKANNYA ULANG menurut sifat. Menjumlahkan kembali
 * himpunan yang sama dengan pengelompokan berbeda tidak bisa menghasilkan total
 * yang berbeda.
 *
 * Konsekuensinya disengaja: setiap perubahan aturan beban di Laba Rugi terbawa
 * ke sini tanpa satu baris pun disunting, dan `reports.ts` tidak disentuh.
 *
 * == "Belum ditetapkan" DITAMPILKAN, bukan disembunyikan ====================
 * Akun beban yang belum ditandai sifatnya mendapat barisnya sendiri. Justru
 * baris itulah yang memberi tahu seberapa bisa dipercaya sisanya: laporan yang
 * menyembunyikannya terlihat rapi sambil menyembunyikan bahwa separuh bebannya
 * tak terklasifikasi.
 *
 * == Bentuknya: pembangun MURNI + pembaca tipis =============================
 * Seluruh aritmetika hidup di `buildExpenseByNature()`, yang tidak menyentuh
 * basis data dan karena itu diuji langsung. `getExpenseByNature()` di bawahnya
 * hanya menjemput dua hal lalu menyerahkannya ke sana.
 */
import { EXPENSE_NATURES } from "@/lib/accounting";
import { prisma } from "@/lib/prisma";
import { getIncomeStatement } from "@/lib/reports";
import type { CostCenterFilter } from "@/lib/cost-centers";

/** Satu baris beban sebagaimana dipulangkan Laba Rugi. */
export interface ExpenseLineInput {
  code: string;
  name: string;
  amount: number;
}

export interface ExpenseNatureRow {
  /** Nilai `accounts.expense_nature`, atau `null` bila belum ditandai. */
  nature: string | null;
  /** Label bahasa tugas; "Belum ditetapkan" untuk yang `null`. */
  label: string;
  amount: number;
  /** Berapa akun beban yang jatuh ke sifat ini — konteks untuk angkanya. */
  accountCount: number;
}

export interface ExpenseNatureReport {
  rows: ExpenseNatureRow[];
  total: number;
  /**
   * Nilai beban yang BELUM ditandai sifatnya. Nol berarti klasifikasinya
   * lengkap; bukan nol adalah ukuran seberapa jauh laporan ini masih boleh
   * dipercaya sebagai bahan CALK.
   */
  unassignedAmount: number;
}

/** Label "belum ditetapkan" — bahasa sumber; layar memakai kamusnya. */
export const UNASSIGNED_NATURE_LABEL = "Belum ditetapkan";

const LABEL_BY_VALUE = new Map(EXPENSE_NATURES.map((n) => [n.value, n.label]));

/**
 * Kelompokkan baris beban Laba Rugi menurut sifat akunnya.
 *
 * `natureByCode` memetakan KODE akun ke sifatnya. Kode yang tidak ada di peta —
 * dan kode yang sifatnya kosong — sama-sama jatuh ke "Belum ditetapkan": dari
 * sudut pandang laporan ini keduanya berarti hal yang sama, yaitu tak ada yang
 * bisa dikatakan tentang sifat beban itu.
 */
export function buildExpenseByNature(
  expenseLines: ExpenseLineInput[],
  natureByCode: Map<string, string | null>
): ExpenseNatureReport {
  const byNature = new Map<string | null, { amount: number; accounts: Set<string> }>();

  for (const line of expenseLines) {
    const raw = natureByCode.get(line.code) ?? null;
    const nature = raw && LABEL_BY_VALUE.has(raw) ? raw : null;
    const entry = byNature.get(nature) ?? { amount: 0, accounts: new Set<string>() };
    entry.amount += line.amount;
    entry.accounts.add(line.code);
    byNature.set(nature, entry);
  }

  /*
   * Urutannya mengikuti `EXPENSE_NATURES` — taksonomi yang sama dengan
   * formulir akun dan `check-data-conformance` — lalu "Belum ditetapkan"
   * PALING AKHIR. Bukan diurutkan menurut nominal: pembaca CALK membandingkan
   * laporan antar-periode, dan baris yang berpindah tempat setiap bulan
   * memaksa ia mencari alih-alih membaca.
   */
  const rows: ExpenseNatureRow[] = [];
  for (const def of EXPENSE_NATURES) {
    const entry = byNature.get(def.value);
    if (!entry) continue;
    rows.push({
      nature: def.value,
      label: def.label,
      amount: round2(entry.amount),
      accountCount: entry.accounts.size,
    });
  }

  const unassigned = byNature.get(null);
  if (unassigned) {
    rows.push({
      nature: null,
      label: UNASSIGNED_NATURE_LABEL,
      amount: round2(unassigned.amount),
      accountCount: unassigned.accounts.size,
    });
  }

  /*
   * Total dijumlahkan dari BARIS MASUKAN, bukan dari `rows`. Keduanya sama
   * hari ini, dan justru itu maksudnya: bila suatu saat pengelompokan di atas
   * menjatuhkan sebuah baris, totalnya tetap menyebut kebenaran Laba Rugi dan
   * selisihnya menjadi terlihat — alih-alih ikut mengecil diam-diam.
   */
  return {
    rows,
    total: round2(expenseLines.reduce((s, l) => s + l.amount, 0)),
    unassignedAmount: round2(unassigned?.amount ?? 0),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pembacanya (issue #446).
 *
 * Tipis dengan sengaja: satu panggilan ke Laba Rugi, satu pembacaan sifat akun,
 * lalu seluruh aritmetikanya diserahkan ke pembangun murni di atas.
 *
 * `getIncomeStatement()` dipanggil apa adanya — TIDAK ditiru, tidak ditulis
 * ulang dengan penyaring "kurang lebih sama". Itulah yang membuat totalnya
 * tidak bisa berbeda, dan itu pula yang membuat `reports.ts` tidak perlu
 * disentuh sama sekali.
 */
export async function getExpenseByNature(
  from?: Date,
  to?: Date,
  client = prisma,
  costCenter?: CostCenterFilter
): Promise<ExpenseNatureReport> {
  const [statement, accounts] = await Promise.all([
    getIncomeStatement(from, to, client, costCenter),
    client.account.findMany({ select: { code: true, expenseNature: true } }),
  ]);

  return buildExpenseByNature(
    statement.expense,
    new Map(accounts.map((a) => [a.code, a.expenseNature ?? null]))
  );
}
