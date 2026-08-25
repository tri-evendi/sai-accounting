/**
 * KODE BARANG (issue #493) — identitas sebuah barang berpindah dari nama ke kode.
 *
 * ══ Kenapa perpindahan ini perlu terjadi ═══════════════════════════════════
 * Berkas saldo awal 2024 milik pengguna pertama (`RINCIAN PERSEDIAAN AKHIR
 * 2024.xlsx`, PT Subur Anugerah) memuat DUA barang bernama sama persis:
 *
 *   100006  LONG PEPPER    1.101,00 kg   Rp     55.050.043,82  (± Rp 50.000/kg)
 *   100010  LONG PEPPER   13.684,06 kg   Rp    184.734.851,05  (± Rp 13.500/kg)
 *
 * Harga satuannya berselisih hampir empat kali lipat, jadi ini bukan baris
 * kembar yang salah cetak melainkan dua mutu barang yang kebetulan dinamai
 * sama. Selama `items.name` yang `@unique`, hanya satu yang bisa hidup — dan
 * saldo awal senilai Rp 239 juta tidak punya jalan masuk.
 *
 * ══ Yang TIDAK boleh ikut hilang ═══════════════════════════════════════════
 * Perlindungan yang dipasang 24 Agustus 2026 (nama kembar dijawab, bukan
 * diruntuhkan) berubah BENTUK, bukan dicabut: nama kembar kini ditahan satu
 * pertanyaan alih-alih ditolak. Sebabnya tetap berlaku — nama kembar yang
 * TIDAK disengaja membelah riwayat stok sebuah barang menjadi dua, dan
 * pembelahan itu tak pernah terlihat sampai laporannya tidak mau cocok.
 * Penjaganya ada di `tests/reported-2026-08-24.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { itemSchema } from "@/lib/validations/inventory";
import { parseItemRows, ITEM_COLUMNS } from "@/lib/import/master";
import { summarizeInventoryItem, type ItemWithStock } from "@/lib/inventory";

const schema = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  join(__dirname, "..", "prisma", "migrations", "0051_item_codes", "migration.sql"),
  "utf8"
);

/** Blok `model Item { … }` saja — bukan seluruh skema. */
const itemModel = schema.slice(
  schema.indexOf("model Item {"),
  schema.indexOf("\n}", schema.indexOf("model Item {"))
);

describe("skema: kode yang unik, nama yang tidak lagi", () => {
  it("`code` ada, `@unique`, dan VarChar — bukan Int", () => {
    /* String meski nilai dari Accurate kebetulan angka: kode berawalan nol dan
       kode berhuruf akan muncul cepat atau lambat, dan kolom Int tidak bisa
       memundurkan keputusan itu. */
    expect(itemModel).toMatch(/code\s+String\s+@unique\s+@db\.VarChar\(20\)/);
  });

  it("`name` TIDAK lagi @unique — dua LONG PEPPER harus bisa hidup berdampingan", () => {
    expect(itemModel).toMatch(/name\s+String\s+@db\.VarChar\(100\)/);
    expect(itemModel).not.toMatch(/name\s+String\s+@unique/);
  });

  it("nama tetap ber-index meski bukan kunci — ia masih dicari & diurutkan", () => {
    expect(itemModel).toMatch(/@@index\(\[name\]\)/);
  });
});

