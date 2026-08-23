/**
 * Impor rekening koran (issue #468) — sifat yang dikunci.
 *
 * Yang diuji di sini bukan "apakah ia bisa membaca CSV" melainkan apakah ia
 * membaca BERKAS YANG BENAR-BENAR DIKELUARKAN BANK. Sampai #468 parser hanya
 * menerima `date,description,amount` — judul Inggris yang tidak dikeluarkan
 * bank mana pun — sehingga setiap pengguna harus menyunting berkasnya di Excel
 * lebih dulu.
 *
 * Dua kelas kesalahan di modul ini tidak pernah menerbitkan galat, hanya
 * angka yang salah, dan keduanya diuji paling keras: TANDA (arah mutasi) dan
 * TANGGAL (urutan hari/bulan).
 */
import { describe, expect, it } from "vitest";

import { parseStatementCsv, STATEMENT_COLUMNS } from "@/lib/import/bank-statement";

const rows = (csv: string) => {
  const result = parseStatementCsv(csv);
  if (!result.ok) throw new Error(`ditolak: ${result.issues.map((i) => i.key).join(", ")}`);
  return result.rows;
};

const issues = (csv: string) => {
  const result = parseStatementCsv(csv);
  if (result.ok) throw new Error("seharusnya ditolak");
  return result.issues;
};

describe("judul kolom yang benar-benar dikeluarkan bank", () => {
  it("BCA: Tanggal · Keterangan · Cabang · Jumlah · DB/CR · Saldo", () => {
    /* Kolom `Cabang` dan `Saldo` tidak kita butuhkan — dan berkas yang isinya
       sudah benar tidak boleh ditolak hanya karena membawa keduanya. */
    const csv = [
      "Tanggal,Keterangan,Cabang,Jumlah,DB/CR,Saldo",
      '31/12/2026,"SETORAN TUNAI",0123,"1,500,000.00",CR,"5,000,000.00"',
      '31/12/2026,"BIAYA ADM",0123,"15,000.00",DB,"4,985,000.00"',
    ].join("\n");
    expect(rows(csv)).toEqual([
      { date: "2026-12-31", description: "SETORAN TUNAI", amount: 1500000 },
      { date: "2026-12-31", description: "BIAYA ADM", amount: -15000 },
    ]);
  });

  it("judul Indonesia berkolom Debet/Kredit, pemisah titik koma, desimal koma", () => {
    const csv = [
      "Tanggal;Uraian;Debet;Kredit;Saldo",
      "05/08/2026;Transfer masuk;;2.000.000,00;7.000.000,00",
      "31/08/2026;Tarik tunai;500.000,50;;6.499.999,50",
    ].join("\n");
    expect(rows(csv)).toEqual([
      { date: "2026-08-05", description: "Transfer masuk", amount: 2000000 },
      { date: "2026-08-31", description: "Tarik tunai", amount: -500000.5 },
    ]);
  });

  it("judul Inggris lama tetap diterima — berkas yang sudah jadi tidak boleh patah", () => {
    const csv = [
      "date,description,amount",
      "2026-07-01,Setoran tunai,1500000.00",
      "2026-07-02,Biaya admin,-15000",
    ].join("\n");
    expect(rows(csv)).toEqual([
      { date: "2026-07-01", description: "Setoran tunai", amount: 1500000 },
      { date: "2026-07-02", description: "Biaya admin", amount: -15000 },
    ]);
  });

  it("kolom wajib hilang → ditolak SEBELUM satu baris pun dibaca", () => {
    const found = issues("Tanggal,Jumlah\n31/12/2026,100");
    expect(found).toHaveLength(1);
    expect(found[0].key).toMatch(/missingColumns/);
    expect(found[0].row).toBeUndefined();
  });

  it("ada judul wajib tapi tak satu pun kolom nominal → ditolak, dan itu berkas, bukan baris", () => {
    const found = issues("Tanggal,Keterangan\n31/12/2026,Setoran");
    expect(found[0].key).toMatch(/missingAmountColumns/);
  });
});

