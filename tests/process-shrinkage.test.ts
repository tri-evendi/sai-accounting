/**
 * HASIL PROSES / SUSUT PROSES (issue #490).
 *
 * ══ Yang diminta pengguna ══════════════════════════════════════════════════
 * Kishen, 24 Agustus 2026, lewat WhatsApp dan sebuah pesan suara 51 detik:
 *
 *   "Untuk Stok Barang: Tambah / Hasil Proses / Kurang Stok"
 *   "…di hasil proses itu nanti dia ada pengurangan stok, sama nominal uangnya.
 *    Misalnya ini 35 kilo susut, terus 35 kilo itu nominalnya misalnya 1 juta.
 *    Nah nanti dia ada akun penyusutannya 1 juta… Nah baru nanti ada dia stok
 *    barang akhirnya."
 *
 * Jadi: SATU barang, kuantitasnya berkurang, dan nilai yang hilang dibebankan
 * ke sebuah akun susut. Dua angka DITERIMA TERPISAH — 35 kg dan Rp 1 juta —
 * yang berarti nilainya diketik, bukan diturunkan dari rata-rata tertimbang.
 *
 * ══ Bentuk yang dipilih, dan kenapa ════════════════════════════════════════
 * Susut proses ditulis sebagai gerakan `out` BIASA yang bertanda, bukan sebagai
 * nilai `type` baru. `type` adalah dasar SELURUH aritmetika saldo; nilai baru di
 * sana berarti setiap penjumlahan harus diajari mengenalnya, dan yang terlewat
 * tidak bersuara — ia hanya menghasilkan saldo yang salah. Yang berbeda hanya
 * JURNALnya, dan itu ditentukan `sourceType` saat memposting.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stockUpdateSchema } from "@/lib/validations/inventory";
import { PROCESS_SHRINKAGE_NOTE, STOCK_MOVEMENT_TYPES } from "@/lib/constants";
import { MAPPING_KEYS, MAPPING_KEY_LABELS } from "@/lib/posting/mapping";
import { COA_TEMPLATE } from "@/lib/accounting";
import { weightedAverageUnitCost } from "@/lib/posting/cogs";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

describe("skema: dua angka, dan yang kedua wajib", () => {
  const base = { itemId: 1, quantity: 35, date: "2026-08-24" };

  it("menerima Hasil Proses dengan kuantitas DAN nilainya", () => {
    const r = stockUpdateSchema.safeParse({
      ...base,
      type: "shrinkage",
      shrinkageValue: 1_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("menolak Hasil Proses TANPA nilai — barang hilang tanpa jadi ongkos", () => {
    /*
     * Tanpa nilai, susut hanya mengurangi stok tanpa membebankan apa pun:
     * barangnya lenyap dari gudang dan tidak muncul sebagai biaya di mana pun.
     * Itu bukan pencatatan setengah jadi, itu pencatatan yang salah.
     */
    const r = stockUpdateSchema.safeParse({ ...base, type: "shrinkage" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("shrinkageValue"))).toBe(true);
    }
  });

  it("menolak nilai nol atau negatif", () => {
    for (const shrinkageValue of [0, -1]) {
      expect(
        stockUpdateSchema.safeParse({ ...base, type: "shrinkage", shrinkageValue }).success
      ).toBe(false);
    }
  });

  it("nilai susut TIDAK diminta pada masuk maupun keluar biasa", () => {
    expect(stockUpdateSchema.safeParse({ ...base, type: "out" }).success).toBe(true);
    expect(
      stockUpdateSchema.safeParse({ ...base, type: "in", unitCost: 10_000 }).success
    ).toBe(true);
  });
});

