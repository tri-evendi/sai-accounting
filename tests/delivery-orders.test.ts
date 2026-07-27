/**
 * Surat Jalan / Delivery Order (issue #14):
 *   • the Zod guard — a surat jalan needs at least one line and every line must
 *     ship a positive quantity (bags × kg/bag > 0);
 *   • the pure stock maths — kg per line, per-item aggregation, and the over-issue
 *     guard that refuses to drive stock negative (mirrors `/api/inventory`);
 *   • the document number format `SJ.YYYY.MM.NNNNN`;
 *   • the accounting DECISION, proven end to end against the in-memory fake
 *     client: issuing a DO reduces stock via a `stock` `out` movement, and that
 *     movement posts HPP through the EXISTING engine (`postForSource
 *     stock_movement` → D: HPP, K: Persediaan), balanced in IDR base. No new
 *     posting source, no second COGS rule — the same path a manual stock-out uses.
 */
import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
  MAPPING_KEYS,
  postForSource,
  buildCogsLines,
} from "@/lib/posting";
import {
  lineStockKg,
  sumRequestedKgByItem,
  findStockShortfalls,
  assertStockAvailable,
  nextDeliveryOrderNo,
  OverIssueError,
} from "@/lib/delivery-orders";
import { deliveryOrderSchema } from "@/lib/validations/delivery-order";
import { createDeliveryOrderInTx } from "@/lib/document-writes";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

// ─── Zod: number/quantity validation ─────────────────────

describe("deliveryOrderSchema", () => {
  const base = {
    date: "2026-07-20",
    consigneeId: 5,
    items: [{ itemId: 9, itemName: "Kopi Arabika", bags: 100, kgPerBag: 60 }],
  };

  it("accepts a well-formed surat jalan", () => {
    const r = deliveryOrderSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejects a surat jalan with no items", () => {
    const r = deliveryOrderSchema.safeParse({ ...base, items: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a line that ships zero quantity (bags × kg/bag = 0)", () => {
    const r = deliveryOrderSchema.safeParse({
      ...base,
      items: [{ itemId: 9, itemName: "Kopi", bags: 0, kgPerBag: 60 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.join(".") === "items.0")).toBe(true);
  });

  it("rejects a line with no item selected", () => {
    const r = deliveryOrderSchema.safeParse({
      ...base,
      items: [{ itemId: 0, itemName: "Kopi", bags: 10, kgPerBag: 60 }],
    });
    expect(r.success).toBe(false);
  });

  it("coerces empty source-document ids to null", () => {
    const r = deliveryOrderSchema.safeParse({ ...base, contractId: "", invoiceId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contractId).toBeNull();
      expect(r.data.invoiceId).toBeNull();
    }
  });
});

// ─── Pure stock maths ────────────────────────────────────

describe("delivery-order stock maths", () => {
  it("line kg = bags × kg/bag, rounded to the DB grain", () => {
    expect(lineStockKg({ bags: 100, kgPerBag: 60 })).toBe(6000);
    expect(lineStockKg({ bags: 3, kgPerBag: 62.5 })).toBe(187.5);
    expect(lineStockKg({ bags: 0, kgPerBag: 60 })).toBe(0);
  });

  it("aggregates requested kg per item across repeated lines", () => {
    const map = sumRequestedKgByItem([
      { itemId: 9, bags: 100, kgPerBag: 60 },
      { itemId: 9, bags: 50, kgPerBag: 60 },
      { itemId: 7, bags: 10, kgPerBag: 25 },
    ]);
    expect(map.get(9)).toBe(9000);
    expect(map.get(7)).toBe(250);
  });

  it("flags an item whose requested kg exceeds what is on hand", () => {
    const available = new Map([[9, 5000]]);
    const short = findStockShortfalls(
      [{ itemId: 9, itemName: "Kopi", kg: 6000 }],
      available
    );
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ itemId: 9, requested: 6000, available: 5000 });
  });

  it("passes when stock is exactly sufficient (no false negative from float noise)", () => {
    const available = new Map([[9, 6000]]);
    expect(() =>
      assertStockAvailable([{ itemId: 9, itemName: "Kopi", kg: 6000 }], available)
    ).not.toThrow();
  });

  it("throws OverIssueError naming the short item when stock is insufficient", () => {
    const available = new Map([[9, 100]]);
    try {
      assertStockAvailable([{ itemId: 9, itemName: "Kopi Arabika", kg: 6000 }], available);
      throw new Error("expected OverIssueError");
    } catch (e) {
      expect(e).toBeInstanceOf(OverIssueError);
      expect((e as OverIssueError).shortfalls[0].itemId).toBe(9);
      expect((e as Error).message).toContain("Kopi Arabika");
      expect((e as Error).message).toContain("tidak dibuat");
    }
  });

  it("treats a missing item as zero stock on hand", () => {
    const short = findStockShortfalls([{ itemId: 42, itemName: "Baru", kg: 1 }], new Map());
    expect(short).toHaveLength(1);
    expect(short[0].available).toBe(0);
  });
});

// ─── Document number ─────────────────────────────────────

describe("nextDeliveryOrderNo", () => {
  it("formats SJ.YYYY.MM.NNNNN, zero-padded, from the running count", async () => {
    const tx = { deliveryOrder: { count: async () => 0 } } as never;
    expect(await nextDeliveryOrderNo(tx, new Date("2026-07-20"))).toBe("SJ.2026.07.00001");

    const tx2 = { deliveryOrder: { count: async () => 41 } } as never;
    expect(await nextDeliveryOrderNo(tx2, new Date("2026-12-01"))).toBe("SJ.2026.12.00042");
  });
});

// ─── Accounting: DO reduces stock via the EXISTING COGS path ──

const ACC = { inventory: 205, cogs: 206 };
const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
  { key: MAPPING_KEYS.COGS, currency: ANY_CURRENCY, accountId: ACC.cogs, isActive: true },
];
const DATE = new Date("2026-07-20T00:00:00.000Z");

const debitOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);
const creditOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.credit, 0);

