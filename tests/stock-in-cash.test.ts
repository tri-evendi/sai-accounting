/**
 * Barang masuk yang UANGNYA ikut keluar (5 Sep 2026).
 *
 * ══ Kenapa fitur ini ada ═══════════════════════════════════════════════════
 * Barang yang dibeli tunai di gudang tidak melewati layar Pembelian: tidak ada
 * hutang yang terbit, tidak ada pelunasan yang menutupnya, dan sampai sekarang
 * tidak ada satu pun baris yang mengatakan kasnya berkurang. Stoknya bertambah,
 * uangnya diam — dan selisih itu baru terlihat saat kas fisik dihitung.
 *
 * ══ Kenapa BUKAN pembelian pemasok ═════════════════════════════════════════
 * Jalur pemasok akan menerbitkan hutang lalu melunasinya pada detik yang sama,
 * dan halaman Kas & Bank — yang membaca `cash_movements`, BUKAN buku besar —
 * tetap tidak akan menampilkan apa pun. Yang dituntut pengguna justru saldo di
 * halaman itu, jadi barisnya harus `cash_movements`.
 *
 * ══ Yang diuji di sini, dan akibatnya bila salah ═══════════════════════════
 *  1. Tanpa `cashType`, TIDAK ADA baris kas sama sekali — kalau ini rusak,
 *     setiap penerimaan barang dari wisaya pembelian mengeluarkan uang kedua
 *     kalinya di atas pelunasan yang sudah ada.
 *  2. Nominalnya `quantity × unitCost` dan akun lawannya slot `inventory` yang
 *     DISELESAIKAN SERVER — bukan id titipan pemanggil, sebab `cash_movement`
 *     adalah satu-satunya aturan posting yang menuntut akun lawan dari luar.
 *  3. Izinnya DUA. `inventory.write` saja tidak pernah berarti "boleh
 *     mengeluarkan uang perusahaan".
 *  4. Arah selain MASUK menolak `cashType` di skema — yang keluar tidak dibayar
 *     siapa pun, dan susut proses adalah pembebanan, bukan pengeluaran uang.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stockUpdateSchema } from "@/lib/validations/inventory";

/* ── Dunia palsu ─────────────────────────────────────────────────────────── */

const created = { id: 77, itemId: 1, quantity: 200, type: "in", item: { name: "NUTMEG ABC" } };

const db = vi.hoisted(() => ({
  stockMovement: { create: vi.fn() },
  cashMovement: { create: vi.fn() },
  supplier: { findUnique: vi.fn() },
  item: { findUnique: vi.fn() },
}));

const postForSource = vi.hoisted(() => vi.fn(async () => null));
const resolveAccountId = vi.hoisted(() => vi.fn(async () => 1104));
/** Izin yang sedang berlaku; tes mengubahnya untuk menutup `cash.write`. */
const granted = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...db,
    // Callback dijalankan dengan klien yang SAMA: seluruh tulisan satu gerakan
    // stok memang harus hidup atau mati bersama.
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireApiPermission: async (permission: string) =>
    granted.has(permission)
      ? { authorized: true, session: { user: { id: "5", email: "a@b.c", role: "staff" } }, companyId: 1 }
      : { authorized: false, response: new Response(null, { status: 403 }) },
}));

vi.mock("@/lib/posting", () => ({ postForSource }));

vi.mock("@/lib/posting/mapping", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/posting/mapping")>()),
  resolveAccountId,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/i18n/server", () => ({
  getRequestI18n: async () => ({ dictionary: null, t: (key: string) => key }),
}));

const { POST } = await import("@/app/api/inventory/route");

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const stockIn = {
  itemId: 1,
  type: "in",
  quantity: 200,
  unitCost: 5_000,
  date: "2026-09-05",
  note: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  granted.clear();
  granted.add("inventory.write");
  granted.add("cash.write");
  db.stockMovement.create.mockResolvedValue(created);
  db.cashMovement.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 900,
    ...data,
  }));
  db.supplier.findUnique.mockResolvedValue(null);
});

