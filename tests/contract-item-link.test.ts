/**
 * BARANG KONTRAK DARI MASTER (issue #491).
 *
 * ══ Kenapa ini mendesak, dan sejak kapan ═══════════════════════════════════
 * Sampai #493 nama barang adalah kunci, jadi teks bebas di `contract_items`
 * memang menunjuk tepat satu barang. #493 mencabut kekunciannya: dua barang
 * kini boleh bernama sama persis selama kodenya berbeda — `LONG PEPPER` kode
 * 100006 (±Rp 50.000/kg) dan 100010 (±Rp 13.500/kg) di data pengguna.
 *
 * Sejak itu teks bebas TIDAK BISA lagi menyatakan barang mana yang dimaksud.
 * Lebih buruk: `buildContractOutstanding` menggabungkan baris bernama sama
 * ("repeated names are merged, so their cap is their sum"), sehingga dua barang
 * yang harganya berselisih empat kali lipat berbagi SATU pagu sisa kontrak.
 *
 * ══ Yang TIDAK benar di badan issue versi pertama ══════════════════════════
 * Issue ini semula menyebut bahwa selisih besar-kecil huruf dan spasi ganda
 * memecah pencocokan. Itu keliru: `normalizeItemName` sudah merapatkan spasi
 * dan menghuruf-kecilkan sejak awal. Uji di bawah mengunci sifat itu supaya
 * klaim yang salah tidak lahir kembali.
 */
import { describe, expect, it } from "vitest";
import {
  buildContractOutstanding,
  chainLineKey,
  normalizeItemName,
} from "@/lib/document-chain";

describe("kunci baris: id bila ada, nama bila tidak", () => {
  it("baris ber-itemId berkunci id", () => {
    expect(chainLineKey({ itemId: 10, itemName: "LONG PEPPER" })).toBe("#10");
  });

  it("baris tanpa itemId berkunci nama yang dinormalkan", () => {
    expect(chainLineKey({ itemId: null, itemName: "  Long   Pepper " })).toBe("long pepper");
  });

  it("kunci-id dan kunci-nama tak bisa bertabrakan", () => {
    /* `normalizeItemName` tak pernah MENAMBAH karakter, jadi ia tak akan pernah
       menghasilkan string berawalan "#" dari nama yang tidak berawalan itu. */
    expect(normalizeItemName("10")).not.toBe("#10");
    expect(chainLineKey({ itemId: 10, itemName: "apa pun" }).startsWith("#")).toBe(true);
  });
});

describe("spasi & besar-kecil huruf memang SUDAH tertangani", () => {
  it("dua spasi dan huruf besar tidak memecah baris", () => {
    /* Contoh nyata dari berkas pengguna: `ALPINIA GALANGA /  FRUCTUS GALANGA`
       memang ditulis dengan dua spasi di tengahnya. */
    const a = normalizeItemName("ALPINIA GALANGA /  FRUCTUS GALANGA");
    const b = normalizeItemName("Alpinia Galanga / Fructus Galanga");
    expect(a).toBe(b);
  });
});

