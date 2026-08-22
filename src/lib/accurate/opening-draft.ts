/**
 * Saldo akhir Accurate → RANCANGAN saldo awal — inti murni (tahap 5).
 *
 * ══ KENAPA "RANCANGAN", DAN BUKAN LANGSUNG DIPOSTING ═══════════════════════
 * Saldo awal di aplikasi ini masuk lewat SATU pintu yang sengaja hanya bisa
 * dilalui sekali: `runOpeningBalanceSetup` (`@/lib/opening-balance`), yang
 * memposting satu jurnal pembuka seimbang lewat `postJournal`, menghitung
 * sendiri angka penyeimbang Modal/Ekuitas, dan menolak jalan kedua kalinya —
 * dijaga oleh bendera `is_setup` DAN oleh keberadaan jurnal `opening_balance`
 * itu sendiri.
 *
 * Membuat impor menulis ke sana berarti membuat pintu kedua ke tempat yang
 * seluruh rancangannya dibangun untuk berpintu satu. Yang dihasilkan modul ini
 * karena itu adalah BAHAN untuk wisaya saldo awal — daftar akun beserta sisi
 * dan nominalnya, siap diperiksa mata manusia lalu dimasukkan lewat pintu yang
 * sudah ada. Impor yang berhenti satu langkah sebelum buku besar adalah impor
 * yang tidak bisa merusak buku besar.
 *
 * ══ SISINYA DATANG DARI BAGAN AKUN KITA, BUKAN DARI BERKASNYA ══════════════
 * Rincian buku besar Accurate tidak menyebut tipe akun sama sekali. Ia hanya
 * mencetak saldo sebagai angka POSITIF ke arah normal akun itu. Jadi "1.000"
 * di akun beban berarti debit, dan "1.000" di akun utang berarti kredit —
 * angka yang sama, sisi yang berlawanan.
 *
 * Satu-satunya sumber yang tahu bedanya adalah bagan akun KITA. Karena itu
 * modul ini menuntut penyelesai (`resolve`) dan menolak menebak: akun yang
 * tidak ada di bagan akun kita dipulangkan dengan status `unknown_account`,
 * bukan diberi sisi asal-asalan. Menebak di sini memindahkan saldo ke sisi
 * yang salah, dan sebuah utang yang mendarat sebagai aset tidak akan
 * ketahuan sampai neracanya dibaca orang.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */
import type { AccurateLedgerAccount } from "@/lib/accurate/ledger-report";

export type NormalBalanceSide = "debit" | "credit";

/** Akun kita, seperti yang dilihat modul ini. */
export interface ResolvedAccount {
  accountId: number;
  code: string;
  name: string;
  normalBalance: NormalBalanceSide;
  currency: string;
}

export type OpeningDraftStatus =
  /** Siap dipakai: akunnya ada, saldonya bukan nol. */
  | "ready"
  /** Saldo akhirnya nol — tidak perlu baris saldo awal sama sekali. */
  | "zero"
  /** Kode akunnya tidak ada di bagan akun kita; sisinya tidak bisa ditentukan. */
  | "unknown_account";

export interface OpeningDraftRow {
  code: string;
  /** Nama menurut Accurate — dibawa apa adanya untuk dibandingkan mata manusia. */
  accurateName: string;
  /** Nama menurut bagan akun kita; kosong bila akunnya belum ada. */
  saiName: string;
  accountId: number | null;
  currency: string;
  /** Saldo akhir menurut Accurate, positif ke arah normal akunnya. */
  balance: number;
  /** Sisi jurnal pembuka; `null` bila akunnya belum ada. */
  side: NormalBalanceSide | null;
  /** Nominal untuk baris saldo awal (selalu positif). */
  amount: number;
  status: OpeningDraftStatus;
}

export interface OpeningDraft {
  /** Tanggal saldonya berlaku — akhir periode laporan. */
  asOf: Date | null;
  rows: OpeningDraftRow[];
  totals: {
    debit: number;
    credit: number;
    /**
     * `debit − credit`: angka yang akan diserap baris Modal/Ekuitas bila
     * rancangan ini dimasukkan apa adanya. Ditampilkan supaya orang melihat
     * lebih dulu seberapa besar penyeimbangnya — penyeimbang yang tak terduga
     * besarnya hampir selalu berarti ada akun yang belum ikut.
     */
    equityPlug: number;
  };
  /** Akun yang belum ada di bagan akun kita — harus dibuat lebih dulu. */
  unknownCodes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Susun rancangan saldo awal dari seksi-seksi laporan Accurate.
 *
 * `resolve` memetakan kode akun Accurate ke akun kita. Ia sengaja berupa fungsi
 * dan bukan `Map`: pemanggil yang menentukan apakah pencocokannya persis, tidak
 * peduli besar-kecil huruf, atau lewat tabel pemetaan tersendiri nanti — dan
 * modul ini tidak perlu berubah untuk salah satunya.
 */
export function buildOpeningDraft(
  accounts: readonly AccurateLedgerAccount[],
  resolve: (code: string) => ResolvedAccount | null,
  asOf: Date | null
): OpeningDraft {
  const rows: OpeningDraftRow[] = [];
  const unknownCodes: string[] = [];
  let debit = 0;
  let credit = 0;

  for (const account of accounts) {
    const balance = round2(account.closing);
    const resolved = resolve(account.code);

    if (!resolved) {
      unknownCodes.push(account.code);
      rows.push({
        code: account.code,
        accurateName: account.name,
        saiName: "",
        accountId: null,
        currency: "IDR",
        balance,
        side: null,
        amount: Math.abs(balance),
        status: "unknown_account",
      });
      continue;
    }

    /* Saldo Accurate positif = ke arah NORMAL akun itu. Saldo negatif berarti
       akunnya berdiri di sisi seberang saldo normalnya — sah, dan terjadi
       (kas yang minus, piutang yang berujung kredit) — jadi sisinya dibalik
       alih-alih nominalnya dibiarkan negatif. Baris jurnal bernominal negatif
       akan ditolak `buildOpeningBalanceLines`, dan penolakan itu benar. */
    const side: NormalBalanceSide =
      balance >= 0
        ? resolved.normalBalance
        : resolved.normalBalance === "debit"
          ? "credit"
          : "debit";
    const amount = Math.abs(balance);

    if (amount === 0) {
      rows.push({
        code: account.code,
        accurateName: account.name,
        saiName: resolved.name,
        accountId: resolved.accountId,
        currency: resolved.currency,
        balance,
        side,
        amount,
        status: "zero",
      });
      continue;
    }

    if (side === "debit") debit = round2(debit + amount);
    else credit = round2(credit + amount);

    rows.push({
      code: account.code,
      accurateName: account.name,
      saiName: resolved.name,
      accountId: resolved.accountId,
      currency: resolved.currency,
      balance,
      side,
      amount,
      status: "ready",
    });
  }

  return {
    asOf,
    rows,
    totals: { debit, credit, equityPlug: round2(debit - credit) },
    unknownCodes,
  };
}
