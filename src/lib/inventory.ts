import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { weightedAverageUnitCost } from "@/lib/posting/cogs";
import { round2 } from "@/lib/posting/rules";

/** Stock movement row shape (Prisma `StockMovement` or API payload). */
export type StockMovement = {
  quantity: number | string | { toString(): string };
  type: string;
  date: Date | string;
  /** IDR cost per unit on `in` rows — dasar nilai persediaan (issue #58). */
  unitCost?: number | string | { toString(): string } | null;
  note?: string | null;
};

/** Plain movement safe for Client Components (no Prisma Decimal/Date). */
export type SerializedStockMovement = {
  quantity: number;
  type: string;
  date: string;
  note: string | null;
};

export type ItemWithStock = {
  id: number;
  name: string;
  unit: string | null;
  stockMovements: StockMovement[];
};

export type InventorySummary = {
  id: number;
  name: string;
  unit: string | null;
  totalIn: number;
  totalOut: number;
  currentStock: number;
  movementCount: number;
  /**
   * Biaya per unit (IDR, rata-rata tertimbang dari gerakan `in` bercosting) dan
   * nilai persediaan = currentStock × unitCost (issue #58). `null` bila TIDAK
   * ada dasar biaya (semua `in` tanpa unit_cost / item legacy) — dibedakan dari
   * nilai nol agar tidak menyesatkan.
   */
  unitCost: number | null;
  stockValue: number | null;
  lastMovement: SerializedStockMovement | null;
};

/** Subset passed to client-side PDF/export components. */
export type ClientInventoryItem = {
  id: number;
  name: string;
  unit: string | null;
  totalIn: number;
  totalOut: number;
  currentStock: number;
  movementCount: number;
  unitCost: number | null;
  stockValue: number | null;
};

export type StockLevel = "empty" | "low" | "healthy";

/** Label bahasa tugas untuk kondisi stok (issue #1) — dipakai badge & PDF. */
export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  empty: "Habis",
  low: "Menipis",
  healthy: "Aman",
};

function toNumber(value: StockMovement["quantity"]): number {
  return Number(value);
}

function serializeMovement(movement: StockMovement): SerializedStockMovement {
  return {
    quantity: toNumber(movement.quantity),
    type: movement.type,
    date:
      movement.date instanceof Date
        ? movement.date.toISOString()
        : String(movement.date),
    note: movement.note ?? null,
  };
}

/** Strip non-serializable fields before passing inventory to Client Components. */
export function toClientInventory(items: InventorySummary[]): ClientInventoryItem[] {
  return items.map(
    ({ id, name, unit, totalIn, totalOut, currentStock, movementCount, unitCost, stockValue }) => ({
      id,
      name,
      unit,
      totalIn,
      totalOut,
      currentStock,
      movementCount,
      unitCost,
      stockValue,
    })
  );
}

export function getStockLevel(
  currentStock: number,
  threshold: number = LOW_STOCK_THRESHOLD
): StockLevel {
  if (currentStock <= 0) return "empty";
  if (currentStock <= threshold) return "low";
  return "healthy";
}

export function getStockBadgeVariant(
  level: StockLevel
): "success" | "warning" | "danger" {
  if (level === "healthy") return "success";
  if (level === "low") return "warning";
  return "danger";
}

/**
 * Saldo = jumlah `in` − jumlah `out`. `process` (issue #111) sengaja tidak
 * masuk keduanya: barangnya sedang diolah, masih milik perusahaan, jadi
 * mengurangkannya akan menghapus barang yang sebenarnya ada.
 *
 * Aturan yang sama PERSIS harus berlaku di `stockLevelsFromTotals` — beranda
 * memakai yang itu, halaman Stok memakai yang ini, dan keduanya harus menyebut
 * angka yang sama.
 */
export function calculateStockTotals(movements: StockMovement[]) {
  const totalIn = movements
    .filter((s) => s.type === "in")
    .reduce((sum, s) => sum + toNumber(s.quantity), 0);
  const totalOut = movements
    .filter((s) => s.type === "out")
    .reduce((sum, s) => sum + toNumber(s.quantity), 0);

  return {
    totalIn,
    totalOut,
    currentStock: totalIn - totalOut,
  };
}

