/**
 * PENJAGA #495 butir 1 — biaya impor yang datang belakangan tidak boleh
 * menulis ulang jurnal yang sudah terbit.
 *
 * == Kegagalan yang dijaga =================================================
 * Cara termudah menyebar bea masuk yang datang tiga minggu kemudian adalah
 * mengubah `unit_cost` gerakan stok pembeliannya. Ia bekerja, angkanya jadi
 * "benar", dan ia menulis ulang HPP yang sudah diposting — sehingga laporan
 * yang sudah dicetak, ditandatangani, dan mungkin sudah dilaporkan pajaknya
 * diam-diam berbeda dari basis datanya.
 *
 * #510 sudah menolak jalan itu dengan kalimat yang eksplisit. Berkas ini
 * menjaga penggantinya benar: yang masih di gudang menempel, yang sudah
 * terjual jatuh ke selisih HPP.
 *
 * == Yang TIDAK diklaim berkas ini =========================================
 * Ini proporsi tingkat barang, bukan identitas lot. Di bawah rata-rata
 * tertimbang tidak ada cara jujur mengatakan "180 kg dari pembelian ini yang
 * terjual". Tes di bawah karena itu menguji proporsinya, bukan sesuatu yang
 * berpura-pura tahu lot mana yang keluar.
 */
import { describe, expect, it } from "vitest";

import { onHandShare, planLandedCost, type LandedCostLine } from "@/lib/landed-cost";

const baris = (itemId: number, value: number, quantity: number, onHand: number): LandedCostLine => ({
  itemId,
  value,
  quantity,
  onHand,
});

describe("berapa yang masih boleh menempel", () => {
  it("semuanya masih di gudang → seluruhnya menempel", () => {
    /* Keadaan paling lazim ketika biaya impornya datang cepat. */
    expect(onHandShare(1000, 1000)).toBe(1);
  });

  it("saldo LEBIH besar dari yang dibeli → tetap 1, tidak >1", () => {
    /* Ada pembelian lain sesudahnya. Tidak satu pun unit dari pembelian INI
       yang bisa sudah terjual, tapi biayanya juga tidak boleh berlipat. */
    expect(onHandShare(1000, 2500)).toBe(1);
  });

  it("habis terjual → nol menempel", () => {
    expect(onHandShare(1000, 0)).toBe(0);
  });

  it("saldo negatif tidak melahirkan bagian negatif", () => {
    /* Stok minus terjadi di buku nyata (barang keluar sebelum penerimaan
       dicatat). Ia tidak boleh menjadi biaya yang MENGURANGI persediaan. */
    expect(onHandShare(1000, -50)).toBe(0);
  });

  it("dibeli nol tidak membagi dengan nol", () => {
    expect(onHandShare(0, 100)).toBe(0);
    expect(Number.isFinite(onHandShare(0, 100))).toBe(true);
  });

  it("sebagian terjual → proporsional", () => {
    expect(onHandShare(1000, 820)).toBeCloseTo(0.82, 10);
  });
});

describe("tidak ada satu sen pun yang menguap", () => {
  it("menempel + jatuh ke selisih = yang dialokasikan, per baris", () => {
    /* Satu sen yang tidak ke mana-mana adalah jurnal yang tidak seimbang. */
    const plan = planLandedCost(
      [baris(1, 50_000_000, 1000, 820), baris(2, 13_500_000, 700, 0), baris(3, 9_000_000, 300, 300)],
      25_750_000,
      "value"
    );
    for (const line of plan.lines) {
      expect(line.capitalized + line.expensed).toBeCloseTo(line.allocated, 10);
    }
  });

  it("jumlah seluruh alokasi = total biayanya", () => {
    const plan = planLandedCost(
      [baris(1, 50_000_000, 1000, 820), baris(2, 13_500_000, 700, 0)],
      25_750_000,
      "value"
    );
    expect(plan.totalAllocated).toBe(25_750_000);
    expect(plan.totalCapitalized + plan.totalExpensed).toBeCloseTo(plan.totalAllocated, 10);
  });

  it("angka yang tidak habis dibagi tetap berjumlah utuh", () => {
    /* Tiga baris sama rata atas 100 adalah tempat pembulatan paling mudah
       kehilangan satu sen. */
    const plan = planLandedCost(
      [baris(1, 100, 10, 10), baris(2, 100, 10, 10), baris(3, 100, 10, 10)],
      100,
      "value"
    );
    expect(plan.totalAllocated).toBe(100);
  });
});

