/**
 * Impor piutang & utang terbuka (issue #381 tahap 4).
 *
 * Tahap 3 membuat saldo awal AR/AP lahir sebagai DOKUMEN. Tahap ini membawa
 * RINCIANNYA — dan rincian yang paling menentukan adalah TANGGAL TERBIT: tanpa
 * itu setiap dokumen memakai tanggal jurnal pembuka, dan seluruh piutang lama
 * tampil di ember umur yang sama pada hari pertama. Piutang yang menunggak
 * delapan bulan terlihat sama sehatnya dengan yang terbit kemarin — padahal
 * justru daftar itulah alasan orang membuka halaman umur piutang.
 */
import { describe, expect, it } from "vitest";

import {
  OPENING_AP_COLUMNS,
  OPENING_AR_COLUMNS,
  parseOpeningDocuments,
} from "@/lib/import/opening-ar-ap";
import { buildTemplate } from "@/lib/import/template";

const AR = (sheet: unknown[][]) => parseOpeningDocuments(sheet, OPENING_AR_COLUMNS);
const HEADER = [
  "Pelanggan",
  "No. Dokumen",
  "Tanggal",
  "Jatuh Tempo",
  "Mata Uang",
  "Kurs",
  "Sisa",
];

describe("baris lengkap", () => {
  it("terbaca utuh, dengan tanggal aslinya", () => {
    const { rows, errors } = AR([
      HEADER,
      ["PT Maju", "INV-2025-0417", "2025-11-20", "2025-12-20", "IDR", "", "15.750.000"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      partner: "PT Maju",
      documentNo: "INV-2025-0417",
      currency: "IDR",
      rate: null,
      amount: 15_750_000,
    });
    expect(rows[0].date.toISOString()).toBe("2025-11-20T00:00:00.000Z");
    expect(rows[0].dueDate?.toISOString()).toBe("2025-12-20T00:00:00.000Z");
  });

  it("satu baris = satu DOKUMEN, bukan satu mitra", () => {
    // Pelanggan dengan dua belas faktur terbuka menghasilkan dua belas baris —
    // dua belas dokumen yang bisa dilunasi satu per satu, dengan umur
    // masing-masing.
    const { rows, errors } = AR([
      HEADER,
      ["PT Maju", "INV-1", "2025-01-10", "", "", "", "1.000.000"],
      ["PT Maju", "INV-2", "2025-06-10", "", "", "", "2.000.000"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.partner)).toEqual(["PT Maju", "PT Maju"]);
  });

  it("jatuh tempo opsional", () => {
    const { rows, errors } = AR([HEADER, ["PT X", "INV-9", "2025-03-01", "", "", "", "500.000"]]);
    expect(errors).toEqual([]);
    expect(rows[0].dueDate).toBeNull();
  });
});

describe("mata uang & kurs", () => {
  it("mata uang asing WAJIB berkurs — nilai IDR tidak pernah ditebak", () => {
    // Tanpa kurs, piutang USD 10.000 akan mendarat sebagai Rp 10.000 di neraca.
    const { errors, rows } = AR([
      HEADER,
      ["PT X", "INV-9", "2025-03-01", "", "USD", "", "10.000"],
    ]);
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain("Kurs");
  });

  it("USD berkurs diterima, dan kursnya tersimpan", () => {
    const { rows, errors } = AR([
      HEADER,
      ["PT X", "INV-9", "2025-03-01", "", "USD", "16.250", "10.000"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ currency: "USD", rate: 16_250, amount: 10_000 });
  });

  it("IDR tidak menyimpan kurs — 1 bukan informasi", () => {
    const { rows } = AR([HEADER, ["PT X", "INV-9", "2025-03-01", "", "IDR", "1", "500.000"]]);
    expect(rows[0].rate).toBeNull();
  });

  it("mata uang tak dikenal ditolak", () => {
    const { errors } = AR([HEADER, ["PT X", "INV-9", "2025-03-01", "", "EUR", "17000", "100"]]);
    expect(errors[0].message).toContain("EUR");
  });
});

describe("penolakan yang menyelamatkan buku", () => {
  it("sisa nol atau negatif ditolak", () => {
    // Dokumen tanpa sisa bukan piutang terbuka; ia sudah lunas di sistem lama.
    for (const nilai of ["0", "-500.000"]) {
      const { errors } = AR([HEADER, ["PT X", "INV-9", "2025-03-01", "", "", "", nilai]]);
      expect(errors).toHaveLength(1);
    }
  });

  it("jatuh tempo sebelum tanggal terbit ditolak", () => {
    // Hampir selalu berarti dua kolom tertukar; menerimanya menghasilkan umur
    // yang negatif.
    const { errors } = AR([
      HEADER,
      ["PT X", "INV-9", "2025-06-01", "2025-01-01", "", "", "100.000"],
    ]);
    expect(errors[0].message).toContain("Jatuh tempo lebih awal");
  });

  it("nomor dokumen kembar di dalam berkas ditolak", () => {
    // Dua baris bernomor sama akan menjadi dua dokumen yang tak terbedakan saat
    // pelunasan — dan `invoices.invoice_no` unik di basis data.
    const { errors, rows } = AR([
      HEADER,
      ["PT X", "INV-9", "2025-01-01", "", "", "", "100"],
      ["PT Y", "INV-9", "2025-02-01", "", "", "", "200"],
    ]);
    expect(rows).toHaveLength(1);
    expect(errors[0].message).toContain("baris 2");
  });

  it("SELURUH masalah satu baris dilaporkan sekaligus", () => {
    const { errors } = AR([HEADER, ["", "", "kemarin", "", "EUR", "", "abc"]]);
    expect(errors).toHaveLength(1);
    const pesan = errors[0].message;
    for (const bagian of ["Nama mitra", "No. Dokumen", "Tanggal", "EUR", "Sisa"]) {
      expect(pesan).toContain(bagian);
    }
  });

  it("tanggal gaya Indonesia dibaca hari-dulu", () => {
    const { rows } = AR([HEADER, ["PT X", "INV-9", "01/02/2025", "", "", "", "100"]]);
    expect(rows[0].date.toISOString()).toBe("2025-02-01T00:00:00.000Z");
  });
});

describe("templat kedua sisi", () => {
  it("judulnya persis judul yang divalidasi", () => {
    for (const columns of [OPENING_AR_COLUMNS, OPENING_AP_COLUMNS]) {
      expect(buildTemplate(columns).rows[0]).toEqual(columns.map((c) => c.header));
    }
  });

  it("hanya kolom mitranya yang berbeda antara piutang dan utang", () => {
    const ar = OPENING_AR_COLUMNS.map((c) => c.header);
    const ap = OPENING_AP_COLUMNS.map((c) => c.header);
    expect(ar[0]).toBe("Pelanggan");
    expect(ap[0]).toBe("Pemasok");
    expect(ar.slice(1)).toEqual(ap.slice(1));
  });

  it("legendanya menyebut bahwa yang diminta SISA, bukan nilai asli", () => {
    // Meminta nilai asli lalu pembayarannya pula akan mengundang seluruh
    // riwayat pelunasan lama masuk ke buku baru.
    const teks = JSON.stringify(buildTemplate(OPENING_AR_COLUMNS).legend);
    expect(teks).toContain("SISA yang belum dibayar");
  });

  it("legendanya menyebut nama mitra harus persis sama", () => {
    const teks = JSON.stringify(buildTemplate(OPENING_AP_COLUMNS).legend);
    expect(teks).toContain("PERSIS sama");
  });

  it("templat yang diisi seadanya lolos validatornya sendiri", () => {
    const { rows } = buildTemplate(OPENING_AR_COLUMNS);
    const hasil = parseOpeningDocuments(rows, OPENING_AR_COLUMNS);
    expect(hasil.errors).toEqual([]);
    expect(hasil.rows).toHaveLength(1);
  });
});
