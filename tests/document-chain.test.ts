/**
 * Dokumen berantai — Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15):
 *   • the pure outstanding maths — per contract line, how much was delivered and
 *     how much invoiced, and what is left (`buildContractOutstanding`);
 *   • the "Ambil" pull — draft faktur lines drawn from the REMAINDER, in both
 *     modes (whole contract remainder / only what a surat jalan shipped);
 *   • the acceptance criterion "tidak bisa memfakturkan melebihi yang dikontrak"
 *     (`assertWithinContract`), including the ways a naive check would be fooled:
 *     two lines naming the same item, a renamed/re-cased item, float noise;
 *   • the timeline stage statuses shown on the contract detail page;
 *   • the DB-side helper's SELF-EXCLUSION rule, driven against a tiny in-memory
 *     client: editing a pulled faktur must not count that faktur against itself.
 *
 * No DATABASE_URL, no network — the module keeps its arithmetic free of Prisma
 * exactly like `@/lib/returns` and `@/lib/delivery-orders`.
 */
import { describe, expect, it } from "vitest";
import {
  assertWithinContract,
  buildContractChain,
  buildContractOutstanding,
  chainStatus,
  contractOutstandingForInvoice,
  contractStageStatus,
  findOverInvoiced,
  normalizeItemName,
  OverInvoiceError,
  pullInvoiceLines,
} from "@/lib/document-chain";
import { invoiceSchema } from "@/lib/validations/invoice";
import type { Prisma } from "@/generated/prisma/client";

// A contract for 6.000 kg Arabika @ 90.000/kg and 1.000 kg Robusta @ 60.000/kg.
const CONTRACT_LINES = [
  { itemName: "Kopi Arabika", bags: 100, kgPerBag: 60, pricePerKg: 90_000 },
  { itemName: "Kopi Robusta", bags: 20, kgPerBag: 50, pricePerKg: 60_000 },
];

// ─── Join key ────────────────────────────────────────────

describe("normalizeItemName", () => {
  it("ignores case, padding and repeated whitespace", () => {
    expect(normalizeItemName("  Kopi   Arabika ")).toBe("kopi arabika");
    expect(normalizeItemName("KOPI ARABIKA")).toBe(normalizeItemName("kopi arabika"));
  });

  it("keeps genuinely different items apart", () => {
    expect(normalizeItemName("Kopi Arabika")).not.toBe(normalizeItemName("Kopi Robusta"));
  });
});

// ─── Outstanding per baris ───────────────────────────────