describe("yang sudah terjual TIDAK menempel — inti aturannya", () => {
  it("barang yang habis terjual: seluruh biayanya ke selisih HPP", () => {
    const plan = planLandedCost([baris(1, 10_000_000, 500, 0)], 4_000_000, "value");
    expect(plan.lines[0].capitalized).toBe(0);
    expect(plan.lines[0].expensed).toBe(4_000_000);
  });

  it("barang yang utuh di gudang: seluruh biayanya menempel", () => {
    const plan = planLandedCost([baris(1, 10_000_000, 500, 500)], 4_000_000, "value");
    expect(plan.lines[0].capitalized).toBe(4_000_000);
    expect(plan.lines[0].expensed).toBe(0);
  });

  it("82% tersisa → 82% menempel, 18% ke selisih", () => {
    const plan = planLandedCost([baris(1, 10_000_000, 1000, 820)], 25_750_000, "value");
    expect(plan.lines[0].capitalized).toBeCloseTo(21_115_000, 2);
    expect(plan.lines[0].expensed).toBeCloseTo(4_635_000, 2);
  });
});

describe("dasar sebarnya benar-benar berbeda, dan itu sebabnya ia wajib dipilih", () => {
  /* Rempah yang harga per kg-nya berselisih empat kali lipat: "menurut nilai"
     dan "menurut berat" memberi harga pokok yang sangat berbeda. */
  const lines = [baris(1, 50_000_000, 1000, 1000), baris(2, 13_500_000, 1000, 1000)];

  it("menurut NILAI mengikuti harga", () => {
    const plan = planLandedCost(lines, 6_350_000, "value");
    expect(plan.lines[0].allocated).toBeGreaterThan(plan.lines[1].allocated);
  });

  it("menurut BERAT membagi rata saat kuantitasnya sama", () => {
    const plan = planLandedCost(lines, 6_350_000, "weight");
    expect(plan.lines[0].allocated).toBeCloseTo(plan.lines[1].allocated, 2);
  });

  it("dasarnya ikut dilaporkan, bukan disimpan diam-diam", () => {
    /* Yang dipilih harus bisa dipertanggungjawabkan belakangan. */
    expect(planLandedCost(lines, 1_000, "weight").basis).toBe("weight");
  });
});

describe("bentuk yang tak masuk akal tidak melahirkan angka", () => {
  it("tanpa baris → rencana kosong, bukan lemparan", () => {
    const plan = planLandedCost([], 5_000_000, "value");
    expect(plan.lines).toEqual([]);
    expect(plan.totalAllocated).toBe(0);
  });

  it("total nol atau negatif → tidak ada yang disebar", () => {
    for (const total of [0, -1_000_000]) {
      const plan = planLandedCost([baris(1, 100, 10, 10)], total, "value");
      expect(plan.totalAllocated).toBe(0);
      expect(plan.totalCapitalized).toBe(0);
    }
  });

  it("seluruh dasar nol → tidak membagi dengan nol", () => {
    const plan = planLandedCost([baris(1, 0, 0, 0)], 5_000_000, "value");
    expect(plan.lines.every((l) => Number.isFinite(l.allocated))).toBe(true);
    expect(plan.totalAllocated).toBe(0);
  });
});

describe("memakai penyebar #510, bukan salinannya", () => {
  it("hasilnya identik dengan `allocateAdditionalCost` untuk masukan yang sama", async () => {
    /*
     * Dua penyebar yang "sama" adalah dua penyebar yang suatu hari membulatkan
     * berbeda — lalu dua dokumen atas kontainer yang sama menghasilkan harga
     * pokok yang berbeda, dan tidak ada yang bisa mengatakan mana yang benar.
     */
    const { allocateAdditionalCost } = await import("@/lib/wizard");
    const lines = [baris(1, 333, 7, 7), baris(2, 667, 11, 11), baris(3, 1000, 3, 3)];
    const langsung = allocateAdditionalCost(
      lines.map((l) => ({ value: l.value, quantity: l.quantity })),
      1_234_567,
      "value"
    );
    const plan = planLandedCost(lines, 1_234_567, "value");
    expect(plan.lines.map((l) => l.allocated)).toEqual(langsung);
  });
});
