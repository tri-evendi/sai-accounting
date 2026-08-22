/**
 * Pagar materialitas akun penampung beban — inti murni (issue #444).
 *
 * ══ KENAPA SEBUAH AKUN PENAMPUNG ADALAH MASALAH, BUKAN KEBIASAAN ═══════════
 * Membukukan pengeluaran yang tak sempat dipikirkan ke satu akun "Beban
 * Lain-lain" adalah kebiasaan yang tumbuh sendiri di setiap pembukuan. Selama
 * bertahun-tahun ongkosnya cuma estetika: Laba Rugi yang kurang bercerita.
 *
 * Sejak Coretax ongkosnya berubah jadi uang. Akun "Lain-Lain" berskala
 * material diprioritaskan sebagai target **Koreksi Fiskal Positif Otomatis**,
 * dan alasan yang disebut DJP adalah bahwa "sifat objek pajaknya sulit
 * diidentifikasi oleh sistem pengawasan". Beban yang dikoreksi positif berarti
 * pajak terutang naik — tanpa sengketa, karena perusahaan tidak bisa
 * membuktikan isinya apa.
 *
 * Yang perlu digarisbawahi: sulit diidentifikasi oleh DJP berarti sulit
 * diidentifikasi juga OLEH KITA SENDIRI. Akun penampung yang gemuk membuat
 * equalisasi PPh mustahil dibangun di atasnya nanti — bukan karena mesinnya
 * kurang pintar, melainkan karena angkanya memang tidak pernah dipisah.
 *
 * ══ DUA TEMUAN, DAN KENAPA BUKAN SATU ══════════════════════════════════════
 * `name` — akun yang MENAMAI DIRINYA penampung ("Beban Lain-lain", "Serba
 *          Serbi") dan pangsanya melewati ambang. Ini sinyal paling tajam,
 *          dan ia menemukan kasus yang paling sering nyata: penampung yang
 *          lahir sebagai `expense` biasa, bukan sebagai `other_expense`.
 *
 * `band`  — SELURUH band "Beban Lain-lain" (`other_expense`) melewati ambang.
 *          Ini pertanyaan yang berbeda: bukan "akun ini penampung?" melainkan
 *          "kenapa sebanyak ini beban perusahaan berdiri di luar usahanya?"
 *
 * Keduanya dipisah karena menuduh akun yang salah lebih buruk daripada tidak
 * menuduh. `7201 Beban Bunga & Administrasi Bank` bertipe `other_expense` dan
 * ia BUKAN penampung — ia beban yang sangat spesifik. Menandainya sebagai
 * penampung hanya karena tipenya akan melatih orang mengabaikan pemeriksa ini.
 *
 * ══ MENEMUKAN, BUKAN MENOLAK ═══════════════════════════════════════════════
 * Modul ini tidak memblokir apa pun. Penampung kadang sah, dan penjaga yang
 * menolak transaksi atas dasar heuristik nama akun akan salah pada hari
 * pertama. Yang bisa diotomatiskan adalah MENEMUKANNYA.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */
import { CATCH_ALL_EXPENSE_TYPE, accountTypeLabel } from "@/lib/accounting";

/**
 * Ambang bawaan: 5% dari total beban.
 *
 * Bukan angka dari peraturan — tidak ada peraturan yang menyebut satu angka
 * untuk ini. Ia ambang PRAKTIK: cukup rendah untuk menangkap penampung yang
 * benar-benar menyembunyikan sesuatu, cukup tinggi agar buku kecil yang wajar
 * tidak berbunyi tiap bulan. Bisa ditimpa pemanggilnya, dan memang harus bisa.
 */
export const DEFAULT_CATCH_ALL_THRESHOLD = 0.05;

/**
 * Nama yang menyatakan dirinya penampung.
 *
 * Sengaja hanya kata yang MAKNANYA memang "apa saja yang lain" — bukan daftar
 * kata mencurigakan. `lainnya` ikut karena "Beban Operasional Lainnya" adalah
 * penampung dengan nama yang lebih sopan, dan ia sama persis masalahnya.
 */
const CATCH_ALL_NAME =
  /(lain[-\s]?lain|lainnya|serba[-\s]?serbi|\bdll\b|\bdsb\b|miscellaneous|\bmisc\b|\bsundry\b|\bother\b|\bothers\b)/i;

export function isCatchAllName(name: string): boolean {
  return CATCH_ALL_NAME.test(name ?? "");
}

export interface ExpenseAccountTotal {
  code: string;
  name: string;
  type: string;
  /**
   * Nilai IDR sepanjang buku: Σ(base_debit − base_credit).
   *
   * Beban bersaldo normal debit, jadi angka wajar di sini POSITIF. Yang negatif
   * (akun beban bersaldo kredit) dilewati alih-alih dibalik tandanya: ia bukan
   * penampung yang gemuk melainkan keanehan tersendiri, dan pemeriksa lain yang
   * pantas menyebutnya.
   */
  amount: number;
  /**
   * Sifat beban akun ini (issue #445); `null`/tak ada = belum ditetapkan.
   * Opsional supaya pemanggil yang hanya menilai materialitas tidak perlu
   * mengambil kolomnya.
   */
  nature?: string | null;
}

export type CatchAllReason = "name" | "band";

export interface CatchAllFinding {
  reason: CatchAllReason;
  /** Kode akun; KOSONG untuk temuan tingkat band. */
  code: string;
  name: string;
  amount: number;
  /** Pangsa terhadap total beban, 0..1. */
  share: number;
}

