/**
 * KOLOM PEMBANDING LAPORAN KEUANGAN (issue #557).
 *
 * ══ MASALAHNYA ════════════════════════════════════════════════════════════
 * Setiap laporan keuangan menampilkan SATU kolom angka. "Beban penjualan
 * Rp 84 juta" tidak memberi tahu pembacanya apa pun sampai ia tahu bulan lalu
 * berapa — dan satu-satunya cara mengetahuinya hari ini adalah membuka laporan
 * yang sama dua kali lalu membandingkannya di kepala.
 *
 * Dua alasan yang lebih keras daripada kenyamanan:
 *
 *   • **Laporan statutori menyajikan komparatif.** Neraca dan Laba Rugi untuk
 *     bank, auditor, dan SPT Tahunan selalu menampilkan periode berjalan
 *     berdampingan dengan periode sebelumnya. Yang dicetak hari ini belum
 *     berbentuk itu.
 *   • **Ia melengkapi kalimat dasbor (#472).** Panel itu sudah mengatakan "kas
 *     turun 18% dibanding bulan lalu", lalu tautannya membuka laporan yang
 *     tidak menunjukkan bulan lalu sama sekali.
 *
 * ══ MURNI ═════════════════════════════════════════════════════════════════
 * Tanpa Prisma dan tanpa React: pemanggil membaca DUA periode lewat pembaca
 * yang sudah ada, modul ini hanya menyandingkannya. Itu yang menjaga janji
 * #557 bahwa tidak satu angka pun berubah — kolom berjalan pada laporan
 * komparatif WAJIB identik dengan laporan satu-kolom untuk rentang yang sama,
 * sebab keduanya angka yang sama persis, dibaca sekali.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Baris laporan apa adanya — bentuk yang sudah dipakai Neraca & Laba Rugi. */
export interface ComparableLine {
  code: string;
  name: string;
  amount: number;
}

export interface ComparedLine {
  code: string;
  name: string;
  current: number;
  prior: number;
  /** `current − prior`. */
  delta: number;
  /**
   * Perubahan dalam persen, atau `null` bila tidak bermakna.
   *
   * `null` ketika pembandingnya NOL: "naik ∞%" bukan informasi, dan "naik 100%"
   * atas dasar nol adalah pernyataan yang salah — dari nol, kenaikan berapa pun
   * tak punya persentase. Layarnya menggambar tanda pisah, bukan angka.
   */
  percent: number | null;
}

/**
 * Sandingkan dua daftar baris.
 *
 * ── Akun yang hanya ada di SATU periode tetap muncul ──────────────────────
 * Dengan nol di sisi lainnya, bukan hilang dari barisnya. Sebuah akun yang
 * bersaldo tahun lalu dan nol tahun ini adalah informasi — sering justru yang
 * paling ingin dilihat pembacanya — dan membuangnya membuat kolom pembanding
 * tidak lagi berjumlah total periode pembandingnya.
 *
 * ── Urutannya mengikuti periode BERJALAN ──────────────────────────────────
 * Baris yang hanya ada di periode pembanding menyusul di belakang, terurut
 * kode. Kalau urutannya dicampur menurut kode secara keseluruhan, laporan
 * berjalan berubah susunannya hanya karena sebuah akun lama ikut ditampilkan —
 * dan pembaca yang hafal letak barisnya kehilangan pegangan.
 */
