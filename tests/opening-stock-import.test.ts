/**
 * IMPOR SALDO STOK AWAL (issue #381 — berkas terakhir dari enam).
 *
 * == Yang ditutup berkas ini ================================================
 * Tahap 4 #381 menyebut stok awal sebagai "sudah ada lewat #379, tinggal jalur
 * impornya", dan jalur itu tidak pernah dibuat: `master/opening` hanya mengenal
 * `receivables | payables | fixed-assets`. Stok awal hanya bisa DIKETIK satu
 * per satu di wisaya — berbenturan dengan kriteria selesai #381 sendiri,
 * *"tanpa mengetik ulang"*.
 *
 * == Sifat yang paling menentukan ==========================================
 * Barang dicocokkan lewat KODE, bukan nama. Sejak #493 dua barang boleh
 * bernama sama persis, dan berkas saldo awal yang dicocokkan namanya tidak bisa
 * menyatakan barang mana yang dimaksud.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseOpeningStockRows,
  OPENING_STOCK_COLUMNS,
} from "@/lib/import/opening-stock";

const HEADER = ["Kode Barang", "Nama Barang", "Kuantitas", "Harga Pokok"];

const route = readFileSync(
  join(
    __dirname,
    "..",
    "src",
    "app",
    "api",
    "t",
    "[tenantSlug]",
    "[companySlug]",
    "master",
    "opening",
    "route.ts"
  ),
  "utf8"
);

describe("bentuk berkasnya", () => {
  it("kode, kuantitas, dan harga pokok WAJIB; nama opsional", () => {
    const wajib = OPENING_STOCK_COLUMNS.filter((c) => c.required).map((c) => c.key);
    expect(wajib.sort()).toEqual(["code", "quantity", "unitCost"]);
    expect(OPENING_STOCK_COLUMNS.find((c) => c.key === "name")?.required).toBeFalsy();
  });

  it("petunjuk kolom Nama MENGATAKAN bahwa yang dicocokkan kodenya", () => {
    /* Tanpa kalimat itu, orang akan menyunting nama di berkas dan menyangka ia
       mengubah barang yang dituju. */
    const name = OPENING_STOCK_COLUMNS.find((c) => c.key === "name");
    expect(name?.hint).toMatch(/KODE/);
  });

  it("membaca baris yang sah", () => {
    const { rows, errors } = parseOpeningStockRows([
      HEADER,
      ["100003", "BLACK PEPPER", "1624.36", "54000"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      code: "100003",
      name: "BLACK PEPPER",
      quantity: 1624.36,
      unitCost: 54000,
    });
  });

  it("nama boleh kosong", () => {
    const { rows, errors } = parseOpeningStockRows([HEADER, ["100003", "", "10", "1000"]]);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBeNull();
  });

  it("kolom wajib yang hilang = kesalahan BERKAS, dilaporkan di baris judul", () => {
    const { rows, errors } = parseOpeningStockRows([["Kuantitas"], ["10"]]);
    expect(rows).toEqual([]);
    expect(errors[0].row).toBe(1);
    expect(errors[0].message).toContain("Kode Barang");
  });
});

describe("nol dan negatif ditolak — aturan yang sama dengan wisaya", () => {
  /* `openingStockSchema` menuntut keduanya positif, dan alasannya sama: baris
     nol tidak menambah apa pun ke jurnal maupun ke stok. */
  it("kuantitas nol", () => {
    expect(parseOpeningStockRows([HEADER, ["100003", "", "0", "1000"]]).rows).toEqual([]);
  });

  it("harga pokok nol", () => {
    expect(parseOpeningStockRows([HEADER, ["100003", "", "10", "0"]]).rows).toEqual([]);
  });

  it("kuantitas negatif", () => {
    const { rows, errors } = parseOpeningStockRows([HEADER, ["100003", "", "-5", "1000"]]);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe("kode ganda di dalam berkas ditolak, tidak dijumlahkan", () => {
  it("baris kedua gugur dan barisnya disebut", () => {
    /* Di berkas saldo awal, dua baris untuk satu barang hampir selalu berarti
       berkasnya salah susun. Menjumlahkannya diam-diam menyembunyikan itu. */
    const { rows, errors, duplicateCodesInFile } = parseOpeningStockRows([
      HEADER,
      ["100003", "BLACK PEPPER", "10", "1000"],
      ["100003", "BLACK PEPPER", "5", "1000"],
    ]);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(duplicateCodesInFile).toEqual(["100003"]);
  });

  it("dua barang BERNAMA SAMA dengan kode beda justru LOLOS — kasus #493", () => {
    /* `LONG PEPPER` 100006 & 100010 di berkas saldo awal 2024 pengguna. Berkas
       inilah yang membuat #493 ada; menolaknya di sini akan mengulang cacatnya. */
    const { rows, errors } = parseOpeningStockRows([
      HEADER,
      ["100006", "LONG PEPPER", "1101", "50000"],
      ["100010", "LONG PEPPER", "13684.06", "13500"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.code)).toEqual(["100006", "100010"]);
  });
});

describe("route: dicocokkan lewat kode, dan tidak menulis apa pun", () => {
  it("jenis `stock` dikenali", () => {
    expect(route).toMatch(/raw === "stock"/);
    expect(route).toMatch(/parseOpeningStockRows\(/);
  });

  it("mencocokkan KODE, bukan nama", () => {
    /*
     * Diperiksa DI DALAM cabang `stock` saja. `byName` memang ada di route ini
     * dan memang benar — ia mencocokkan PELANGGAN/PEMASOK untuk piutang & utang
     * awal, tempat nama memang pengenalnya. Asersi setingkat-berkas akan
     * menuduhnya, dan asersi yang menuduh hal benar adalah asersi yang cepat
     * dilonggarkan orang berikutnya.
     */
    const mulai = route.indexOf('if (kind === "stock")');
    const selesai = route.indexOf('if (kind === "fixed-assets")', mulai);
    expect(mulai).toBeGreaterThan(-1);
    const cabang = route.slice(mulai, selesai);

    expect(cabang).toMatch(/byCode\s*=\s*new Map/);
    expect(cabang).toMatch(/i\.code\.trim\(\)\.toLowerCase\(\)/);
    /* Nama dari berkas tidak boleh jadi dasar pencocokan di cabang ini. */
    expect(cabang).not.toMatch(/byName/);
  });

  it("nama yang dipulangkan diambil dari MASTER, bukan dari berkas", () => {
    /* Berkas boleh menuliskannya sekenanya; yang dilihat pengguna saat meninjau
       harus nama yang benar-benar akan dipakai bukunya. */
    expect(route).toMatch(/name: item\.name/);
  });

  it("route ini PARSER — tidak menulis stok maupun jurnal", () => {
    /*
     * Nilainya masuk ke buku bersama jurnal pembukanya di
     * `applyOpeningBalances`, satu transaksi sekali-jalan. Route yang menulis
     * stoknya lebih dulu akan meninggalkan gerakan tanpa jurnal bila langkah
     * kedua gagal — persis cacat yang #387 tutup.
     */
    expect(route).not.toMatch(/stockMovement\.create/);
    expect(route).not.toMatch(/postForSource/);
  });

  it("kode yang tidak ada dijawab per BARIS, dengan kode yang tersedia disebut", () => {
    expect(route).toMatch(/belum ada\.\$\{hint\}/);
    expect(route).toMatch(/Kode yang tersedia/);
  });
});
