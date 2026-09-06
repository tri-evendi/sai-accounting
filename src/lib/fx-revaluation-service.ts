/**
 * REVALUASI VALAS (issue #554) — pengumpul saldo dan jalur postingnya.
 *
 * Aritmetikanya hidup di `lib/fx-revaluation.ts` dan diuji tanpa basis data.
 * Yang di sini hanya dua hal yang memang butuh Prisma: **saldo mana** yang
 * direvaluasi, dan **bagaimana** jurnalnya mendarat.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { postJournal } from "@/lib/ledger";
import { periodBounds } from "@/lib/period";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import {
  planRevaluation,
  revaluationJournalLines,
  type MonetaryBalance,
  type RevaluationPlan,
} from "@/lib/fx-revaluation";

type Client = typeof prisma | Prisma.TransactionClient;

/** Mata uang buku. Segala yang bukan ini adalah valas bagi berkas ini. */
export const BASE_CURRENCY = "IDR";

/**
 * Tipe akun yang POS MONETER — hak menerima atau kewajiban menyerahkan uang
 * dalam jumlah tertentu.
 *
 * ══ DAFTAR IZIN, DAN SENGAJA PENDEK ════════════════════════════════════════
 * PSAK 10 hanya menjabarkan ulang pos MONETER; pos non-moneter tetap pada kurs
 * historis. Salah menggolongkan di sini menghasilkan neraca yang lebih salah
 * daripada tidak direvaluasi sama sekali — persediaan yang "direvaluasi" akan
 * bergerak dua kali (sekali oleh kurs, sekali oleh harga pokok rata-rata), dan
 * tidak ada laporan yang bisa menjelaskan selisihnya.
 *
 * Bentuknya IZIN, bukan larangan: tipe akun BARU tidak ikut direvaluasi sampai
 * seseorang menuliskannya di sini beserta alasannya. Daftar larangan akan
 * selalu tertinggal satu tipe di belakang.
 *
 * ⚠ `other_current_asset` sengaja TIDAK ikut, walau sebagian isinya moneter
 * (uang muka yang akan dikembalikan). Ia juga menampung biaya dibayar di muka —
 * pos NON-moneter yang akan menjadi beban, bukan kas. Satu tipe akun yang
 * memuat keduanya tidak bisa diputuskan dari tipenya saja, dan menebak di sini
 * berarti menebak pada seluruh saldonya.
 */
export const MONETARY_ACCOUNT_TYPES = [
  "cash_bank",
  "account_receivable",
  "account_payable",
] as const;

/**
 * Saldo pos moneter valas pada satu tanggal, per akun per mata uang.
 *
 * ══ ATURAN PENJUMLAHANNYA SAMA DENGAN NERACA — DAN ITU MENGIKAT ════════════
 * `accountNets` (lib/reports.ts) menjumlahkan SELURUH baris jurnal sampai
 * tanggalnya, tanpa menyaring `is_reversed`: pembalikan adalah jurnal tersendiri
 * berisi baris yang berlawanan, jadi keduanya saling menghapus dengan
 * sendirinya. Menambahkan penyaring di sini akan membuang pembalikannya sambil
 * menyimpan jurnal aslinya — dan revaluasi akan berdiri di atas saldo yang
 * tidak pernah ada di neraca mana pun.
 *
 * Karena itu bentuk kueri ini sengaja dibuat kembar dengan `accountNets`, hanya
 * dengan dua tambahan yang memang tidak dibutuhkan neraca: dikelompokkan juga
 * per MATA UANG, dan ikut menjumlahkan nilai mata uang aslinya.
 */