describe("penentuan TANDA — tiga cara, satu arti", () => {
  it("kolom DB/CR terpisah: CR = masuk, DB = keluar", () => {
    const csv = ["Tanggal,Keterangan,Jumlah,DB/CR", "31/12/2026,Masuk,1000,CR", "31/12/2026,Keluar,1000,DB"].join(
      "\n"
    );
    expect(rows(csv).map((r) => r.amount)).toEqual([1000, -1000]);
  });

  it('"K" adalah KREDIT (masuk), bukan "keluar" — terbalik = rekonsiliasi arah salah', () => {
    const csv = ["Tanggal,Keterangan,Jumlah,Tipe", "31/12/2026,Masuk,1000,K", "31/12/2026,Keluar,1000,D"].join("\n");
    expect(rows(csv).map((r) => r.amount)).toEqual([1000, -1000]);
  });

  it("penanda yang menempel di sel nominal ikut terbaca", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "31/12/2026,Masuk,1.000 CR", "31/12/2026,Keluar,1.000 DB"].join("\n");
    expect(rows(csv).map((r) => r.amount)).toEqual([1000, -1000]);
  });

  it("Debet/Kredit: kredit = uang MASUK ke rekening", () => {
    const csv = [
      "Tanggal,Keterangan,Debet,Kredit",
      "31/12/2026,Transfer masuk,,2000000",
      "31/12/2026,Tarik tunai,500000,",
    ].join("\n");
    expect(rows(csv).map((r) => r.amount)).toEqual([2000000, -500000]);
  });

  it("kolom nominal bertanda dipakai apa adanya bila tak ada penanda arah", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "31/12/2026,Masuk,1000", "31/12/2026,Keluar,-1000"].join("\n");
    expect(rows(csv).map((r) => r.amount)).toEqual([1000, -1000]);
  });

  it("tanda kurung = negatif (konvensi akuntansi sebagian ekspor)", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "31/12/2026,Koreksi,(1.500)"].join("\n");
    expect(rows(csv).map((r) => r.amount)).toEqual([-1500]);
  });

  it("penanda arah yang tak dikenali DITOLAK, bukan dianggap masuk", () => {
    const found = issues("Tanggal,Keterangan,Jumlah,DB/CR\n31/12/2026,Entah,1000,XY");
    expect(found[0].key).toMatch(/badDirection/);
    expect(found[0].row).toBe(2);
  });
});

describe("urutan TANGGAL — diputuskan dari berkasnya, tidak ditebak per sel", () => {
  it("satu baris yang menentukan menjelaskan seluruh berkas", () => {
    // 31 tidak mungkin bulan → berkas ini HH/BB, termasuk barisnya yang ambigu.
    const csv = [
      "Tanggal,Keterangan,Jumlah",
      "05/08/2026,Ambigu sendirian,100",
      "31/08/2026,Penentu,100",
    ].join("\n");
    expect(rows(csv).map((r) => r.date)).toEqual(["2026-08-05", "2026-08-31"]);
  });

  it("berkas gaya BB/HH terbaca sebagai BB/HH", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "08/31/2026,Penentu,100", "08/05/2026,Ikut,100"].join("\n");
    expect(rows(csv).map((r) => r.date)).toEqual(["2026-08-31", "2026-08-05"]);
  });

  it("berkas yang BERTENTANGAN ditolak — itu rusak, bukan ambigu", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "31/08/2026,Menuntut HH/BB,100", "08/31/2026,Menuntut BB/HH,100"].join(
      "\n"
    );
    expect(issues(csv)[0].key).toMatch(/dateConflict/);
  });

  it("tanpa satu pun bukti: HH/BB dipakai, TAPI hasilnya menandai asumsinya", () => {
    /* Ini satu-satunya asumsi di modul ini yang tidak bisa dibuktikan dari
       berkasnya, jadi ia wajib bisa dibaca pemanggil dan dikatakan di layar. */
    const result = parseStatementCsv("Tanggal,Keterangan,Jumlah\n05/08/2026,Ambigu,100");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dateOrder).toBe("assumed_dmy");
      expect(result.rows[0].date).toBe("2026-08-05");
    }
  });

  it("berkas ISO tidak pernah menandai asumsi apa pun", () => {
    const result = parseStatementCsv("date,description,amount\n2026-08-05,ISO,100");
    expect(result.ok && result.dateOrder).toBe("iso");
  });

  it("pemisah titik & strip diterima seperti garis miring", () => {
    const csv = ["Tanggal,Keterangan,Jumlah", "31-12-2026,Strip,100", "30.12.2026,Titik,100"].join("\n");
    expect(rows(csv).map((r) => r.date)).toEqual(["2026-12-31", "2026-12-30"]);
  });

  it("tanggal mustahil ditolak dengan nomor barisnya", () => {
    const found = issues("Tanggal,Keterangan,Jumlah\n31/02/2026,Tak ada tanggalnya,100");
    expect(found[0].key).toMatch(/badDate/);
    expect(found[0].row).toBe(2);
  });
});

