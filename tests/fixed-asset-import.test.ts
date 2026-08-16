/**
 * Impor aset tetap + penjaga penyusutan ganda (issue #381 tahap 4).
 *
 * ══ KENAPA ASET TETAP TIDAK SEPERTI MASTER DATA LAIN ═══════════════════════
 * Pelanggan dan barang cukup dipindahkan namanya. Aset tetap membawa SEJARAH:
 * ia sudah disusutkan bertahun-tahun, dan yang harus ikut pindah bukan hanya
 * harga perolehannya melainkan berapa yang SUDAH disusutkan dan sampai bulan
 * apa. Tanpa keduanya, jadwalnya MENGULANG dari nol — aset berumur delapan
 * tahun disusutkan seolah baru dibeli, membebani laba bertahun-tahun lagi atas
 * nilai yang sudah habis dibebankan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIXED_ASSET_COLUMNS, parseFixedAssetRows } from "@/lib/import/fixed-assets";
import { buildTemplate } from "@/lib/import/template";

const HEADER = [
  "Kode Aset",
  "Nama",
  "Kategori",
  "Tanggal Perolehan",
  "Harga Perolehan",
  "Nilai Residu",
  "Umur (bulan)",
  "Akumulasi Penyusutan",
  "Terakhir Disusutkan",
  "Lokasi",
];

const baris = (over: Partial<Record<string, string>> = {}) => {
  const d: Record<string, string> = {
    "Kode Aset": "AT-001",
    Nama: "Truk Colt Diesel",
    Kategori: "Kendaraan",
    "Tanggal Perolehan": "2019-04-15",
    "Harga Perolehan": "350.000.000",
    "Nilai Residu": "0",
    "Umur (bulan)": "96",
    "Akumulasi Penyusutan": "175.000.000",
    "Terakhir Disusutkan": "2025-12",
    Lokasi: "Gudang Pusat",
    ...over,
  };
  return HEADER.map((h) => d[h] ?? "");
};

describe("sejarah aset ikut pindah", () => {
  it("akumulasi dan bulan terakhirnya terbaca", () => {
    const { rows, errors } = parseFixedAssetRows([HEADER, baris()]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      assetNo: "AT-001",
      cost: 350_000_000,
      accumulated: 175_000_000,
      lastDepreciationYear: 2025,
      lastDepreciationMonth: 12,
      usefulLifeMonths: 96,
    });
    expect(rows[0].acquisitionDate.toISOString()).toBe("2019-04-15T00:00:00.000Z");
  });

  it("aset yang belum pernah disusutkan: akumulasi 0, bulan kosong", () => {
    const { rows, errors } = parseFixedAssetRows([
      HEADER,
      baris({ "Akumulasi Penyusutan": "0", "Terakhir Disusutkan": "" }),
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ accumulated: 0, lastDepreciationYear: null });
  });

  it("akumulasi terisi TANPA bulan terakhir ditolak", () => {
    // Mesin tahu berapa yang sudah dibebankan tapi tidak sampai kapan — bulan
    // berikutnya yang dijalankan bisa membebani ulang bulan yang sudah
    // dibebankan di sistem lama.
    const { errors } = parseFixedAssetRows([HEADER, baris({ "Terakhir Disusutkan": "" })]);
    expect(errors[0].message).toContain("Terakhir Disusutkan");
  });

  it("umur boleh kosong — kategorinya yang menentukan", () => {
    const { rows, errors } = parseFixedAssetRows([HEADER, baris({ "Umur (bulan)": "" })]);
    expect(errors).toEqual([]);
    expect(rows[0].usefulLifeMonths).toBeNull();
  });

  it("umur dalam BULAN, bukan tahun — pecahan ditolak", () => {
    const { errors } = parseFixedAssetRows([HEADER, baris({ "Umur (bulan)": "8,5" })]);
    expect(errors[0].message).toContain("bilangan bulat");
  });
});

describe("penolakan yang menyelamatkan laba", () => {
  it("akumulasi melebihi yang bisa disusutkan ditolak", () => {
    /* Kalau akumulasi > (perolehan − residu), sisanya NEGATIF — dan aset yang
       bebannya negatif MENAMBAH laba setiap bulan, diam-diam, sampai seseorang
       bertanya kenapa penyusutannya berwarna hijau. */
    const { errors, rows } = parseFixedAssetRows([
      HEADER,
      baris({ "Akumulasi Penyusutan": "400.000.000" }),
    ]);
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain("melebihi");
  });

  it("residu diperhitungkan saat menguji batas itu", () => {
    // 350jt − 50jt residu = 300jt yang bisa disusutkan; 320jt melewatinya.
    const { errors } = parseFixedAssetRows([
      HEADER,
      baris({ "Nilai Residu": "50.000.000", "Akumulasi Penyusutan": "320.000.000" }),
    ]);
    expect(errors).toHaveLength(1);
  });

  it("tepat habis diterima — itu aset yang sudah lunas penyusutannya", () => {
    const { errors, rows } = parseFixedAssetRows([
      HEADER,
      baris({ "Akumulasi Penyusutan": "350.000.000" }),
    ]);
    expect(errors).toEqual([]);
    expect(rows[0].accumulated).toBe(350_000_000);
  });

  it("bulan terakhir sebelum tanggal perolehan ditolak", () => {
    const { errors } = parseFixedAssetRows([HEADER, baris({ "Terakhir Disusutkan": "2018-01" })]);
    expect(errors[0].message).toContain("lebih awal daripada tanggal perolehan");
  });

  it("bulan terakhir yang tidak berbentuk YYYY-MM ditolak", () => {
    const { errors } = parseFixedAssetRows([
      HEADER,
      baris({ "Terakhir Disusutkan": "Desember 2025" }),
    ]);
    expect(errors[0].message).toContain("2025-12");
  });

  it("kode aset kembar ditolak, menyebut baris pertamanya", () => {
    const { errors, rows } = parseFixedAssetRows([HEADER, baris(), baris({ Nama: "Truk kedua" })]);
    expect(rows).toHaveLength(1);
    expect(errors[0].message).toContain("baris 2");
  });
});

