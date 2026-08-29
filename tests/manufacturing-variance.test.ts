/**
 * Varians produksi (#495 butir 3, tahap 3).
 *
 * Varians di buku ini adalah INFORMASI, bukan jurnal: WIP menampung biaya
 * sesungguhnya dan barang jadi menerima seluruhnya, jadi tak ada selisih yang
 * tertinggal untuk dijurnal. Yang diuji di sini karena itu adalah aritmetika
 * pelaporannya — dan arah tandanya, yang merupakan kekeliruan paling mudah
 * terjadi pada laporan varians.
 */
import { describe, expect, it } from "vitest";
import {
  arahVarians,
  ringkasanVarians,
  variansBahan,
  variansEfisiensi,
  variansHasil,
  type KomponenVarians,
  type OperasiVarians,
} from "@/lib/manufacturing/variance";
import { variansPerintahProduksi } from "@/lib/manufacturing/variance-report";
import type { Prisma } from "@/generated/prisma/client";

const KOMPONEN: KomponenVarians[] = [
  // Boros 50 kg pada harga 45.000.
  {
    itemId: 1,
    itemName: "Lada Hitam Mentah",
    plannedQuantity: 1000,
    issuedQuantity: 1050,
    issuedCost: 47_250_000,
  },
  // Hemat 2 karung pada harga 5.000.
  { itemId: 3, itemName: "Karung Goni", plannedQuantity: 20, issuedQuantity: 18, issuedCost: 90_000 },
];

const OPERASI: OperasiVarians[] = [
  {
    sequence: 1,
    name: "Sortir",
    standardHours: 8,
    actualHours: 10,
    laborRate: 25_000,
    overheadRate: 10_000,
  },
];

describe("arahVarians", () => {
  it("menyebut arah dengan KATA, bukan hanya tanda", () => {
    // Pada laporan biaya, angka negatif bisa berarti "hemat" maupun "kurang
    // dibebankan" tergantung pembacanya — dan satu dari dua tafsir itu terbalik.
    expect(arahVarians(1000)).toBe("merugikan");
    expect(arahVarians(-1000)).toBe("menguntungkan");
    expect(arahVarians(0)).toBe("tepat");
  });

  it("menganggap selisih di bawah setengah sen sebagai tepat", () => {
    expect(arahVarians(0.004)).toBe("tepat");
  });
});

describe("variansBahan", () => {
  const baris = variansBahan(KOMPONEN);

  it("menilai selisih kuantitas pada harga saat dikeluarkan", () => {
    expect(baris[0]).toMatchObject({
      itemName: "Lada Hitam Mentah",
      selisihKuantitas: 50,
      hargaPerUnit: 45_000,
      selisihNilai: 2_250_000,
      arah: "merugikan",
    });
  });

  it("memakai lebih SEDIKIT adalah menguntungkan", () => {
    expect(baris[1]).toMatchObject({
      itemName: "Karung Goni",
      selisihKuantitas: -2,
      selisihNilai: -10_000,
      arah: "menguntungkan",
    });
  });

  it("MELEWATI bahan yang belum dikeluarkan", () => {
    // Perintah yang belum diterbitkan belum boros dan belum hemat.
    const b = variansBahan([{ ...KOMPONEN[0], issuedQuantity: null, issuedCost: null }]);
    expect(b).toEqual([]);
  });
});

describe("variansEfisiensi", () => {
  it("memisahkan bagian upah dari bagian overhead", () => {
    // Keduanya mendarat di akun berbeda; digabung, "yang mana yang membengkak"
    // hanya bisa dijawab dengan tebakan.
    expect(variansEfisiensi(OPERASI)[0]).toMatchObject({
      selisihJam: 2,
      selisihUpah: 50_000,
      selisihOverhead: 20_000,
      arah: "merugikan",
    });
  });

  it("lebih cepat dari standar adalah menguntungkan", () => {
    const v = variansEfisiensi([{ ...OPERASI[0], actualHours: 6 }])[0];
    expect(v.selisihJam).toBe(-2);
    expect(v.arah).toBe("menguntungkan");
  });

  it("MELEWATI operasi yang belum dilaporkan", () => {
    // Memperlakukan `null` sebagai nol jam akan melaporkan penghematan penuh
    // yang tidak pernah ada.
    expect(variansEfisiensi([{ ...OPERASI[0], actualHours: null }])).toEqual([]);
  });
});

