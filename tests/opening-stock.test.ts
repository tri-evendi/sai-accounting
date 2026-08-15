/**
 * Saldo awal PERSEDIAAN per barang + rekonsiliasinya (issue #379).
 *
 * ══ CACAT YANG DIJAGA DI SINI ══════════════════════════════════════════════
 * Nilai persediaan dijawab dua tempat dari sumber terpisah: Neraca membacanya
 * dari baris jurnal, laporan stok dari `stock_movements`. Dalam operasi normal
 * keduanya sinkron secara konstruksi — satu pembelian menerbitkan keduanya.
 * Jalur PEMBUKAAN adalah satu-satunya tempat rangkaian itu putus, dan ia putus
 * ke dua arah: wisaya menerbitkan jurnal tanpa gerakan stok, `/inventory/update`
 * menerbitkan gerakan stok tanpa jurnal.
 *
 * ⚠ Catatan untuk pembaca berikutnya: versi pertama temuan ini menyebutnya
 * "tercatat dua kali". Itu SALAH — `buildStockMovementEntry` memulangkan `null`
 * untuk gerakan `in`, jadi stok masuk manual tidak pernah memposting apa pun.
 * Tes di bawah menguncinya supaya koreksi itu tidak hilang lagi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { openingStockTotal, openingStockValue } from "@/lib/opening-balance";
import {
  INVENTORY_TOLERANCE,
  inventoryVerdictKey,
  reconcileInventory,
} from "@/lib/inventory-reconciliation";

const row = (quantity: number, unitCost: number) => ({
  itemId: 1,
  itemName: "Kopi",
  quantity,
  unitCost,
});

describe("nilai saldo awal persediaan", () => {
  it("nilai satu baris = kuantitas × harga pokok", () => {
    expect(openingStockValue(row(12.5, 80_000))).toBe(1_000_000);
  });

  it("dibulatkan dua desimal — kuantitas boleh 3 desimal, uang tidak", () => {
    // Kuantitas `Decimal(15,3)` × harga `Decimal(15,2)` menghasilkan lebih dari
    // dua desimal; yang masuk jurnal harus uang, bukan pecahan sen.
    expect(openingStockValue(row(0.333, 1_000))).toBe(333);
    expect(openingStockValue(row(1.5, 3.33))).toBe(5);
    expect(openingStockValue(row(3, 1.115))).toBe(3.35);
  });

  it("total = jumlah seluruh barisnya", () => {
    expect(openingStockTotal([row(2, 1_500), row(3, 2_000)])).toBe(9_000);
  });

  it("daftar kosong = nol, bukan lemparan — perusahaan jasa memang tanpa stok", () => {
    expect(openingStockTotal([])).toBe(0);
  });
});

describe("rekonsiliasi persediaan", () => {
  it("dua angka yang sama → seimbang", () => {
    const r = reconcileInventory(9_000, 9_000);
    expect(r.balanced).toBe(true);
    expect(r.difference).toBe(0);
    expect(inventoryVerdictKey(r)).toBe("reports.inventoryReconciled");
  });

  it("selisih pembulatan tidak berbunyi", () => {
    // Rata-rata tertimbang membagi dan membulatkan tiap langkah; saldo akun
    // menjumlah baris yang sudah bulat. Beberapa sen bukan cacat, dan penjaga
    // yang berbunyi untuk Rp 0,01 akan dimatikan orang dalam seminggu.
    expect(reconcileInventory(9_000.4, 9_000).balanced).toBe(true);
    expect(reconcileInventory(9_000, 9_000 + INVENTORY_TOLERANCE).balanced).toBe(true);
  });

  it("selisih sebesar satu dokumen berbunyi", () => {
    expect(reconcileInventory(9_000, 0).balanced).toBe(false);
  });

  it("ARAHNYA disebut — keduanya menuntut pemeriksaan yang berbeda", () => {
    // Stok lebih besar = ada barang masuk tanpa jurnal.
    expect(inventoryVerdictKey(reconcileInventory(9_000, 0))).toBe(
      "reports.inventoryStockHigher"
    );
    // Buku besar lebih besar = ada jurnal tanpa barang — persis gejala wisaya
    // gelondongan sebelum #379.
    expect(inventoryVerdictKey(reconcileInventory(0, 9_000))).toBe(
      "reports.inventoryLedgerHigher"
    );
  });
});

describe("jalur pembukaan menerbitkan KEDUA sisinya (#379)", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "lib", "opening-balance.ts"),
    "utf8"
  );

  it("satu baris jurnal untuk TOTAL, bukan satu per barang", () => {
    // Buku besar mencatat nilai; rinciannya per barang adalah urusan buku
    // pembantu — dan jurnal pembuka dengan 2.000 baris mustahil dibaca manusia.
    expect(src).toContain("openingStockTotal(input.inventory)");
  });

  it("gerakan stok pembuka diterbitkan, per barang", () => {
    expect(src).toContain("tx.stockMovement.create");
    expect(src).toMatch(/type:\s*"in"/);
  });

  it("gerakan pembukanya bertanggal SAMA dengan jurnal pembuka", () => {
    // Rata-rata tertimbang membaca gerakan urut waktu; stok yang seolah masuk
    // sesudah transaksi pertama akan salah menghargai HPP-nya.
    const blok = src.slice(src.indexOf("tx.stockMovement.create"));
    expect(blok.slice(0, 400)).toContain("input.company.fiscalYearStart");
  });

  it("harga pokoknya ikut — tanpa itu laporan stok tak punya nilai", () => {
    const blok = src.slice(src.indexOf("tx.stockMovement.create"));
    expect(blok.slice(0, 400)).toContain("unitCost: row.unitCost");
  });

  it("TIDAK memanggil postForSource", () => {
    /*
     * Bukan karena akan menggandakan — `buildStockMovementEntry` memulangkan
     * `null` untuk gerakan `in`. Justru karena itu: sebuah pemanggilan yang
     * tidak melakukan apa-apa akan disalahpahami orang berikutnya sebagai
     * "di sinilah jurnalnya terbit", padahal nilainya sudah ada di jurnal
     * pembuka satu baris di atas.
     */
    // Komentar dilucuti: berkas itu MENJELASKAN kenapa `postForSource` tidak
    // dipanggil, dan penjelasannya bukan pemanggilan.
    const kode = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(kode).not.toContain("postForSource");
  });
});

describe("stok masuk manual memang tidak pernah memposting jurnal", () => {
  it("aturan postingnya menolak gerakan selain `out`", () => {
    // Inilah fakta yang membuat versi pertama temuan #379 salah. Ia dikunci di
    // sini supaya koreksinya tidak hilang, dan supaya siapa pun yang kelak
    // membuat stok masuk MEMPOSTING sesuatu harus melewati tes ini lebih dulu
    // — sebab saat itu jalur pembukaan BENAR-BENAR akan menggandakan.
    const posting = readFileSync(
      join(process.cwd(), "src", "lib", "posting", "index.ts"),
      "utf8"
    );
    expect(posting).toContain('if (movement.type !== "out") return null;');
  });
});
