/**
 * Tiga laporan PDF yang muatannya kini DIHITUNG SERVER (09 §5) — perilakunya,
 * di bawah route handler sungguhan.
 *
 * ══ YANG DIBUKTIKAN ════════════════════════════════════════════════════════
 *  1. ISI kertasnya sama dengan yang dulu dihasilkan dari muatan rakitan
 *     PERAMBAN untuk buku yang sama. "Muatan peramban" di sini adalah REKAMAN
 *     jalur lama — kode halaman/tombol sebelum perubahan ini, disalin apa
 *     adanya di `muatanPeramban*` di bawah — dilewatkan ke skema muatan yang
 *     dulu dipakai rute, lalu ke generator yang sama. Yang dibandingkan byte
 *     PDF tanpa `/ID` dan `/CreationDate` (08 §2: dua instance jsPDF hanya
 *     berbeda di sana); jamnya dibekukan supaya "Generated:" sama.
 *  2. Jalur ANTREAN (di atas ambang penyerahan) menerbitkan PARAMETER saja, dan
 *     pekerjaannya menghasilkan isi yang sama.
 *  3. Otorisasi: izin per jenis dari registri; penanya yang ditolak penjaganya
 *     (mis. bukan anggota PT yang diminta → 404) tidak membuat SATU baris buku
 *     pun terbaca dan tidak menerbitkan apa pun; hasil berantre PT lain, atau
 *     jenis lain dari yang disebut alamatnya, dijawab 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PdfCompany } from "@/lib/pdf/company-header";

/* ── Buku palsu: TEPAT kueri yang dipakai pembangun muatan dan halamannya ── */

/** Bentuk `Prisma.Decimal` yang dipakai di sini: `toString`, `toJSON` string. */
class Dec {
  constructor(private readonly s: string) {}
  toString() {
    return this.s;
  }
  toJSON() {
    return this.s;
  }
  valueOf() {
    return Number(this.s);
  }
}

interface Barang {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  isActive: boolean;
}
interface Gerak {
  itemId: number;
  type: string;
  quantity: Dec;
  date: Date;
  unitCost: Dec | null;
}
interface Kas {
  id: number;
  type: string;
  date: Date;
  description: string;
  currency: string;
  debit: Dec;
  credit: Dec;
  rate: null;
  baseAmount: null;
  reconciled: boolean;
}

const buku = vi.hoisted(() => ({
  barang: [] as unknown[],
  gerak: [] as unknown[],
  kas: [] as unknown[],
  dibaca: 0,
}));

vi.mock("@/lib/prisma", () => {
  const items = () => buku.barang as Barang[];
  const moves = () => buku.gerak as Gerak[];
  const cash = () => buku.kas as Kas[];
  const byName = (a: Barang, b: Barang) => a.name.localeCompare(b.name);
  return {
    prisma: {
      item: {
        findMany: async (q: { select?: unknown; include?: unknown }) => {
          buku.dibaca++;
          const urut = [...items()].sort(byName);
          if (q.select) return urut.map(({ id, name, unit }) => ({ id, name, unit }));
          return urut.map((it) => ({
            ...it,
            stockMovements: moves()
              .filter((m) => m.itemId === it.id)
              .map(({ quantity, type, date, unitCost }) => ({ quantity, type, date, unitCost })),
          }));
        },
      },
      stockMovement: {
        groupBy: async () => {
          buku.dibaca++;
          const peta = new Map<string, { itemId: number; type: string; sum: number }>();
          for (const m of moves()) {
            const k = `${m.itemId}:${m.type}`;
            const e = peta.get(k) ?? { itemId: m.itemId, type: m.type, sum: 0 };
            e.sum += Number(m.quantity);
            peta.set(k, e);
          }
          return [...peta.values()].map((e) => ({
            itemId: e.itemId,
            type: e.type,
            _sum: { quantity: new Dec(String(e.sum)) },
          }));
        },
      },
      cashMovement: {
        findMany: async (q: {
          where?: { type?: string; currency?: string; date?: { gte: Date; lt: Date } };
        }) => {
          buku.dibaca++;
          const w = q.where ?? {};
          return cash()
            .filter((r) => (w.type ? r.type === w.type : true))
            .filter((r) => (w.currency ? r.currency === w.currency : true))
            .filter((r) => (w.date ? r.date >= w.date.gte && r.date < w.date.lt : true))
            .sort((a, b) => b.date.getTime() - a.date.getTime());
        },
      },
    },
  };
});