export function summarizeInventoryItem(item: ItemWithStock): InventorySummary {
  const sorted = [...item.stockMovements].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    return db - da;
  });
  const totals = calculateStockTotals(item.stockMovements);

  // Nilai persediaan (issue #58): rata-rata tertimbang dari gerakan `in`
  // bercosting — pola & fungsi yang SAMA dengan mesin COGS, jadi nilai neraca
  // dan HPP tidak bisa memakai biaya berbeda. `unitCost` 0 berarti tak ada
  // dasar biaya (item legacy tanpa unit_cost) → nilai dilaporkan `null`, bukan
  // Rp 0 yang menyesatkan.
  const unitCost = weightedAverageUnitCost(item.stockMovements);
  const hasCostBasis = unitCost > 0;

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    ...totals,
    movementCount: item.stockMovements.length,
    unitCost: hasCostBasis ? unitCost : null,
    stockValue: hasCostBasis ? round2(totals.currentStock * unitCost) : null,
    lastMovement: sorted[0] ? serializeMovement(sorted[0]) : null,
  };
}

export function summarizeInventory(items: ItemWithStock[]): InventorySummary[] {
  return items.map(summarizeInventoryItem);
}

/**
 * Bentuk MINIMAL yang dibutuhkan penghitungan kondisi stok: saldo saja, plus
 * nama & satuan untuk peringatan.
 *
 * Sengaja bukan `InventorySummary` penuh (issue #104): beranda kini menghitung
 * saldo lewat GROUP BY di basis data, jadi ia tidak punya — dan tidak perlu —
 * biaya rata-rata, nilai persediaan, maupun jumlah gerakan. `InventorySummary`
 * tetap cocok dengan bentuk ini, jadi semua pemanggil lama tak berubah.
 */
export type StockLevelInput = { currentStock: number };
export type LowStockInput = StockLevelInput & { name: string; unit: string | null };

/**
 * Saldo per barang dari hasil GROUP BY basis data (issue #104).
 *
 * Aturannya sama persis dengan `calculateStockTotals`, hanya masukannya yang
 * berbeda: di sana baris gerakan satu per satu, di sini jumlah yang sudah
 * dihitung basis data. Dipisah jadi fungsi murni supaya kesamaan itu bisa
 * DIBUKTIKAN tes, bukan sekadar diyakini — kalau keduanya berselisih, kartu
 * "stok menipis" di beranda akan menyebut angka lain daripada halaman Stok.
 *
 * Barang tanpa satu pun gerakan tetap muncul dengan saldo nol; menghilangkannya
 * dari daftar akan membuat "0 barang kosong" pada pemasangan yang justru baru
 * saja memasukkan master barangnya.
 */
export function stockLevelsFromTotals<T extends { id: number; name: string; unit: string | null }>(
  items: T[],
  totals: { itemId: number; type: string; quantity: number }[]
): (LowStockInput & { id: number })[] {
  const byItem = new Map<number, { totalIn: number; totalOut: number }>();
  for (const row of totals) {
    const entry = byItem.get(row.itemId) ?? { totalIn: 0, totalOut: 0 };
    /*
     * `else` di sini dulunya berarti "apa pun selain `in` mengurangi saldo" —
     * dan itulah yang membuat `process` (issue #111) diperlakukan sebagai
     * barang keluar DI BERANDA saja, sementara halaman Stok mengabaikannya.
     * Dua halaman, satu barang, dua angka. Karena itu keduanya kini disebut
     * eksplisit: hanya `out` yang mengurangi.
     */
    if (row.type === "in") entry.totalIn += row.quantity;
    else if (row.type === "out") entry.totalOut += row.quantity;
    byItem.set(row.itemId, entry);
  }

  return items.map((item) => {
    const t = byItem.get(item.id) ?? { totalIn: 0, totalOut: 0 };
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: t.totalIn - t.totalOut,
    };
  });
}

export function countStockHealth(
  items: StockLevelInput[],
  threshold: number = LOW_STOCK_THRESHOLD
) {
  let healthy = 0;
  let lowStock = 0;
  let empty = 0;

  for (const item of items) {
    const level = getStockLevel(item.currentStock, threshold);
    if (level === "healthy") healthy++;
    else if (level === "low") lowStock++;
    else empty++;
  }

  return {
    totalItems: items.length,
    healthy,
    lowStock,
    empty,
    /** Any quantity on hand (healthy + low). */
    inStock: healthy + lowStock,
  };
}

export function getLowStockItems<T extends StockLevelInput>(
  items: T[],
  threshold: number = LOW_STOCK_THRESHOLD
): T[] {
  return items
    .filter((i) => getStockLevel(i.currentStock, threshold) === "low")
    .sort((a, b) => a.currentStock - b.currentStock);
}

/** Plain objects for client/server alert UI. */
export function toLowStockAlerts(
  items: LowStockInput[],
  threshold: number = LOW_STOCK_THRESHOLD
) {
  return getLowStockItems(items, threshold).map((i) => ({
    name: i.name,
    currentStock: i.currentStock,
    unit: i.unit,
  }));
}