describe("saldo: `out` bertanda, bukan nilai `type` baru", () => {
  it("`shrinkage` BUKAN nilai `stock_movements.type` yang sah", () => {
    /* Kalau ia sampai masuk ke sini, setiap penjumlahan saldo di aplikasi harus
       diajari mengenalnya — dan yang terlewat tidak akan bersuara. */
    expect(STOCK_MOVEMENT_TYPES as readonly string[]).not.toContain("shrinkage");
    expect(STOCK_MOVEMENT_TYPES as readonly string[]).not.toContain("process_shrinkage");
  });

  it("route menuliskannya sebagai `out`", () => {
    const route = src("app", "api", "inventory", "route.ts");
    expect(route).toMatch(/isShrinkage \? "out" : stockData\.type/);
  });

  it("route menandainya dengan konstanta yang SAMA dengan yang dibaca pembacanya", () => {
    const route = src("app", "api", "inventory", "route.ts");
    expect(route).toMatch(/PROCESS_SHRINKAGE_NOTE/);
    expect(PROCESS_SHRINKAGE_NOTE.length).toBeGreaterThan(5);
  });

  it("catatan pengguna tidak hilang tertimpa penanda", () => {
    const route = src("app", "api", "inventory", "route.ts");
    expect(route).toMatch(/\[PROCESS_SHRINKAGE_NOTE, stockData\.note\?\.trim\(\)\]/);
  });
});

describe("jurnal: akun sendiri, bukan HPP dan bukan Selisih Persediaan", () => {
  it("punya kunci pemetaan sendiri", () => {
    expect(MAPPING_KEYS.PROCESS_SHRINKAGE).toBe("process_shrinkage");
    expect(MAPPING_KEY_LABELS.process_shrinkage).toBe("Beban Susut Proses");
  });

  it("akun bawaannya ada di bagan akun & bertipe beban", () => {
    /* Kalau akunnya tidak ada di templat, pemetaan bawaannya menunjuk kode yang
       tak pernah dibuat, dan posting pertama gagal di perusahaan baru. */
    const akun = COA_TEMPLATE.find((a) => a.code === "610106");
    expect(akun?.name).toBe("Beban Susut Proses");
    expect(akun?.type).toBe("expense");
  });

  it("TERPISAH dari Selisih Persediaan — dua pertanyaan, dua angka", () => {
    /* Susut opname = gudang tidak akurat. Susut proses = ongkos mengolah yang
       wajar. Satu akun untuk keduanya membuat kedua pertanyaan hanya punya satu
       angka, dan angka itu tidak menjawab satu pun di antaranya. */
    expect(MAPPING_KEYS.PROCESS_SHRINKAGE).not.toBe(MAPPING_KEYS.INVENTORY_ADJUSTMENT);
    const posting = src("lib", "posting", "index.ts");
    expect(posting).toMatch(/MAPPING_KEYS\.PROCESS_SHRINKAGE/);
  });

  it("diposting lewat sourceType-nya sendiri, dipilih di route", () => {
    const route = src("app", "api", "inventory", "route.ts");
    expect(route).toMatch(/isShrinkage \? "stock_shrinkage" : "stock_movement"/);
  });

  it("nilai yang tak diketik TIDAK diposting sebagai nol", () => {
    /* Membukukan nol menyatakan bahwa mengolah barang ini tidak berongkos
       apa-apa — persis kebalikan dari yang sedang dicatat. */
    const posting = src("lib", "posting", "index.ts");
    expect(posting).toMatch(/if \(qty <= 0 \|\| unitCost <= 0\) return null;/);
  });
});

describe("rata-rata tertimbang tidak tergeser olehnya", () => {
  it("baris `out` bercosting diabaikan mesin costing", () => {
    /*
     * Nilai susut disimpan di `unit_cost` baris `out`. Itu aman HANYA karena
     * `weightedAverageUnitCost` membaca baris `in` saja — kalau suatu saat ia
     * ikut membaca `out`, susut proses akan diam-diam menggeser harga pokok
     * setiap barang yang pernah disusutkan.
     */
    const avg = weightedAverageUnitCost([
      { quantity: 100, type: "in", unitCost: 10_000 },
      { quantity: 35, type: "out", unitCost: 28_571.43 },
    ]);
    expect(avg).toBe(10_000);
  });
});

describe("angka pengguna dipulangkan utuh", () => {
  it("35 kg senilai Rp 1 juta → unit_cost yang mengalikan balik jadi 1 juta", () => {
    /* Route menyimpan `shrinkageValue / quantity`; jurnal menghitung
       `qty × unitCost`. Bolak-balik itu harus memulangkan angka yang PERSIS
       disebut pengguna, sebab itulah angka yang ia harapkan di laporan. */
    const quantity = 35;
    const shrinkageValue = 1_000_000;
    const unitCost = shrinkageValue / quantity;
    expect(Math.round(quantity * unitCost)).toBe(1_000_000);
  });
});
