/**
 * Transaksi berulang — aturannya, sebagai fungsi murni (issue #469).
 *
 * ══ MASALAH YANG DIBERESKANNYA ══════════════════════════════════════════════
 * Sewa bulanan, langganan, cicilan, dan beban rutin lain diketik ulang dari nol
 * setiap bulan oleh orang yang sama. Penghematan waktunya nyata tapi bukan
 * alasan utamanya: pekerjaan bulanan yang diketik ulang adalah pekerjaan yang
 * TERLEWAT. Bukan salah ketik yang jadi masalah, melainkan bulan yang bukunya
 * kehilangan satu beban rutin — lalu laba bulan itu terlihat lebih baik
 * daripada kenyataannya, dan bagi pengguna tanpa akuntan yang memeriksa,
 * kesalahan itu tidak pernah ketahuan.
 *
 * ══ SATU KEPUTUSAN YANG MENENTUKAN SELURUH BENTUKNYA ════════════════════════
 * Yang dihasilkan penjadwal adalah DRAF, bukan jurnal yang sudah terposting.
 * Mesin yang memposting sendiri ke buku besar setiap bulan berarti angka yang
 * tidak seorang pun lihat sebelum tercatat — dan pada buku yang laporannya
 * dipakai mengambil keputusan, itu lebih mahal daripada mengetik ulang.
 *
 * ══ TANGGAL 31 DI BULAN BERISI 30 HARI ══════════════════════════════════════
 * Ini pertanyaan yang WAJIB punya jawaban tertulis, bukan perilaku kebetulan.
 * Jawabannya: **dijepit ke hari terakhir bulan itu**, dan tanggal aslinya
 * TIDAK hilang — kejadian berikutnya dihitung ulang dari tanggal MULAI, bukan
 * dari kejadian sebelumnya. Sewa yang jatuh tiap tanggal 31 karena itu
 * berbunyi 31 Jan → 28 Feb → 31 Mar, bukan merosot menjadi 28 setiap bulan
 * sesudahnya. Menghitung dari kejadian sebelumnya adalah cara paling mudah
 * sebuah jadwal bulanan "hanyut" beberapa hari dalam setahun tanpa ada yang
 * menyadarinya.
 *
 * MURNI: tanpa Prisma, tanpa I/O, tanpa `Date.now()` implisit — hari ini
 * SELALU dioper.
 */

export const RECURRENCE_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRING_KINDS = ["invoice", "journal"] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

/** Aturan pengulangan sebuah templat. */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Kejadian PERTAMA. Ia juga jangkar tanggalnya (lihat catatan "tanggal 31"). */
  startDate: Date;
  /** Berhenti SESUDAH tanggal ini (inklusif). `null` = tanpa batas tanggal. */
  endDate: Date | null;
  /** Berhenti setelah sekian kejadian. `null` = tanpa batas jumlah. */
  maxOccurrences: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tengah malam UTC — seluruh modul ini membandingkan HARI, bukan jam. */
function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `YYYY-MM-DD` dari sebuah tanggal (UTC) — bentuk kunci idempotensinya. */
export function occurrenceKey(date: Date): string {
  return new Date(dayStart(date)).toISOString().slice(0, 10);
}

/** Hari terakhir sebuah bulan. */
function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Kejadian ke-`n` (0 = yang pertama), dihitung dari TANGGAL MULAI.
 *
 * Selalu dari jangkarnya, tidak pernah dari kejadian sebelumnya — itu yang
 * mencegah jadwal bulanan hanyut, dan yang membuat kejadian ke-100 bisa
 * dihitung tanpa menghitung 99 sebelumnya.
 */