describe("issuing a surat jalan posts HPP through the existing stock-out engine", () => {
  it("a DO `out` movement → D: HPP, K: Persediaan, balanced in IDR base", async () => {
    // 6000 kg on hand @ 11,000 average; 6000 kg out → 66,000,000
    const tx = createFakeClient({
      mappings: MAPPINGS,
      stockMovementsById: {
        // The `out` movement the DO route creates for one line (6000 kg).
        70: {
          id: 70,
          itemId: 9,
          quantity: 6000,
          type: "out",
          date: DATE,
          item: { name: "Kopi Arabika" },
        },
      },
      stockMovements: [
        { itemId: 9, type: "in", quantity: 4000, unitCost: 10_000, date: new Date("2026-05-01") },
        { itemId: 9, type: "in", quantity: 4000, unitCost: 12_000, date: new Date("2026-06-01") },
      ],
    });

    const j = (await postForSource({
      sourceType: "stock_movement",
      sourceId: 70,
      tx,
    })) as unknown as FakeJournal;

    expect(j).not.toBeNull();
    const debit = j.lines.reduce((s, l) => s + l.baseDebit, 0);
    const credit = j.lines.reduce((s, l) => s + l.baseCredit, 0);
    expect(Math.round(debit * 100)).toBe(Math.round(credit * 100)); // balanced in IDR base
    expect(debitOn(j, ACC.cogs)).toBe(66_000_000);
    expect(creditOn(j, ACC.inventory)).toBe(66_000_000);
  });

  it("reuses the shared COGS builder (same two legs as buildCogsLines)", () => {
    const lines = buildCogsLines({
      cogsAccountId: ACC.cogs,
      inventoryAccountId: ACC.inventory,
      cost: 66_000_000,
      memo: "Kopi Arabika",
    });
    // The builder the DO path funnels through: one HPP debit, one Persediaan credit.
    expect(lines).toHaveLength(2);
    const debit = lines.find((l) => l.accountId === ACC.cogs);
    const credit = lines.find((l) => l.accountId === ACC.inventory);
    expect(debit?.debit).toBe(66_000_000);
    expect(credit?.credit).toBe(66_000_000);
  });
});