/* ── Penjaga, identitas, antrean: dipalsukan di batasnya ─────────────────── */

const PERUSAHAAN = { name: "PT Uji", address: "Jl. Uji No. 1", logo: null } satisfies PdfCompany;

const penjaga = vi.hoisted(() => ({
  izinDiminta: [] as string[],
  tolak: null as null | number,
  companyId: 1,
}));

vi.mock("@/lib/auth-guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
  requireApiPermission: vi.fn(async (izin: string) => {
    penjaga.izinDiminta.push(izin);
    if (penjaga.tolak !== null) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Not Found" }, { status: penjaga.tolak }),
      };
    }
    return {
      authorized: true,
      session: { user: { id: "u1", role: "finance_manager", name: "U", email: "u@x", mustChangePassword: false } },
      companyId: penjaga.companyId,
    };
  }),
  };
});

vi.mock("@/lib/pdf-company", () => ({
  serverPdfCompany: vi.fn(async () => PERUSAHAAN),
}));

const antrean = vi.hoisted(() => ({
  terbit: [] as { kind: string; companyId: number; payload: unknown }[],
  job: null as null | Record<string, unknown>,
}));

vi.mock("@sai/platform/job-queue", () => ({
  publishJob: vi.fn(async (j: { kind: string; companyId: number; payload: unknown }) => {
    antrean.terbit.push(j);
    return { id: 77 };
  }),
  jobForDownload: vi.fn(async () => antrean.job),
}));

/* Ambang penyerahan diperkecil supaya jalur antrean teruji dengan buku kecil:
   buku dasar di bawah paling banyak 9 baris (Kas tanpa saringan: 5 transaksi +
   4 saldo), jadi semuanya sinkron; tes antrean menambah baris. Plafon
   penolakan tetap aslinya. */
vi.mock("@sai/core/export-limits", async (asli) => ({
  ...(await asli<typeof import("@sai/core/export-limits")>()),
  EXPORT_QUEUE_HANDOFF_ROWS: 9,
}));

vi.mock("@sai/platform/i18n/server", () => ({
  getRequestI18n: async () => ({ t: (k: string) => k, dictionary: {}, locale: "id" }),
}));

const efektif = vi.hoisted(() => ({ boleh: true, diperiksa: [] as string[] }));
vi.mock("@/lib/authz-effective", () => ({
  canEffective: vi.fn(async (_u: unknown, izin: string) => {
    efektif.diperiksa.push(izin);
    return efektif.boleh;
  }),
}));

/* Impor SESUDAH mock. */
const { POST } = await import("@/app/api/reports/pdf/[jenis]/route");
const { GET: ambilHasil } = await import(
  "@/app/api/t/[tenantSlug]/[companySlug]/jobs/[kind]/[id]/result/route"
);
const { renderReportPdfJob } = await import("@/lib/report-pdf-job");
const { bolehAmbilHasil } = await import("@/lib/job-result-gate");
const { REPORT_PDF } = await import("@/lib/report-pdf");
const {
  financeReportPayloadSchema,
  opnameSheetPayloadSchema,
  stockReportPayloadSchema,
} = await import("@/lib/validations/report-pdf");
const { stockLevelsFromTotals, summarizeInventory, toClientInventory } = await import("@/lib/inventory");
const { toFinanceReportRows } = await import("@/lib/finance-report-rows");
const { businessDate, businessParts } = await import("@sai/core/business-date");
const { generateStockReportPDF } = await import("@/lib/pdf/stock-report-pdf");
const { generateOpnameSheetPDF } = await import("@/lib/pdf/opname-sheet-pdf");
const { generateFinanceReportPDF } = await import("@/lib/pdf/finance-report-pdf");

/* ── Isi buku ────────────────────────────────────────────────────────────── */

