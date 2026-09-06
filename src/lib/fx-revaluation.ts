/**
 * REVALUASI POS MONETER VALAS (issue #554) — aritmetikanya, dan hanya itu.
 *
 * ══ PERTANYAAN YANG DIJAWAB BERKAS INI ═════════════════════════════════════
 * Sebuah piutang USD 100.000 dibukukan pada kurs 15.800 (tercatat Rp 1,58 M).
 * Pada 30 September kurs penutup 16.500. Piutang itu kini bernilai Rp 1,65 M,
 * dan selisih Rp 70 juta adalah keuntungan yang SUDAH terjadi walau uangnya
 * belum bergerak. PSAK 10 (IAS 21) menuntutnya masuk laba rugi pada tanggal
 * pelaporan, bukan nanti saat pelunasan.
 *
 * Yang dihitung di sini: selisih itu, per akun, dari saldo yang sudah dikumpulkan
 * pemanggil. Tanpa Prisma, tanpa React — supaya ia bisa diuji dengan angka
 * terburuk yang bisa dibayangkan, bukan hanya dengan angka yang kebetulan ada
 * di basis data hari ini.
 *
 * ══ SATU ATURAN TANDA, DUA ARAH ════════════════════════════════════════════
 * Seluruh besaran di sini **positif-debit**: aset bersaldo positif, kewajiban
 * bersaldo negatif. Itu bukan gaya penulisan melainkan yang membuat berkas ini
 * tidak perlu tahu apa-apa tentang jenis akun.
 *
 *   selisih = (saldo valas × kurs penutup) − nilai tercatat
 *
 * Piutang USD saat kurs naik → selisih POSITIF → Dr piutang, Kr selisih kurs
 * (untung). Utang USD saat kurs naik → saldonya negatif, nilai tercatat makin
 * negatif → selisih NEGATIF → Kr utang, Dr selisih kurs (rugi). Satu rumus,
 * dua arah, nol percabangan aset-versus-kewajiban — dan percabangan yang tidak
 * ditulis adalah percabangan yang tidak bisa salah.
 *
 * ══ HANYA POS MONETER, DAN ITU KEPUTUSAN PEMANGGIL ═════════════════════════
 * Berkas ini merevaluasi APA PUN yang diberikan kepadanya. Penyaringan pos
 * moneter (piutang, utang, kas/bank valas) terjadi di pemanggil, sebab hanya
 * ia yang tahu tipe akunnya. Persediaan dan aset tetap adalah pos NON-moneter
 * dan tetap pada kurs historis; menyertakannya menghasilkan neraca yang lebih
 * salah daripada tidak direvaluasi sama sekali.
 */

/** Uang di buku ini `Decimal(15,2)`; pembulatan mengikuti itu, bukan float. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Saldo satu akun dalam satu mata uang asing, positif-debit. */
export interface MonetaryBalance {
  accountId: number;
  accountCode: string;
  accountName: string;
  /** Mata uang asing. Pemanggil TIDAK boleh mengirim mata uang dasar. */
  currency: string;
  /** Saldo dalam mata uang asalnya (debit − kredit). */
  foreignAmount: number;
  /** Nilai IDR sebagaimana TERCATAT di buku (base debit − base kredit). */
  carryingBase: number;
}

/** Satu baris rencana revaluasi — satu akun, satu selisih. */
export interface RevaluationLine extends MonetaryBalance {
  /** Saldo valas × kurs penutup, dibulatkan ke sen. */
  revaluedBase: number;
  /** `revaluedBase − carryingBase`. Positif = debit, negatif = kredit. */
  difference: number;
}

/**
 * Rencana revaluasi satu mata uang.
 *
 * `lines` HANYA memuat baris yang benar-benar bergerak; lihat `planRevaluation`.
 */
export interface RevaluationPlan {
  currency: string;
  closingRate: number;
  lines: RevaluationLine[];
  /**
   * Jumlah seluruh `difference`. Inilah yang mendarat di akun Selisih Kurs,
   * dengan tanda TERBALIK — sisi penyeimbang jurnalnya.
   */
  totalDifference: number;
}

/** Kurs penutup yang tidak masuk akal ditolak, bukan dipakai. */
export class InvalidClosingRateError extends Error {
  constructor(readonly currency: string, readonly rate: number) {
    super(`Kurs penutup ${currency} tidak sah: ${rate}`);
    this.name = "InvalidClosingRateError";
  }
}

