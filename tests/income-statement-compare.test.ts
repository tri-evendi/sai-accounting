/**
 * LABA RUGI KOMPARATIF (issue #557, langkah 2).
 *
 * ══ Janji yang dijaga di sini ══════════════════════════════════════════════
 * Menambahkan kolom pembanding TIDAK BOLEH mengubah laporan satu-kolom. Kalau
 * ia berubah, setiap laporan yang sudah pernah dicetak berhenti bisa
 * dihasilkan ulang dari bukunya sendiri — dan itu kerusakan yang jauh lebih
 * mahal daripada tidak punya kolom pembandingnya.
 *
 * Kolom pembanding hidup di `incomeStatementLayout`, bukan di layar, supaya
 * layar/PDF/lembar sebar sepakat — pelajaran #241, ketika cetakan membuat
 * pernyataan yang layarnya sengaja tolak keluarkan.
 */
import { describe, expect, it } from "vitest";

import { incomeStatementLayout, type IncomeStatementShape } from "@/lib/statement-layout";

const band = (lines: { code: string; name: string; amount: number }[]) => ({
  lines,
  total: lines.reduce((s, l) => s + l.amount, 0),
});

const buat = (
  penjualan: { code: string; name: string; amount: number }[],
  beban: { code: string; name: string; amount: number }[]
): IncomeStatementShape => {
  const sales = band(penjualan);
  const operatingExpense = band(beban);
  return {
    sales,
    cogs: band([]),
    operatingExpense,
    otherIncome: band([]),
    otherExpense: band([]),
    grossProfit: sales.total,
    operatingProfit: sales.total - operatingExpense.total,
    netIncome: sales.total - operatingExpense.total,
  } as IncomeStatementShape;
};

const KINI = buat(
  [{ code: "4101", name: "Penjualan", amount: 1_200 }],
  [{ code: "6101", name: "Beban Gaji", amount: 500 }]
);
const LALU = buat(
  [{ code: "4101", name: "Penjualan", amount: 1_000 }],
  [
    { code: "6101", name: "Beban Gaji", amount: 400 },
    { code: "6109", name: "Beban Lama", amount: 30 },
  ]
);

describe("laporan satu kolom TIDAK berubah", () => {
  it("tanpa pembanding, tidak ada satu pun medan `prior`/`percent`", () => {
    /* Bukan "prior bernilai nol" — medannya tidak ada sama sekali, sehingga
       konsumen yang belum tahu apa-apa tentang pembanding menggambar persis apa
       yang selalu mereka gambar. */
    const rows = incomeStatementLayout(KINI);
    for (const r of rows) {
      expect(r).not.toHaveProperty("prior");
      expect(r).not.toHaveProperty("percent");
    }
  });

  it("kolom BERJALAN pada laporan komparatif identik dengan laporan satu kolom", () => {
    /* Inti #557: keduanya angka yang sama persis, dibaca sekali. */
    const satu = incomeStatementLayout(KINI);
    const dua = incomeStatementLayout(KINI, undefined, LALU);

    const nominal = (rows: { amount: number | null }[]) => rows.map((r) => r.amount);
    /* Laporan komparatif memuat baris TAMBAHAN (akun yang hanya ada di periode
       lalu), jadi yang dibandingkan barisnya yang bersesuaian — bukan
       panjangnya. */
    const kunci = (r: { kind: string; code?: string; label: string }) =>
      `${r.kind}:${r.code ?? r.label}`;
    const petaDua = new Map(dua.map((r) => [kunci(r), r.amount]));
    for (const r of satu) {
      expect(petaDua.get(kunci(r)), `baris ${kunci(r)}`).toBe(r.amount);
    }
    expect(nominal(satu).length).toBeGreaterThan(0);
  });
});

describe("kolom pembanding", () => {
  const rows = incomeStatementLayout(KINI, undefined, LALU);
  const cari = (code: string) => rows.find((r) => r.code === code)!;

  it("baris akun membawa nilai lalu dan persennya", () => {
    expect(cari("4101").amount).toBe(1_200);
    expect(cari("4101").prior).toBe(1_000);
    expect(cari("4101").percent).toBe(20);
  });

  it("⚠ akun yang hanya ada di periode LALU tetap muncul, dengan nol di sisi kini", () => {
    /* Tanpa ini kolom pembanding berhenti berjumlah subtotalnya sendiri —
       laporan yang tidak menjumlahkan dirinya jauh lebih sulit terlihat
       daripada total yang salah. */
    const lama = cari("6109");
    expect(lama.amount).toBe(0);
    expect(lama.prior).toBe(30);
    expect(lama.percent).toBe(-100);
  });

  it("subtotal band memakai total periode lalu, bukan jumlah baris yang tampil", () => {
    const sub = rows.find((r) => r.kind === "subtotal" && r.section === "operatingExpense")!;
    expect(sub.amount).toBe(500);
    expect(sub.prior).toBe(430);
  });

  it("baris penutup membandingkan laba bersihnya", () => {
    const total = rows.find((r) => r.kind === "total")!;
    expect(total.amount).toBe(700);
    expect(total.prior).toBe(570);
  });

  it("judul band & baris kosong berpembanding `null`, bukan 0", () => {
    /* Nol adalah angka, dan judul band yang membawa "0" di kolom tahun lalu
       mengundang pembacanya menjumlahkannya. */
    const judul = rows.find((r) => r.kind === "section")!;
    expect(judul.amount).toBeNull();
    expect(judul.prior).toBeNull();
    expect(judul.percent).toBeNull();
  });
});