async function monetaryBalances(
  asOf: Date,
  client: Client = prisma
): Promise<MonetaryBalance[]> {
  const accounts = await client.account.findMany({
    where: { type: { in: [...MONETARY_ACCOUNT_TYPES] } },
    select: { id: true, code: true, name: true },
  });
  if (accounts.length === 0) return [];

  const byId = new Map(accounts.map((a) => [a.id, a]));

  const grouped = await client.journalLine.groupBy({
    by: ["accountId", "currency"],
    _sum: { debit: true, credit: true, baseDebit: true, baseCredit: true },
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      currency: { not: BASE_CURRENCY },
      journal: { date: { lte: asOf } },
    },
  });

  const rows: MonetaryBalance[] = [];
  for (const g of grouped) {
    const account = byId.get(g.accountId);
    if (!account) continue;

    const foreignAmount =
      Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0);
    const carryingBase =
      Number(g._sum.baseDebit ?? 0) - Number(g._sum.baseCredit ?? 0);

    /* Akun yang benar-benar kosong di kedua sisi tidak punya apa pun untuk
       direvaluasi. Yang saldo valasnya nol tetapi masih menyisakan rupiah IKUT
       — sisa itu justru yang harus dihapus (lihat tes "saldo valas nol"). */
    if (foreignAmount === 0 && carryingBase === 0) continue;

    rows.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      currency: g.currency,
      foreignAmount,
      carryingBase,
    });
  }

  return rows.sort((a, b) =>
    a.currency === b.currency
      ? a.accountCode.localeCompare(b.accountCode)
      : a.currency.localeCompare(b.currency)
  );
}

/** Mata uang asing yang punya saldo moneter terbuka pada tanggal itu. */
export async function openForeignCurrencies(
  asOf: Date,
  client: Client = prisma
): Promise<string[]> {
  const balances = await monetaryBalances(asOf, client);
  return [...new Set(balances.map((b) => b.currency))].sort();
}

/** Rencana revaluasi satu mata uang pada akhir periode — hanya membaca. */
export async function previewRevaluation(
  year: number,
  month: number,
  currency: string,
  closingRate: number,
  client: Client = prisma
): Promise<RevaluationPlan> {
  const { end } = periodBounds(year, month);
  return planRevaluation(currency, closingRate, await monetaryBalances(end, client));
}

/** Revaluasi periode+mata uang ini sudah pernah dijalankan. */
export class AlreadyRevaluedError extends Error {
  constructor(readonly year: number, readonly month: number, readonly currency: string) {
    super(`Revaluasi ${currency} untuk ${month}/${year} sudah pernah dijalankan.`);
    this.name = "AlreadyRevaluedError";
  }
}

export interface RevaluationResult {
  id: number;
  plan: RevaluationPlan;
  /** `null` bila tidak ada yang bergerak — itu hasil yang sah, bukan kegagalan. */
  journalId: number | null;
  reversalJournalId: number | null;
}

/**
 * Jalankan revaluasi: catat, posting, lalu posting pembaliknya.
 *
 * ══ TIGA TULISAN, SATU TRANSAKSI ═══════════════════════════════════════════
 * Baris `fx_revaluations`, jurnal akhir periode, dan jurnal pembalik awal
 * periode berikutnya hidup atau mati bersama. Sebuah revaluasi yang terposting
 * tanpa pembaliknya adalah kerusakan yang paling mahal di seluruh fitur ini:
 * saldo valas akan berdiri pada kurs penutup SELAMANYA, dan setiap selisih kurs
 * terealisasi sesudahnya dihitung terhadap dasar yang sudah digeser.
 *
 * ══ IDEMPOTENSI DARI CONSTRAINT, BUKAN DARI PEMERIKSAAN ════════════════════
 * Barisnya ditulis LEBIH DULU, dan `@@unique([year, month, currency])` yang
 * menjaganya. Sebuah pemeriksaan "sudah ada belum?" di aplikasi bisa kalah
 * balapan dengan klik kedua yang datang 50 md kemudian; constraint tidak bisa.
 *
 * ══ SALDONYA DIHITUNG ULANG DI DALAM TRANSAKSI ═════════════════════════════
 * Bukan memakai rencana yang dilihat pengguna di layar. Yang dimasukkan orang
 * hanyalah KURS; saldonya milik buku. Kalau ada transaksi yang mendarat antara
 * pratinjau dan penekanan tombol, yang benar adalah angka buku pada saat
 * posting — bukan angka yang sempat terlihat. Layarnya menyebutkan ini.
 */
