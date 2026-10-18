/**
 * MENUMPUK PAKET KECIL vs NAIK PAKET — hitungan, bukan klaim.
 *
 * ══ PERTANYAAN YANG DIJAWABNYA ═════════════════════════════════════════════
 * Pembeli produk ini adalah pemilik grup berisi beberapa PT
 * (`docs/KOMERSIALISASI.md` §2), dan pertanyaan pertamanya bukan "paket mana
 * yang paling murah" melainkan **"saya punya tiga PT — lebih murah beli tiga
 * paket kecil atau satu paket besar?"**. Sampai sekarang halaman harga
 * membiarkannya menghitung sendiri dari tiga kartu nominal.
 *
 * Jawabannya sudah menjadi keputusan komersial yang tercatat — `docs/PRICING.md`
 * §1: *"naik paket selalu lebih murah daripada membeli beberapa paket kecil:
 * 3 × Starter = Rp 747.000 > Pro; 8 PT lewat 3 × Pro = Rp 1.797.000 >
 * Business"*. Modul ini MENURUNKAN kedua baris itu dari katalog alih-alih
 * mengetiknya, jadi ia tidak bisa menyimpang pada hari harga berubah.
 *
 * ══ KENAPA DITURUNKAN, BUKAN DITULIS ═══════════════════════════════════════
 * Halaman pendaratan tidak boleh memuat angka yang tidak punya sumber di kode
 * (`pages/landing.md` §KLAIM HARUS PUNYA SUMBER). Angka hemat yang diketik akan
 * tetap tertulis "hemat Rp 148.000" berbulan-bulan setelah seseorang menaikkan
 * harga Starter — yaitu klaim yang berubah menjadi salah tanpa ada yang
 * menyentuhnya.
 *
 * ⚠ DAN KALAU HITUNGANNYA TIDAK MENDUKUNG KLAIMNYA, BARISNYA HILANG.
 * Tangga harga hari ini membuat menumpuk selalu lebih mahal, tetapi itu sifat
 * ANGKANYA, bukan hukum alam: Starter pada Rp 199.000 akan membuat 3 × Starter
 * (597.000) lebih murah daripada Pro (599.000) — persis alasan `PRICING.md`
 * menolak angka itu. Fungsi ini menjatuhkan baris yang tidak hemat alih-alih
 * memajang "hemat −Rp 2.000", sebab halaman pemasaran yang membantah dirinya
 * sendiri lebih buruk daripada halaman yang diam.
 *
 * MURNI: tanpa Prisma, tanpa `next/*`, tanpa kamus — ia menerima katalog dan
 * memulangkan angka. Diuji langsung di `tests/plan-stacking.test.ts`.
 */

/** Bentuk seminimal yang dibutuhkan — sebagian `PlanOption` (`plan-catalog`). */
export interface StackablePlan {
  key: string;
  name: string;
  priceMonthly: number;
  /** Mata uang nominalnya — dipajang apa adanya, tidak pernah dikonversi. */
  currency: string;
  maxCompanies: number;
  /** Harga dirundingkan → tidak punya nominal untuk dibandingkan. */
  contactOnly: boolean;
}

export interface StackingComparison {
  /** Berapa paket kecil yang dibutuhkan untuk menyamai kuota paket besar. */
  count: number;
  /** Paket kecil yang ditumpuk. */
  small: StackablePlan;
  /** Paket besar yang menggantikannya. */
  large: StackablePlan;
  /** `count × small.priceMonthly`. */
  stacked: number;
  /** `large.priceMonthly`. */
  upgrade: number;
  /** `stacked − upgrade`, selalu > 0 (baris yang tidak hemat dijatuhkan). */
  saving: number;
}

/** Paket yang punya nominal untuk dibandingkan, termurah lebih dulu. */
function comparable(plans: readonly StackablePlan[]): StackablePlan[] {
  return plans
    .filter((p) => !p.contactOnly && p.priceMonthly > 0 && p.maxCompanies > 0)
    .sort((a, b) => a.priceMonthly - b.priceMonthly);
}

/**
 * Perbandingan untuk setiap pasangan paket BERURUTAN.
 *
 * Pasangan berurutan, bukan setiap kombinasi: "3 × Starter vs Business" benar
 * secara aritmetika tetapi bukan pilihan yang sedang dipikirkan siapa pun —
 * orang yang butuh 8 PT tidak sedang menimbang Starter. Satu langkah tangga
 * per baris menjaga tabelnya tetap sependek keputusannya.
 */
export function stackingComparisons(
  plans: readonly StackablePlan[]
): StackingComparison[] {
  const urut = comparable(plans);
  const out: StackingComparison[] = [];

  for (let i = 0; i + 1 < urut.length; i++) {
    const small = urut[i];
    const large = urut[i + 1];

    /* Berapa paket kecil untuk menyamai kuota PT paket besar. `ceil`: setengah
       lisensi tidak bisa dibeli, dan pembulatan ke bawah akan membandingkan
       kuota yang TIDAK setara — yaitu perbandingan yang menguntungkan kami
       secara tidak jujur. */
    const count = Math.ceil(large.maxCompanies / small.maxCompanies);
    if (count < 2) continue; // kuotanya sama → tidak ada yang ditumpuk

    const stacked = count * small.priceMonthly;
    const saving = stacked - large.priceMonthly;
    /* Lihat ⚠ di kepala berkas: tidak hemat = tidak ada barisnya. */
    if (saving <= 0) continue;

    out.push({ count, small, large, stacked, upgrade: large.priceMonthly, saving });
  }

  return out;
}
