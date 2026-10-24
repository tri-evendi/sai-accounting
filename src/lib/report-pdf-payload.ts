/**
 * PEMBANGUN MUATAN tiga laporan PDF — dari PARAMETER + buku PT, di server.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Tahap 1c memindahkan PENGGAMBARAN tiga laporan ini ke server
 * (`/api/reports/pdf/<jenis>`), tapi muatannya tetap dirakit di peramban: halaman
 * mengoper seluruh daftar barang / seluruh buku kas ke komponen klien sebagai
 * props, lalu tombolnya mengirimkannya balik ke rute. Itu menyisakan tiga hal
 * yang 09 §5 sebut sebagai "belum":
 *
 *   • angka di atas kertas tetap ditentukan apa yang DIKIRIM peramban;
 *   • laporan besar tidak bisa diserahkan ke antrean — pekerjaan di basis data
 *     KENDALI hanya boleh membawa parameter (#104), dan muatan tanpa asal tidak
 *     bisa dihitung ulang siapa pun;
 *   • beranda membayar perjalanan ganda (baris turun dari `/api/inventory` atau
 *     `/api/finance`, lalu naik lagi sebagai muatan).
 *
 * Modul ini menutup ketiganya dengan cara yang sama seperti `report-payload.ts`
 * untuk laporan katalog: muatan DIHITUNG dari parameter, oleh pembaca yang SAMA
 * dengan halaman yang menampilkannya. Rute sinkron dan pekerja antrean
 * memanggil fungsi yang sama, jadi tidak ada implementasi kedua.
 *
 * ══ SATU IMPLEMENTASI DENGAN HALAMANNYA ═══════════════════════════════════
 * Halaman Kas & Bank dan Stok Opname memakai turunan di bawah untuk LAYARNYA
 * juga (`financeFilter`, `financeBalances`, `opnameStockLevels`), sehingga
 * kertas dan layar tidak bisa berbeda karena dua salinan aturan saringan.
 * Yang tetap bisa membedakannya hanya waktu: transaksi yang masuk di antara
 * halaman dibuka dan tombol ditekan ikut tercetak — konsekuensi yang sudah
 * diterima beranda sejak #104, dan yang lebih benar daripada mencetak potret
 * basi.
 *
 * Klien buku bisa diserahkan (bawaannya klien PT aktif): tes memberinya klien
 * palsu, dan pekerja antrean menjalankannya di dalam `runReadOnly`.
 */
import { prisma } from "@/lib/prisma";
import { businessDate, businessParts } from "@sai/core/business-date";
import { stockLevelsFromTotals, summarizeInventory, toClientInventory } from "@/lib/inventory";
import { toFinanceReportRows } from "@/lib/finance-report-rows";
import type {
  FinanceReportParams,
  FinanceReportPayload,
  OpnameSheetParams,
  OpnameSheetPayload,
  StockReportPayload,
} from "@/lib/validations/report-pdf";
import type { FinanceBalanceRow } from "@/lib/pdf/finance-report-pdf";

/** Klien buku yang dibaca modul ini — klien PT aktif atau klien transaksinya. */
type BookClient = Pick<typeof prisma, "item" | "stockMovement" | "cashMovement">;

/* ── Laporan Stok ──────────────────────────────────────────────────────── */

/**
 * Ringkasan stok per barang — halaman `/inventory` DAN Laporan Stok-nya.
 * `summarizeInventory` adalah fungsi penilaian persediaan neraca & HPP, jadi
 * kertas, tabel, dan neraca memakai satu aturan costing.
 *
 * Gerakannya dibaca tanpa `orderBy`, persis seperti halaman itu sejak dulu:
 * urutan penjumlahan rata-rata tertimbang ikut menentukan bit terakhir float,
 * dan karena keduanya kini SATU kueri, kertas tidak bisa menyebut angka lain
 * daripada tabelnya. Hanya empat kolom gerakan yang dibaca — yang dipakai
 * perhitungannya (alasannya di halaman `/inventory`).
 */
