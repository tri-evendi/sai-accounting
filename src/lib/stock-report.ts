/**
 * Reader for Kartu Stok / Mutasi (issue #126).
 *
 * Thin on purpose: two aggregates and the item master, handed straight to the
 * pure `buildStockMovementReport`. All the arithmetic lives there so it can be
 * tested without a database.
 *
 * ── Two disjoint aggregates, not one scan ───────────────────────────────────
 * Opening balance needs every movement STRICTLY BEFORE the period; the report
 * body needs exactly the movements inside it. Expressed as two GROUP BY queries
 * with `{ lt: from }` and `{ gte: from, lte: to }`, the two sets cannot overlap
 * and cannot leave a gap, so `saldo awal + masuk − keluar = saldo akhir` holds by
 * construction rather than by careful bookkeeping in application code.
 *
 * This deliberately does NOT stream every movement row the way `/inventory` does.
 * That page must, because weighted-average costing needs each `in` with its unit
 * cost one at a time. A quantity report needs only sums, and `@@index([itemId,
 * date])` serves exactly this shape.
 */
import { prisma } from "@/lib/prisma";
import { OPNAME_ADJUSTMENT_NOTE } from "@/lib/constants";
import {
  buildStockMovementReport,
  type StockMovementReport,
  type StockTotalRow,
} from "@/lib/stock-movement";
import { buildOpnameHistory, type OpnameHistory } from "@/lib/opname-history";
import { summarizeInventory } from "@/lib/inventory";
import {
  buildStockValuePeriodReport,
  type StockValuePeriodReport,
} from "@/lib/stock-value-report";
import { round2 } from "@/lib/reconciliation";

type Client = typeof prisma;

/** Sum quantity per (item, type) for a journal-free date window. */
async function stockTotals(
  where: { date: { lt: Date } | { gte: Date; lte: Date } },
  client: Client
): Promise<StockTotalRow[]> {
  const grouped = await client.stockMovement.groupBy({
    by: ["itemId", "type"],
    _sum: { quantity: true },
    where,
  });
  return grouped.map((g) => ({
    itemId: g.itemId,
    type: g.type,
    quantity: Number(g._sum.quantity ?? 0),
  }));
}

/**
 * Kartu Stok for an inclusive [from, to] window.
 *
 * Items come back in name order — the order the Stok page already lists them in,
 * so a user moving between the two reads the same sequence.
 */
