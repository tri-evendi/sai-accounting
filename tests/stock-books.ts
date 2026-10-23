/**
 * BUKU FIXTURE laporan stok — sisi TS dari
 * `services/integrator/internal/ledgerread/testdata/stock_books.json`.
 *
 * Klien palsu yang melayani TEPAT kueri `src/lib/stock-report.ts` (Nilai
 * Persediaan, Riwayat Stok, Riwayat Hitung Ulang Stok) — penyaring, urutan,
 * dan `SUM` NUMERIC yang TEPAT (bukan penjumlahan float), aturan yang SAMA
 * dengan emulasi di `ledgerread/stock_test.go`. Klien yang menjumlahkan float
 * akan "menemukan" sisa 5,55e-17 yang tidak pernah dipulangkan PostgreSQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const GO = join(AKAR_REPO, "services", "integrator", "internal");
const NUMBERS = join(GO, "ledgerread", "testdata");
const SHEETS = join(GO, "document", "testdata");

export interface StockCase {
  case: string;
  from: string;
  to: string;
  cols?: string;
}

export interface StockBook {
  name: string;
  companyName: string;
  items: { id: number; code: string; name: string; unit?: string }[];
  movements: {
    id: number;
    itemId: number;
    type: string;
    quantity: string;
    date: string;
    unitCost?: string;
    valueAdjustment?: string;
    note?: string;
  }[];
  stockValues: StockCase[];
  stockMovements: StockCase[];
  opnameHistories: StockCase[];
}

export const STOCK_BOOKS = JSON.parse(
  readFileSync(join(NUMBERS, "stock_books.json"), "utf8")
) as StockBook[];

export const goNumbers = <T>(name: string): T =>
  JSON.parse(readFileSync(join(NUMBERS, `${name}.golden.json`), "utf8")) as T;
export const goSheet = (name: string) =>
  new Uint8Array(readFileSync(join(SHEETS, `${name}.golden.xlsx`)));

/** Σ desimal TEPAT (skala 3, Decimal(15,3)) → teks desimal, seperti `SUM` NUMERIC. */
function exactSum(values: string[]): string {
  let total = 0n;
  for (const v of values) {
    const neg = v.startsWith("-");
    const [whole, frac = ""] = v.replace("-", "").split(".");
    const units = BigInt(whole! + frac.padEnd(3, "0").slice(0, 3));
    total += neg ? -units : units;
  }
  const neg = total < 0n;
  const abs = (neg ? -total : total).toString().padStart(4, "0");
  const text = `${abs.slice(0, -3)}.${abs.slice(-3)}`.replace(/\.?0+$/, "");
  return `${neg ? "-" : ""}${text || "0"}`;
}

type DateFilter = { lt?: Date; lte?: Date; gte?: Date };
const inside = (d: Date, f: DateFilter | undefined) =>
  !f ||
  ((f.lt === undefined || d < f.lt) &&
    (f.lte === undefined || d <= f.lte) &&
    (f.gte === undefined || d >= f.gte));

/* Urutan teks fixture: satuan kode UTF-16 (`<`) — Go membandingkan byte; fixture
   ASCII, jadi keduanya sama. Kolasi basis data dibuktikan paritas sungguhan. */
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

export function stockClient(book: StockBook) {
  const items = book.items.map((i) => ({ ...i, unit: i.unit ?? null }));
  const movements = book.movements.map((m) => ({ ...m, date: new Date(m.date) }));
  const byItem = new Map(items.map((i) => [i.id, i]));

  return {
    item: {
      async findMany(args: {
        select: Record<string, unknown> & {
          stockMovements?: { where?: { date?: DateFilter }; orderBy?: { id: "asc" } };
        };
        orderBy: Record<string, "asc">[] | Record<string, "asc">;
      }) {
        const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        const sorted = [...items].sort((a, b) => {
          for (const o of order) {
            const k = Object.keys(o)[0] as "name" | "id" | "code";
            const c = cmp(a[k], b[k]);
            if (c !== 0) return c;
          }
          return 0;
        });
        const sm = args.select.stockMovements;
        return sorted.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          unit: i.unit,
          ...(sm
            ? {
                stockMovements: movements
                  .filter((m) => m.itemId === i.id && inside(m.date, sm.where?.date))
                  .sort((a, b) => a.id - b.id)
                  .map((m) => ({
                    quantity: m.quantity,
                    type: m.type,
                    date: m.date,
                    unitCost: m.unitCost ?? null,
                    valueAdjustment: m.valueAdjustment ?? null,
                  })),
              }
            : {}),
        }));
      },
    },
    stockMovement: {
      async groupBy(args: { where: { date: DateFilter } }) {
        const groups = new Map<string, { itemId: number; type: string; values: string[] }>();
        for (const m of movements) {
          if (!inside(m.date, args.where.date)) continue;
          const k = `${m.itemId}\u0000${m.type}`;
          const g = groups.get(k) ?? { itemId: m.itemId, type: m.type, values: [] };
          g.values.push(m.quantity);
          groups.set(k, g);
        }
        return [...groups.values()].map((g) => ({
          itemId: g.itemId,
          type: g.type,
          _sum: { quantity: exactSum(g.values) },
        }));
      },
      async findMany(args: { where: { note: string; date: DateFilter } }) {
        return movements
          .filter((m) => m.note === args.where.note && inside(m.date, args.where.date))
          .sort((a, b) => b.date.getTime() - a.date.getTime() || a.id - b.id)
          .map((m) => {
            const it = byItem.get(m.itemId)!;
            return {
              date: m.date,
              type: m.type,
              quantity: m.quantity,
              item: { name: it.name, unit: it.unit },
            };
          });
      },
    },
  };
}