// ─── Pusat biaya HPP diwarisi dari faktur surat jalannya (issue #98) ──────────

/**
 * Dimensi HPP tidak bisa dibaca ulang saat posting: `stock_movements` tak punya
 * FK ke faktur maupun surat jalan (satu-satunya jejaknya adalah teks `note`),
 * dan HPP tak pernah dipicu posting FAKTUR — ia lahir DI SINI, saat surat jalan
 * terbit. Jadi inilah satu-satunya titik di mana dokumen sumbernya masih
 * terlihat, dan tes ini menjaganya: gerakan `out` yang ditulis harus membawa
 * pusat biaya faktur yang disebut surat jalannya.
 */
describe("createDeliveryOrderInTx menurunkan pusat biaya faktur ke gerakan stoknya", () => {
  /**
   * Klien palsu + tiga model yang dibutuhkan penulis dokumen. `create` menulis
   * balik ke seed, sehingga `postForSource` menemukan gerakan yang baru dibuat
   * lewat `findUnique` seperti di database sungguhan.
   */
  function harness(invoice: Record<string, unknown> | null) {
    const seed = {
      mappings: MAPPINGS,
      invoices: invoice ? { 77: invoice } : {},
      stockMovementsById: {} as Record<number, unknown>,
      stockMovements: [
        { itemId: 9, type: "in", quantity: 8000, unitCost: 11_000, date: new Date("2026-05-01") },
      ],
    };
    const base = createFakeClient(seed) as unknown as Record<string, Record<string, unknown>>;
    const written: Record<string, unknown>[] = [];
    let movementId = 500;

    const tx = {
      ...base,
      invoice: base.invoice,
      deliveryOrder: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 1,
          no: data.no,
          items: (data.items as { create: Record<string, unknown>[] }).create.map((i, k) => ({
            id: k + 1,
            ...i,
          })),
        }),
      },
      stockMovement: {
        ...base.stockMovement,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          movementId += 1;
          const row = { id: movementId, ...data, item: { name: "Kopi Arabika" } };
          seed.stockMovementsById[movementId] = row;
          written.push(row);
          return row;
        },
      },
    };

    return { tx: tx as never, written, journals: (base as unknown as { _journals: FakeJournal[] })._journals };
  }

  const input = (invoiceId: number | null) => ({
    date: "2026-07-20",
    contractId: null,
    invoiceId,
    consigneeId: null,
    items: [{ itemId: 9, itemName: "Kopi Arabika", bags: 100, kgPerBag: 60 }],
  });

  it("faktur bertag → gerakan `out` DAN jurnal HPP-nya berdiri di cabang itu", async () => {
    const { tx, written, journals } = harness({ id: 77, costCenterId: 5 });

    await createDeliveryOrderInTx(tx, input(77), {
      nameById: new Map([[9, "Kopi Arabika"]]),
    });

    expect(written).toHaveLength(1);
    expect(written[0].costCenterId).toBe(5);
    // Dan warisan itu benar-benar sampai ke buku besar, bukan berhenti di kolom.
    const hpp = journals.find((j) => j.sourceType === "stock_movement")!;
    expect([...new Set(hpp.lines.map((l) => l.costCenterId))]).toEqual([5]);
  });

  it("faktur TANPA tag → gerakan tetap 'belum ditetapkan', bukan ditebak", async () => {
    const { tx, written } = harness({ id: 77, costCenterId: null });
    await createDeliveryOrderInTx(tx, input(77), { nameById: new Map([[9, "Kopi Arabika"]]) });
    expect(written[0].costCenterId).toBeNull();
  });

  it("surat jalan tanpa faktur → NULL, dan fakturnya tak pernah dibaca", async () => {
    const { tx, written } = harness(null);
    await createDeliveryOrderInTx(tx, input(null), { nameById: new Map([[9, "Kopi Arabika"]]) });
    expect(written[0].costCenterId).toBeNull();
  });
});
