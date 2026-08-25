/**
 * NILAI PERSEDIAAN PER PERIODE (issue #492) — bagian MURNInya.
 *
 * ══ Pertanyaan yang selama ini tak punya jawaban ═══════════════════════════
 * `reports/stock-value` hanya bisa menjawab "per hari ini": periodenya ditulis
 * mati sebagai `new Date()`. Maka pertanyaan yang paling sering ditanyakan
 * akuntan pada akhir tahun — *"berapa nilai persediaan saya per 31 Desember?"* —
 * tidak punya jawaban di aplikasi ini, padahal seluruh datanya ada.
 *
 * Angka "per hari ini" juga bukan angka yang bisa dipakai: begitu tanggal
 * berganti, laporan yang sama memulangkan hasil berbeda, sehingga tak ada yang
 * bisa dilampirkan ke SPT atau dicocokkan dengan neraca per akhir periode.
 *
 * ══ Kenapa ini BUKAN lagi terhalang ════════════════════════════════════════
 * Komentar di `reports/stock-value/page.tsx` dulu menunda ini dengan alasan
 * yang benar pada waktunya: *"'per tanggal' yang jujur menuntut mesin costing
 * bertanggal"*. Mesin itu ternyata sudah ada dan sudah dipakai jalur posting —
 * `averageUnitCostForItem(itemId, asOf)` di `lib/posting/cogs.ts`, yang di
 * dalamnya memanggil `weightedAverageUnitCost` atas gerakan `in` sampai sebuah
 * tanggal. Modul ini memakai fungsi yang SAMA, bukan menulis aturan kedua.
 *
 * Itu bukan kerapian: dua implementasi aturan costing berarti neraca dan HPP
 * menyebut angka berbeda untuk barang yang sama, dan tidak ada satu pun tanda
 * saat keduanya mulai berselisih.
 *
 * ══ EMPAT nilai, dan tiga di antaranya EKSAK ═══════════════════════════════
 *
 *   • Nilai Masuk  — Σ (kuantitas × harga pokok yang DICATAT pada gerakannya).
 *                    Eksak: ia harga beli sebenarnya, tidak dirata-rata apa pun.
 *   • Nilai Keluar — Σ (kuantitas × rata-rata tertimbang PADA TANGGAL gerakan
 *                    itu). Eksak dalam arti ia angka yang SAMA dengan yang
 *                    sudah diposting mesin HPP ke buku besar.
 *   • Nilai Awal   — saldo awal × rata-rata tertimbang sesaat sebelum periode.
 *   • Nilai Akhir  — saldo akhir × rata-rata tertimbang pada akhir periode.
 *                    Inilah yang HARUS sama dengan angka persediaan di neraca
 *                    per tanggal itu, dan itulah sebabnya ia dihitung begini
 *                    alih-alih diturunkan dari ketiga angka lainnya.
 *
 * ══ SELISIH PENILAIAN: ADA, DAN SENGAJA DITAMPAKKAN ════════════════════════
 * Di bawah rata-rata tertimbang, `Nilai Awal + Masuk − Keluar` TIDAK selalu
 * sama dengan `Nilai Akhir`. Sebabnya bukan kesalahan hitung: pembelian baru
 * menggeser rata-rata, dan pergeseran itu menilai ulang barang yang sudah ada
 * di gudang sejak sebelum periode.
 *
 * Ada dua cara menghadapinya, dan hanya satu yang jujur:
 *
 *   (a) Menurunkan `Nilai Akhir` dari ketiga angka lain supaya barisnya selalu
 *       "rapi" — dan dengan begitu memulangkan angka yang TIDAK sama dengan
 *       neraca. Laporan yang tidak bisa dicocokkan dengan neraca adalah
 *       laporan yang gagal pada satu-satunya hal yang diminta darinya.
 *   (b) Menghitung `Nilai Akhir` dari saldo × rata-rata, lalu MENAMPILKAN
 *       selisihnya sebagai angkanya sendiri (`revaluation`).
 *
 * Modul ini memilih (b). Selisih yang terlihat bisa ditanyakan; selisih yang
 * disembunyikan dengan pembulatan definisi akan ditemukan berbulan-bulan
 * kemudian oleh orang yang mencocokkan laporan ini dengan neraca.
 *
 * MURNI — tanpa basis data, supaya seluruh aritmetika di atas bisa diuji
 * langsung (`tests/stock-value-report.test.ts`).
 */
import { weightedAverageUnitCost, type CostingMovement } from "@/lib/posting/cogs";
import { round2 } from "@/lib/reconciliation";

/** Gerakan sebagaimana dibutuhkan penilaian: kuantitas, arah, tanggal, biaya. */
export interface ValuationMovement extends CostingMovement {
  date: Date | string;
}

export interface ValuationItem {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  movements: ValuationMovement[];
}

export interface StockValuePeriodRow {
  id: number;
  code: string;
  name: string;
  unit: string | null;

  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;

  /** `null` = tidak ada dasar biaya, BUKAN nol (pola yang sama dengan #58). */
  openingValue: number | null;
  inValue: number | null;
  outValue: number | null;
  closingValue: number | null;

  /**
   * `closingValue − (openingValue + inValue − outValue)`. Nol pada barang yang
   * harga belinya tidak pernah berubah; bukan nol begitu rata-ratanya bergeser.
   */
  revaluation: number;
}