function isiBuku() {
  const d = (s: string) => new Date(s);
  buku.barang = [
    { id: 1, code: "BRG-1", name: "Kopi Arabika", unit: "kg", isActive: true },
    { id: 2, code: "BRG-2", name: "Gula Aren", unit: "kg", isActive: true },
    { id: 3, code: "BRG-3", name: "Botol Kaca", unit: null, isActive: false },
  ] satisfies Barang[];
  buku.gerak = [
    { itemId: 1, type: "in", quantity: new Dec("120.5"), date: d("2026-01-10T02:00:00Z"), unitCost: new Dec("85000") },
    { itemId: 1, type: "in", quantity: new Dec("30"), date: d("2026-02-01T02:00:00Z"), unitCost: new Dec("91000.75") },
    { itemId: 1, type: "out", quantity: new Dec("47.25"), date: d("2026-02-20T02:00:00Z"), unitCost: null },
    { itemId: 1, type: "process", quantity: new Dec("3"), date: d("2026-02-21T02:00:00Z"), unitCost: null },
    { itemId: 2, type: "in", quantity: new Dec("10"), date: d("2026-03-01T02:00:00Z"), unitCost: new Dec("0") },
    { itemId: 2, type: "out", quantity: new Dec("12"), date: d("2026-03-02T02:00:00Z"), unitCost: null },
  ] satisfies Gerak[];
  const kas = (
    id: number,
    type: string,
    date: string,
    description: string,
    currency: string,
    debit: string,
    credit: string
  ): Kas => ({
    id,
    type,
    date: d(date),
    description,
    currency,
    debit: new Dec(debit),
    credit: new Dec(credit),
    rate: null,
    baseAmount: null,
    reconciled: false,
  });
  buku.kas = [
    kas(1, "bank", "2025-12-31T16:30:00Z", "Setoran awal Januari (WIB)", "IDR", "25000000.00", "0.00"),
    kas(2, "kas_kecil", "2026-03-05T03:00:00Z", "Transport & bensin", "IDR", "0.00", "950000.00"),
    kas(3, "bank", "2026-03-10T03:00:00Z", "Pembayaran pelanggan", "USD", "1250.50", "0.00"),
    kas(4, "bank", "2026-03-31T17:30:00Z", "Biaya admin (sudah April WIB)", "IDR", "0.00", "15000.00"),
    kas(5, "kas_besar", "2025-06-01T03:00:00Z", "Tahun lalu", "CNY", "880.00", "0.00"),
  ];
  buku.dibaca = 0;
}

/* ── REKAMAN jalur lama: muatan yang dirakit PERAMBAN sebelum perubahan ini ── */

/** Halaman `/inventory` lama: `toClientInventory(summarizeInventory(allItems))` sebagai props. */
function muatanPerambanStok() {
  const allItems = [...(buku.barang as Barang[])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((it) => ({
      ...it,
      stockMovements: (buku.gerak as Gerak[])
        .filter((m) => m.itemId === it.id)
        .map(({ quantity, type, date, unitCost }) => ({ quantity, type, date, unitCost })),
    }));
  return { items: toClientInventory(summarizeInventory(allItems)) };
}

/** Halaman opname lama: GROUP BY + `stockLevelsFromTotals`, lalu formulir mengirim `items` + pilihannya. */
function muatanPerambanOpname(date: string, showSystemQty: boolean) {
  const totals = new Map<string, { itemId: number; type: string; quantity: number }>();
  for (const m of buku.gerak as Gerak[]) {
    const k = `${m.itemId}:${m.type}`;
    const e = totals.get(k) ?? { itemId: m.itemId, type: m.type, quantity: 0 };
    e.quantity += Number(m.quantity);
    totals.set(k, e);
  }
  const allItems = [...(buku.barang as Barang[])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, unit }) => ({ id, name, unit }));
  const items = stockLevelsFromTotals(allItems, [...totals.values()]);
  return { items, date, showSystemQty };
}

