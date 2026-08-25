/**
 * IMPOR BAGAN AKUN: KOLOM AKUN INDUK (issue #494).
 *
 * ══ Yang hilang sebelum ini ════════════════════════════════════════════════
 * Berkas ekspor Accurate pengguna pertama (`akun-perkiraan.xlsx`, 180 akun,
 * PT Subur Anugerah) mengisi kolom `Akun Induk` untuk sebagian besar barisnya:
 *
 *   5100008  ADM, MATERAI & SURAT IJIN     induk 5100
 *   1202002  AKUM. PENYUSUTAN INVENTARIS   induk 1202
 *   1101006  BANK BCA (IDR) 200            induk 1101
 *
 * Kolomnya dibaca lalu DIBUANG, sehingga 180 akun masuk sebagai daftar RATA.
 * Yang rusak bukan tampilannya: laporan yang menjumlah per kelompok akun
 * kehilangan pengelompokannya, dan pengguna harus menyusun ulang 180 hubungan
 * induk-anak dengan tangan — pekerjaan yang justru ingin dihindari dengan
 * mengimpor.
 */
import { describe, expect, it } from "vitest";
import {
  parseCoaRows,
  parentIssues,
  ignoredColumnsIn,
  COA_COLUMNS,
  type ParsedAccount,
} from "@/lib/coa-import";

const HEADER = ["Kode Perkiraan", "Nama", "Tipe Akun", "Akun Induk", "Mata Uang"];

function akun(code: string, parentCode: string | null): ParsedAccount {
  return {
    code,
    name: `Akun ${code}`,
    type: "expense",
    normalBalance: "debit",
    currency: "IDR",
    parentCode,
  };
}

describe("kolom Akun Induk dikenali & dibaca", () => {
  it("terdaftar sebagai kolom OPSIONAL", () => {
    const parent = COA_COLUMNS.find((c) => c.key === "parent");
    expect(parent).toBeDefined();
    expect(parent?.required).toBeFalsy();
  });

  it("membaca judul Accurate apa adanya", () => {
    const { accounts, errors } = parseCoaRows([
      HEADER,
      ["5100", "HARGA POKOK PENJUALAN", "COGS", "", "IDR"],
      ["5100008", "ADM, MATERAI & SURAT IJIN", "COGS", "5100", "IDR"],
    ]);
    expect(errors).toEqual([]);
    expect(accounts[0].parentCode).toBeNull();
    expect(accounts[1].parentCode).toBe("5100");
  });

  it("berkas TANPA kolom induk tetap terbaca — kolomnya opsional", () => {
    const { accounts, errors } = parseCoaRows([
      ["Kode Perkiraan", "Nama", "Tipe Akun"],
      ["1101", "KAS DAN SETARA KAS", "BANK"],
    ]);
    expect(errors).toEqual([]);
    expect(accounts[0].parentCode).toBeNull();
  });

  it("URUTAN BARIS tidak berpengaruh — induk boleh muncul SESUDAH anaknya", () => {
    /*
     * Ini bukan kasus buatan: berkas Accurate urut ABJAD NAMA, jadi `5100008`
     * ("ADM, MATERAI…") ada di baris 1 sedangkan induknya `5100` ("HARGA POKOK
     * PENJUALAN") baru di baris 95. Pemeriksa yang bekerja per baris akan
     * menolak hampir seluruh berkasnya.
     */
    const { accounts, errors } = parseCoaRows([
      HEADER,
      ["5100008", "ADM, MATERAI & SURAT IJIN", "COGS", "5100", "IDR"],
      ["5100", "HARGA POKOK PENJUALAN", "COGS", "", "IDR"],
    ]);
    expect(errors).toEqual([]);
    expect(accounts.map((a) => a.parentCode)).toEqual(["5100", null]);
  });
});

