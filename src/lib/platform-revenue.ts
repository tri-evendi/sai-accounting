/**
 * ANGKA PENDAPATAN PLATFORM — definisinya, di satu tempat.
 *
 * ══ KENAPA MODUL INI ADA ═══════════════════════════════════════════════════
 * Sampai sekarang pertanyaan **"berapa pendapatan kita?"** tidak bisa dijawab
 * dari tabel mana pun tanpa pengetahuan rahasia: tagihan comp dulu berstatus
 * `paid` bertotal Rp 0 (diperbaiki — kini `comped`), dan "langganan aktif"
 * mencakup akun internal yang tidak pernah ditagih siapa pun.
 * `docs/KOMERSIALISASI.md` §8 menuntut definisi yang tertulis sebelum rupiah
 * pertama; berkas ini definisinya.
 *
 * ══ TIGA ATURAN YANG MEMBENTUK SETIAP ANGKA DI SINI ════════════════════════
 *
 *  1. **UANG = baris `payments` berstatus `paid`.** Bukan tagihan lunas, bukan
 *     langganan aktif. Comp tidak pernah melahirkan baris pembayaran
 *     (`extendSubscription` menolak menulis pembayaran nol — "dokumen yang
 *     menyatakan sesuatu yang tidak pernah terjadi"), jadi menghitung dari
 *     `payments` memisahkan penjualan dari hadiah SECARA KONSTRUKSI, bukan
 *     lewat saringan yang bisa terlupa.
 *
 *  2. **MRR hanya dari langganan yang BOLEH ditagih.** `billing_mode = none`
 *     (internal, penguji, pilot) dikecualikan: harga di baris itu adalah
 *     snapshot katalog, bukan uang yang akan masuk. Memasukkannya membuat MRR
 *     tumbuh setiap kali seseorang membuat akun demo.
 *
 *  3. **Tahunan dibagi dua belas, bukan sepuluh.** Katalog menjual setahun
 *     seharga sepuluh bulan (`PRICING.md` §1), tetapi MRR menjawab "berapa
 *     pendapatan per bulan KALENDER" — jadi pembaginya 12. Membaginya 10 akan
 *     melaporkan MRR 20% lebih tinggi daripada kas yang benar-benar masuk tiap
 *     bulan, dan itu bentuk angka yang membesarkan diri sendiri.
 *
 * ⚠ DUA METRIK §8 SENGAJA TIDAK ADA DI SINI, dan ketiadaannya adalah keputusan:
 *
 *   • **Waktu ke nilai pertama** (hari dari daftar sampai tutup bulan pertama)
 *     menuntut membuka BUKU pelanggan. `lib/operator/store.ts` menyatakannya
 *     terlarang — "konsol operator melihat METADATA langganan, bukan pembukuan
 *     pelanggan" — dan melanggarnya demi sebuah angka dasbor adalah harga yang
 *     salah. Ia butuh keputusan tersendiri, bukan diselundupkan.
 *   • **Konversi per KOHORT** menuntut riwayat peristiwa (kapan sebuah akun
 *     berpindah dari uji coba ke berbayar). Tidak ada tabel peristiwa langganan
 *     di repo ini, jadi yang bisa dihitung jujur hanyalah konversi SEJAK AWAL —
 *     dan ia dinamai demikian (`conversionAllTime`), bukan dipajang sebagai
 *     kohort yang bukan kohort.
 *
 * MURNI: tanpa Prisma, tanpa `next/*` — ia menerima baris dan memulangkan
 * angka. Diuji di `tests/platform-revenue.test.ts`.
 */

import { billingModeIsAutomatic } from "@/lib/platform-constants";

/** Satu langganan, seminimal yang dibutuhkan hitungan MRR. */
export interface RevenueSubscription {
  tenantId: number;
  status: string;
  /** `none` | `manual` | `auto`. */
  billingMode: string;
  /** `monthly` | `yearly`. */
  billingCycle: string;
  /** Harga per siklus — snapshot langganan, bukan katalog berjalan. */
  price: number;
}

/** Satu tagihan terbit yang belum lunas. */
export interface OutstandingInvoice {
  tenantId: number;
  dueDate: Date;
  total: number;
}