describe("riwayat penyusutan TIDAK dibuat-buat", () => {
  it("parser tidak pernah menghasilkan baris riwayat", () => {
    /*
     * Godaan yang wajar: buat baris `fixed_asset_depreciation` untuk setiap
     * bulan yang lewat supaya riwayatnya lengkap. Itu salah, dan salahnya
     * dalam: setiap baris riwayat berpasangan dengan JURNAL yang benar-benar
     * diposting. Riwayat tanpa jurnal = laporan penyusutan yang tidak bisa
     * ditelusuri ke buku besar mana pun — dan jurnalnya memang tidak boleh ada,
     * sebab bebannya sudah dibebankan di pembukuan lama.
     */
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "import", "fixed-assets.ts"),
      "utf8"
    );
    expect(src).not.toContain("fixedAssetDepreciation");
    const { rows } = parseFixedAssetRows([HEADER, baris()]);
    expect(Object.keys(rows[0])).not.toContain("depreciations");
  });
});

describe("penjaga penyusutan ganda (#381)", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "fixed-assets.ts"), "utf8");

  it("periode yang sudah tercakup `lastDepreciation*` ditolak", () => {
    /*
     * `alreadyDepreciated` memeriksa BARIS RIWAYAT — lengkap hanya selama
     * seluruh riwayat lahir di sini. Aset IMPOR membawa keadaannya tanpa satu
     * baris pun, jadi tanpa penjaga ini bulan yang sudah disusutkan di sistem
     * lama akan diposting sekali lagi, tanpa satu pun galat.
     */
    expect(src).toContain("lastDepreciationYear");
    expect(src).toMatch(/requested <= lastYear \* 12 \+ lastMonth/);
  });

  it("jawabannya `already_posted`, bukan lemparan", () => {
    // Bentuk yang sama dengan "tidak ada yang perlu dikerjakan" lainnya, supaya
    // penjadwal batch tidak berhenti di tengah karena satu aset impor.
    const blok = src.slice(src.indexOf("const lastYear = asset.lastDepreciationYear"));
    expect(blok.slice(0, 400)).toContain('reason: "already_posted"');
  });
});

describe("templat", () => {
  it("judulnya persis judul yang divalidasi", () => {
    expect(buildTemplate(FIXED_ASSET_COLUMNS).rows[0]).toEqual(
      FIXED_ASSET_COLUMNS.map((c) => c.header)
    );
  });

  it("templat yang diisi seadanya lolos validatornya sendiri", () => {
    const { rows } = buildTemplate(FIXED_ASSET_COLUMNS);
    const hasil = parseFixedAssetRows(rows);
    expect(hasil.errors).toEqual([]);
    expect(hasil.rows).toHaveLength(1);
  });

  it("legendanya menjelaskan dua kolom yang paling mudah salah", () => {
    const teks = JSON.stringify(buildTemplate(FIXED_ASSET_COLUMNS).legend);
    expect(teks).toContain("SUDAH disusutkan di sistem lama");
    expect(teks).toContain("8 tahun = 96");
  });
});