describe("pemisah DESIMAL — juga diputuskan dari berkasnya", () => {
  it("gaya Indonesia (1.500.000,50) terbaca benar", () => {
    const csv = ["Tanggal;Keterangan;Jumlah", "31/12/2026;Gaya ID;1.500.000,50"].join("\n");
    expect(rows(csv)[0].amount).toBe(1500000.5);
  });

  it("gaya Inggris (1,500,000.50) terbaca benar", () => {
    const csv = ["Tanggal;Keterangan;Jumlah", "31/12/2026;Gaya EN;1,500,000.50"].join("\n");
    expect(rows(csv)[0].amount).toBe(1500000.5);
  });

  it("tanpa bukti desimal, tandanya pemisah ribuan — benar untuk rupiah", () => {
    // "1,500" di berkas rupiah berarti seribu lima ratus, bukan satu setengah.
    const csv = ["Tanggal;Keterangan;Jumlah", "31/12/2026;Bulat;1,500"].join("\n");
    expect(rows(csv)[0].amount).toBe(1500);
  });

  it("simbol mata uang & spasi dibuang; huruf asing tetap ditolak", () => {
    expect(rows("Tanggal,Keterangan,Jumlah\n31/12/2026,Ada Rp,Rp 1.500")[0].amount).toBe(1500);
    expect(issues("Tanggal,Keterangan,Jumlah\n31/12/2026,Bukan angka,seribu")[0].key).toMatch(/badAmount/);
  });
});

describe("semua-atau-tidak-sama-sekali tetap berlaku", () => {
  it("satu baris rusak membatalkan seluruh impor", () => {
    const csv = [
      "Tanggal,Keterangan,Jumlah",
      "31/12/2026,Baris benar,100",
      "bukan-tanggal,Baris rusak,200",
    ].join("\n");
    expect(parseStatementCsv(csv).ok).toBe(false);
  });

  it("seluruh masalah dilaporkan sekaligus, bukan satu per unggahan", () => {
    const csv = [
      "Tanggal,Keterangan,Jumlah",
      "31/02/2026,Tanggal mustahil,100",
      "31/12/2026,,100",
      "31/12/2026,Nominal ngawur,seribu",
    ].join("\n");
    const found = issues(csv);
    expect(found).toHaveLength(3);
    expect(found.map((i) => i.row)).toEqual([2, 3, 4]);
  });

  it("berkas kosong & berkas tanpa baris mutasi ditolak dengan sebab yang berbeda", () => {
    expect(issues("")[0].key).toMatch(/emptyFile/);
    expect(issues("Tanggal,Keterangan,Jumlah\n")[0].key).toMatch(/noRows/);
  });

  it("sel berkutip yang memuat pemisah tidak memecah barisnya", () => {
    const csv = ['Tanggal,Keterangan,Jumlah', '31/12/2026,"Bayar, PLN dan air",-250000'].join("\n");
    expect(rows(csv)[0].description).toBe("Bayar, PLN dan air");
  });
});

describe("bentuk spesifikasinya", () => {
  it("hanya Tanggal & Keterangan yang wajib — cara menyebut nominal boleh tiga-tiganya", () => {
    const required = STATEMENT_COLUMNS.filter((c) => c.required).map((c) => c.key);
    expect(required).toEqual(["date", "description"]);
  });

  it("tidak ada alias kembar antar-kolom — satu judul tak boleh punya dua arti", () => {
    const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seen = new Map<string, string>();
    for (const column of STATEMENT_COLUMNS) {
      for (const name of [column.header, ...(column.aliases ?? [])]) {
        const key = normalize(name);
        expect(seen.has(key), `"${name}" dipakai ${seen.get(key)} dan ${column.key}`).toBe(false);
        seen.set(key, column.key);
      }
    }
  });
});