export interface RevenueSummary {
  /** Tenant dengan ≥1 pembayaran `paid` — pelanggan, bukan penerima hadiah. */
  payingTenants: number;
  /** Pendapatan bulanan berulang dari langganan yang boleh ditagih. */
  mrr: number;
  /** `mrr × 12`. Disebut sekali supaya tidak dihitung ulang di tampilan. */
  arr: number;
  /** Langganan yang ikut menyumbang MRR — penyebut yang membuat MRR bisa dibaca. */
  billableSubscriptions: number;
  /** Pendaftar yang pernah membayar, sejak awal. `null` = belum ada pendaftar. */
  conversionAllTime: number | null;
  /** Tagihan terbit yang belum lunas. */
  outstandingCount: number;
  outstandingTotal: number;
  /**
   * Umur tagihan tertua yang belum lunas, dalam hari. `null` = tidak ada.
   *
   * Dipilih alih-alih DSO rata-rata dengan sengaja: di bawah sepuluh tagihan,
   * rata-rata disetir satu pencilan dan menyembunyikan justru tagihan yang
   * paling perlu ditindak. Yang menuntut tindakan adalah YANG TERTUA.
   */
  oldestOutstandingDays: number | null;
}

/**
 * Harga per BULAN KALENDER dari harga per siklus.
 *
 * Lihat aturan 3 di kepala berkas: tahunan dibagi 12, bukan 10. Siklus yang
 * tidak dikenal diperlakukan sebagai bulanan — arah yang konservatif (tidak
 * membesarkan angkanya) dan sejalan dengan `nextPeriod`, yang juga jatuh ke
 * bulanan untuk nilai di luar daftar.
 */
export function monthlyEquivalent(price: number, cycle: string): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return cycle === "yearly" ? price / 12 : price;
}

/**
 * Apakah langganan ini menyumbang MRR?
 *
 * `manual` IKUT — ia ditagih di luar sistem (faktur dari buku PT penyedia),
 * tetapi uangnya nyata dan berulang; mengecualikannya akan membuat MRR
 * melaporkan nol selama Fase B, yaitu selama seluruh pendapatan pertama
 * perusahaan ini (`docs/KOMERSIALISASI.md` §5).
 *
 * `cancelled` TIDAK: langganan yang berhenti tidak berulang lagi. `past_due`
 * IKUT — ia masih langganan yang berjalan, hanya tagihannya tertunggak, dan
 * mencabutnya dari MRR akan membuat angka itu turun pada hari seseorang
 * terlambat bayar lalu naik lagi saat ia melunasi.
 */
export function countsTowardMrr(sub: RevenueSubscription): boolean {
  if (sub.billingMode === "none") return false;
  if (!billingModeIsAutomatic(sub.billingMode) && sub.billingMode !== "manual") return false;
  return sub.status !== "cancelled";
}

const HARI_MS = 24 * 60 * 60 * 1000;

/** Seluruh angka §8 yang bisa dihitung tanpa membuka buku pelanggan. */
export function summarizeRevenue(input: {
  subscriptions: readonly RevenueSubscription[];
  /** Id tenant yang punya ≥1 pembayaran `paid`. */
  payingTenantIds: readonly number[];
  /** Jumlah SELURUH tenant terdaftar — penyebut konversi. */
  totalTenants: number;
  outstanding: readonly OutstandingInvoice[];
  now: Date;
}): RevenueSummary {
  const berbayar = new Set(input.payingTenantIds);

  let mrr = 0;
  let billable = 0;
  for (const sub of input.subscriptions) {
    if (!countsTowardMrr(sub)) continue;
    billable += 1;
    mrr += monthlyEquivalent(sub.price, sub.billingCycle);
  }

  let outstandingTotal = 0;
  let tertua: number | null = null;
  for (const inv of input.outstanding) {
    outstandingTotal += inv.total;
    const umur = Math.floor((input.now.getTime() - inv.dueDate.getTime()) / HARI_MS);
    /* Umur dihitung dari JATUH TEMPO, bukan dari penerbitan: yang menuntut
       tindakan adalah seberapa lama ia TERLAMBAT. Tagihan yang belum jatuh
       tempo berumur negatif dan karena itu tidak pernah menjadi "yang tertua". */
    if (umur > (tertua ?? -Infinity)) tertua = umur;
  }

  return {
    payingTenants: berbayar.size,
    /* Dibulatkan ke rupiah: MRR dengan sen adalah ketelitian palsu — ia jumlah
       dari harga yang masing-masing sudah dibulatkan di katalog. */
    mrr: Math.round(mrr),
    arr: Math.round(mrr) * 12,
    billableSubscriptions: billable,
    conversionAllTime:
      input.totalTenants > 0 ? berbayar.size / input.totalTenants : null,
    outstandingCount: input.outstanding.length,
    outstandingTotal,
    oldestOutstandingDays: tertua,
  };
}
