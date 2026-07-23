/**
 * Aksi Cepat & navigasi tugas (issue #2) — keputusan murninya.
 *
 * Penyaringan peran diuji di sini karena inilah keputusan yang dipakai SERVER
 * component beranda: bila `quickActionsForRole` salah, tombol yang tidak boleh
 * dipakai peran itu benar-benar terkirim ke browser — bukan sekadar tersembunyi.
 */
import { describe, expect, it } from "vitest";
import { QUICK_ACTIONS, quickActionsForRole } from "@/lib/quick-actions";
import {
  NAV_GROUPS,
  NAV_HOME,
  activeNavHref,
  isNavItemVisible,
  visibleNavGroups,
  visibleNavHrefs,
} from "@/lib/nav";

describe("quickActionsForRole", () => {
  it("bos mendapat keenam aksi yang diminta issue #2", () => {
    const keys = quickActionsForRole("bos").map((a) => a.key);
    expect(keys).toEqual([
      "catat_penjualan",
      "catat_pembelian",
      "terima_uang",
      "bayar",
      "tambah_stok",
      "buat_kontrak",
    ]);
  });

  it("core (staf kantor) mendapat aksi yang sama dengan bos", () => {
    expect(quickActionsForRole("core").map((a) => a.key)).toEqual(
      quickActionsForRole("bos").map((a) => a.key)
    );
  });

  it("ptg HANYA mendapat aksi stok", () => {
    const actions = quickActionsForRole("ptg");
    expect(actions.map((a) => a.key)).toEqual(["tambah_stok"]);
    expect(actions.every((a) => a.tone === "stock")).toBe(true);
  });

  it("ptg tidak pernah mendapat aksi uang atau dokumen penjualan", () => {
    const hrefs = quickActionsForRole("ptg").map((a) => a.href);
    expect(hrefs.some((h) => h.startsWith("/finance"))).toBe(false);
    expect(hrefs.some((h) => h.startsWith("/invoices"))).toBe(false);
    expect(hrefs.some((h) => h.startsWith("/contracts"))).toBe(false);
    expect(hrefs.some((h) => h.startsWith("/suppliers"))).toBe(false);
  });

  it("peran tak dikenal atau kosong tidak mendapat aksi apa pun", () => {
    expect(quickActionsForRole("tamu")).toHaveLength(0);
    expect(quickActionsForRole(null)).toHaveLength(0);
    expect(quickActionsForRole(undefined)).toHaveLength(0);
    expect(quickActionsForRole("")).toHaveLength(0);
  });

  it("urutan aslinya dipertahankan dan hasilnya tidak mengubah daftar induk", () => {
    const before = QUICK_ACTIONS.map((a) => a.key);
    quickActionsForRole("bos").reverse();
    expect(QUICK_ACTIONS.map((a) => a.key)).toEqual(before);
  });

  it("setiap aksi punya tujuan, ikon, label, dan penjelasan", () => {
    for (const action of QUICK_ACTIONS) {
      expect(action.href.startsWith("/")).toBe(true);
      expect(action.icon.length).toBeGreaterThan(0);
      expect(action.label.trim().length).toBeGreaterThan(0);
      expect(action.description.trim().length).toBeGreaterThan(10);
      expect(action.roles.length).toBeGreaterThan(0);
    }
  });

  it("kunci aksi unik", () => {
    const keys = QUICK_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("kelompok menu berbasis tugas", () => {
  it("memakai enam area tugas issue #2, dengan Persetujuan (#25) di atasnya", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      // issue #25 — antrean yang menahan pekerjaan orang lain berdiri paling atas.
      "persetujuan",
      "penjualan",
      "pembelian",
      "kas",
      "stok",
      "laporan",
      "pengaturan",
    ]);
  });

  it("tidak ada href ganda di seluruh menu", () => {
    const hrefs = [NAV_HOME.href, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))];
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("wizard terpandu (#5) berdiri di puncak Penjualan & Pembelian", () => {
    // Pintu utama pengguna awam: wizard harus terjangkau dari menu di halaman
    // mana pun, bukan hanya dari Aksi Cepat beranda.
    const penjualan = NAV_GROUPS.find((g) => g.id === "penjualan");
    const pembelian = NAV_GROUPS.find((g) => g.id === "pembelian");
    expect(penjualan?.items[0]?.href).toBe("/sales/new");
    expect(pembelian?.items[0]?.href).toBe("/purchases/new");
    // ptg tidak mendapat pintu wizard — konsisten dengan Aksi Cepat.
    expect(visibleNavHrefs({ role: "ptg" })).not.toContain("/sales/new");
    expect(visibleNavHrefs({ role: "core" })).toContain("/sales/new");
    expect(visibleNavHrefs({ role: "core" })).toContain("/purchases/new");
  });

  it("Surat Jalan masuk kelompok Penjualan, Pusat Laporan masuk Laporan", () => {
    const penjualan = NAV_GROUPS.find((g) => g.id === "penjualan");
    const laporan = NAV_GROUPS.find((g) => g.id === "laporan");
    expect(penjualan?.items.map((i) => i.href)).toContain("/delivery-orders");
    expect(laporan?.items.map((i) => i.href)).toContain("/reports");
  });

  it("Dokumen ikut kelompok Penjualan — arsip ekspor, bukan pengaturan aplikasi", () => {
    const penjualan = NAV_GROUPS.find((g) => g.id === "penjualan");
    const pengaturan = NAV_GROUPS.find((g) => g.id === "pengaturan");
    expect(penjualan?.items.map((i) => i.href)).toContain("/documents");
    expect(pengaturan?.items.map((i) => i.href)).not.toContain("/documents");
  });

  it("tidak ada label kelompok yang kembar dengan label item di dalamnya", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.label, `${group.id} / ${item.href}`).not.toBe(group.label);
      }
    }
  });

  it("ptg hanya melihat persetujuan, stok, beranda, kamus, dan pengaturan", () => {
    const groups = visibleNavGroups({ role: "ptg" });
    // Antrean persetujuan terbuka untuk semua peran — ptg memakainya untuk
    // melihat kabar pengajuannya sendiri — tetapi ATURANNYA tetap bos-only.
    expect(groups.map((g) => g.id)).toEqual(["persetujuan", "stok", "pengaturan"]);
    expect(groups[0].items.map((i) => i.href)).toEqual(["/approvals"]);
    expect(groups[2].items.map((i) => i.href)).toEqual(["/glossary", "/settings"]);
  });

  it("core tidak melihat menu khusus bos (Pusat Laporan, Pengguna)", () => {
    const hrefs = visibleNavHrefs({ role: "core" });
    expect(hrefs).not.toContain("/reports");
    expect(hrefs).not.toContain("/users");
    expect(hrefs).toContain("/invoices");
  });

  it("permukaan akuntansi hanya muncul saat Mode Akuntan efektif ON", () => {
    const on = visibleNavHrefs({ role: "bos", accountantMode: true });
    const off = visibleNavHrefs({ role: "bos", accountantMode: false });
    for (const href of ["/journal", "/ledger", "/accounts"]) {
      expect(on).toContain(href);
      expect(off).not.toContain(href);
    }
    // Bos tanpa preferensi eksplisit → default peran (ON).
    expect(visibleNavHrefs({ role: "bos" })).toContain("/journal");
  });

  it("kelompok yang seluruh isinya tersembunyi ikut hilang", () => {
    const groups = visibleNavGroups({ role: "ptg" });
    expect(groups.some((g) => g.id === "laporan")).toBe(false);
  });

  it("isNavItemVisible menolak peran yang tidak terdaftar", () => {
    // Dicari lewat href, bukan posisi: menyisipkan kelompok baru di atas (mis.
    // Persetujuan #25) tidak boleh diam-diam mengubah item yang diuji.
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/contracts")!;
    expect(isNavItemVisible(item, { role: "ptg" })).toBe(false);
    expect(isNavItemVisible(item, { role: "core" })).toBe(true);
  });
});

describe("activeNavHref", () => {
  const hrefs = ["/dashboard", "/inventory", "/inventory/update", "/inventory/opname", "/invoices"];

  it("menyorot menu yang persis sama", () => {
    expect(activeNavHref("/inventory", hrefs)).toBe("/inventory");
  });

  it("memilih kecocokan TERPANJANG untuk sub-halaman", () => {
    expect(activeNavHref("/inventory/opname", hrefs)).toBe("/inventory/opname");
    expect(activeNavHref("/inventory/update", hrefs)).toBe("/inventory/update");
  });

  it("sub-halaman tanpa menu sendiri menyorot induknya", () => {
    expect(activeNavHref("/invoices/new", hrefs)).toBe("/invoices");
  });

  it("tidak menyorot apa pun untuk path asing", () => {
    expect(activeNavHref("/glossary", hrefs)).toBeNull();
  });

  it("tidak tertipu awalan yang mirip", () => {
    expect(activeNavHref("/inventoryX", hrefs)).toBeNull();
  });
});
