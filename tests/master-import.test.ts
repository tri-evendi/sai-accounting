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
  /* Kode ikut sejak #493 — ia yang menjadi identitas barang, dan wajib. */
  const HEADER = ["Kode", "Nama", "Satuan"];

  it("kode + nama + satuan", () => {
    const { rows } = parseItemRows([HEADER, ["100001", "Kopi Arabika", "kg"]]);
    expect(rows[0]).toEqual({ code: "100001", name: "Kopi Arabika", unit: "kg" });
  });

  it("satuan opsional", () => {
    expect(parseItemRows([HEADER, ["100002", "Jasa Angkut"]]).rows[0].unit).toBeNull();
  });

  it("satuan lebih dari 20 karakter ditolak — kolomnya memang sesempit itu", () => {
    const { errors } = parseItemRows([HEADER, ["100003", "Kopi", "x".repeat(21)]]);
    expect(errors[0].message).toContain("20 karakter");
  });

  it("kode WAJIB — baris tanpa kode tidak bisa dibedakan dari barang lain", () => {
    const { rows, errors } = parseItemRows([HEADER, ["", "Kopi", "kg"]]);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
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
      ["ID Lama", "Kode", "Nama", "Kategori"],
      ["X-99", "100001", "Kopi", "Minuman"],
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
    expect(errors[0].message).toContain("Kode");
  });

  it("KODE kembar di dalam berkas ditolak, menyebut baris pertamanya", () => {
    /* Sejak #493 yang kembar diperiksa adalah kode, bukan nama — lihat catatan
       pada `parseMaster`. Nama kembar justru harus LOLOS (uji berikutnya). */
    const { rows, errors, duplicateNamesInFile } = parseItemRows([
      ["Kode", "Nama"],
      ["100001", "Kopi"],
      ["100002", "Teh"],
      ["100001", "Kopi Lain"],
    ]);
    expect(rows.map((r) => r.code)).toEqual(["100001", "100002"]);
    expect(errors[0].message).toContain("baris 2");
    expect(duplicateNamesInFile).toEqual(["100001"]);
  });

  it("NAMA kembar berkode beda justru LOLOS — kasus nyata #493", () => {
    /* `LONG PEPPER` 100006 & 100010 di berkas saldo awal 2024 pengguna: dua
       mutu berbeda yang harga satuannya berselisih hampir empat kali lipat.
       Menolaknya berarti menolak berkas yang menjadi alasan #493 ada. */
    const { rows, errors } = parseItemRows([
      ["Kode", "Nama"],
      ["100006", "LONG PEPPER"],
      ["100010", "LONG PEPPER"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("kembar tidak peka huruf besar-kecil", () => {
    // "a1" dan "A1" adalah satu kode bagi manusia, dan `items.code` unik di
    // basis data — menerima keduanya hanya menunda galatnya ke saat menulis.
    const { errors } = parseItemRows([
      ["Kode", "Nama"],
      ["a1", "Kopi"],
      ["A1", "Teh"],
    ]);
    expect(errors).toHaveLength(1);
  });

  it("baris kosong dilewati", () => {
    const { rows, errors } = parseItemRows([
      ["Kode", "Nama"],
      ["100001", "Kopi"],
      [""],
      [],
      ["100002", "Teh"],
    ]);
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