describe("dua barang bernama sama tidak lagi berbagi satu pagu", () => {
  const lines = [
    { itemId: 6, itemName: "LONG PEPPER", bags: 10, kgPerBag: 100, pricePerKg: 50_000 },
    { itemId: 10, itemName: "LONG PEPPER", bags: 10, kgPerBag: 100, pricePerKg: 13_500 },
  ];

  it("berkunci id: dua baris tetap DUA baris", () => {
    const out = buildContractOutstanding({ lines });
    expect(out.lines).toHaveLength(2);
    expect(out.lines.map((l) => l.key)).toEqual(["#6", "#10"]);
  });

  it("faktur atas barang A tidak menghabiskan pagu barang B", () => {
    /* `remainingKg` dihitung dari yang DIFAKTURKAN (bukan dari yang dikirim) —
       lihat `buildContractOutstanding`. */
    const out = buildContractOutstanding({
      lines,
      invoiced: [{ itemId: 6, itemName: "LONG PEPPER", quantity: 1000, price: 50_000 }],
    });
    const a = out.lines.find((l) => l.key === "#6")!;
    const b = out.lines.find((l) => l.key === "#10")!;
    expect(a.remainingKg).toBe(0);
    /* Inilah bug yang ditutup: sebelum #491 kedua baris digabung, jadi faktur
       atas barang mahal ikut menghabiskan pagu barang murah. */
    expect(b.remainingKg).toBe(1000);
  });

  it("pengiriman pun terhitung pada barangnya sendiri", () => {
    const out = buildContractOutstanding({
      lines,
      delivered: [{ itemId: 6, itemName: "LONG PEPPER", quantity: 400 }],
    });
    expect(out.lines.find((l) => l.key === "#6")!.deliveredKg).toBe(400);
    expect(out.lines.find((l) => l.key === "#10")!.deliveredKg).toBe(0);
  });

  it("TANPA itemId keduanya memang tergabung — perilaku lama, dan itu bugnya", () => {
    const out = buildContractOutstanding({
      lines: lines.map(({ itemId: _drop, ...l }) => l),
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].contractedKg).toBe(2000);
  });
});

describe("baris lama tetap terhitung persis seperti sebelumnya", () => {
  it("itemId NULL di kedua sisi → berjodoh lewat nama", () => {
    const out = buildContractOutstanding({
      lines: [{ itemName: "CLOVE", bags: 10, kgPerBag: 100, pricePerKg: 85_000 }],
      delivered: [{ itemName: "clove", quantity: 400 }],
      invoiced: [{ itemName: "  Clove ", quantity: 400, price: 85_000 }],
    });
    /* Besar-kecil huruf & spasi memang sudah dirapatkan sejak awal — baris ini
       yang membuktikannya, bukan sekadar `normalizeItemName` secara terpisah. */
    expect(out.lines[0].deliveredKg).toBe(400);
    expect(out.lines[0].invoicedKg).toBe(400);
    expect(out.lines[0].remainingKg).toBe(600);
  });

  it("kontrak tertaut vs surat jalan belum tertaut TIDAK berjodoh — dan itu jujur", () => {
    /*
     * Sengaja tidak "dipintarkan" dengan mencoba nama sebagai cadangan: sebuah
     * baris yang menunjuk barang 6 dan sebuah baris yang cuma bertuliskan
     * "LONG PEPPER" memang tidak bisa dipastikan barang yang sama — ada dua
     * kandidat. Menebaknya berarti mengurangi pagu kontrak yang salah.
     */
    const out = buildContractOutstanding({
      lines: [{ itemId: 6, itemName: "LONG PEPPER", bags: 10, kgPerBag: 100, pricePerKg: 50_000 }],
      delivered: [{ itemName: "LONG PEPPER", quantity: 400 }],
    });
    expect(out.lines[0].deliveredKg).toBe(0);
  });
});

describe("migrasi 0052 tidak menebak", () => {
  it("hanya menautkan nama yang cocok ke TEPAT SATU barang", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(
      join(__dirname, "..", "prisma", "migrations", "0052_contract_item_link", "migration.sql"),
      "utf8"
    );
    /* Pagar `COUNT(*) = 1`: nama yang menunjuk dua barang (justru kasus
       `LONG PEPPER`) dibiarkan NULL, bukan ditebak salah satunya. */
    expect(sql).toMatch(/COUNT\(\*\)[\s\S]*?\)\s*=\s*1/);
    /* Normalisasi yang SAMA dengan `normalizeItemName`, kalau tidak, tautannya
       akan berbeda dari yang dilihat aplikasi. */
    expect(sql).toMatch(/LOWER\(TRIM\(REGEXP_REPLACE/);
    expect(sql).toMatch(/ON DELETE RESTRICT/);
  });
});