describe("gerakan stok masuk TANPA pemotongan kas — perilaku lama, utuh", () => {
  it("tidak menulis satu pun baris kas", async () => {
    const res = await POST(request(stockIn));
    expect(res.status).toBe(201);
    expect(db.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(db.cashMovement.create).not.toHaveBeenCalled();
  });

  it("hanya memposting gerakan stoknya — dan gerakan MASUK memang tak berjurnal", async () => {
    await POST(request(stockIn));
    expect(postForSource).toHaveBeenCalledTimes(1);
    expect(postForSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "stock_movement", sourceId: 77 })
    );
  });
});

describe("gerakan stok masuk DENGAN pemotongan kas", () => {
  it("menulis satu baris kas keluar senilai quantity × unitCost", async () => {
    const res = await POST(request({ ...stockIn, cashType: "kas_besar" }));
    expect(res.status).toBe(201);

    const data = db.cashMovement.create.mock.calls[0][0].data;
    expect(data.type).toBe("kas_besar");
    // 200 × 5.000 — perkalian yang SAMA dengan yang masuk ke persediaan, jadi
    // kedua sisi jurnal tidak bisa berselisih.
    expect(Number(data.credit)).toBe(1_000_000);
    expect(Number(data.debit)).toBe(0);
    expect(data.currency).toBe("IDR");
    // Rupiah lawan rupiah: kurs 1 dan base_amount = nominalnya sendiri.
    expect(Number(data.rate)).toBe(1);
    expect(Number(data.baseAmount)).toBe(1_000_000);
    // Jejak balik ke gerakannya — `cash_movements` tidak punya FK ke sana.
    expect(data.note).toContain("#77");
  });

  it("mempostingnya D: Persediaan / K: Kas — akun lawan diselesaikan SERVER", async () => {
    await POST(request({ ...stockIn, cashType: "bank" }));

    expect(resolveAccountId).toHaveBeenCalledWith("inventory", "IDR", expect.anything());
    expect(postForSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "cash_movement",
        sourceId: 900,
        counterAccountId: 1104,
      })
    );
  });

  it("menyebut pemasoknya di keterangan bila ada — itu yang terbaca di Kas & Bank", async () => {
    db.supplier.findUnique.mockResolvedValue({ name: "CV Rempah Jaya" });
    await POST(request({ ...stockIn, supplierId: 3, cashType: "bank" }));

    const data = db.cashMovement.create.mock.calls[0][0].data;
    expect(data.description).toContain("NUTMEG ABC");
    expect(data.description).toContain("CV Rempah Jaya");
  });

  it("MENOLAK tanpa izin cash.write — dan tidak menulis apa pun, bukan hanya kasnya", async () => {
    granted.delete("cash.write");
    const res = await POST(request({ ...stockIn, cashType: "bank" }));

    expect(res.status).toBe(403);
    expect(db.stockMovement.create).not.toHaveBeenCalled();
    expect(db.cashMovement.create).not.toHaveBeenCalled();
  });
});

describe("stockUpdateSchema — cashType hanya pada arah MASUK", () => {
  it("menerima ketiga kas pada barang masuk", () => {
    for (const cashType of ["bank", "kas_besar", "kas_kecil"]) {
      const r = stockUpdateSchema.safeParse({ ...stockIn, cashType });
      expect(r.success, cashType).toBe(true);
    }
  });

  it("NULL saat tidak disebut — dan itu bukan isian yang terlewat", () => {
    const r = stockUpdateSchema.safeParse(stockIn);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cashType).toBeNull();
  });

  it("MENOLAK pada barang keluar dan pada susut proses", () => {
    for (const type of ["out", "shrinkage"]) {
      const r = stockUpdateSchema.safeParse({
        ...stockIn,
        type,
        unitCost: undefined,
        shrinkageValue: type === "shrinkage" ? 1_000_000 : undefined,
        cashType: "bank",
      });
      expect(r.success, type).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("cashType"))).toBe(true);
      }
    }
  });
});