describe("buildContractOutstanding", () => {
  it("reads a fresh contract as fully outstanding", () => {
    const { lines, totals } = buildContractOutstanding({ lines: CONTRACT_LINES });

    expect(lines).toHaveLength(2);
    const arabika = lines[0];
    expect(arabika.contractedKg).toBe(6_000);
    expect(arabika.contractedValue).toBe(540_000_000);
    expect(arabika.pricePerKg).toBe(90_000);
    expect(arabika.deliveredKg).toBe(0);
    expect(arabika.invoicedKg).toBe(0);
    expect(arabika.remainingKg).toBe(6_000);
    expect(arabika.remainingValue).toBe(540_000_000);
    expect(arabika.undeliveredKg).toBe(6_000);
    expect(arabika.readyToInvoiceKg).toBe(0); // nothing shipped yet
    expect(arabika.deliveryStatus).toBe("belum");
    expect(arabika.invoiceStatus).toBe("belum");

    expect(totals.contractedKg).toBe(7_000);
    expect(totals.contractedValue).toBe(600_000_000);
    expect(totals.remainingKg).toBe(7_000);
  });

  it("subtracts what has shipped and what has been invoiced, per line", () => {
    const { lines } = buildContractOutstanding({
      lines: CONTRACT_LINES,
      delivered: [{ itemName: "Kopi Arabika", quantity: 4_000 }],
      invoiced: [{ itemName: "Kopi Arabika", quantity: 2_500, price: 90_000 }],
    });

    const arabika = lines[0];
    expect(arabika.deliveredKg).toBe(4_000);
    expect(arabika.invoicedKg).toBe(2_500);
    expect(arabika.invoicedValue).toBe(225_000_000);
    expect(arabika.remainingKg).toBe(3_500); // 6.000 − 2.500 belum ditagih
    expect(arabika.undeliveredKg).toBe(2_000); // 6.000 − 4.000 belum dikirim
    expect(arabika.readyToInvoiceKg).toBe(1_500); // dikirim 4.000 − ditagih 2.500
    expect(arabika.deliveryStatus).toBe("sebagian");
    expect(arabika.invoiceStatus).toBe("sebagian");

    // The untouched line is unaffected by another line's movements.
    expect(lines[1].remainingKg).toBe(1_000);
    expect(lines[1].invoiceStatus).toBe("belum");
  });

  it("never lets 'siap difakturkan' exceed the contract's own remainder", () => {
    // Over-shipped: 7.000 kg delivered against a 6.000 kg promise.
    const { lines } = buildContractOutstanding({
      lines: CONTRACT_LINES,
      delivered: [{ itemName: "Kopi Arabika", quantity: 7_000 }],
    });
    expect(lines[0].deliveredKg).toBe(7_000);
    expect(lines[0].undeliveredKg).toBe(0);
    expect(lines[0].readyToInvoiceKg).toBe(6_000); // capped by the contract, not by the DO
    expect(lines[0].deliveryStatus).toBe("selesai");
  });

  it("clamps a fully drawn line at zero instead of a negative remainder", () => {
    const { lines } = buildContractOutstanding({
      lines: CONTRACT_LINES,
      invoiced: [{ itemName: "Kopi Arabika", quantity: 6_000, price: 90_000 }],
    });
    expect(lines[0].remainingKg).toBe(0);
    expect(lines[0].remainingValue).toBe(0);
    expect(lines[0].invoiceStatus).toBe("selesai");
  });

  it("merges contract lines that repeat the same item, so the cap is their sum", () => {
    const { lines } = buildContractOutstanding({
      lines: [
        { itemName: "Kopi Arabika", bags: 50, kgPerBag: 60, pricePerKg: 90_000 },
        { itemName: "kopi  arabika", bags: 50, kgPerBag: 60, pricePerKg: 90_000 },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].contractedBags).toBe(100);
    expect(lines[0].contractedKg).toBe(6_000);
    expect(lines[0].itemName).toBe("Kopi Arabika"); // first spelling wins for display
  });

  it("prices a merged line by value weight, not by the last price seen", () => {
    const { lines } = buildContractOutstanding({
      lines: [
        { itemName: "Kopi", bags: 1, kgPerBag: 100, pricePerKg: 100 }, // 100 kg @ 100
        { itemName: "Kopi", bags: 1, kgPerBag: 300, pricePerKg: 200 }, // 300 kg @ 200
      ],
    });
    // (10.000 + 60.000) / 400 kg = 175
    expect(lines[0].pricePerKg).toBe(175);
  });

  it("reports movements whose item is not on the contract instead of dropping them", () => {
    const { lines, totals } = buildContractOutstanding({
      lines: CONTRACT_LINES,
      delivered: [{ itemName: "Karung Goni", quantity: 120 }],
      invoiced: [{ itemName: "Ongkos Kirim", quantity: 1, price: 5_000_000 }],
    });
    expect(lines.every((l) => l.deliveredKg === 0 && l.invoicedKg === 0)).toBe(true);
    expect(totals.unmatchedDeliveredKg).toBe(120);
    expect(totals.unmatchedInvoicedKg).toBe(1);
    expect(totals.unmatchedInvoicedValue).toBe(5_000_000);
  });

  it("matches across spelling differences in surat jalan and faktur", () => {
    const { lines } = buildContractOutstanding({
      lines: CONTRACT_LINES,
      delivered: [{ itemName: "  KOPI  ARABIKA ", quantity: 1_000 }],
      invoiced: [{ itemName: "kopi arabika", quantity: 1_000, price: 90_000 }],
    });
    expect(lines[0].deliveredKg).toBe(1_000);
    expect(lines[0].invoicedKg).toBe(1_000);
  });

  it("handles a contract with no lines at all", () => {
    const { lines, totals } = buildContractOutstanding({ lines: [] });
    expect(lines).toEqual([]);
    expect(totals.contractedKg).toBe(0);
    expect(totals.remainingValue).toBe(0);
  });
});

// ─── Pola "Ambil" ────────────────────────────────────────

describe("pullInvoiceLines", () => {
  const outstanding = buildContractOutstanding({
    lines: CONTRACT_LINES,
    delivered: [{ itemName: "Kopi Arabika", quantity: 4_000 }],
    invoiced: [{ itemName: "Kopi Arabika", quantity: 2_500, price: 90_000 }],
  }).lines;

  it("pulls the contract remainder, priced from the contract", () => {
    const pulled = pullInvoiceLines(outstanding, "contract");
    expect(pulled).toEqual([
      { itemName: "Kopi Arabika", quantity: 3_500, price: 90_000, unit: "kg" },
      { itemName: "Kopi Robusta", quantity: 1_000, price: 60_000, unit: "kg" },
    ]);
  });

  it("pulls only what a surat jalan actually shipped when asked to", () => {
    const pulled = pullInvoiceLines(outstanding, "delivery");
    // Robusta has shipped nothing, so it is not offered at all.
    expect(pulled).toEqual([
      { itemName: "Kopi Arabika", quantity: 1_500, price: 90_000, unit: "kg" },
    ]);
  });

  it("offers nothing once the contract is fully invoiced — not a set of 0-kg lines", () => {
    const done = buildContractOutstanding({
      lines: CONTRACT_LINES,
      invoiced: [
        { itemName: "Kopi Arabika", quantity: 6_000, price: 90_000 },
        { itemName: "Kopi Robusta", quantity: 1_000, price: 60_000 },
      ],
    }).lines;
    expect(pullInvoiceLines(done, "contract")).toEqual([]);
  });

  it("writes kg lines, the unit the guard compares in", () => {
    for (const line of pullInvoiceLines(outstanding, "contract")) {
      expect(line.unit).toBe("kg");
    }
  });
});

// ─── Guard: tidak bisa memfakturkan melebihi kontrak ─────

describe("assertWithinContract", () => {
  const fresh = buildContractOutstanding({ lines: CONTRACT_LINES }).lines;
  const halfInvoiced = buildContractOutstanding({
    lines: CONTRACT_LINES,
    invoiced: [{ itemName: "Kopi Arabika", quantity: 4_000, price: 90_000 }],
  }).lines;

  it("passes a faktur that fits inside the remainder", () => {
    expect(() =>
      assertWithinContract(halfInvoiced, [{ itemName: "Kopi Arabika", quantity: 2_000 }])
    ).not.toThrow();
  });

  it("passes a faktur that draws the remainder exactly to zero", () => {
    expect(() =>
      assertWithinContract(fresh, [
        { itemName: "Kopi Arabika", quantity: 6_000 },
        { itemName: "Kopi Robusta", quantity: 1_000 },
      ])
    ).not.toThrow();
  });

  it("refuses a faktur that exceeds what is left of a contract line", () => {
    expect(() =>
      assertWithinContract(halfInvoiced, [{ itemName: "Kopi Arabika", quantity: 2_001 }])
    ).toThrow(OverInvoiceError);
  });

  it("sums repeated lines, so a split cannot slip past the cap", () => {
    // 1.500 + 1.500 = 3.000 > sisa 2.000, though neither line alone exceeds it.
    expect(() =>
      assertWithinContract(halfInvoiced, [
        { itemName: "Kopi Arabika", quantity: 1_500 },
        { itemName: "Kopi Arabika", quantity: 1_500 },
      ])
    ).toThrow(OverInvoiceError);
  });

  it("is not fooled by re-casing or re-spacing the item name", () => {
    expect(() =>
      assertWithinContract(halfInvoiced, [{ itemName: "  kopi   ARABIKA", quantity: 5_000 }])
    ).toThrow(OverInvoiceError);
  });

  it("tolerates float noise rather than rejecting an exact remainder", () => {
    const noisy = 0.1 + 0.2; // 0.30000000000000004
    const tiny = buildContractOutstanding({
      lines: [{ itemName: "Kopi", bags: 1, kgPerBag: 0.3, pricePerKg: 1 }],
    }).lines;
    expect(() => assertWithinContract(tiny, [{ itemName: "Kopi", quantity: noisy }])).not.toThrow();
  });

  it("leaves items the contract never promised uncapped (ongkos kirim, selisih timbang)", () => {
    expect(() =>
      assertWithinContract(fresh, [{ itemName: "Ongkos Kirim", quantity: 999_999 }])
    ).not.toThrow();
  });

  it("names every offending line, with the numbers, in Indonesian", () => {
    let message = "";
    try {
      assertWithinContract(halfInvoiced, [{ itemName: "Kopi Arabika", quantity: 3_000 }]);
    } catch (e) {
      message = (e as OverInvoiceError).message;
    }
    expect(message).toContain("Kopi Arabika");
    expect(message).toContain("diminta 3000 kg");
    expect(message).toContain("sisa 2000 kg");
    expect(message).toContain("Faktur tidak dibuat dan jurnal tidak diposting.");
  });

  it("reports every overdrawn line at once, not just the first", () => {
    const over = findOverInvoiced(fresh, [
      { itemName: "Kopi Arabika", quantity: 7_000 },
      { itemName: "Kopi Robusta", quantity: 2_000 },
    ]);
    expect(over.map((o) => o.itemName)).toEqual(["Kopi Arabika", "Kopi Robusta"]);
    expect(over[0]).toMatchObject({
      contractedKg: 6_000,
      alreadyInvoicedKg: 0,
      requestedKg: 7_000,
      remainingKg: 6_000,
    });
  });

  it("refuses ANY quantity once a line is fully invoiced", () => {
    const done = buildContractOutstanding({
      lines: CONTRACT_LINES,
      invoiced: [{ itemName: "Kopi Arabika", quantity: 6_000, price: 90_000 }],
    }).lines;
    expect(() =>
      assertWithinContract(done, [{ itemName: "Kopi Arabika", quantity: 1 }])
    ).toThrow(OverInvoiceError);
  });
});

// ─── Timeline dokumen ────────────────────────────────────

describe("chainStatus", () => {
  it("is 'belum' when nothing has been done", () => {
    expect(chainStatus(0, 1_000)).toBe("belum");
  });
  it("is 'sebagian' part-way", () => {
    expect(chainStatus(400, 1_000)).toBe("sebagian");
  });
  it("is 'selesai' at the target, and beyond it", () => {
    expect(chainStatus(1_000, 1_000)).toBe("selesai");
    expect(chainStatus(1_200, 1_000)).toBe("selesai");
  });
  it("treats a zero target as an absent stage, not a completed one", () => {
    expect(chainStatus(0, 0)).toBe("belum");
    // …unless something happened anyway, which must never read as "belum".
    expect(chainStatus(5, 0)).toBe("selesai");
  });
  it("compares money at the cent grain", () => {
    expect(chainStatus(999.999, 1_000, 2)).toBe("selesai");
  });
});

describe("contractStageStatus", () => {
  it("maps the contract's own status onto the timeline", () => {
    expect(contractStageStatus("signed")).toBe("selesai");
    expect(contractStageStatus("pending")).toBe("sebagian");
    expect(contractStageStatus("canceled")).toBe("belum");
  });
});

describe("buildContractChain", () => {
  const { totals } = buildContractOutstanding({
    lines: CONTRACT_LINES,
    delivered: [{ itemName: "Kopi Arabika", quantity: 6_000 }],
    invoiced: [{ itemName: "Kopi Arabika", quantity: 3_000, price: 90_000 }],
  });

  const stages = buildContractChain({
    contractStatus: "signed",
    totals,
    deliveryOrderCount: 2,
    invoiceCount: 1,
    paymentCount: 1,
    paidBase: 100_000_000,
    contractBase: 600_000_000,
  });

  it("walks Kontrak → Surat Jalan → Faktur → Pembayaran, in that order", () => {
    expect(stages.map((s) => s.key)).toEqual(["contract", "delivery", "invoice", "payment"]);
    expect(stages.map((s) => s.label)).toEqual([
      "Kontrak",
      "Surat Jalan",
      "Faktur",
      "Pembayaran",
    ]);
  });

  it("gives each stage its own progress", () => {
    expect(stages[0].status).toBe("selesai"); // signed
    expect(stages[1].status).toBe("sebagian"); // 6.000 of 7.000 kg shipped
    expect(stages[2].status).toBe("sebagian"); // 3.000 of 7.000 kg invoiced
    expect(stages[3].status).toBe("sebagian"); // 100jt of 600jt paid
  });

  it("measures the payment stage in IDR and the rest in kg", () => {
    expect(stages.map((s) => s.unit)).toEqual(["kg", "kg", "kg", "IDR"]);
    expect(stages[3].done).toBe(100_000_000);
    expect(stages[3].target).toBe(600_000_000);
  });

  it("survives a foreign contract whose rate was never filled in", () => {
    const noBase = buildContractChain({
      contractStatus: "pending",
      totals,
      deliveryOrderCount: 0,
      invoiceCount: 0,
      paymentCount: 0,
      paidBase: 0,
      contractBase: null,
    });
    expect(noBase[3].target).toBe(0);
    expect(noBase[3].status).toBe("belum");
  });
});

// ─── DB side: self-exclusion when editing a pulled faktur ──

/**
 * The three `findMany` calls `contractOutstandingForInvoice` makes, in memory.
 * Deliberately tiny — the point is the `{ id: { not } }` exclusion, not Prisma.
 */
function createChainClient(seed: {
  contractItems: { itemName: string; bags: number; kgPerBag: number; pricePerKg: number }[];
  deliveryOrders?: { items: { itemName: string; quantity: number }[] }[];
  invoices?: { id: number; items: { itemName: string; quantity: number; price: number }[] }[];
}) {
  return {
    contractItem: { findMany: async () => seed.contractItems },
    deliveryOrder: { findMany: async () => seed.deliveryOrders ?? [] },
    invoice: {
      findMany: async ({ where }: { where: { id?: { not: number } } }) =>
        (seed.invoices ?? []).filter((i) => where.id?.not == null || i.id !== where.id.not),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("contractOutstandingForInvoice", () => {
  const client = createChainClient({
    contractItems: CONTRACT_LINES,
    deliveryOrders: [{ items: [{ itemName: "Kopi Arabika", quantity: 4_000 }] }],
    invoices: [{ id: 7, items: [{ itemName: "Kopi Arabika", quantity: 4_000, price: 90_000 }] }],
  });

  it("counts existing faktur against the contract when creating a new one", async () => {
    const { lines } = await contractOutstandingForInvoice(client, 1);
    expect(lines[0].invoicedKg).toBe(4_000);
    expect(lines[0].remainingKg).toBe(2_000);
    expect(() =>
      assertWithinContract(lines, [{ itemName: "Kopi Arabika", quantity: 2_001 }])
    ).toThrow(OverInvoiceError);
  });

  it("excludes the faktur being edited, so a save never collides with itself", async () => {
    const { lines } = await contractOutstandingForInvoice(client, 1, 7);
    expect(lines[0].invoicedKg).toBe(0);
    expect(lines[0].remainingKg).toBe(6_000);
    // Re-saving faktur #7 unchanged must pass.
    expect(() =>
      assertWithinContract(lines, [{ itemName: "Kopi Arabika", quantity: 4_000 }])
    ).not.toThrow();
    // …but growing it past the contract still must not.
    expect(() =>
      assertWithinContract(lines, [{ itemName: "Kopi Arabika", quantity: 6_001 }])
    ).toThrow(OverInvoiceError);
  });
});

// ─── Zod: kontrak sumber pada faktur ─────────────────────

describe("invoiceSchema carries the source contract (issue #15)", () => {
  const base = {
    invoiceNo: "SI.2026.07.00001",
    date: "2026-07-21",
    items: [{ itemName: "Kopi Arabika", quantity: 1_000, price: 90_000 }],
  };

  it("defaults to no contract — a faktur need not come from one", () => {
    const r = invoiceSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contractId).toBeNull();
  });

  it("accepts a contract id", () => {
    const r = invoiceSchema.safeParse({ ...base, contractId: 42 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contractId).toBe(42);
  });

  it("treats an untouched picker ('' / null) as no contract", () => {
    for (const value of ["", null, undefined]) {
      const r = invoiceSchema.safeParse({ ...base, contractId: value });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.contractId).toBeNull();
    }
  });

  it("rejects a nonsense contract id rather than coercing it", () => {
    expect(invoiceSchema.safeParse({ ...base, contractId: 0 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...base, contractId: -3 }).success).toBe(false);
  });
});
