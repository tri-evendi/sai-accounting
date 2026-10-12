/**
 * PENYESUAIAN NILAI MariaDB -> PostgreSQL
 *
 * Tiga kerusakan yang dijaga di sini punya satu sifat bersama: **jumlah
 * barisnya tetap sama**. Jadi pemeriksaan "19 basis data, jumlah baris cocok"
 * akan lulus dengan sempurna sementara datanya sudah salah.
 */
import { describe, expect, it } from "vitest";
import { pgTypeDari, sesuaikan, sqlGeserSequence } from "@/lib/pg-coerce";

describe("boolean: MySQL tidak punya tipe boolean", () => {
  it("0 dan 1 menjadi false dan true", () => {
    expect(sesuaikan(0, "boolean")).toBe(false);
    expect(sesuaikan(1, "boolean")).toBe(true);
  });

  it('STRING "0" menjadi false — bukan true', () => {
    /*
     * Jebakan intinya. `Boolean("0")` di JavaScript bernilai BENAR, jadi
     * penyesuaian yang naif akan membuat setiap baris nonaktif hidup kembali —
     * di 17 buku sekaligus, tanpa satu pun galat, dengan jumlah baris yang
     * cocok sempurna.
     */
    expect(sesuaikan("0", "boolean")).toBe(false);
    expect(sesuaikan("1", "boolean")).toBe(true);
    expect(sesuaikan("false", "boolean")).toBe(false);
    expect(sesuaikan("true", "boolean")).toBe(true);
  });

  it("null tetap null — TIDAK menjadi false", () => {
    /* "belum diputuskan" dan "diputuskan tidak" adalah dua keadaan berbeda, dan
       melebur keduanya mengubah arti data tanpa mengubah jumlah barisnya. */
    expect(sesuaikan(null, "boolean")).toBeNull();
    expect(sesuaikan(undefined, "boolean")).toBeNull();
  });

  it("BigInt ikut ditangani — driver bisa memulangkannya", () => {
    expect(sesuaikan(BigInt(0), "boolean")).toBe(false);
    expect(sesuaikan(BigInt(1), "boolean")).toBe(true);
  });

  it("nilai yang TIDAK DIKENALI melempar, bukan menebak", () => {
    /* Menebak di sini berarti memilih diam-diam antara dua jawaban yang
       keduanya bisa salah. Gagal keras adalah satu-satunya jawaban yang jujur. */
    expect(() => sesuaikan("ya", "boolean")).toThrow(/tak dikenali/);
    expect(() => sesuaikan({}, "boolean")).toThrow(/tak terduga/);
  });
});

describe("numeric: presisi uang tidak boleh melewati Number", () => {
  it("string dilewatkan apa adanya", () => {
    expect(sesuaikan("16570000.00", "numeric")).toBe("16570000.00");
  });

  it("nilai besar tetap UTUH — ini alasan tipe ini ditangani khusus", () => {
    /* Kredit `cash_movements` di buku produksi berjumlah 1.548.932.904.858,88.
       Itu di bawah 2^53, tapi marginnya tidak besar — dan pembulatan yang tidak
       melempar galat adalah kerusakan yang paling mahal di aplikasi akuntansi. */
    const besar = "1548932904858.88";
    expect(sesuaikan(besar, "numeric")).toBe(besar);
    expect(sesuaikan(BigInt("9007199254740993"), "numeric")).toBe("9007199254740993");
  });

  it("null tetap null", () => {
    expect(sesuaikan(null, "numeric")).toBeNull();
  });

  it("NaN / Infinity melempar", () => {
    expect(() => sesuaikan(Number.NaN, "numeric")).toThrow(/tak hingga/);
    expect(() => sesuaikan(Number.POSITIVE_INFINITY, "numeric")).toThrow(/tak hingga/);
  });

  it("Date pada kolom numeric melempar — itu kolom yang salah dipetakan", () => {
    expect(() => sesuaikan(new Date(), "numeric")).toThrow(/Date/);
  });
});

describe("pemetaan tipe kolom PostgreSQL", () => {
  it("mengenali yang perlu disesuaikan", () => {
    expect(pgTypeDari("bool", "boolean")).toBe("boolean");
    expect(pgTypeDari("numeric", "numeric")).toBe("numeric");
    expect(pgTypeDari("int8", "bigint")).toBe("bigint");
    expect(pgTypeDari("jsonb", "jsonb")).toBe("json");
    expect(pgTypeDari("bytea", "bytea")).toBe("bytea");
  });

  it("sisanya dilewatkan apa adanya — jangan menyentuh yang tidak perlu", () => {
    expect(pgTypeDari("varchar", "character varying")).toBe("lain");
    expect(pgTypeDari("timestamp", "timestamp without time zone")).toBe("lain");
    const d = new Date("2026-10-12T00:00:00Z");
    expect(sesuaikan(d, "lain")).toBe(d);
  });
});

describe("sequence: kegagalan yang datang TERLAMBAT", () => {
  /*
   * Satu-satunya langkah migrasi yang kegagalannya tidak muncul saat migrasi.
   * `SERIAL` memulai dari 1; baris yang dimuat membawa id aslinya, jadi
   * `INSERT` pertama dari pengguna sungguhan akan bertabrakan — pada permintaan
   * pertama sesudah penukaran, bukan saat pemeriksaan.
   */
  it("memakai pg_get_serial_sequence, bukan nama sequence yang ditebak", () => {
    const sql = sqlGeserSequence("invoices", "id");
    expect(sql).toContain("pg_get_serial_sequence");
    expect(sql).not.toMatch(/invoices_id_seq/);
  });

  it("tabel KOSONG tidak dipaksa mulai dari 2", () => {
    /* `is_called` diisi "apakah tabelnya berisi": kalau selalu true, tabel
       kosong akan melewatkan id 1 selamanya. */
    const sql = sqlGeserSequence("items", "id");
    expect(sql).toContain("COUNT(*) > 0");
    expect(sql).toContain("COALESCE");
  });

  it("identifier dikutip — nama tabel snake_case tetap aman", () => {
    expect(sqlGeserSequence("fixed_asset_categories", "id")).toContain('"fixed_asset_categories"');
  });
});
