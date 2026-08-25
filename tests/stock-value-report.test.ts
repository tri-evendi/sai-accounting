/**
 * NILAI PERSEDIAAN PER PERIODE (issue #492).
 *
 * Yang diuji di sini bukan "fungsinya memulangkan angka", melainkan sifat-sifat
 * yang membuat laporan ini boleh dipakai sebagai lampiran: sambungan antar
 * periode, kesamaan dengan neraca, dan kejujurannya soal biaya yang tak
 * diketahui.
 */
import { describe, expect, it } from "vitest";
import {
  buildStockValuePeriodReport,
  type ValuationItem,
} from "@/lib/stock-value-report";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Akhir hari — batas atas jendela, seperti yang disusun pemanggil sebenarnya. */
const end = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

function item(movements: ValuationItem["movements"]): ValuationItem {
  return { id: 1, code: "100003", name: "BLACK PEPPER", unit: "kg", movements };
}

describe("saldo & nilai dalam satu jendela", () => {
  const beras = item([
    { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
    { date: d("2024-06-20"), type: "out", quantity: 40, unitCost: null },
  ]);

  it("saldo akhir = awal + masuk − keluar", () => {
    const r = buildStockValuePeriodReport([beras], d("2024-06-01"), end("2024-06-30")).rows[0];
    expect(r.openingQty).toBe(0);
    expect(r.inQty).toBe(100);
    expect(r.outQty).toBe(40);
    expect(r.closingQty).toBe(60);
  });

  it("nilai akhir = saldo akhir × rata-rata tertimbang — angka yang dicocokkan ke neraca", () => {
    const r = buildStockValuePeriodReport([beras], d("2024-06-01"), end("2024-06-30")).rows[0];
    expect(r.closingValue).toBe(600_000); // 60 × 10.000
  });

  it("nilai masuk memakai harga pokok yang DICATAT, bukan rata-rata", () => {
    const r = buildStockValuePeriodReport([beras], d("2024-06-01"), end("2024-06-30")).rows[0];
    expect(r.inValue).toBe(1_000_000); // 100 × 10.000
  });

  it("nilai keluar memakai rata-rata PADA TANGGALNYA — sama dengan yang diposting HPP", () => {
    const r = buildStockValuePeriodReport([beras], d("2024-06-01"), end("2024-06-30")).rows[0];
    expect(r.outValue).toBe(400_000); // 40 × 10.000
  });
});

describe("sambungan antar periode — sifat yang paling menentukan", () => {
  /*
   * Kalau dua angka ini pernah berbeda, laporannya tidak bisa dipercaya untuk
   * apa pun: neraca akhir Juni dan neraca awal Juli akan menyebut persediaan
   * yang berbeda tanpa satu pun transaksi di antaranya.
   */
  const kopi = item([
    { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
    { date: d("2024-07-05"), type: "in", quantity: 100, unitCost: 20_000 },
    { date: d("2024-07-20"), type: "out", quantity: 50, unitCost: null },
  ]);

  it("saldo akhir periode N = saldo awal periode N+1", () => {
    const juni = buildStockValuePeriodReport([kopi], d("2024-06-01"), end("2024-06-30")).rows[0];
    const juli = buildStockValuePeriodReport([kopi], d("2024-07-01"), end("2024-07-31")).rows[0];
    expect(juli.openingQty).toBe(juni.closingQty);
  });

  it("NILAI akhir periode N = NILAI awal periode N+1", () => {
    const juni = buildStockValuePeriodReport([kopi], d("2024-06-01"), end("2024-06-30")).rows[0];
    const juli = buildStockValuePeriodReport([kopi], d("2024-07-01"), end("2024-07-31")).rows[0];
    expect(juli.openingValue).toBe(juni.closingValue);
  });
});

describe("selisih penilaian ditampakkan, bukan disembunyikan", () => {
  /*
   * Di bawah rata-rata tertimbang, `awal + masuk − keluar` tidak selalu sama
   * dengan `akhir`. Yang berbahaya adalah menyembunyikan selisihnya dengan
   * menurunkan `closingValue` dari ketiga angka lain — laporan yang "rapi"
   * tetapi TIDAK sama dengan neraca.
   */

  it("nilai akhir tetap saldo × rata-rata, bukan turunan baris lain", () => {
    const kopi = item([
      { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
      { date: d("2024-07-05"), type: "in", quantity: 100, unitCost: 20_000 },
    ]);
    const juli = buildStockValuePeriodReport([kopi], d("2024-07-01"), end("2024-07-31")).rows[0];
    expect(juli.closingQty).toBe(200);
    expect(juli.closingValue).toBe(3_000_000); // 200 × 15.000
  });

  it("tanpa gerakan keluar, barisnya menutup sendiri — selisihnya nol", () => {
    /* Bukan kebetulan: saldo awal dinilai pada rata-rata SEBELUM periode
       (10.000), jadi pergeseran rata-rata belum menyentuhnya. */
    const kopi = item([
      { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
      { date: d("2024-07-05"), type: "in", quantity: 100, unitCost: 20_000 },
    ]);
    const juli = buildStockValuePeriodReport([kopi], d("2024-07-01"), end("2024-07-31")).rows[0];
    expect(juli.openingValue).toBe(1_000_000);
    expect(juli.inValue).toBe(2_000_000);
    expect(juli.revaluation).toBe(0);
  });

  it("KELUAR sebelum pembelian yang menggeser rata-rata memunculkan selisihnya", () => {
    /*
     * Keluar 50 kg pada 2 Juli dinilai 10.000 (rata-rata saat itu), sedangkan
     * sisa 150 kg pada akhir Juli dinilai 15.000. Selisih −250.000 itu NYATA:
     * ia penilaian ulang barang lama akibat pembelian yang lebih mahal.
     */
    const kopi = item([
      { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
      { date: d("2024-07-02"), type: "out", quantity: 50, unitCost: null },
      { date: d("2024-07-10"), type: "in", quantity: 100, unitCost: 20_000 },
    ]);
    const juli = buildStockValuePeriodReport([kopi], d("2024-07-01"), end("2024-07-31")).rows[0];

    expect(juli.openingValue).toBe(1_000_000); // 100 × 10.000
    expect(juli.inValue).toBe(2_000_000); // 100 × 20.000
    expect(juli.outValue).toBe(500_000); // 50 × 10.000 — rata-rata PADA 2 Juli
    expect(juli.closingQty).toBe(150);
    expect(juli.closingValue).toBe(2_250_000); // 150 × 15.000

    expect(juli.revaluation).toBe(-250_000);
    /* Dan inilah definisinya, ditulis ulang sebagai persamaan supaya ia tak
       bisa diam-diam berubah makna. */
    expect(juli.revaluation).toBe(
      juli.closingValue! - (juli.openingValue! + juli.inValue! - juli.outValue!)
    );
  });

  it("barang berharga tetap tidak punya selisih sama sekali", () => {
    const tetap = item([
      { date: d("2024-06-10"), type: "in", quantity: 100, unitCost: 10_000 },
      { date: d("2024-07-02"), type: "out", quantity: 50, unitCost: null },
      { date: d("2024-07-10"), type: "in", quantity: 50, unitCost: 10_000 },
    ]);
    const juli = buildStockValuePeriodReport([tetap], d("2024-07-01"), end("2024-07-31")).rows[0];
    expect(juli.revaluation).toBe(0);
  });
});

describe("biaya yang tak diketahui: null, bukan nol", () => {
  it("barang tanpa satu pun `in` bercosting bernilai null dan dihitung terpisah", () => {
    const lama = item([{ date: d("2024-06-10"), type: "in", quantity: 100, unitCost: null }]);
    const r = buildStockValuePeriodReport([lama], d("2024-06-01"), end("2024-06-30"));
    expect(r.rows[0].closingQty).toBe(100);
    expect(r.rows[0].closingValue).toBeNull();
    /* Barang yang ADA wujudnya tetapi tak bernilai membuat TOTALnya kurang —
       mengatakannya adalah yang menjaga total itu jujur. */
    expect(r.uncostedCount).toBe(1);
  });

  it("`null` tidak menular ke total sebagai NaN", () => {
    const lama = item([{ date: d("2024-06-10"), type: "in", quantity: 100, unitCost: null }]);
    const r = buildStockValuePeriodReport([lama], d("2024-06-01"), end("2024-06-30"));
    expect(Number.isNaN(r.totalClosingValue)).toBe(false);
    expect(r.totalClosingValue).toBe(0);
  });
});

describe("barang yang tidak bergerak", () => {
  it("bersaldo dari sebelumnya TETAP muncul meski periodenya sepi", () => {
    /* Ini yang diminta issue: barang tanpa gerakan di dalam periode tetapi
       bersaldo dari sebelumnya wajib tampil dengan awal = akhir. */
    const diam = item([{ date: d("2024-01-10"), type: "in", quantity: 80, unitCost: 5_000 }]);
    const r = buildStockValuePeriodReport([diam], d("2024-06-01"), end("2024-06-30"));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].openingQty).toBe(80);
    expect(r.rows[0].closingQty).toBe(80);
    expect(r.rows[0].openingValue).toBe(r.rows[0].closingValue);
    expect(r.dormantCount).toBe(0);
  });

  it("tak bersaldo dan tak bergerak DIBUANG dari baris, tetapi dihitung", () => {
    const kosong = item([]);
    const r = buildStockValuePeriodReport([kosong], d("2024-06-01"), end("2024-06-30"));
    expect(r.rows).toEqual([]);
    expect(r.dormantCount).toBe(1);
  });
});

describe("dua barang bernama sama dibedakan — #493 bertemu #492", () => {
  it("keduanya jadi baris sendiri, dan kodenya ikut", () => {
    const a: ValuationItem = {
      id: 6,
      code: "100006",
      name: "LONG PEPPER",
      unit: "kg",
      movements: [{ date: d("2024-12-31"), type: "in", quantity: 1101, unitCost: 50_000 }],
    };
    const b: ValuationItem = {
      id: 10,
      code: "100010",
      name: "LONG PEPPER",
      unit: "kg",
      movements: [{ date: d("2024-12-31"), type: "in", quantity: 13_684.06, unitCost: 13_500 }],
    };
    const r = buildStockValuePeriodReport([a, b], d("2024-01-01"), end("2024-12-31"));
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.code)).toEqual(["100006", "100010"]);
    /* Nilainya berbeda hampir empat kali lipat per kg — kalau keduanya pernah
       tergabung jadi satu baris, angka inilah yang hilang. */
    expect(r.rows[0].closingValue).not.toBe(r.rows[1].closingValue);
  });
});

describe("jendela inklusif di kedua ujungnya", () => {
  it("gerakan tepat pada tanggal `to` ikut terhitung", () => {
    /* Berkas pengguna mencatat seluruh saldo awal pada 31 Des 2024 — tepat di
       ujung periode. Jendela yang eksklusif akan memulangkan laporan kosong. */
    const x = item([{ date: d("2024-12-31"), type: "in", quantity: 10, unitCost: 1_000 }]);
    const r = buildStockValuePeriodReport([x], d("2024-01-01"), end("2024-12-31"));
    expect(r.rows[0].inQty).toBe(10);
  });

  it("gerakan tepat pada tanggal `from` masuk ke MASUK, bukan ke saldo awal", () => {
    const x = item([{ date: d("2024-06-01"), type: "in", quantity: 10, unitCost: 1_000 }]);
    const r = buildStockValuePeriodReport([x], d("2024-06-01"), end("2024-06-30"));
    expect(r.rows[0].openingQty).toBe(0);
    expect(r.rows[0].inQty).toBe(10);
  });
});