/** Halaman Kas & Bank lama — saringan dan `Map` saldo yang dulu ditulis sebaris di sana. */
function muatanPerambanKasHalaman(filters: { type?: string; currency?: string; month?: string; year?: string }) {
  const yearNum = filters.year ? Number.parseInt(filters.year, 10) : NaN;
  const monthNum = filters.month ? Number.parseInt(filters.month, 10) : NaN;
  const monthValid = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
  const effectiveYear = Number.isFinite(yearNum)
    ? yearNum
    : monthValid
      ? businessParts(new Date()).year
      : null;
  let rows = [...(buku.kas as Kas[])];
  if (filters.type) rows = rows.filter((r) => r.type === filters.type);
  if (filters.currency) rows = rows.filter((r) => r.currency === filters.currency);
  if (effectiveYear != null) {
    const startDate = monthValid ? businessDate(effectiveYear, monthNum - 1, 1) : businessDate(effectiveYear, 0, 1);
    const endDate = monthValid ? businessDate(effectiveYear, monthNum, 1) : businessDate(effectiveYear + 1, 0, 1);
    rows = rows.filter((r) => r.date >= startDate && r.date < endDate);
  }
  const allTransactions = rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  const balanceMap = new Map<string, { type: string; currency: string; debit: number; credit: number }>();
  for (const tx of allTransactions) {
    const key = `${tx.type}_${tx.currency}`;
    const existing = balanceMap.get(key) || { type: tx.type, currency: tx.currency, debit: 0, credit: 0 };
    existing.debit += Number(tx.debit);
    existing.credit += Number(tx.credit);
    balanceMap.set(key, existing);
  }
  return {
    balances: Array.from(balanceMap.values()).map((b) => ({ ...b, balance: b.debit - b.credit })),
    transactions: toFinanceReportRows(allTransactions),
  };
}

/** Tombol beranda lama: `GET /api/finance` (tanpa saringan) → JSON → `toFinanceReportRows`. */
function muatanPerambanKasBeranda() {
  const transactions = [...(buku.kas as Kas[])].sort((a, b) => b.date.getTime() - a.date.getTime());
  const balances = transactions.reduce(
    (acc, t) => {
      const key = `${t.type}_${t.currency}`;
      if (!acc[key]) acc[key] = { type: t.type, currency: t.currency, debit: 0, credit: 0, balance: 0 };
      acc[key].debit += Number(t.debit);
      acc[key].credit += Number(t.credit);
      acc[key].balance = acc[key].debit - acc[key].credit;
      return acc;
    },
    {} as Record<string, { type: string; currency: string; debit: number; credit: number; balance: number }>
  );
  const json = JSON.parse(JSON.stringify({ transactions, balances: Object.values(balances) }));
  return { balances: json.balances, transactions: toFinanceReportRows(json.transactions) };
}

/** Yang dulu dilihat generator: badan peramban → JSON → skema muatan rute lama. */
function lewatRuteLama<T>(skema: { parse: (v: unknown) => T }, badan: unknown): T {
  return skema.parse(JSON.parse(JSON.stringify(badan)));
}

/* ── Pembanding isi ──────────────────────────────────────────────────────── */

function isi(b: Uint8Array | ArrayBuffer): string {
  return Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b))
    .toString("latin1")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID []")
    .replace(/\/CreationDate\s*\([^)]*\)/g, "/CreationDate ()");
}