describe("variansHasil — arahnya TERBALIK", () => {
  it("menghasilkan KURANG dari rencana itu merugikan", () => {
    // Kekeliruan paling mudah pada laporan varians: memakai tanda yang sama
    // dengan varians masukan, lalu melaporkan kerugian sebagai penghematan.
    const v = variansHasil(950, 900, 47_000)!;
    expect(v.selisih).toBe(-50);
    expect(v.arah).toBe("merugikan");
  });

  it("menghasilkan LEBIH dari rencana itu menguntungkan", () => {
    expect(variansHasil(950, 1000, 47_000)!.arah).toBe("menguntungkan");
  });

  it("null selama perintah belum selesai", () => {
    expect(variansHasil(950, null, 47_000)).toBeNull();
  });
});

describe("ringkasanVarians", () => {
  const r = ringkasanVarians(KOMPONEN, OPERASI, 950, 900, 47_000);

  it("menjumlahkan tiap sumbu secara terpisah", () => {
    expect(r.totalBahan).toBe(2_240_000); // 2.250.000 − 10.000
    expect(r.totalUpah).toBe(50_000);
    expect(r.totalOverhead).toBe(20_000);
    expect(r.totalMasukan).toBe(2_310_000);
    expect(r.arah).toBe("merugikan");
  });

  it("TIDAK menjumlahkan varians hasil ke total masukan", () => {
    // Sumbunya berbeda (keluaran, bukan masukan). Menjumlahkannya akan
    // menghitung penyimpangan yang sama dua kali: bahan yang boros sudah
    // muncul di totalBahan, dan akibatnya pada hasil muncul lagi di `hasil`.
    expect(r.hasil).not.toBeNull();
    expect(r.totalMasukan).toBe(r.totalBahan + r.totalUpah + r.totalOverhead);
  });

  it("perintah yang belum diterbitkan tidak punya varians masukan", () => {
    const kosong = ringkasanVarians(
      KOMPONEN.map((k) => ({ ...k, issuedQuantity: null, issuedCost: null })),
      OPERASI.map((o) => ({ ...o, actualHours: null })),
      950,
      null,
      0
    );
    expect(kosong.totalMasukan).toBe(0);
    expect(kosong.arah).toBe("tepat");
    expect(kosong.hasil).toBeNull();
  });
});

// ─── Pembaca laporan (klien dalam-ingatan, tanpa MySQL) ────────────────────

describe("variansPerintahProduksi", () => {
  const client = (order: unknown) =>
    ({ productionOrder: { findUnique: async () => order } }) as unknown as Prisma.TransactionClient;

  const PERINTAH = {
    orderNo: "PO.2026.08.00001",
    status: "finished",
    plannedQuantity: 950,
    producedQuantity: 900,
    outputItem: { name: "Lada Hitam Bersih" },
    components: [
      {
        itemId: 1,
        itemName: "Lada Hitam Mentah",
        plannedQuantity: 1000,
        issuedQuantity: 1050,
        issuedCost: 47_250_000,
      },
    ],
    operations: [
      {
        sequence: 1,
        name: "Sortir",
        standardHours: 8,
        actualHours: 10,
        laborRate: 25_000,
        overheadRate: 10_000,
      },
    ],
  };

  it("menurunkan harga pokok per unit dari biaya sesungguhnya", () => {
    return variansPerintahProduksi(client(PERINTAH), 1).then((r) => {
      // 47.250.000 bahan + 250.000 upah + 100.000 overhead = 47.600.000 ÷ 900
      expect(r?.hargaPokokPerUnit).toBe(52_888.89);
    });
  });

  it("melaporkan boros bahan dan lambat kerja sekaligus", async () => {
    const r = await variansPerintahProduksi(client(PERINTAH), 1);
    expect(r?.varians.totalBahan).toBe(2_250_000);
    expect(r?.varians.totalUpah).toBe(50_000);
    expect(r?.varians.arah).toBe("merugikan");
  });

  it("perintah yang BELUM selesai tidak dinilai per unit", async () => {
    // Memaksakan angka di situ berarti menilai barang yang belum ada.
    const r = await variansPerintahProduksi(
      client({ ...PERINTAH, status: "released", producedQuantity: null }),
      1
    );
    expect(r?.hargaPokokPerUnit).toBe(0);
    expect(r?.varians.hasil).toBeNull();
  });

  it("null untuk perintah yang tidak ada", async () => {
    expect(await variansPerintahProduksi(client(null), 99)).toBeNull();
  });
});