export interface StockValuePeriodReport {
  rows: StockValuePeriodRow[];
  totalOpeningValue: number;
  totalInValue: number;
  totalOutValue: number;
  totalClosingValue: number;
  totalRevaluation: number;
  /** Barang bersaldo akhir > 0 yang tak punya dasar biaya sama sekali. */
  uncostedCount: number;
  /** Barang yang sepanjang periode tidak bersaldo dan tidak bergerak. */
  dormantCount: number;
}

const num = (v: ValuationMovement["quantity"] | null | undefined): number =>
  v == null ? 0 : Number(v);

const at = (d: Date | string): number => new Date(d).getTime();

/**
 * Rata-rata tertimbang sebuah barang PADA sebuah saat — cerminan persis
 * `averageUnitCostForItem`, tetapi atas gerakan yang sudah ada di memori.
 * `null` bila tidak ada satu pun `in` bercosting sampai saat itu: nol akan
 * berbohong tentang barang yang wujudnya ada.
 */
function unitCostAsOf(movements: ValuationMovement[], asOf: number): number | null {
  const upto = movements.filter((m) => at(m.date) <= asOf);
  const avg = weightedAverageUnitCost(upto);
  return avg > 0 ? avg : null;
}

/** Nilai = kuantitas × biaya, atau `null` bila biayanya tak diketahui. */
function valueOf(qty: number, unitCost: number | null): number | null {
  return unitCost == null ? null : round2(qty * unitCost);
}

/**
 * Bangun laporan untuk jendela `[from, to]` INKLUSIF.
 *
 * `from`/`to` diterima sebagai `Date`; pemanggil yang mengambilnya dari URL
 * bertanggung jawab menormalkan jamnya (awal hari & akhir hari), sebab jendela
 * yang berhenti di tengah hari akan memotong gerakan yang tercatat sore itu.
 */
export function buildStockValuePeriodReport(
  items: ValuationItem[],
  from: Date,
  to: Date
): StockValuePeriodReport {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  /* Sesaat SEBELUM periode — batas yang sama dengan `{ lt: from }` di pembaca,
     jadi saldo awal di sini dan di Kartu Stok tak bisa berbeda. */
  const beforeMs = fromMs - 1;

  const rows: StockValuePeriodRow[] = [];
  let dormantCount = 0;
  let uncostedCount = 0;

  for (const item of items) {
    const before = item.movements.filter((m) => at(m.date) < fromMs);
    const inside = item.movements.filter((m) => {
      const t = at(m.date);
      return t >= fromMs && t <= toMs;
    });

    const sumBy = (list: ValuationMovement[], type: string) =>
      list.filter((m) => m.type === type).reduce((s, m) => s + num(m.quantity), 0);

    const openingQty = sumBy(before, "in") - sumBy(before, "out");
    const inQty = sumBy(inside, "in");
    const outQty = sumBy(inside, "out");
    const closingQty = openingQty + inQty - outQty;

    /* Barang yang sepanjang periode tidak bersaldo dan tidak bergerak dibuang
       dari `rows` tetapi DIHITUNG — pola yang sama dengan `dormantCount` di
       Kartu Stok. Daftar barang sebuah perusahaan dagang berumur lebih panjang
       daripada komoditas yang masih ia perdagangkan; mencetak empat puluh baris
       nol mengubur enam yang bergerak. */
    if (openingQty === 0 && inQty === 0 && outQty === 0) {
      dormantCount += 1;
      continue;
    }

    const openingValue = valueOf(openingQty, unitCostAsOf(item.movements, beforeMs));
    const closingCost = unitCostAsOf(item.movements, toMs);
    const closingValue = valueOf(closingQty, closingCost);

    /* Nilai Masuk: harga pokok yang BENAR-BENAR dicatat pada tiap gerakan.
       Baris tanpa `unitCost` (data lama) dilewati — sama dengan yang dilakukan
       mesin costing, jadi tak ada nilai yang dikarang. */
    let inValue: number | null = null;
    for (const m of inside) {
      if (m.type !== "in" || m.unitCost == null) continue;
      inValue = round2((inValue ?? 0) + num(m.quantity) * Number(m.unitCost));
    }

    /* Nilai Keluar: rata-rata PADA TANGGAL gerakan itu — angka yang sama dengan
       yang sudah diposting mesin HPP. Memakai rata-rata akhir periode akan
       memulangkan laporan yang tak cocok dengan buku besarnya sendiri. */
    let outValue: number | null = null;
    for (const m of inside) {
      if (m.type !== "out") continue;
      const cost = unitCostAsOf(item.movements, at(m.date));
      if (cost == null) continue;
      outValue = round2((outValue ?? 0) + num(m.quantity) * cost);
    }

    const revaluation =
      closingValue == null
        ? 0
        : round2(closingValue - ((openingValue ?? 0) + (inValue ?? 0) - (outValue ?? 0)));

    if (closingQty > 0 && closingCost == null) uncostedCount += 1;

    rows.push({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      openingQty,
      inQty,
      outQty,
      closingQty,
      openingValue,
      inValue,
      outValue,
      closingValue,
      revaluation,
    });
  }

  const sum = (pick: (r: StockValuePeriodRow) => number | null) =>
    round2(rows.reduce((s, r) => s + (pick(r) ?? 0), 0));

  return {
    rows,
    totalOpeningValue: sum((r) => r.openingValue),
    totalInValue: sum((r) => r.inValue),
    totalOutValue: sum((r) => r.outValue),
    totalClosingValue: sum((r) => r.closingValue),
    totalRevaluation: sum((r) => r.revaluation),
    uncostedCount,
    dormantCount,
  };
}
