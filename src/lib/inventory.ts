import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

/** Stock movement row shape (Prisma Stock or API payload). */
export type StockMovement = {
  quantity: number | string | { toString(): string };
  type: string;
  date: Date | string;
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
  stock: StockMovement[];
};

export type InventorySummary = {
  id: number;
  name: string;
  unit: string | null;
  totalIn: number;
  totalOut: number;
  currentStock: number;
  movementCount: number;
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
};

export type StockLevel = "empty" | "low" | "healthy";

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  empty: "Out of Stock",
  low: "Low Stock",
  healthy: "In Stock",
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
    ({ id, name, unit, totalIn, totalOut, currentStock, movementCount }) => ({
      id,
      name,
      unit,
      totalIn,
      totalOut,
      currentStock,
      movementCount,
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
  const sorted = [...item.stock].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    return db - da;
  });
  const totals = calculateStockTotals(item.stock);

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    ...totals,
    movementCount: item.stock.length,
    lastMovement: sorted[0] ? serializeMovement(sorted[0]) : null,
  };
}

export function summarizeInventory(items: ItemWithStock[]): InventorySummary[] {
  return items.map(summarizeInventoryItem);
}

export function countStockHealth(
  items: InventorySummary[],
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

export function getLowStockItems(
  items: InventorySummary[],
  threshold: number = LOW_STOCK_THRESHOLD
) {
  return items
    .filter((i) => getStockLevel(i.currentStock, threshold) === "low")
    .sort((a, b) => a.currentStock - b.currentStock);
}

/** Plain objects for client/server alert UI. */
export function toLowStockAlerts(
  items: InventorySummary[],
  threshold: number = LOW_STOCK_THRESHOLD
) {
  return getLowStockItems(items, threshold).map((i) => ({
    name: i.name,
    currentStock: i.currentStock,
    unit: i.unit,
  }));
}
