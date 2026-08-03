/**
 * Perpindahan paket ATAS PERMINTAAN PELANGGAN — aritmetikanya, murni.
 *
 * Sampai sekarang perpindahan paket hanya bisa dikerjakan operator
 * (`changeTenantPlan` di `lib/operator/writes.ts`, ber-audit). Berkas ini
 * menambahkan yang hilang untuk menjadikannya swalayan: JAWABAN ATAS "berapa
 * yang harus saya bayar sekarang", dan "boleh tidak saya turun paket".
 *
 * ⚠ TIDAK ADA I/O DI SINI. Tak satu pun fungsi di berkas ini menyentuh basis
 * data, jam, atau sesi — `now` dioper. Alasannya bukan kerapian: ini satu-
 * satunya tempat di jalur swalayan yang menghitung UANG, dan uang yang salah
 * baru ketahuan pada laporan bulan berikutnya. Yang murni bisa diuji sampai ke
 * kasus tepinya tanpa satu pun basis data.
 *
 * ══ TIGA KEPUTUSAN YANG DITANAM DI SINI ════════════════════════════════════
 * Ketiganya keputusan KOMERSIAL, bukan teknis, dan ditulis di sini supaya
 * terbaca sebagai pilihan — bukan sebagai kebetulan implementasi:
 *
 *  1. PRORATA SELISIH. Naik paket di hari ke-20 dari 30 membayar
 *     `(harga_baru − harga_lama) × 10/30`, dan TANGGAL JATUH TEMPO BERIKUTNYA
 *     TIDAK BERGESER. Alternatifnya — menagih sebulan penuh dan memulai
 *     periode dari hari ini — menagih dua kali untuk 10 hari yang sama.
 *
 *  2. TURUN PAKET DITOLAK bila pemakaian berjalan melampaui kuota baru. Bukan
 *     "diizinkan dengan peringatan" seperti di konsol operator: di sana ada
 *     manusia yang membaca peringatannya dan tahu buku mana yang boleh ditutup.
 *     Di jalur swalayan tidak ada manusia itu, dan yang terjadi tanpa penolakan
 *     adalah buku yang mendadak tidak bisa dibuka tanpa ada yang memilihnya.
 *
 *  3. TURUN PAKET TIDAK MENGEMBALIKAN UANG dan berlaku SEKETIKA. Sisa hari di
 *     paket mahal hangus. Ini harus dikatakan di layar konfirmasi — bukan
 *     ditemukan sendiri oleh pelanggan setelah menekan tombol.
 *
 * Kuota di sini dipakai untuk MENOLAK, dan karena itu angkanya wajib datang
 * dari pemakaian NYATA (hitungan baris di basis data kendali), bukan dari
 * `usage_counters` yang bisa tertinggal — pemanggil yang bertanggung jawab.
 */

/** Paket tujuan, seperlunya saja — bukan seluruh baris `plans`. */
export interface TargetPlan {
  key: string;
  priceMonthly: number;
  maxCompanies: number;
  maxUsers: number;
}

export interface PlanChangeInput {
  currentPlanKey: string;
  /** Harga langganan BERJALAN (snapshot di `subscriptions.price`), bukan harga katalog. */
  currentPrice: number;
  target: TargetPlan;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  /** Pemakaian NYATA — hitungan baris, bukan penghitung yang bisa tertinggal. */
  usage: { companies: number; users: number };
}

