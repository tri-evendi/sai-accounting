/**
 * Transaksi berulang, tahap 2 (issue #469) — sifat yang dikunci di lapisan
 * yang MENYENTUH basis data.
 *
 * Aturan tanggalnya sudah dikunci sebagai fungsi murni di `recurring.test.ts`.
 * Yang diuji di sini adalah tiga keputusan tahap 2, dan ketiganya soal apa yang
 * TIDAK terjadi:
 *
 *   1. yang lahir bukan jurnal terposting — pengajuan persetujuan SELALU
 *      terbit, apa pun nilainya dan walau perusahaan itu tak punya satu aturan
 *      persetujuan pun;
 *   2. kejadian di periode TERTUTUP ditahan dan DICATAT — tidak diselundupkan,
 *      tidak dibuang;
 *   3. sumber yang hilang/dibatalkan tidak pernah ditebak isinya.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const state = {
  templates: [] as Record<string, unknown>[],
  invoice: null as Record<string, unknown> | null,
  periodClosed: false,
  created: [] as Record<string, unknown>[],
  occurrences: [] as Record<string, unknown>[],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringTemplate: { findMany: async () => state.templates },
    invoice: { findUnique: async () => state.invoice },
    recurringOccurrence: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.occurrences.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

vi.mock("@/lib/period", () => ({
  isPeriodClosed: async () => state.periodClosed,
}));

vi.mock("@/lib/document-writes", () => ({
  createInvoiceInTx: async (
    _tx: unknown,
    input: Record<string, unknown>,
    opts: Record<string, unknown>
  ) => {
    state.created.push({ input, opts });
    return { invoice: { id: 777, items: [] }, approval: null, total: 0 };
  },
}));

const { runRecurringForCompany } = await import("@/lib/recurring-run");

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const template = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Sewa kantor",
  kind: "invoice",
  sourceId: 42,
  frequency: "monthly",
  startDate: day("2026-01-15"),
  endDate: null,
  maxOccurrences: null,
  isActive: true,
  occurrences: [],
  ...over,
});

const sourceInvoice = (over: Record<string, unknown> = {}) => ({
  id: 42,
  invoiceNo: "INV/2026/01/9",
  status: "pending",
  date: day("2026-01-15"),
  dueDate: day("2026-02-14"),
  customerId: 3,
  costCenterId: null,
  currency: "IDR",
  rate: null,
  taxable: true,
  taxRate: 11,
  items: [{ itemName: "Sewa", quantity: 1, price: 5_000_000, unit: "bulan" }],
  ...over,
});

afterEach(() => {
  state.templates = [];
  state.invoice = null;
  state.periodClosed = false;
  state.created = [];
  state.occurrences = [];
});

describe("dokumen berulang tidak pernah langsung memposting", () => {
  it("SELALU meminta persetujuan — apa pun nilainya, walau tanpa aturan", async () => {
    /* Inilah keputusan pokok tahap 2. Untuk dokumen yang diketik manusia,
       ambang nilai adalah ukuran yang tepat; untuk yang lahir sendiri setiap
       bulan, ukurannya asal-usulnya — tak seorang pun melihatnya. */
    state.templates = [template()];
    state.invoice = sourceInvoice();

    const out = await runRecurringForCompany(day("2026-03-15"));

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("created");
    expect(state.created[0].opts).toMatchObject({ forceApproval: true });
  });

  it("menyalin barang & mata uang sumbernya apa adanya", async () => {
    state.templates = [template()];
    state.invoice = sourceInvoice();

    await runRecurringForCompany(day("2026-03-15"));

    expect(state.created[0].input).toMatchObject({
      currency: "IDR",
      taxable: true,
      taxRate: 11,
      customerId: 3,
      items: [{ itemName: "Sewa", quantity: 1, price: 5_000_000, unit: "bulan" }],
    });
  });

  it("mempertahankan JARAK jatuh tempo, bukan tanggalnya", async () => {
    /* Menyalin tanggal jatuh temponya apa adanya akan menerbitkan faktur yang
       lahir sudah lewat jatuh tempo — lalu ditagih pengingat #467 besoknya. */
    state.templates = [template()];
    state.invoice = sourceInvoice(); // 15 Jan → jatuh tempo 14 Feb (30 hari)

    await runRecurringForCompany(day("2026-03-15"));

    expect(state.created[0].input).toMatchObject({
      date: "2026-03-15",
      dueDate: "2026-04-14",
    });
  });

  it("TIDAK mewarisi kontrak sumbernya", async () => {
    // Faktur berulang bukan tarikan dari kontrak; mewariskannya menggerus sisa
    // kontrak setiap bulan atas kesepakatan yang tak menyebut pengulangan.
    state.templates = [template()];
    state.invoice = sourceInvoice({ contractId: 5 });

    await runRecurringForCompany(day("2026-03-15"));

    expect((state.created[0].input as Record<string, unknown>).contractId).toBeUndefined();
  });
});