function minta(jenis: string, badan: unknown): Promise<Response> {
  return POST(
    new Request(`http://app.test/api/reports/pdf/${jenis}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badan),
    }),
    { params: Promise.resolve({ jenis }) }
  );
}

async function byteDari(res: Response): Promise<Uint8Array> {
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("application/pdf");
  return new Uint8Array(await res.arrayBuffer());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-15T03:00:00Z"));
  isiBuku();
  penjaga.izinDiminta = [];
  penjaga.tolak = null;
  penjaga.companyId = 1;
  antrean.terbit = [];
  antrean.job = null;
  efektif.boleh = true;
  efektif.diperiksa = [];
});
afterEach(() => {
  vi.useRealTimers();
});

/* ══ 1. Isi kertas = isi dari muatan peramban ═══════════════════════════════ */

describe("isi PDF dari server SAMA dengan dari muatan rakitan peramban", () => {
  it("Laporan Stok (halaman Stok & beranda — badannya `{}`)", async () => {
    const server = await byteDari(await minta("stock", {}));
    const lama = lewatRuteLama(stockReportPayloadSchema, muatanPerambanStok());
    const peramban = generateStockReportPDF(lama.items, PERUSAHAAN).output("arraybuffer");
    expect(isi(server)).toBe(isi(peramban));
    /* Penjaga atas penjaga: bukunya memang tercetak (nama barang ada di aliran
       konten), jadi kesamaan di atas bukan kesamaan dua dokumen kosong. */
    expect(lama.items).toHaveLength(3);
  });

  it("Lembar Hitung Stok, dengan dan tanpa stok sistem", async () => {
    for (const showSystemQty of [false, true]) {
      const server = await byteDari(await minta("opname", { date: "2026-03-14", showSystemQty }));
      const lama = lewatRuteLama(opnameSheetPayloadSchema, muatanPerambanOpname("2026-03-14", showSystemQty));
      const peramban = generateOpnameSheetPDF(lama.items, PERUSAHAAN, {
        date: lama.date,
        showSystemQty: lama.showSystemQty,
      }).output("arraybuffer");
      expect(isi(server), `showSystemQty=${showSystemQty}`).toBe(isi(peramban));
    }
  });

  it("Laporan Kas & Bank dari halaman, tanpa saringan dan dengan saringan bulan/jenis", async () => {
    const kasus = [
      {},
      { type: "bank" },
      { year: "2026", month: "3" },
      { month: "3" }, // bulan tanpa tahun → tahun berjalan (Jakarta)
      { type: "bank", currency: "IDR", year: "2026" },
      { year: "abc", month: "13" }, // diedit tangan → diabaikan, seperti halaman
    ];
    for (const filters of kasus) {
      const server = await byteDari(await minta("finance", filters));
      const lama = lewatRuteLama(financeReportPayloadSchema, muatanPerambanKasHalaman(filters));
      const peramban = generateFinanceReportPDF(lama.balances, lama.transactions, PERUSAHAAN).output(
        "arraybuffer"
      );
      expect(isi(server), JSON.stringify(filters)).toBe(isi(peramban));
    }
  });

  it("Laporan Kas & Bank dari beranda (`GET /api/finance` lama) = badan `{}`", async () => {
    const server = await byteDari(await minta("finance", {}));
    const lama = lewatRuteLama(financeReportPayloadSchema, muatanPerambanKasBeranda());
    const peramban = generateFinanceReportPDF(lama.balances, lama.transactions, PERUSAHAAN).output(
      "arraybuffer"
    );
    expect(isi(server)).toBe(isi(peramban));
  });

  it("pembandingnya MEMBEDAKAN — buku lain menghasilkan isi lain", async () => {
    const sebelum = isi(await byteDari(await minta("finance", {})));
    (buku.kas as Kas[])[1]!.credit = new Dec("950001.00");
    const sesudah = isi(await byteDari(await minta("finance", {})));
    expect(sesudah).not.toBe(sebelum);
  });

  it("badan versi LAMA (muatan jadi) ditolak 400, bukan dicetak tanpa saringan", async () => {
    /* Tab yang dibuka sebelum rilis masih mengirim `{ items }` / `{ balances,
       transactions }`. Tanpa `.strict()` ia lolos sebagai "tanpa saringan". */
    expect((await minta("stock", muatanPerambanStok())).status).toBe(400);
    expect((await minta("finance", muatanPerambanKasBeranda())).status).toBe(400);
    expect((await minta("opname", muatanPerambanOpname("2026-03-14", false))).status).toBe(400);
  });
});

/* ══ 2. Kecil sinkron, besar ke antrean ════════════════════════════════════ */

describe("ambang penyerahan: sinkron di bawah, pekerjaan `report.pdf` di atas", () => {
  /** Tiga baris `kas_besar` IDR: Kas tanpa saringan jadi 8 transaksi + 5 saldo = 13 > 9. */
  function bukuBesar() {
    const tambahan = [6, 7, 8].map((id) => ({
      ...(buku.kas as Kas[])[0]!,
      id,
      type: "kas_besar",
      date: new Date(`2026-02-0${id - 5}T03:00:00Z`),
      description: `Kas besar ${id}`,
      debit: new Dec(`${id}00000.00`),
    }));
    buku.kas = [...(buku.kas as Kas[]), ...tambahan];
  }

  it("di bawah — dan TEPAT di — ambang: digambar di permintaan ini, tak ada pekerjaan", async () => {
    /* Kas tanpa saringan = 9 baris = ambang uji: belum "di atas". */
    expect((await minta("finance", {})).status).toBe(200);
    expect((await minta("stock", {})).status).toBe(200);
    expect(antrean.terbit).toEqual([]);
  });

  it("di atas ambang: 202 + pekerjaan berisi PARAMETER saja, untuk PT penanya", async () => {
    bukuBesar();
    penjaga.companyId = 9;
    const res = await minta("finance", {});
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: true, jobId: 77, kind: "report.pdf", rows: 13 });
    expect(antrean.terbit).toEqual([{ kind: "report.pdf", companyId: 9, payload: { jenis: "finance", params: {} } }]);
    /* Tidak satu angka akuntansi pun di basis data kendali (#104). */
    expect(JSON.stringify(antrean.terbit[0]!.payload)).not.toMatch(/\d{3,}/);
  });

  it("pekerjaannya menghasilkan ISI yang sama dengan muatan peramban", async () => {
    bukuBesar();
    const res = await minta("finance", { type: "bank" });
    /* 3 transaksi bank + 2 saldo = 5 → sinkron; tanpa saringan → antrean. */
    expect(res.status).toBe(200);
    await minta("finance", {});
    const [job] = antrean.terbit;
    const berkas = await renderReportPdfJob(job!.payload as { jenis: unknown; params: unknown });
    const lama = lewatRuteLama(financeReportPayloadSchema, muatanPerambanKasBeranda());
    const peramban = generateFinanceReportPDF(lama.balances, lama.transactions, PERUSAHAAN).output(
      "arraybuffer"
    );
    expect(isi(berkas.bytes)).toBe(isi(peramban));
    expect(berkas.filename).toBe("Finance_Report_2026-03-15.pdf");
  });

  it("`statement` (muatan jadi) TIDAK PERNAH diantrekan, berapa pun barisnya", () => {
    expect(REPORT_PDF.statement.sumber).toBe("muatan");
    for (const jenis of ["stock", "opname", "finance"] as const) {
      expect(REPORT_PDF[jenis].sumber, jenis).toBe("parameter");
    }
  });

  it("pekerjaan dengan jenis/parameter yang tidak sah MELEMPAR, tidak menghasilkan berkas kosong", async () => {
    await expect(renderReportPdfJob({ jenis: "statement", params: {} })).rejects.toThrow();
    await expect(renderReportPdfJob({ jenis: "bukan", params: {} })).rejects.toThrow();
    await expect(renderReportPdfJob({ jenis: "opname", params: { date: 5 } })).rejects.toThrow();
  });
});

/* ══ 3. Otorisasi ═══════════════════════════════════════════════════════════ */

describe("otorisasi: izin per jenis, dan buku PT lain tidak terjangkau", () => {
  it("izin yang dituntut milik JENISNYA (izin halamannya)", async () => {
    await minta("stock", {});
    await minta("opname", { date: "2026-03-14", showSystemQty: false });
    await minta("finance", {});
    expect(penjaga.izinDiminta).toEqual(["inventory.read", "inventory.write", "cash.read"]);
  });

  it("ditolak penjaga (mis. bukan anggota PT yang diminta → 404): nol baris buku dibaca, nol pekerjaan", async () => {
    for (const status of [404, 403, 401]) {
      penjaga.tolak = status;
      for (const [jenis, badan] of [
        ["stock", {}],
        ["opname", { date: "2026-03-14", showSystemQty: true }],
        ["finance", {}],
      ] as const) {
        const res = await minta(jenis, badan);
        expect(res.status, `${jenis} ${status}`).toBe(status);
      }
    }
    expect(buku.dibaca).toBe(0);
    expect(antrean.terbit).toEqual([]);
  });

  it("jenis asing: 404 tanpa menyentuh penjaga maupun buku", async () => {
    const res = await minta("payroll", {});
    expect(res.status).toBe(404);
    expect(penjaga.izinDiminta).toEqual([]);
    expect(buku.dibaca).toBe(0);
  });
});

describe("hasil berantre: pintu bertenant dengan izin JENIS LAPORAN", () => {
  const params = { tenantSlug: "pt-a", companySlug: "buku-a", kind: "report.pdf", id: "77" };
  const ambil = (cari: string, p: Record<string, string> = params) =>
    ambilHasil(new Request(`http://app.test/api/t/pt-a/buku-a/jobs/report.pdf/77/result${cari}`), {
      params: Promise.resolve(p as typeof params),
    });
  const jobKas = (companyId: number) => ({
    id: 77,
    kind: "report.pdf",
    status: "queued",
    tenantId: 1,
    companyId,
    resultRef: null,
    payload: { jenis: "finance", params: {} },
  });

  it("tanpa `?jenis=`, atau jenis yang tak bisa diantrekan: 404 SEBELUM penjaga", async () => {
    for (const cari of ["", "?jenis=", "?jenis=statement", "?jenis=bukan"]) {
      expect((await ambil(cari)).status, cari).toBe(404);
    }
    expect(penjaga.izinDiminta).toEqual([]);
  });

  it("izin gerbang pertama diturunkan dari jenisnya", async () => {
    antrean.job = jobKas(1);
    await ambil("?jenis=finance");
    expect(penjaga.izinDiminta).toEqual(["cash.read"]);
  });

  it("pekerjaan milik PT LAIN dijawab 404", async () => {
    antrean.job = jobKas(2);
    expect((await ambil("?jenis=finance")).status).toBe(404);
  });

  it("alamat menyebut jenis berizin longgar untuk hasil jenis berizin ketat: 404", async () => {
    /* `inventory.read` (semua peran) tidak boleh membuka hasil laporan kas. */
    antrean.job = jobKas(1);
    expect((await ambil("?jenis=stock")).status).toBe(404);
  });

  it("PT sendiri, jenis cocok, belum selesai: 409 — sesudah gerbang kedua memeriksa izin jenis dari MUATAN", async () => {
    antrean.job = jobKas(1);
    const res = await ambil("?jenis=finance");
    expect(res.status).toBe(409);
    expect(efektif.diperiksa).toEqual(["cash.read"]);
  });

  it("gerbang kedua menolak (izin dicabut sesudah pekerjaan lahir): 404", async () => {
    antrean.job = jobKas(1);
    efektif.boleh = false;
    expect((await ambil("?jenis=finance")).status).toBe(404);
  });

  it("gerbang kedua menolak muatan tanpa jenis, jenis `statement`, jenis asing, atau jenis ≠ alamat", async () => {
    const user = { id: "u1", role: "managing_director" };
    expect(await bolehAmbilHasil("report.pdf", {}, user, { jenis: "opname" })).toBe(false);
    expect(await bolehAmbilHasil("report.pdf", null, user, { jenis: "opname" })).toBe(false);
    expect(await bolehAmbilHasil("report.pdf", { jenis: "statement" }, user, { jenis: "statement" })).toBe(false);
    expect(await bolehAmbilHasil("report.pdf", { jenis: "x" }, user, { jenis: "x" })).toBe(false);
    /* Jenis alamat ≠ jenis muatan, atau tanpa jenis alamat sama sekali: tolak. */
    expect(await bolehAmbilHasil("report.pdf", { jenis: "opname" }, user, { jenis: "stock" })).toBe(false);
    expect(await bolehAmbilHasil("report.pdf", { jenis: "opname" }, user)).toBe(false);
    expect(await bolehAmbilHasil("report.pdf", { jenis: "opname" }, user, { jenis: "opname" })).toBe(true);
    expect(efektif.diperiksa).toEqual(["inventory.write"]);
  });
});