export function occurrenceAt(rule: RecurrenceRule, n: number): Date {
  const start = rule.startDate;
  const anchorDay = start.getUTCDate();

  if (rule.frequency === "weekly") {
    return new Date(dayStart(start) + n * 7 * DAY_MS);
  }

  const monthsAhead = rule.frequency === "yearly" ? n * 12 : n;
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + monthsAhead;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;

  /* Dijepit, bukan meluber ke bulan berikutnya: `new Date(2026, 1, 31)` polos
     memulangkan 3 Maret, dan sewa yang tercatat di bulan yang salah adalah
     kesalahan yang tidak pernah menerbitkan galat. */
  const day = Math.min(anchorDay, lastDayOf(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

/** Apakah kejadian ke-`n` masih di dalam batas aturannya. */
function withinBounds(rule: RecurrenceRule, n: number, date: Date): boolean {
  if (rule.maxOccurrences !== null && n >= rule.maxOccurrences) return false;
  if (rule.endDate !== null && dayStart(date) > dayStart(rule.endDate)) return false;
  return true;
}

/**
 * Berapa hari sesudah tanggalnya sebuah kejadian masih boleh menyusul.
 *
 * Sama seperti pengingat jatuh tempo (#467), dan dengan dua alasan yang sama:
 * penjadwal yang mati semalam tidak boleh menghanguskan dokumen bulan itu, dan
 * templat yang BARU dibuat dengan tanggal mulai jauh di belakang tidak boleh
 * menerbitkan dua puluh draf sekaligus pada putaran pertama.
 *
 * Lebih longgar daripada pengingat (2 hari) karena akibatnya berbeda: draf yang
 * telat sehari tetap berguna dan tidak terkirim ke siapa pun, sementara surel
 * yang telat kehilangan gunanya. Yang tetap sama: ia BUKAN "kejar semua yang
 * tertinggal".
 */
export const CATCH_UP_DAYS = 7;

export interface PlannedOccurrence {
  /** Indeks kejadian (0-based) — dipakai menghitung ulang, bukan disimpan. */
  index: number;
  date: Date;
  /** `YYYY-MM-DD` — separuh kunci uniknya di basis data. */
  key: string;
}

/**
 * Kejadian yang PANTAS diterbitkan hari ini.
 *
 * Yang TIDAK dihasilkan:
 *   • kejadian di masa depan — sebuah draf yang muncul sebulan lebih awal
 *     hanya menambah kebisingan di daftar yang harus ditinjau seseorang;
 *   • kejadian yang tanggalnya sudah lewat lebih dari `CATCH_UP_DAYS`;
 *   • kejadian yang sudah pernah diterbitkan (`sudahTerbit`) — saringan kedua
 *     saja; yang benar-benar menjaga adalah kunci unik di basis data.
 */
export function planOccurrences(input: {
  rule: RecurrenceRule;
  today: Date;
  sudahTerbit?: ReadonlySet<string>;
}): PlannedOccurrence[] {
  const today = dayStart(input.today);
  const terbit = input.sudahTerbit ?? new Set<string>();
  const out: PlannedOccurrence[] = [];

  /* Batas putaran: aturan tanpa `endDate` maupun `maxOccurrences` yang
     tanggal mulainya bertahun-tahun lalu tidak boleh membuat penjadwal
     berputar tanpa akhir. Kejadian pertama yang sudah melewati hari ini
     mengakhiri pencarian — jadwal ini menaik, jadi tidak ada yang terlewat
     di belakangnya. */
  for (let n = 0; n < MAX_SCAN; n++) {
    const date = occurrenceAt(input.rule, n);
    if (!withinBounds(input.rule, n, date)) break;

    const at = dayStart(date);
    if (at > today) break;
    if (at < today - CATCH_UP_DAYS * DAY_MS) continue;

    const key = occurrenceKey(date);
    if (terbit.has(key)) continue;
    out.push({ index: n, date, key });
  }

  return out;
}

/**
 * Batas pemindaian. Mingguan selama sepuluh tahun ≈ 520 kejadian; angka ini
 * memberi ruang jauh di atasnya sambil tetap menjadi jaring pengaman terhadap
 * aturan yang cacat.
 */
const MAX_SCAN = 5000;

/**
 * Kejadian BERIKUTNYA sesudah hari ini — untuk layar "akan terbit".
 *
 * `null` berarti templat ini sudah habis: batas tanggalnya lewat, atau jumlah
 * kejadiannya sudah penuh. Itu keadaan yang wajar dan harus bisa dikatakan,
 * bukan dijawab dengan tanggal karangan.
 */
export function nextOccurrence(rule: RecurrenceRule, today: Date): Date | null {
  const at = dayStart(today);
  for (let n = 0; n < MAX_SCAN; n++) {
    const date = occurrenceAt(rule, n);
    if (!withinBounds(rule, n, date)) return null;
    if (dayStart(date) > at) return date;
  }
  return null;
}
