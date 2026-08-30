/**
 * Resep produksi — penurunan bertingkat & biaya standar (#495 butir 3).
 *
 * Acuannya proses rempah PT SAI, yang datanya memang ada di produksi: lada
 * mentah disortir & dikeringkan menjadi lada bersih, dengan susut yang nyata.
 *
 * Murni: tanpa DATABASE_URL, sikap yang sama dengan `document-chain.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  BomCycleError,
  BomInvalidError,
  biayaStandar,
  explodeBom,
  kebutuhanKotor,
  type BomInput,
} from "@/lib/manufacturing/bom";

const LADA_MENTAH = 1;
const LADA_BERSIH = 2;
const KARUNG = 3;
const LADA_SETENGAH = 4;

/** Resep sederhana: 1000 kg mentah + 20 karung → 950 kg bersih. */
const RESEP_BERSIH: BomInput = {
  id: 1,
  code: "BOM-LADA-BERSIH",
  outputItemId: LADA_BERSIH,
  outputQuantity: 950,
  components: [
    { itemId: LADA_MENTAH, itemName: "Lada Hitam Mentah", quantity: 1000 },
    { itemId: KARUNG, itemName: "Karung Goni", quantity: 20 },
  ],
  operations: [
    {
      sequence: 1,
      name: "Sortir",
      workCenterId: 1,
      standardHours: 8,
      laborRate: 25_000,
      overheadRate: 10_000,
    },
  ],
};

describe("kebutuhanKotor", () => {
  it("tanpa susut, kotor = bersih", () => {
    expect(kebutuhanKotor(100)).toBe(100);
    expect(kebutuhanKotor(100, 0)).toBe(100);
  });

  it("membagi, BUKAN mengalikan — dan selisihnya besar", () => {
    // bersih/(1−susut) = 200; bersih×(1+susut) = 150. Yang kedua salah: susut
    // dihitung dari yang DIKELUARKAN, bukan dari kebutuhannya.
    expect(kebutuhanKotor(100, 50)).toBe(200);
    expect(kebutuhanKotor(100, 50)).not.toBe(150);
  });

  it("susut 5% pada 950 kg menuntut 1000 kg", () => {
    expect(kebutuhanKotor(950, 5)).toBe(1000);
  });

  it("menolak susut 100% ke atas — itu pembuangan, bukan resep", () => {
    expect(() => kebutuhanKotor(100, 100)).toThrow(BomInvalidError);
    expect(() => kebutuhanKotor(100, 150)).toThrow(BomInvalidError);
  });

  it("menolak susut negatif", () => {
    expect(() => kebutuhanKotor(100, -1)).toThrow(BomInvalidError);
  });
});

describe("explodeBom — satu tingkat", () => {
  it("menskalakan proporsional terhadap keluaran resepnya", () => {
    const { daun, antara } = explodeBom(RESEP_BERSIH, 1900);
    expect(antara).toEqual([]);
    expect(daun.map((d) => [d.itemName, d.quantity])).toEqual([
      ["Karung Goni", 40],
      ["Lada Hitam Mentah", 2000],
    ]);
  });

  it("mengizinkan pecahan — setengah kali jalan lazim pada proses curah", () => {
    const { daun } = explodeBom(RESEP_BERSIH, 475);
    expect(daun.find((d) => d.itemId === LADA_MENTAH)?.quantity).toBe(500);
  });

  it("menolak resep yang keluarannya nol — pembaginya tidak ada", () => {
    expect(() => explodeBom({ ...RESEP_BERSIH, outputQuantity: 0 }, 100)).toThrow(BomInvalidError);
  });

  it("menaikkan kebutuhan bahan yang punya susut sendiri", () => {
    const resep: BomInput = {
      ...RESEP_BERSIH,
      components: [
        { itemId: LADA_MENTAH, itemName: "Lada Hitam Mentah", quantity: 950, scrapPercent: 5 },
      ],
    };
    expect(explodeBom(resep, 950).daun[0].quantity).toBe(1000);
  });
});