export function compareLines(
  current: readonly ComparableLine[],
  prior: readonly ComparableLine[]
): ComparedLine[] {
  const priorByCode = new Map(prior.map((l) => [l.code, l]));
  const seen = new Set<string>();
  const out: ComparedLine[] = [];

  const push = (code: string, name: string, cur: number, pri: number) => {
    const c = round2(cur);
    const p = round2(pri);
    out.push({
      code,
      name,
      current: c,
      prior: p,
      delta: round2(c - p),
      /* Dibulatkan ke satu desimal DI SINI, bukan saat diformat: dua permukaan
         yang membulatkan di tempat berbeda menghasilkan "19,4%" di satu baris
         dan "19,45%" di baris totalnya. */
      percent: p === 0 ? null : Math.round(((c - p) / Math.abs(p)) * 1000) / 10,
    });
  };

  for (const line of current) {
    seen.add(line.code);
    push(line.code, line.name, line.amount, priorByCode.get(line.code)?.amount ?? 0);
  }

  for (const line of [...prior].sort((a, b) => a.code.localeCompare(b.code))) {
    if (seen.has(line.code)) continue;
    push(line.code, line.name, 0, line.amount);
  }

  return out;
}

/** Satu angka tunggal (total) yang disandingkan. */
export function compareTotals(current: number, prior: number): ComparedLine {
  return compareLines([{ code: "", name: "", amount: current }], [{ code: "", name: "", amount: prior }])[0];
}

/** Bentuk periode pembanding yang bisa dipilih. */
export type ComparisonMode =
  /** Periode setara TEPAT SEBELUMNYA — bulan lalu untuk rentang sebulan. */
  | "preceding"
  /** Periode yang sama TAHUN LALU — bentuk statutori yang paling lazim. */
  | "previous_year";

/**
 * Rentang pembanding untuk sebuah rentang.
 *
 * ⚠ `preceding` memakai PANJANG rentangnya, bukan "bulan lalu": rentang 45 hari
 * dibandingkan dengan 45 hari sebelumnya, sebab membandingkan 45 hari dengan
 * satu bulan kalender menghasilkan selisih yang seluruhnya artefak panjang
 * periode — dan pembacanya tidak punya cara mengetahuinya dari layar.
 *
 * `previous_year` menggeser TAHUN-nya, sehingga rentang 1–31 Januari
 * dibandingkan dengan 1–31 Januari tahun lalu, bukan dengan 31 hari sebelumnya.
 */
export function comparisonRange(
  from: Date,
  to: Date,
  mode: ComparisonMode
): { from: Date; to: Date } {
  if (mode === "previous_year") {
    return {
      from: new Date(from.getFullYear() - 1, from.getMonth(), from.getDate(), 0, 0, 0, 0),
      to: new Date(
        to.getFullYear() - 1,
        to.getMonth(),
        to.getDate(),
        to.getHours(),
        to.getMinutes(),
        to.getSeconds(),
        to.getMilliseconds()
      ),
    };
  }

  /* Berakhir satu milidetik sebelum rentang berjalan dimulai, dan sepanjang
     rentang itu — tanpa satu hari pun bertumpang tindih atau terlewat. */
  const akhir = new Date(from.getTime() - 1);
  const awal = new Date(akhir.getTime() - (to.getTime() - from.getTime()));
  return { from: awal, to: akhir };
}

/**
 * Tanggal pembanding untuk laporan bersaldo (Neraca).
 *
 * ⚠ Neraca dibandingkan pada TANGGAL, Laba Rugi pada RENTANG. Menyamakan
 * keduanya menghasilkan neraca pembanding yang salah tanggal — dan neraca yang
 * salah tanggal tetap seimbang, jadi tidak ada yang berbunyi.
 */
export function comparisonDate(asOf: Date, mode: ComparisonMode, from?: Date): Date {
  if (mode === "previous_year") {
    return new Date(
      asOf.getFullYear() - 1,
      asOf.getMonth(),
      asOf.getDate(),
      asOf.getHours(),
      asOf.getMinutes(),
      asOf.getSeconds(),
      asOf.getMilliseconds()
    );
  }
  /* `preceding` untuk saldo berarti "tepat sebelum periode berjalan dimulai".
     Tanpa `from`, satu-satunya jawaban jujur adalah setahun sebelumnya —
     menebak "sebulan" akan salah untuk rentang panjang mana pun. */
  return from ? new Date(from.getTime() - 1) : comparisonDate(asOf, "previous_year");
}
