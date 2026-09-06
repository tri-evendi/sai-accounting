/**
 * TUTUP BUKU TAHUNAN (issue #555) — aritmetikanya dan batas tahun bukunya.
 *
 * ══ MASALAH YANG DIJAWAB ═══════════════════════════════════════════════════
 * `3102 Laba Ditahan` disemai templat bagan akun dan, diukur di buku produksi,
 * **tidak pernah menerima satu baris jurnal pun**. Laba setiap tahun tinggal di
 * akun pendapatan dan beban selamanya, dan neraca melipat seluruh hasil sejak
 * buku dibuka menjadi satu baris.
 *
 * Dua akibatnya nyata: **Laporan Perubahan Ekuitas mustahil dibuat** (ia justru
 * laporan yang memisahkan hasil tahun berjalan dari tahun-tahun sebelumnya),
 * dan 3102 menjadi persis akun yang diperingatkan `coa-seeding.ts` — nol
 * selamanya sambil memenuhi setiap pemilih akun, mengundang orang menjurnal ke
 * ekuitas dengan tangan.
 *
 * ══ MURNI, DAN ITU DISENGAJA ═══════════════════════════════════════════════
 * Tanpa Prisma, tanpa React. Sebuah jurnal penutup yang salah tidak akan pernah
 * terlihat rusak — ia seimbang, masuk akal bentuknya, dan memindahkan angka
 * yang salah ke ekuitas, tempat kesalahan paling sulit ditemukan kembali.
 */

/** Uang di buku ini `Decimal(15,2)`. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * BATAS TAHUN BUKU — dan ia BUKAN selalu Januari–Desember.
 *
 * `company_settings.fiscal_year_start` menyimpan tanggal mulainya buku, dan
 * bulan/tanggal di dalamnya yang menentukan batas setiap tahun sesudahnya.
 * Mengasumsikan kalender akan menutup buku pada tanggal yang salah bagi setiap
 * perusahaan yang tahun bukunya tidak mulai 1 Januari — dan kesalahannya tidak
 * berbunyi: jurnalnya tetap seimbang, hanya tanggalnya yang memindahkan laba ke
 * tahun yang keliru.
 *
 * `year` di sini adalah tahun KALENDER tempat tahun buku itu DIMULAI. Tahun
 * buku yang mulai 1 April 2026 karena itu `year = 2026`, dan berakhir
 * 31 Maret 2027.
 */
export function fiscalYearBounds(
  fiscalYearStart: Date,
  year: number
): { start: Date; end: Date } {
  const month = fiscalYearStart.getMonth();
  const day = fiscalYearStart.getDate();

  const start = new Date(year, month, day, 0, 0, 0, 0);
  /*
   * Akhirnya diturunkan dari AWAL tahun berikutnya dikurangi satu milidetik,
   * bukan dari "tanggal yang sama tahun depan minus sehari". Bentuk kedua salah
   * pada tahun kabisat dan pada tahun buku yang mulai tanggal 29–31, sebab
   * `new Date(y, m, 31)` menggulung sendiri ke bulan berikutnya. Yang di bawah
   * ini tidak punya kasus tepi: ia hanya satu milidetik sebelum awal berikutnya,
   * apa pun kalendernya.
   */
  const end = new Date(new Date(year + 1, month, day, 0, 0, 0, 0).getTime() - 1);
  return { start, end };
}

/** Saldo satu akun laba rugi pada akhir tahun buku, POSITIF-DEBIT. */
export interface ClosingBalance {
  accountId: number;
  accountCode: string;
  accountName: string;
  /**
   * Positif-debit: akun beban biasanya positif, pendapatan negatif. Aturan
   * tanda yang sama dengan `fx-revaluation.ts`, dan alasan yang sama — satu
   * rumus untuk dua arah, nol percabangan yang bisa salah.
   */
  balance: number;
}

export interface ClosingLine {
  accountId: number;
  debit: number;
  credit: number;
}

