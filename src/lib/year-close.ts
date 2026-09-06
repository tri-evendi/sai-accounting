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

/**
 * Sudahkah tahun buku `year` BERAKHIR pada `now`? (issue #565)
 *
 * ══ KENAPA PERTANYAAN INI PERLU DITANYAKAN SAMA SEKALI ═════════════════════
 * Aritmetika tutup buku benar untuk tahun mana pun — dan justru itu masalahnya.
 * Menutup tahun yang belum berakhir menerbitkan jurnal bertanggal MASA DEPAN
 * (akhir tahun buku), memindahkan laba sampai hari ini ke Laba Ditahan, lalu
 * meninggalkan setiap transaksi antara hari ini dan tanggal itu **di luar**
 * jurnal penutupnya — padahal semuanya jatuh DI DALAM tahun yang sudah
 * dinyatakan tertutup.
 *
 * Hasilnya: akun laba rugi tidak nol pada akhir tahun, `year_closes` menyatakan
 * tahun itu sudah ditutup, dan Laba Ditahan memuat angka yang bukan laba
 * setahun. Neracanya tetap seimbang di setiap langkah, dan tidak ada satu galat
 * pun.
 *
 * `assertPeriodOpen` tidak menahannya: bulan Desember memang terbuka.
 *
 * ⚠ MURNI, dan `now` DISUNTIKKAN — bukan `new Date()` di dalam. Sebuah penjaga
 * yang membaca jam sendiri hanya bisa diuji pada hari tertentu, dan penjaga
 * yang tesnya bergantung pada tanggal berjalan adalah penjaga yang suatu hari
 * memerah tanpa ada yang berubah.
 */
export function fiscalYearHasEnded(
  fiscalYearStart: Date,
  year: number,
  now: Date
): boolean {
  return now.getTime() > fiscalYearBounds(fiscalYearStart, year).end.getTime();
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

/**
 * Tahun buku mana yang memuat `date`.
 *
 * Memulangkan tahun KALENDER tempat tahun buku itu dimulai — sumbu yang sama
 * dengan `fiscalYearBounds` dan dengan kolom `year_closes.year`. Untuk tahun
 * buku yang mulai 1 April, tanggal 15 Februari 2027 ada di dalam tahun buku
 * **2026**, bukan 2027; menjawab 2027 akan memisahkan laba tahun berjalan pada
 * tanggal yang salah selama tiga bulan setiap tahunnya.
 */
export function fiscalYearOf(fiscalYearStart: Date, date: Date): number {
  const tahun = date.getFullYear();
  /* Kalau tanggalnya mendahului awal tahun buku pada tahun kalender yang sama,
     ia masih milik tahun buku sebelumnya. */
  return date.getTime() < fiscalYearBounds(fiscalYearStart, tahun).start.getTime()
    ? tahun - 1
    : tahun;
}

/**
 * Nilai `journals.type` untuk jurnal penutup tahunan.
 *
 * ══ KENAPA IA JENIS TERSENDIRI, BUKAN `adjustment` ═════════════════════════
 * Laporan Laba Rugi HARUS mengecualikannya. Tanpa itu, tahun yang baru saja
 * ditutup akan melaporkan laba NOL — sebab jurnal penutup memang menolkan
 * setiap akun laba rugi, dan laporan yang menjumlahkan seluruh baris akan
 * menjumlahkan penutupnya juga.
 *
 * Itu bentuk kegagalan yang paling meyakinkan: laporannya terbit, seimbang,
 * rapi, dan seluruhnya nol — dan pembacanya akan menyimpulkan perusahaannya
 * tidak menghasilkan apa-apa tahun itu.
 *
 * Menyaring lewat `source_type` bisa saja, tetapi `type` yang tepat: ia sudah
 * menjadi sumbu yang dipakai buku besar untuk membedakan asal jurnal, dan
 * pembalikan (`reversal`) sudah lebih dulu memakainya begitu.
 */
export const CLOSING_JOURNAL_TYPE = "closing";

/**
 * Klausa `where` Prisma yang mengecualikan jurnal penutup, ditulis SEKALI.
 *
 * Dua tempat memakainya: `getIncomeStatement` (yang melayani Laba Rugi,
 * Anggaran vs Realisasi, dan Sifat Beban — ketiganya memanggilnya, tidak
 * menirunya) dan `project-profit-report`, yang menjalankan kuerinya sendiri.
 * Dua penyaring yang "sama" adalah dua penyaring yang suatu hari berbeda, dan
 * yang tertinggal akan melaporkan nol untuk tahun yang sudah ditutup sementara
 * tetangganya melaporkan angka yang benar.
 */
export const NOT_CLOSING = { type: { not: CLOSING_JOURNAL_TYPE } } as const;
