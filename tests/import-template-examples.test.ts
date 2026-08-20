/**
 * Templat impor harus SALING cocok, bukan hanya cocok dengan validatornya
 * sendiri (issue #426).
 *
 * `template.ts` sudah menutup separuh masalahnya: templat dan validator lahir
 * dari `ColumnSpec` yang sama, jadi sebuah templat tidak bisa ditolak oleh
 * parser-nya sendiri. Yang lolos dari jaring itu adalah hubungan ANTAR templat.
 *
 * Templat piutang/utang awal mencontohkan sebuah nama mitra, lalu route-nya
 * menuntut nama itu sudah terdaftar. Nama contohnya dulu "PT Maju Bersama",
 * sementara templat pelanggan mencontohkan "PT Contoh Sejahtera" — sehingga
 * pengguna yang mengikuti kedua templat berurutan ditolak, dengan pesan yang
 * menuduhnya salah menulis nama.
 */
import { describe, expect, it } from "vitest";

import { CUSTOMER_COLUMNS, ITEM_COLUMNS, SUPPLIER_COLUMNS } from "@/lib/import/master";
import { OPENING_AP_COLUMNS, OPENING_AR_COLUMNS } from "@/lib/import/opening-ar-ap";
import { FIXED_ASSET_COLUMNS } from "@/lib/import/fixed-assets";
import { EXAMPLE_PARTNER_NAME, type ColumnSpec } from "@/lib/import/spec";

const example = (columns: readonly ColumnSpec[], key: string) =>
  columns.find((c) => c.key === key)?.example;

describe("contoh nama mitra sama di seluruh templat", () => {
  it("templat pelanggan memakai nama contoh bersama", () => {
    expect(example(CUSTOMER_COLUMNS, "name")).toBe(EXAMPLE_PARTNER_NAME);
  });

  it("templat pemasok memakai nama contoh bersama", () => {
    expect(example(SUPPLIER_COLUMNS, "name")).toBe(EXAMPLE_PARTNER_NAME);
  });

  it("templat piutang awal menunjuk pelanggan yang ada di templat pelanggan", () => {
    expect(example(OPENING_AR_COLUMNS, "partner")).toBe(example(CUSTOMER_COLUMNS, "name"));
  });

  it("templat utang awal menunjuk pemasok yang ada di templat pemasok", () => {
    expect(example(OPENING_AP_COLUMNS, "partner")).toBe(example(SUPPLIER_COLUMNS, "name"));
  });
});

describe("setiap kolom wajib membawa contohnya", () => {
  /* Kolom wajib tanpa contoh membuat baris contoh di templat berisi sel kosong
     tepat di tempat yang tidak boleh kosong — templat yang menolak dirinya
     sendiri, bentuk kegagalan yang `template.ts` ada untuk mencegahnya. */
  const ALL: [string, readonly ColumnSpec[]][] = [
    ["pelanggan", CUSTOMER_COLUMNS],
    ["pemasok", SUPPLIER_COLUMNS],
    ["barang", ITEM_COLUMNS],
    ["piutang awal", OPENING_AR_COLUMNS],
    ["utang awal", OPENING_AP_COLUMNS],
    ["aset tetap", FIXED_ASSET_COLUMNS],
  ];

  for (const [name, columns] of ALL) {
    it(`templat ${name}`, () => {
      const missing = columns.filter((c) => c.required && !c.example).map((c) => c.header);
      expect(missing).toEqual([]);
    });
  }
});