export async function getStockMovementReport(
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<StockMovementReport> {
  const [items, openingTotals, periodTotals] = await Promise.all([
    client.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    stockTotals({ date: { lt: from } }, client),
    stockTotals({ date: { gte: from, lte: to } }, client),
  ]);

  return buildStockMovementReport(items, openingTotals, periodTotals);
}

/**
 * Riwayat Hitung Ulang Stok for an inclusive [from, to] window (issue #129).
 *
 * Opname has no table of its own: a count exists only as the stock movements it
 * produced, marked with `OPNAME_ADJUSTMENT_NOTE`. Matching on that constant — the
 * same one the write path stamps — is what keeps the two halves from drifting
 * into a history that is silently always empty.
 *
 * `note` is an exact match, not a `contains`: a user-typed note that merely
 * mentions the phrase in a manual adjustment must not be dressed up as a
 * stock count that never happened.
 */
export async function getOpnameHistory(
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<OpnameHistory> {
  const rows = await client.stockMovement.findMany({
    where: { note: OPNAME_ADJUSTMENT_NOTE, date: { gte: from, lte: to } },
    select: {
      date: true,
      type: true,
      quantity: true,
      item: { select: { name: true, unit: true } },
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });

  return buildOpnameHistory(
    rows.map((r) => ({
      date: r.date,
      itemName: r.item.name,
      unit: r.item.unit,
      type: r.type,
      quantity: Number(r.quantity),
    }))
  );
}

/**
 * Nilai Persediaan — saldo & nilai tiap komoditas pada saat ini.
 *
 * Memuat SETIAP gerakan beserta biayanya, dan itu bukan kelalaian: nilai
 * persediaan memakai biaya rata-rata tertimbang, yang hanya bisa dihitung dari
 * gerakan `in` satu per satu (`weightedAverageUnitCost`). Menuliskannya ulang
 * sebagai agregat SQL berarti punya DUA implementasi aturan costing — dan saat
 * keduanya berselisih, neraca dan HPP menyebut angka berbeda untuk barang yang
 * sama. Alasan yang sama membuat halaman `/inventory` melakukan hal ini juga.
 *
 * Yang dihemat tanpa mengorbankan itu: kolomnya. Hanya empat yang dipakai.
 *
 * Item tanpa dasar biaya melaporkan nilai `null`, BUKAN Rp 0 — dan dihitung
 * terpisah lewat `uncostedCount`, supaya totalnya tidak diam-diam menganggap
 * barang yang ada wujudnya bernilai nol.
 */
/**
 * Nilai Persediaan PER PERIODE (issue #492) — pembacanya.
 *
 * Tipis dengan sengaja, pola yang sama dengan `getStockMovementReport`: satu
 * kueri, lalu seluruh aritmetikanya diserahkan ke `buildStockValuePeriodReport`
 * yang murni dan teruji tanpa basis data.
 *
 * Memuat SETIAP gerakan beserta biaya & tanggalnya, dan itu bukan kelalaian —
 * alasannya sama persis dengan `getStockValueReport` di bawah: rata-rata
 * tertimbang hanya bisa dihitung dari gerakan `in` satu per satu. Menuliskannya
 * ulang sebagai agregat SQL berarti punya DUA implementasi aturan costing, dan
 * saat keduanya berselisih neraca dan HPP menyebut angka berbeda untuk barang
 * yang sama.
 *
 * `from` & `to` dipakai APA ADANYA; pemanggil yang mengambilnya dari URL wajib
 * menormalkan jamnya lebih dulu (`periodBounds`), sebab jendela yang berhenti
 * di tengah hari memotong gerakan yang tercatat sore itu.
 */
export async function getStockValuePeriodReport(
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<StockValuePeriodReport> {
  const items = await client.item.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      /* Hanya gerakan sampai UJUNG periode: apa yang terjadi sesudahnya tidak
         boleh ikut menggeser rata-rata pada laporan bertanggal — itu justru
         yang membuat laporan "per 31 Des" berubah angkanya bulan depan. */
      stockMovements: {
        where: { date: { lte: to } },
        /* `valueAdjustment` WAJIB ikut (#495 butir 1). Kolom yang tidak diambil
           datang sebagai `undefined`, dan `weightedAverageUnitCost`
           menjumlahkan `undefined` sebagai nol — yaitu diam-diam membuang
           seluruh biaya impor yang menempel. Dijaga `tests/landed-cost-costing`. */
        select: { quantity: true, type: true, date: true, unitCost: true, valueAdjustment: true },
      },
    },
    orderBy: [{ name: "asc" }, { code: "asc" }],
  });

  return buildStockValuePeriodReport(
    items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      movements: i.stockMovements,
    })),
    from,
    to
  );
}

export async function getStockValueReport(client = prisma) {
  const items = await client.item.findMany({
    include: {
      /* `valueAdjustment` ikut — lihat catatan pada kueri berperiode di atas. */
      stockMovements: {
        select: { quantity: true, type: true, date: true, unitCost: true, valueAdjustment: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const summary = summarizeInventory(items);
  const rows = summary.map(({ code, name, unit, currentStock, unitCost, stockValue }) => ({
    /* Ikut sejak #493: nama sudah boleh kembar, jadi ia tak bisa lagi menjadi
       kunci baris maupun pembeda di mata pembaca laporan. */
    code,
    name,
    unit,
    currentStock,
    unitCost,
    stockValue,
  }));

  return {
    rows,
    totalValue: round2(rows.reduce((s, r) => s + (r.stockValue ?? 0), 0)),
    // Hanya barang yang MASIH ADA wujudnya: item bersaldo nol tanpa dasar biaya
    // tidak menyembunyikan nilai apa pun, jadi menghitungnya hanya membuat
    // catatan kakinya berisik tanpa menambah kebenaran.
    uncostedCount: rows.filter((r) => r.stockValue === null && r.currentStock > 0).length,
  };
}