describe("hubungan induk yang tidak pernah sah ditolak", () => {
  it("akun yang menjadi induk dirinya sendiri", () => {
    const issues = parentIssues([akun("5100", "5100")]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("5100");
  });

  it("lingkaran dua akun (A → B → A)", () => {
    /* `Account.parentId onDelete: Restrict` tidak menjaga ini sama sekali, dan
       sebuah lingkaran membuat setiap laporan yang menelusuri hierarki berputar
       tanpa henti. */
    const issues = parentIssues([akun("A", "B"), akun("B", "A")]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes("melingkar"))).toBe(true);
  });

  it("lingkaran tiga akun juga tertangkap", () => {
    const issues = parentIssues([akun("A", "B"), akun("B", "C"), akun("C", "A")]);
    expect(issues.some((i) => i.message.includes("melingkar"))).toBe(true);
  });

  it("rantai LURUS yang dalam bukan lingkaran", () => {
    const issues = parentIssues([
      akun("A", "B"),
      akun("B", "C"),
      akun("C", "D"),
      akun("D", null),
    ]);
    expect(issues).toEqual([]);
  });

  it("induk yang tidak ada DI BERKAS bukan galat — ia mungkin sudah di basis data", () => {
    /* Mengimpor sebagian bagan akun ke perusahaan yang sudah punya akun
       induknya adalah pemakaian yang sah; menolaknya di sini akan menolak
       pemakaian itu. Yang bisa menjawab hanya jalur tulisnya. */
    expect(parentIssues([akun("5100008", "5100")])).toEqual([]);
  });

  it("lingkaran ditolak lewat parseCoaRows, bukan cuma lewat fungsinya", () => {
    const { errors } = parseCoaRows([
      HEADER,
      ["A1", "Satu", "EXPS", "B1", "IDR"],
      ["B1", "Dua", "EXPS", "A1", "IDR"],
    ]);
    expect(errors.some((e) => e.message.includes("melingkar"))).toBe(true);
  });
});

describe("kolom yang dikenali tetapi tidak diimpor DIKATAKAN", () => {
  /*
   * Impor yang berhasil sambil membuang data adalah impor yang paling mahal
   * untuk ditemukan salahnya: pengguna baru sadar berbulan-bulan kemudian, saat
   * laporannya tidak mau cocok.
   */
  it("Kurs Saldo di berkas Accurate dilaporkan", () => {
    const found = ignoredColumnsIn([
      "No.",
      "Tipe Akun",
      "Kode Perkiraan",
      "Nama",
      "Akun Induk",
      "Mata Uang",
      "Kurs Saldo (Jika Asing)",
      "Cabang Saldo",
    ]);
    expect(found.map((c) => c.header)).toContain("Kurs Saldo");
    expect(found.map((c) => c.header)).toContain("Cabang Saldo");
  });

  it("setiap kolom yang dilaporkan menyebut SEBABNYA, bukan sekadar namanya", () => {
    const found = ignoredColumnsIn(["Kurs Saldo"]);
    expect(found[0].why.length).toBeGreaterThan(15);
  });

  it("berkas tanpa kolom itu tidak melaporkan apa-apa", () => {
    expect(ignoredColumnsIn(["Kode Perkiraan", "Nama", "Tipe Akun"])).toEqual([]);
  });
});

describe("bentuk nyata berkas pengguna", () => {
  it("baris Accurate sungguhan terbaca lengkap dengan induknya", () => {
    const { accounts, errors } = parseCoaRows([
      ["No.", "Tipe Akun", "Kode Perkiraan", "Nama", "Akun Induk", "Mata Uang", "Kurs Saldo"],
      [1, "COGS", "5100008", "ADM, MATERAI &SURAT IJIN", "5100", "IDR", 1],
      [2, "BANK", "1101012", "BANK BCA (CNY) 069", "1101", "CNY", 2261],
      [3, "BANK", "1101", "KAS DAN SETARA KAS", "", "IDR", 1],
      [4, "COGS", "5100", "HARGA POKOK PENJUALAN", "", "IDR", 1],
    ]);

    expect(errors).toEqual([]);
    expect(accounts).toHaveLength(4);
    expect(accounts[0]).toMatchObject({ code: "5100008", parentCode: "5100" });
    expect(accounts[1]).toMatchObject({ code: "1101012", parentCode: "1101", currency: "CNY" });
    expect(accounts[2].parentCode).toBeNull();
  });
});