export interface CatchAllAssessment {
  totalExpense: number;
  findings: CatchAllFinding[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CatchAllOptions {
  /** Pangsa minimum yang dianggap material, 0..1. */
  threshold?: number;
  /** Tipe band "lain-lain"; disuntikkan agar modul ini tetap bisa diuji sendiri. */
  catchAllType?: string;
  /** Label band; bawaannya label tipe akun dari `@/lib/accounting`. */
  catchAllTypeLabel?: string;
}

/**
 * Nilai sekumpulan akun beban terhadap ambang materialitas.
 *
 * Total beban dihitung dari SELURUH akun yang diberikan — pemanggil yang
 * menentukan lingkupnya (satu periode, atau seumur buku). Bila totalnya nol
 * atau negatif, tidak ada temuan: pangsa terhadap nol bukan angka, dan
 * memaksakan jawabannya berarti menerbitkan persentase yang tidak berarti apa
 * pun kepada orang yang akan memercayainya.
 */
export function assessCatchAllExpenses(
  accounts: readonly ExpenseAccountTotal[],
  options: CatchAllOptions = {}
): CatchAllAssessment {
  const threshold = options.threshold ?? DEFAULT_CATCH_ALL_THRESHOLD;
  const catchAllType = options.catchAllType ?? CATCH_ALL_EXPENSE_TYPE;

  const totalExpense = round2(accounts.reduce((sum, a) => sum + a.amount, 0));
  if (totalExpense <= 0) return { totalExpense, findings: [] };

  const findings: CatchAllFinding[] = [];

  for (const account of accounts) {
    if (account.amount <= 0) continue;
    if (!isCatchAllName(account.name)) continue;
    const share = account.amount / totalExpense;
    if (share <= threshold) continue;
    findings.push({
      reason: "name",
      code: account.code,
      name: account.name,
      amount: round2(account.amount),
      share,
    });
  }

  const bandTotal = round2(
    accounts.filter((a) => a.type === catchAllType).reduce((sum, a) => sum + a.amount, 0)
  );
  if (bandTotal > 0) {
    const share = bandTotal / totalExpense;
    if (share > threshold) {
      findings.push({
        reason: "band",
        code: "",
        name: options.catchAllTypeLabel ?? accountTypeLabel(catchAllType),
        amount: bandTotal,
        share,
      });
    }
  }

  // Yang paling besar lebih dulu — itu yang paling pantas dilihat orang.
  findings.sort((a, b) => b.share - a.share);
  return { totalExpense, findings };
}

/**
 * Satu temuan sebagai kalimat.
 *
 * Menyebut kode, nama, nominal, DAN pangsanya. "Ada akun penampung yang besar"
 * tanpa menyebut yang mana memaksa orang menggali sendiri — dan pemeriksa yang
 * menyuruh menggali adalah pemeriksa yang akan diabaikan.
 */
export function describeCatchAllFinding(finding: CatchAllFinding): string {
  const persen = (finding.share * 100).toFixed(1);
  const nominal = Math.round(finding.amount).toLocaleString("id-ID");
  return finding.reason === "band"
    ? `seluruh band "${finding.name}" = Rp ${nominal} (${persen}% dari total beban)`
    : `${finding.code} ${finding.name} = Rp ${nominal} (${persen}% dari total beban)`;
}

export interface UntaggedExpenseFinding {
  code: string;
  name: string;
  amount: number;
  /** Pangsa terhadap total beban, 0..1. */
  share: number;
}

/**
 * Akun beban yang BESAR tapi belum ditandai sifatnya (issue #445).
 *
 * Pertanyaannya berbeda dari pagar penampung: bukan "akun ini menyembunyikan
 * sesuatu?" melainkan "apa yang tersisa untuk diklasifikasi, dan mana yang
 * paling berdampak kalau dikerjakan lebih dulu?"
 *
 * Ambangnya dipakai ulang dengan sengaja. Menuntut SETIAP akun beban ditandai
 * akan menerbitkan daftar sepanjang bagan akun pada hari pertama — dan daftar
 * yang mustahil dihabiskan adalah daftar yang diabaikan. Yang disebut hanyalah
 * yang benar-benar menggerakkan angka; sisanya bisa menyusul kapan saja tanpa
 * ada yang rusak, sebab kosong memang jawaban yang sah.
 */
export function findUntaggedMaterialExpenses(
  accounts: readonly ExpenseAccountTotal[],
  options: Pick<CatchAllOptions, "threshold"> = {}
): { totalExpense: number; findings: UntaggedExpenseFinding[] } {
  const threshold = options.threshold ?? DEFAULT_CATCH_ALL_THRESHOLD;
  const totalExpense = round2(accounts.reduce((sum, a) => sum + a.amount, 0));
  if (totalExpense <= 0) return { totalExpense, findings: [] };

  const findings = accounts
    .filter((a) => a.amount > 0 && !a.nature)
    .map((a) => ({
      code: a.code,
      name: a.name,
      amount: round2(a.amount),
      share: a.amount / totalExpense,
    }))
    .filter((f) => f.share > threshold)
    .sort((a, b) => b.share - a.share);

  return { totalExpense, findings };
}

/** Satu akun belum bersifat, sebagai kalimat. */
export function describeUntaggedExpense(finding: UntaggedExpenseFinding): string {
  const persen = (finding.share * 100).toFixed(1);
  const nominal = Math.round(finding.amount).toLocaleString("id-ID");
  return `${finding.code} ${finding.name} = Rp ${nominal} (${persen}% dari total beban)`;
}