export interface YearClosePlan {
  /** Baris penutup akun laba rugi, ditambah baris Laba Ditahan. */
  lines: ClosingLine[];
  /**
   * Laba (positif) atau rugi (negatif) tahun itu — angka yang PINDAH ke ekuitas.
   * Sama dengan "Laba/Rugi Bersih" pada Laba Rugi tahun yang sama.
   */
  netIncome: number;
  /** Akun laba rugi yang benar-benar bersaldo dan karena itu ditutup. */
  closedAccounts: number;
}

/**
 * Susun jurnal penutup: nolkan setiap akun laba rugi, pindahkan hasilnya ke
 * Laba Ditahan.
 *
 * ── Kenapa akun bersaldo nol DILEWATI ─────────────────────────────────────
 * Baris bernilai nol tetap seimbang dan tetap sampah: ia muncul di kartu akun,
 * ekspor, dan rekonsiliasi tanpa mengatakan apa pun. Perusahaan dengan 200 akun
 * laba rugi yang 150 di antaranya tak terpakai akan mendapat jurnal penutup
 * 200 baris yang 150-nya kosong.
 *
 * ── DIAM ADALAH KELUARAN YANG SAH ─────────────────────────────────────────
 * Tahun tanpa satu pun transaksi laba rugi memulangkan `lines: []`. Pemanggil
 * TIDAK boleh memposting apa pun untuk rencana seperti itu — sebuah jurnal
 * penutup bernilai nol menyatakan bahwa tahun itu sudah ditutup padahal tidak
 * ada yang perlu ditutup, dan tahun berikutnya akan menumpuk di atasnya.
 */
export function planYearClose(
  balances: readonly ClosingBalance[],
  retainedEarningsAccountId: number
): YearClosePlan {
  const lines: ClosingLine[] = [];
  let moved = 0;

  for (const b of balances) {
    const amount = round2(b.balance);
    if (amount === 0) continue;

    /* Menolkan saldo positif-debit berarti memposting lawannya. */
    lines.push({
      accountId: b.accountId,
      debit: amount < 0 ? -amount : 0,
      credit: amount > 0 ? amount : 0,
    });
    moved = round2(moved + amount);
  }

  const closedAccounts = lines.length;

  /*
   * `moved` adalah jumlah saldo positif-debit seluruh akun laba rugi, yaitu
   * (beban − pendapatan) — kebalikan tanda dari laba. Dijumlahkan dari nilai
   * yang SUDAH dibulatkan, alasan yang sama dengan `planRevaluation`: sisi
   * Laba Ditahan diturunkan dari angka ini, jadi tidak ada sisa pembulatan yang
   * bisa lahir di antara keduanya dan jurnalnya seimbang secara konstruksi.
   */
  /*
   * `+ 0` menormalkan NEGATIF NOL. `-moved` menghasilkan `-0` ketika impas, dan
   * `-0` bukan keanehan akademis di sini: sebagian pemformat menampilkannya
   * sebagai "-0", `Object.is(-0, 0)` bernilai false sehingga perbandingan di
   * pemanggil bisa meleset, dan JSON.stringify menuliskannya "0" — jadi ia juga
   * berubah bentuk saat melintasi API. Impas adalah nol, bukan minus nol.
   */
  const netIncome = round2(-moved) + 0;

  /*
   * Laba nol dengan akun yang bergerak adalah mungkin dan sah — pendapatan
   * persis sebesar beban. Akun-akunnya tetap harus dinolkan; yang tidak boleh
   * lahir hanyalah baris Laba Ditahan bernilai nol.
   */
  if (lines.length > 0 && netIncome !== 0) {
    lines.push({
      accountId: retainedEarningsAccountId,
      debit: netIncome < 0 ? -netIncome : 0,
      credit: netIncome > 0 ? netIncome : 0,
    });
  }

  return { lines, netIncome, closedAccounts };
}