describe("explodeBom — bertingkat", () => {
  /** Setengah jadi dibuat sendiri: 1000 mentah → 980 setengah. */
  const RESEP_SETENGAH: BomInput = {
    id: 2,
    code: "BOM-LADA-SETENGAH",
    outputItemId: LADA_SETENGAH,
    outputQuantity: 980,
    components: [{ itemId: LADA_MENTAH, itemName: "Lada Hitam Mentah", quantity: 1000 }],
  };
  /** Bersih kini dibuat dari SETENGAH JADI, bukan langsung dari mentah. */
  const RESEP_ATAS: BomInput = {
    id: 3,
    code: "BOM-LADA-BERSIH-2",
    outputItemId: LADA_BERSIH,
    outputQuantity: 950,
    components: [
      { itemId: LADA_SETENGAH, itemName: "Lada Setengah Jadi", quantity: 980 },
      { itemId: KARUNG, itemName: "Karung Goni", quantity: 20 },
    ],
  };
  const peta = new Map([[LADA_SETENGAH, RESEP_SETENGAH]]);

  it("menurunkan sampai DAUN — yang benar-benar diambil dari gudang", () => {
    const { daun } = explodeBom(RESEP_ATAS, 950, peta);
    expect(daun.map((d) => [d.itemName, d.quantity])).toEqual([
      ["Karung Goni", 20],
      ["Lada Hitam Mentah", 1000],
    ]);
    // Setengah jadi TIDAK muncul sebagai daun: ia dibuat, bukan diambil.
    expect(daun.some((d) => d.itemId === LADA_SETENGAH)).toBe(false);
  });

  it("melaporkan rakitan antara secara terpisah", () => {
    const { antara } = explodeBom(RESEP_ATAS, 950, peta);
    expect(antara.map((a) => [a.itemName, a.quantity, a.level])).toEqual([
      ["Lada Setengah Jadi", 980, 1],
    ]);
  });

  it("menggabungkan bahan yang sama dari dua cabang", () => {
    // Mentah dipakai LANGSUNG di atas dan lewat setengah jadi.
    const resep: BomInput = {
      ...RESEP_ATAS,
      components: [
        ...RESEP_ATAS.components,
        { itemId: LADA_MENTAH, itemName: "Lada Hitam Mentah", quantity: 50 },
      ],
    };
    const { daun } = explodeBom(resep, 950, peta);
    const mentah = daun.find((d) => d.itemId === LADA_MENTAH);
    expect(mentah?.quantity).toBe(1050);
    // Level DANGKAL yang menang — ia dilaporkan di tempat pertama dibutuhkan.
    expect(mentah?.level).toBe(1);
  });

  it("MENOLAK resep yang melingkar, dengan jalurnya", () => {
    // Tanpa penjaga ini rekursinya berjalan sampai tumpukan panggilan habis —
    // terbaca sebagai aplikasi mati, bukan sebagai resep yang salah.
    const a: BomInput = {
      id: 10, code: "BOM-A", outputItemId: 100, outputQuantity: 1,
      components: [{ itemId: 200, itemName: "B", quantity: 1 }],
    };
    const b: BomInput = {
      id: 11, code: "BOM-B", outputItemId: 200, outputQuantity: 1,
      components: [{ itemId: 100, itemName: "A", quantity: 1 }],
    };
    const melingkar = new Map([[200, b], [100, a]]);
    try {
      explodeBom(a, 1, melingkar);
      expect.unreachable("seharusnya melempar");
    } catch (e) {
      expect(e).toBeInstanceOf(BomCycleError);
      expect((e as BomCycleError).jalur).toEqual(["BOM-A", "BOM-B", "BOM-A"]);
    }
  });
});

describe("biayaStandar", () => {
  const harga = new Map([
    [LADA_MENTAH, 45_000],
    [KARUNG, 5_000],
  ]);

  it("menjumlahkan bahan, tenaga kerja, dan overhead diserap", () => {
    const b = biayaStandar(RESEP_BERSIH, 950, harga);
    expect(b.bahan).toBe(1000 * 45_000 + 20 * 5_000); // 45.100.000
    expect(b.tenagaKerja).toBe(8 * 25_000); // 200.000
    expect(b.overhead).toBe(8 * 10_000); // 80.000
    expect(b.total).toBe(45_380_000);
    expect(b.perUnit).toBe(round2(45_380_000 / 950));
  });

  it("menskalakan jam standar bersama bahannya", () => {
    const b = biayaStandar(RESEP_BERSIH, 1900, harga);
    expect(b.tenagaKerja).toBe(16 * 25_000);
    expect(b.overhead).toBe(16 * 10_000);
  });

  it("MELAPORKAN bahan tanpa harga pokok, tidak menganggapnya nol", () => {
    // Barang tanpa harga pokok bukan barang gratis. Biaya standar yang
    // melewatkannya diam-diam akan menyatakan margin yang tak pernah ada.
    const b = biayaStandar(RESEP_BERSIH, 950, new Map([[LADA_MENTAH, 45_000]]));
    expect(b.bahanTanpaHarga.map((x) => x.itemName)).toEqual(["Karung Goni"]);
    expect(b.bahan).toBe(45_000_000);
  });

  it("resep tanpa operasi tidak menyerap apa pun", () => {
    const b = biayaStandar({ ...RESEP_BERSIH, operations: [] }, 950, harga);
    expect(b.tenagaKerja).toBe(0);
    expect(b.overhead).toBe(0);
  });
});

/** Pembulatan uang yang dipakai tes di atas — sama dengan modulnya. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
