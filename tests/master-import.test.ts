/**
 * Impor master data — pelanggan, pemasok, barang (issue #381, tahap 2).
 *
 * Yang dijaga di sini adalah sifat-sifat yang membedakan impor yang BISA
 * dipakai dari impor yang secara teknis bekerja: berkas orang lain diterima apa
 * adanya (urutan kolom bebas, kolom asing diabaikan), setiap baris salah
 * dilaporkan sekali dengan seluruh masalahnya, dan tidak ada satu pun nilai
 * yang ditebak diam-diam.
 */
import { describe, expect, it } from "vitest";

import {
  CUSTOMER_COLUMNS,
  ITEM_COLUMNS,
  SUPPLIER_COLUMNS,
  parseCustomerRows,
  parseItemRows,
  parseSupplierRows,
} from "@/lib/import/master";
import { buildTemplate } from "@/lib/import/template";

describe("impor pelanggan", () => {
  const HEADER = ["Nama", "Alamat", "Telepon", "Email", "PIC", "NPWP", "Bebas PPN"];

  it("baris lengkap terbaca utuh", () => {
    const { rows, errors } = parseCustomerRows([
      HEADER,
      ["PT Maju", "Jl. Merdeka 1", "021-111", "a@b.co.id", "Budi", "01.234.567.8-901.000", "Ya"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      name: "PT Maju",
      address: "Jl. Merdeka 1",
      phone: "021-111",
      email: "a@b.co.id",
      pic: "Budi",
      npwp: "01.234.567.8-901.000",
      taxExempt: true,
    });
  });

  it("hanya Nama yang wajib", () => {
    const { rows, errors } = parseCustomerRows([HEADER, ["PT Minim", "", "", "", "", "", ""]]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "PT Minim", address: null, taxExempt: false });
  });

  it("Bebas PPN kosong berarti TIDAK bebas", () => {
    // Memperlakukan sel kosong sebagai "bebas PPN" akan diam-diam menghapus
    // pajak dari setiap faktur pelanggan yang kolomnya tidak diisi.
    expect(parseCustomerRows([HEADER, ["PT X"]]).rows[0].taxExempt).toBe(false);
  });

  it("Bebas PPN yang tidak dikenali DITOLAK, bukan dianggap tidak", () => {
    // Kolom ini menentukan apakah pajak dikenakan; "Iyaa" yang salah eja tidak
    // boleh diam-diam berarti "tidak".
    const { errors, rows } = parseCustomerRows([HEADER, ["PT X", "", "", "", "", "", "Iyaa"]]);
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain("Iyaa");
  });

  it("beberapa bentuk Ya/Tidak diterima", () => {
    const { rows } = parseCustomerRows([
      HEADER,
      ["A", "", "", "", "", "", "ya"],
      ["B", "", "", "", "", "", "TRUE"],
      ["C", "", "", "", "", "", "1"],
      ["D", "", "", "", "", "", "tidak"],
      ["E", "", "", "", "", "", "-"],
    ]);
    expect(rows.map((r) => r.taxExempt)).toEqual([true, true, true, false, false]);
  });

  it("email yang jelas bukan alamat ditolak — hampir selalu kolom tergeser", () => {
    const { errors } = parseCustomerRows([HEADER, ["PT X", "", "", "bukan email", "", "", ""]]);
    expect(errors[0].message).toContain("tidak berbentuk alamat surel");
  });

  it("SELURUH masalah satu baris dilaporkan sekaligus", () => {
    const { errors } = parseCustomerRows([HEADER, ["", "", "", "salah", "", "", "mungkin"]]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Nama");
    expect(errors[0].message).toContain("surel");
    expect(errors[0].message).toContain("mungkin");
  });
});

describe("impor pemasok", () => {
  it("bentuknya sama dengan pelanggan, tanpa kolom pajak", () => {
    const { rows, errors } = parseSupplierRows([
      ["Nama", "Alamat", "Telepon", "Email"],
      ["CV Sumber", "Jl. Ikan 9", "0812", "s@x.co.id"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      name: "CV Sumber",
      address: "Jl. Ikan 9",
      phone: "0812",
      email: "s@x.co.id",
    });
  });
});

describe("impor barang", () => {
  const HEADER = ["Nama", "Satuan"];

  it("nama + satuan", () => {
    const { rows } = parseItemRows([HEADER, ["Kopi Arabika", "kg"]]);
    expect(rows[0]).toEqual({ name: "Kopi Arabika", unit: "kg" });
  });

  it("satuan opsional", () => {
    expect(parseItemRows([HEADER, ["Jasa Angkut"]]).rows[0].unit).toBeNull();
  });

  it("satuan lebih dari 20 karakter ditolak — kolomnya memang sesempit itu", () => {
    const { errors } = parseItemRows([HEADER, ["Kopi", "x".repeat(21)]]);
    expect(errors[0].message).toContain("20 karakter");
  });
});

describe("sifat yang berlaku untuk ketiganya", () => {
  it("urutan kolom bebas", () => {
    const { rows } = parseCustomerRows([
      ["Email", "Nama", "Telepon"],
      ["a@b.co.id", "PT Terbalik", "021"],
    ]);
    expect(rows[0]).toMatchObject({ name: "PT Terbalik", email: "a@b.co.id", phone: "021" });
  });

  it("kolom asing diabaikan, bukan ditolak", () => {
    // Berkas ekspor dari aplikasi lain hampir selalu membawa kolom tambahan.
    const { rows, errors } = parseItemRows([
      ["ID Lama", "Nama", "Kategori"],
      ["X-99", "Kopi", "Minuman"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Kopi");
  });

  it("kolom WAJIB hilang = kesalahan BERKAS, dilaporkan di baris judul", () => {
    // Melaporkannya di baris data membuat orang mencari-cari di dalam datanya,
    // padahal yang perlu diperbaiki judulnya.
    const { errors, rows } = parseItemRows([["Satuan"], ["kg"]]);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
    expect(errors[0].message).toContain("Nama");
  });

  it("nama kembar di dalam berkas ditolak, menyebut baris pertamanya", () => {
    const { rows, errors, duplicateNamesInFile } = parseItemRows([
      ["Nama"],
      ["Kopi"],
      ["Teh"],
      ["Kopi"],
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Kopi", "Teh"]);
    expect(errors[0].message).toContain("baris 2");
    expect(duplicateNamesInFile).toEqual(["kopi"]);
  });

  it("kembar tidak peka huruf besar-kecil", () => {
    // "Kopi" dan "KOPI" adalah satu barang bagi manusia, dan `items.name` unik
    // di basis data — menerima keduanya hanya menunda galatnya ke saat menulis.
    const { errors } = parseItemRows([["Nama"], ["Kopi"], ["KOPI"]]);
    expect(errors).toHaveLength(1);
  });

  it("baris kosong dilewati", () => {
    const { rows, errors } = parseItemRows([["Nama"], ["Kopi"], [""], [], ["Teh"]]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });
});

describe("templat lahir dari spesifikasi kolom yang SAMA", () => {
  it("judulnya persis judul yang divalidasi", () => {
    // Ketika templat dan validator ditulis terpisah, mereka menyimpang pada
    // perubahan pertama — dan gejalanya adalah bentuk kegagalan paling
    // membingungkan: berkas yang diunduh dari aplikasi ini ditolak olehnya.
    for (const columns of [CUSTOMER_COLUMNS, SUPPLIER_COLUMNS, ITEM_COLUMNS]) {
      const { rows } = buildTemplate(columns);
      expect(rows[0]).toEqual(columns.map((c) => c.header));
    }
  });

  it("templat yang diunduh, diisi seadanya, LOLOS validasinya sendiri", () => {
    const { rows } = buildTemplate(ITEM_COLUMNS);
    const hasil = parseItemRows(rows);
    expect(hasil.errors).toEqual([]);
    expect(hasil.rows).toHaveLength(1);
  });

  it("satu baris contoh — bukan nol, bukan lima", () => {
    // Nol membuat orang menebak bentuk isiannya; banyak membuat sebagian orang
    // MENYUNTING contohnya alih-alih menggantinya, lalu mengimpor
    // "PT Contoh Sejahtera" ke dalam bukunya sendiri.
    expect(buildTemplate(CUSTOMER_COLUMNS).rows).toHaveLength(2);
  });

  it("legenda menyebut mana yang wajib", () => {
    const { legend } = buildTemplate(CUSTOMER_COLUMNS);
    const namaRow = legend.find((r) => r[0] === "Nama");
    expect(namaRow?.[1]).toBe("WAJIB");
    const alamatRow = legend.find((r) => r[0] === "Alamat");
    expect(alamatRow?.[1]).toBe("opsional");
  });

  it("legenda menyebut aturan yang paling sering ditanyakan", () => {
    const teks = JSON.stringify(buildTemplate(ITEM_COLUMNS).legend);
    expect(teks).toContain("Urutan kolom");
    expect(teks).toContain("hari dulu");
    expect(teks).toContain("TIDAK ADA yang disimpan");
  });
});