export async function inventorySummaries(client: BookClient = prisma) {
  const items = await client.item.findMany({
    include: {
      stockMovements: {
        select: { quantity: true, type: true, date: true, unitCost: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return summarizeInventory(items);
}

/** Muatan Laporan Stok — ringkasan yang sama dengan tabel halaman `/inventory`. */
export async function stockReportPayload(client: BookClient = prisma): Promise<StockReportPayload> {
  return { items: toClientInventory(await inventorySummaries(client)) };
}

/* ── Lembar Hitung Stok (opname) ───────────────────────────────────────── */

/**
 * Saldo per barang untuk halaman Stok Opname DAN lembar hitungnya — penjumlahan
 * di basis data, aturan saldo `stockLevelsFromTotals` (sama dengan
 * `calculateStockTotals`, dibuktikan tests/inventory-value.test.ts).
 */
export async function opnameStockLevels(client: BookClient = prisma) {
  const [items, movementTotals] = await Promise.all([
    client.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    client.stockMovement.groupBy({ by: ["itemId", "type"], _sum: { quantity: true } }),
  ]);
  return stockLevelsFromTotals(
    items,
    movementTotals.map((row) => ({
      itemId: row.itemId,
      type: row.type,
      quantity: Number(row._sum.quantity ?? 0),
    }))
  );
}

/**
 * Muatan lembar hitung. `date` dan `showSystemQty` adalah PILIHAN orang yang
 * mencetaknya (tanggal hitung di formulir, dan keputusan hitung-buta), jadi
 * keduanya parameter — bukan angka. Saldonya saldo SAAT INI, seperti kolom
 * "stok sistem" di halaman opname.
 */
export async function opnameSheetPayload(
  params: OpnameSheetParams,
  client: BookClient = prisma
): Promise<OpnameSheetPayload> {
  const levels = await opnameStockLevels(client);
  return {
    items: levels.map(({ name, unit, currentStock }) => ({ name, unit, currentStock })),
    date: params.date,
    showSystemQty: params.showSystemQty,
  };
}

/* ── Laporan Kas & Bank ────────────────────────────────────────────────── */

/**
 * `?type=&currency=&year=&month=` halaman Kas & Bank → saringan Prisma.
 *
 * Aturannya dipindah APA ADANYA dari halaman itu, yang kini memanggil fungsi
 * ini juga: tahun/bulan yang diedit tangan tidak boleh mengirim `NaN` ke
 * kueri, dan bulan yang dipilih bersama "Semua tahun" berarti bulan itu di
 * tahun BERJALAN (kalender Jakarta) — saringan yang diterapkan selalu saringan
 * yang ditampilkan.
 */
export function financeFilter(filters: FinanceReportParams, now: Date = new Date()) {
  const where: {
    type?: string;
    currency?: string;
    date?: { gte: Date; lt: Date };
  } = {};
  if (filters.type) where.type = filters.type;
  if (filters.currency) where.currency = filters.currency;

  const yearNum = filters.year ? Number.parseInt(filters.year, 10) : NaN;
  const monthNum = filters.month ? Number.parseInt(filters.month, 10) : NaN;
  const monthValid = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
  const effectiveYear = Number.isFinite(yearNum)
    ? yearNum
    : monthValid
      ? businessParts(now).year
      : null;
  if (effectiveYear != null) {
    // Batas bulan/tahun menurut kalender Jakarta (`@sai/core/business-date`).
    const startDate = monthValid
      ? businessDate(effectiveYear, monthNum - 1, 1)
      : businessDate(effectiveYear, 0, 1);
    const endDate = monthValid
      ? businessDate(effectiveYear, monthNum, 1)
      : businessDate(effectiveYear + 1, 0, 1);
    where.date = { gte: startDate, lt: endDate };
  }
  return { where, effectiveYear, monthValid, monthNum };
}

/**
 * Saldo per jenis kas & mata uang, dari SELURUH baris yang tersaring — kartu
 * saldo halaman Kas & Bank dan bagian pertama laporannya. Urutannya urutan
 * kemunculan pertama, sama seperti `Map` yang dulu ditulis sebaris di halaman.
 */
export function financeBalances(
  rows: readonly {
    type: string;
    currency: string;
    debit: { toString(): string } | number;
    credit: { toString(): string } | number;
  }[]
): FinanceBalanceRow[] {
  const map = new Map<string, { type: string; currency: string; debit: number; credit: number }>();
  for (const tx of rows) {
    const key = `${tx.type}_${tx.currency}`;
    const existing = map.get(key) || { type: tx.type, currency: tx.currency, debit: 0, credit: 0 };
    existing.debit += Number(tx.debit);
    existing.credit += Number(tx.credit);
    map.set(key, existing);
  }
  return Array.from(map.values(), (b) => ({ ...b, balance: b.debit - b.credit }));
}

/** Seluruh gerakan kas yang tersaring, terbaru dulu — sumber kartu dan laporan. */
export function financeMovements(filters: FinanceReportParams, client: BookClient = prisma) {
  return client.cashMovement.findMany({
    where: financeFilter(filters).where,
    orderBy: { date: "desc" },
  });
}

/**
 * Muatan Laporan Kas & Bank: saldo per jenis & mata uang DAN transaksinya, dari
 * satu pembacaan — dua bagian di satu lembar, dan menurunkan yang satu dari
 * pembacaan yang lain berarti penjumlahan kedua yang bisa berbeda.
 *
 * Tanpa saringan apa pun ia sama dengan yang dulu dirakit tombol beranda dari
 * `GET /api/finance` (seluruh buku kas, terbaru dulu).
 */
export async function financeReportPayload(
  params: FinanceReportParams,
  client: BookClient = prisma
): Promise<FinanceReportPayload> {
  const rows = await financeMovements(params, client);
  return { balances: financeBalances(rows), transactions: toFinanceReportRows(rows) };
}