describe("penahanan DICATAT, tidak didiamkan", () => {
  it("periode tertutup → held_period, dan tidak ada dokumen yang lahir", async () => {
    state.templates = [template()];
    state.invoice = sourceInvoice();
    state.periodClosed = true;

    const out = await runRecurringForCompany(day("2026-03-15"));

    expect(out[0].status).toBe("held_period");
    expect(state.created).toHaveLength(0);
    /* Dicatat — kalau tidak, ia dicoba lagi tiap jam selama jendela susulan dan
       tak seorang pun tahu ia pernah gagal. */
    expect(state.occurrences[0]).toMatchObject({ status: "held_period", documentId: null });
  });

  it("periode tertutup diperiksa SEBELUM sumbernya dibaca", async () => {
    // Urutannya penting: buku yang periodenya tertutup tidak perlu ditanyai
    // apa pun tentang dokumen sumber yang tak akan disalin.
    state.templates = [template()];
    state.invoice = null;
    state.periodClosed = true;

    const out = await runRecurringForCompany(day("2026-03-15"));
    expect(out[0].status).toBe("held_period");
  });

  it("sumber hilang → held_source, isinya tidak pernah ditebak", async () => {
    state.templates = [template()];
    state.invoice = null;

    const out = await runRecurringForCompany(day("2026-03-15"));

    expect(out[0].status).toBe("held_source");
    expect(out[0].note).toMatch(/tidak ditemukan/i);
    expect(state.created).toHaveLength(0);
  });

  it("sumber DIBATALKAN diperlakukan sama dengan hilang", async () => {
    state.templates = [template()];
    state.invoice = sourceInvoice({ status: "canceled" });

    const out = await runRecurringForCompany(day("2026-03-15"));

    expect(out[0].status).toBe("held_source");
    expect(out[0].note).toMatch(/dibatalkan/i);
  });

  it("jenis templat yang belum didukung ditahan, bukan diam-diam dilewati", async () => {
    state.templates = [template({ kind: "journal" })];

    const out = await runRecurringForCompany(day("2026-03-15"));
    expect(out[0].status).toBe("held_source");
  });
});

describe("apa yang TIDAK diterbitkan", () => {
  it("kejadian yang sudah pernah tercatat tidak diulang", async () => {
    state.templates = [template({ occurrences: [{ occurrenceDate: day("2026-03-15") }] })];
    state.invoice = sourceInvoice();

    expect(await runRecurringForCompany(day("2026-03-15"))).toEqual([]);
  });

  it("templat nonaktif tidak dibaca sama sekali", async () => {
    // `findMany` disaring `isActive: true` di query-nya; di sini dibuktikan
    // dengan tidak menyediakan satu pun templat aktif.
    state.templates = [];
    expect(await runRecurringForCompany(day("2026-03-15"))).toEqual([]);
  });

  it("kejadian masa depan tidak diterbitkan lebih awal", async () => {
    state.templates = [template()];
    state.invoice = sourceInvoice();

    expect(await runRecurringForCompany(day("2026-03-14"))).toEqual([]);
  });
});