export type PlanChangeQuote =
  /** Paket yang sama — tidak ada yang perlu dikerjakan. */
  | { outcome: "same_plan" }
  /** Kuota baru lebih kecil dari pemakaian berjalan. Ditolak, dengan angkanya. */
  | {
      outcome: "blocked_over_quota";
      companies: { used: number; max: number } | null;
      users: { used: number; max: number } | null;
    }
  /** Tidak ada yang perlu ditagih — turun paket, atau naik paket di sisa hari
   *  yang selisihnya membulat ke nol. Berlaku seketika. */
  | { outcome: "apply_immediate"; refund: false }
  /** Naik paket: tagihan prorata dulu, paket berpindah setelah LUNAS. */
  | {
      outcome: "invoice_required";
      chargeable: number;
      remainingDays: number;
      periodDays: number;
    };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Pembulatan uang ke 2 desimal. `Decimal(15,2)` di basis data — bukan Float. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Selisih hari kalender, dibulatkan ke atas: sisa 0,4 hari tetap sehari yang
 *  dipakai pelanggan, dan membulatkannya ke bawah berarti memberikannya gratis. */
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Panjang periode & sisa harinya — angka yang sama yang dipakai prorata di
 * bawah, diekspor supaya LAYAR KONFIRMASI menyebut hari yang persis sama
 * dengan yang ditagih. Dua perhitungan hari yang berdiri sendiri akan berselisih
 * satu hari di tengah malam, dan selisih itu muncul sebagai "katanya 10 hari,
 * tagihannya 11".
 */
export function periodDaysFor(
  periodStart: Date,
  periodEnd: Date,
  now: Date
): { periodDays: number; remainingDays: number } {
  const periodDays = daysBetween(periodStart, periodEnd);
  if (periodDays <= 0) return { periodDays: 0, remainingDays: 0 };
  return {
    periodDays,
    remainingDays: Math.min(periodDays, Math.max(0, daysBetween(now, periodEnd))),
  };
}

export function quotePlanChange(input: PlanChangeInput): PlanChangeQuote {
  const { target, usage } = input;

  if (target.key === input.currentPlanKey) return { outcome: "same_plan" };

  /* ── 1. KUOTA DULU, sebelum uang ─────────────────────────────────────────
   * Diperiksa untuk ARAH MANA PUN, bukan hanya turun paket: paket yang lebih
   * mahal pun bisa punya kuota lebih kecil di salah satu sumbunya (paket "Pro
   * banyak pengguna, satu PT" misalnya). Yang menentukan adalah angkanya,
   * bukan harganya — memakai harga sebagai penanda arah adalah asumsi yang
   * diam-diam salah pada hari daftar paket berubah. */
  const companiesOver = usage.companies > target.maxCompanies;
  const usersOver = usage.users > target.maxUsers;
  if (companiesOver || usersOver) {
    return {
      outcome: "blocked_over_quota",
      companies: companiesOver
        ? { used: usage.companies, max: target.maxCompanies }
        : null,
      users: usersOver ? { used: usage.users, max: target.maxUsers } : null,
    };
  }

  /* ── 2. Selisih harga ────────────────────────────────────────────────────
   * `delta <= 0` = turun paket (atau harga sama): berlaku seketika, tanpa
   * pengembalian uang. Keputusan 3 di kepala berkas. */
  const delta = input.target.priceMonthly - input.currentPrice;
  if (delta <= 0) return { outcome: "apply_immediate", refund: false };

  /* ── 3. Prorata ──────────────────────────────────────────────────────────
   * Periode yang tidak masuk akal (akhir sebelum awal, atau nol hari) TIDAK
   * boleh menghasilkan kenaikan paket gratis: yang aman saat data periodenya
   * rusak adalah menagih selisih PENUH, bukan nol. */
  const periodDays = daysBetween(input.periodStart, input.periodEnd);
  if (periodDays <= 0) {
    return {
      outcome: "invoice_required",
      chargeable: round2(delta),
      remainingDays: 0,
      periodDays: 0,
    };
  }

  const remainingDays = Math.min(
    periodDays,
    Math.max(0, daysBetween(input.now, input.periodEnd))
  );
  const chargeable = round2((delta * remainingDays) / periodDays);

  /* Sisa hari yang selisihnya membulat ke nol: tidak ada yang bisa ditagih,
   * jadi tidak ada yang bisa ditunggu pembayarannya. Berpindah seketika lebih
   * jujur daripada tagihan Rp 0 yang tidak akan pernah "lunas". */
  if (chargeable <= 0) return { outcome: "apply_immediate", refund: false };

  return { outcome: "invoice_required", chargeable, remainingDays, periodDays };
}