export async function runRevaluation(
  input: { year: number; month: number; currency: string; closingRate: number },
  client: typeof prisma = prisma
): Promise<RevaluationResult> {
  const { year, month, currency, closingRate } = input;
  const { end } = periodBounds(year, month);
  /* Hari pertama periode BERIKUTNYA. `periodBounds` sudah menormalkan
     pergantian tahun, jadi Desember tidak perlu percabangannya sendiri. */
  const nextStart = periodBounds(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)
    .start;

  return client.$transaction(async (tx) => {
    const balances = await monetaryBalances(end, tx);
    const plan = planRevaluation(currency, closingRate, balances);

    let row;
    try {
      row = await tx.fxRevaluation.create({
        data: {
          year,
          month,
          currency,
          closingRate: new Prisma.Decimal(closingRate),
          carryingBase: new Prisma.Decimal(
            plan.lines.reduce((s, l) => s + l.carryingBase, 0)
          ),
          revaluedBase: new Prisma.Decimal(
            plan.lines.reduce((s, l) => s + l.revaluedBase, 0)
          ),
          difference: new Prisma.Decimal(plan.totalDifference),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AlreadyRevaluedError(year, month, currency);
      }
      throw e;
    }

    /*
     * Tidak ada yang bergerak: barisnya tetap dicatat (bukti bahwa revaluasi
     * MEMANG dijalankan bulan itu, dan pada kurs berapa) tetapi tidak ada jurnal
     * sama sekali. Jurnal kosong yang terbit tiap akhir bulan adalah jurnal yang
     * mengajari pembacanya melewatinya.
     */
    if (plan.lines.length === 0) {
      return { id: row.id, plan, journalId: null, reversalJournalId: null };
    }

    /* Slot yang SAMA dengan yang dipakai selisih kurs terealisasi. Selisih
       terealisasi dan belum terealisasi adalah satu jenis penghasilan, dan
       memisahkannya ke dua akun akan memecah satu angka laba rugi menjadi dua
       yang tidak pernah dijumlahkan siapa pun. Nilainya sudah dalam IDR, jadi
       slot ini dibaca tanpa mata uang (`ANY_CURRENCY`). */
    const fxAccountId = await resolveAccountId(MAPPING_KEYS.FX_GAIN_LOSS, null, tx);
    const lines = revaluationJournalLines(plan, fxAccountId);

    const journal = await postJournal(
      {
        date: end,
        type: "adjustment",
        sourceType: "fx_revaluation",
        sourceId: row.id,
        note: `Revaluasi ${currency} kurs penutup ${closingRate}`,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
      tx
    );

    /*
     * PEMBALIK — jurnal BIASA, bukan `reverseJournal()`.
     *
     * `reverseJournal()` menandai jurnal asalnya `is_reversed`, yang berarti
     * "yang ini keliru". Pembalikan revaluasi bukan koreksi: ia peristiwa yang
     * sudah direncanakan sejak jurnal pertamanya dibuat, dan menandai asalnya
     * keliru akan berbohong kepada siapa pun yang membaca buku besar nanti.
     * Ia juga bertanggal HARI INI, sedangkan yang dibutuhkan di sini hari
     * pertama periode berikutnya.
     */
    const reversal = await postJournal(
      {
        date: nextStart,
        type: "adjustment",
        sourceType: "fx_revaluation_reversal",
        sourceId: row.id,
        note: `Pembalik revaluasi ${currency} ${month}/${year}`,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
        })),
      },
      tx
    );

    return { id: row.id, plan, journalId: journal.id, reversalJournalId: reversal.id };
  });
}
