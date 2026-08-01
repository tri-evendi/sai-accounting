/**
 * "Langkah Pertama" — keputusan murninya.
 *
 * Dua hal diuji di sini karena keduanya dipakai SERVER component beranda, dan
 * salahnya tidak berbunyi:
 *
 *  • `visibleFirstSteps` menentukan langkah mana yang benar-benar DIKIRIM ke
 *    browser. Salah di sini bukan tombol yang tersembunyi, melainkan tombol
 *    yang sampai ke orang yang halaman tujuannya akan menolaknya — sambutan
 *    yang berakhir di layar "tidak berizin", pada hari pertamanya memakai
 *    aplikasi ini.
 *
 *  • `isFirstRun` menentukan WUJUD beranda. Salah ke satu arah menyembunyikan
 *    seluruh angka perusahaan yang sudah berjalan; salah ke arah lain
 *    mengembalikan dinding angka nol yang justru dihapus.
 */
import { describe, expect, it } from "vitest";
import { FIRST_STEPS, isFirstRun, visibleFirstSteps } from "@/lib/first-steps";

describe("visibleFirstSteps", () => {
  it("bos mendapat kelima langkah, urut seperti daftar induknya", () => {
    expect(visibleFirstSteps("managing_director").map((s) => s.key)).toEqual([
      "pelanggan",
      "pemasok",
      "stok_awal",
      "penjualan",
      "terima_uang",
    ]);
  });

  it("kepala gudang HANYA diminta mencatat stok awal", () => {
    expect(visibleFirstSteps("warehouse_head").map((s) => s.key)).toEqual(["stok_awal"]);
  });

  it("peran tak dikenal atau kosong tidak diminta apa pun", () => {
    expect(visibleFirstSteps("tamu")).toHaveLength(0);
    expect(visibleFirstSteps(null)).toHaveLength(0);
    expect(visibleFirstSteps(undefined)).toHaveLength(0);
    expect(visibleFirstSteps("")).toHaveLength(0);
  });

  it("set izin efektif menang atas matriks bawaan — ke dua arah", () => {
    // Modul gudang dimatikan (preset Jasa): langkah stoknya ikut hilang, walau
    // matriks bawaan memberi izinnya.
    const tanpaGudang = new Set([
      "customer.write",
      "supplier.write",
      "invoice.write",
      "cash.write",
    ]);
    expect(visibleFirstSteps("managing_director", tanpaGudang).map((s) => s.key)).toEqual([
      "pelanggan",
      "pemasok",
      "penjualan",
      "terima_uang",
    ]);

    // Sebaliknya, override yang menghadiahkan izin memunculkan langkahnya.
    const gudangPlusKas = new Set(["inventory.write", "cash.write"]);
    expect(visibleFirstSteps("warehouse_head", gudangPlusKas).map((s) => s.key)).toEqual([
      "stok_awal",
      "terima_uang",
    ]);
  });

  it("hasilnya tidak mengubah daftar induk", () => {
    const before = FIRST_STEPS.map((s) => s.key);
    visibleFirstSteps("managing_director").reverse();
    expect(FIRST_STEPS.map((s) => s.key)).toEqual(before);
  });

  it("setiap langkah punya tujuan, ikon, label, penjelasan, dan izin halaman tujuannya", () => {
    for (const step of FIRST_STEPS) {
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.icon.length).toBeGreaterThan(0);
      expect(step.label.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(10);
      // Deklarasi izin "resource.action", bukan daftar peran (AGENTS.md).
      expect(step.permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("kunci langkah unik", () => {
    const keys = FIRST_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isFirstRun", () => {
  it("perusahaan tanpa jejak apa pun masih hari pertama", () => {
    expect(isFirstRun({})).toBe(true);
    expect(isFirstRun({ penjualan: false, terima_uang: false, stok_awal: false })).toBe(true);
  });

  it("satu jejak transaksi saja sudah mengembalikan beranda biasa", () => {
    expect(isFirstRun({ penjualan: true })).toBe(false);
    expect(isFirstRun({ terima_uang: true })).toBe(false);
    expect(isFirstRun({ stok_awal: true })).toBe(false);
  });

  it("MASTER DATA saja tidak menghitung — itu belum bekerja, baru bersiap", () => {
    // Perusahaan yang sudah memasukkan pelanggan & pemasok tetapi belum
    // mencatat satu transaksi pun masih butuh sambutannya: beranda biasa akan
    // menyambutnya dengan dinding angka nol yang sama seperti sebelumnya.
    expect(isFirstRun({ pelanggan: true, pemasok: true })).toBe(true);
  });
});