/**
 * Susun rencana revaluasi untuk SATU mata uang.
 *
 * ── Kenapa baris bernilai nol DIBUANG, bukan dibawa dengan angka nol ───────
 * Sebuah jurnal yang memuat baris nol tetap seimbang dan tetap benar secara
 * aritmetika — dan tetap sampah di buku besar: ia muncul di setiap kartu akun,
 * setiap ekspor, dan setiap rekonsiliasi, tanpa mengatakan apa pun. Yang tidak
 * bergerak tidak dijurnal.
 *
 * ── DIAM ADALAH KELUARAN YANG SAH ─────────────────────────────────────────
 * Kurs penutup yang persis sama dengan kurs pembukuan seluruh saldonya
 * menghasilkan `lines: []` dan `totalDifference: 0`. Pemanggil TIDAK boleh
 * memposting apa pun untuk rencana seperti itu — jurnal kosong yang terbit tiap
 * akhir bulan adalah jurnal yang mengajari pembacanya melewatinya.
 */
export function planRevaluation(
  currency: string,
  closingRate: number,
  balances: readonly MonetaryBalance[]
): RevaluationPlan {
  /*
   * Kurs nol, negatif, atau bukan angka BUKAN kasus tepi yang boleh dibulatkan
   * menjadi "tidak ada selisih": ia akan menilai setiap saldo valas menjadi nol
   * dan menerbitkan jurnal sebesar seluruh piutang perusahaan. Ditolak di
   * pintu — pola `resolveRate`, yang menolak menebak.
   */
  if (!Number.isFinite(closingRate) || closingRate <= 0) {
    throw new InvalidClosingRateError(currency, closingRate);
  }

  const lines: RevaluationLine[] = [];
  for (const b of balances) {
    if (b.currency !== currency) continue;

    const revaluedBase = round2(b.foreignAmount * closingRate);
    const difference = round2(revaluedBase - b.carryingBase);
    if (difference === 0) continue;

    lines.push({ ...b, revaluedBase, difference });
  }

  /*
   * Dijumlahkan dari `difference` yang SUDAH dibulatkan, bukan dari perkalian
   * mentah lalu dibulatkan di akhir. Inilah yang membuat jurnalnya seimbang
   * secara konstruksi: sisi Selisih Kurs adalah negatif dari jumlah ini, jadi
   * tidak ada sisa pembulatan yang bisa lahir di antara keduanya. Membalik
   * urutan (jumlah dulu, bulatkan kemudian) menghasilkan jurnal yang timpang
   * satu sen pada sebagian data dan seimbang pada sebagian lain — cacat yang
   * hanya muncul di produksi.
   */
  const totalDifference = round2(lines.reduce((sum, l) => sum + l.difference, 0));

  return { currency, closingRate, lines, totalDifference };
}

/** Satu baris jurnal siap posting, positif-debit sudah diterjemahkan ke Dr/Kr. */
export interface RevaluationJournalLine {
  accountId: number;
  debit: number;
  credit: number;
}

/**
 * Terjemahkan rencana menjadi baris jurnal, ditambah sisi penyeimbangnya.
 *
 * Sisi penyeimbang memakai `-totalDifference`: untung revaluasi (selisih
 * positif, Dr aset) mengkredit Selisih Kurs, dan sebaliknya. Karena angkanya
 * diambil dari jumlah yang sudah dibulatkan di `planRevaluation`, jurnal ini
 * seimbang tanpa perlu satu pun baris penyesuai.
 */
export function revaluationJournalLines(
  plan: RevaluationPlan,
  fxAccountId: number
): RevaluationJournalLine[] {
  if (plan.lines.length === 0) return [];

  const lines: RevaluationJournalLine[] = plan.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.difference > 0 ? l.difference : 0,
    credit: l.difference < 0 ? -l.difference : 0,
  }));

  /*
   * Selisih total NOL sementara baris-barisnya tidak — mungkin, dan bukan
   * kelainan: untung di piutang bisa menghapus rugi di utang dengan tepat.
   * Jurnalnya tetap sah dan tetap harus terbit (masing-masing akun memang
   * bergerak); yang tidak boleh terbit hanyalah baris penyeimbang bernilai nol.
   */
  if (plan.totalDifference !== 0) {
    lines.push({
      accountId: fxAccountId,
      debit: plan.totalDifference < 0 ? -plan.totalDifference : 0,
      credit: plan.totalDifference > 0 ? plan.totalDifference : 0,
    });
  }

  return lines;
}