describe("migration 0051: urutannya yang membuatnya selamat", () => {
  /*
   * Menambahkan kolom `NOT NULL UNIQUE` sekaligus di atas tabel berisi akan
   * menabrak: MySQL mengisi baris lama dengan string kosong, dan string kosong
   * yang sama untuk semua baris melanggar UNIQUE-nya sendiri. Jadi urutannya
   * BUKAN selera — ia satu-satunya urutan yang jalan.
   */
  it("kolom ditambahkan NULL dulu, diisi, BARU dijadikan NOT NULL", () => {
    const addNull = migration.indexOf("ADD COLUMN `code` VARCHAR(20) NULL");
    const backfill = migration.indexOf("UPDATE `items` SET `code`");
    const notNull = migration.indexOf("MODIFY COLUMN `code` VARCHAR(20) NOT NULL");
    const unique = migration.indexOf("CREATE UNIQUE INDEX `items_code_key`");

    expect(addNull).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(addNull);
    expect(notNull).toBeGreaterThan(backfill);
    expect(unique).toBeGreaterThan(notNull);
  });

  it("kode sementara DITURUNKAN dari id — deterministik, bukan diacak", () => {
    /* Migrasi yang sama dijalankan di empat basis data PT. Kode acak berarti
       empat hasil berbeda yang tak bisa dicocokkan bila perlu ditelusuri. */
    expect(migration).toMatch(/CONCAT\('ITM-', LPAD\(`id`, 4, '0'\)\)/);
    expect(migration).not.toMatch(/RAND\(|UUID\(/);
  });

  it("index unik pada NAMA dibuang — kalau tidak, seluruh perubahan ini sia-sia", () => {
    expect(migration).toMatch(/DROP INDEX `items_name_key`/);
  });
});

describe("itemSchema: kode wajib, dan spasi bukan kode", () => {
  it("menerima barang berkode", () => {
    const r = itemSchema.safeParse({ code: "100006", name: "LONG PEPPER", unit: "kg" });
    expect(r.success).toBe(true);
  });

  it("menolak kode kosong", () => {
    expect(itemSchema.safeParse({ code: "", name: "Kopi" }).success).toBe(false);
  });

  it("menolak kode yang isinya hanya spasi — di-trim SEBELUM diperiksa", () => {
    expect(itemSchema.safeParse({ code: "   ", name: "Kopi" }).success).toBe(false);
  });

  it("menolak kode di atas 20 karakter", () => {
    expect(itemSchema.safeParse({ code: "x".repeat(21), name: "Kopi" }).success).toBe(false);
  });

  it("`confirmDuplicateName` bawaannya false — diam BUKAN berarti setuju", () => {
    const r = itemSchema.safeParse({ code: "A1", name: "Kopi" });
    expect(r.success && r.data.confirmDuplicateName).toBe(false);
  });
});

describe("impor master barang: identitasnya kode", () => {
  it("templatnya punya kolom Kode, wajib", () => {
    const code = ITEM_COLUMNS.find((c) => c.key === "code");
    expect(code?.required).toBe(true);
  });

  it("petunjuk kolom Nama tidak lagi menjanjikan keunikan", () => {
    /* Petunjuk yang masih berkata "UNIK" membuat pengguna mengarang nama
       pembeda ("LONG PEPPER 2") untuk masalah yang sudah tidak ada. */
    const name = ITEM_COLUMNS.find((c) => c.key === "name");
    expect(name?.hint).not.toMatch(/UNIK/);
  });

  it("membaca dua LONG PEPPER berkode beda sebagai DUA baris — kasus nyata #493", () => {
    const parsed = parseItemRows([
      ["Kode", "Nama", "Satuan"],
      ["100006", "LONG PEPPER", "kg"],
      ["100010", "LONG PEPPER", "kg"],
    ]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((r) => r.code)).toEqual(["100006", "100010"]);
    expect(new Set(parsed.rows.map((r) => r.name)).size).toBe(1);
  });

  it("mengenali judul kolom Accurate (\"Kode Barang\")", () => {
    const parsed = parseItemRows([
      ["Kode Barang", "Nama Barang", "Satuan"],
      ["100003", "BLACK PEPPER", "kg"],
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].code).toBe("100003");
  });

  it("baris tanpa kode ditolak, dan galatnya menyebut barisnya", () => {
    const parsed = parseItemRows([
      ["Kode", "Nama", "Satuan"],
      ["", "BLACK PEPPER", "kg"],
    ]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});

describe("kode ikut sampai ke ringkasan — bukan berhenti di basis data", () => {
  it("summarizeInventoryItem memulangkan `code`", () => {
    const item: ItemWithStock = {
      id: 7,
      code: "100010",
      name: "LONG PEPPER",
      unit: "kg",
      stockMovements: [],
    };
    /* Tanpa ini laporan & pemilih menampilkan dua baris yang tampak identik,
       dan pengguna tidak punya cara memilih yang benar. */
    expect(summarizeInventoryItem(item).code).toBe("100010");
  });
});
