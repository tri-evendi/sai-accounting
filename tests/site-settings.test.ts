/**
 * PENGATURAN SITUS — penjaga satu aturan yang paling mudah hilang.
 *
 * Tiga nilai (nomor WhatsApp, surel penjualan, instruksi transfer) kini bisa
 * disetel dari konsol operator alih-alih lewat SSH. Presedensinya DB → env,
 * dan di tengahnya ada cabang yang gampang disederhanakan jadi `db || env`:
 *
 *   • `null`  = tidak diatur dari konsol  → JATUH ke environment;
 *   • `""`    = operator SENGAJA mencabut → env TIDAK dipakai;
 *   • nilai   = dipakai, sudah di-trim.
 *
 * `db || env` menghapus cabang kedua, dan akibatnya: mencabut nomor WhatsApp
 * dari konsol diam-diam MENGHIDUPKAN KEMBALI nomor lama yang masih tertinggal
 * di `.env` — kanal kontak yang mengarah ke nomor yang sudah ditinggalkan,
 * tanpa satu pun galat.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { effectiveSetting } from "@/lib/site-settings";

describe("effectiveSetting — presedensi DB → env", () => {
  it("tidak diatur dari konsol (`null`/`undefined`) → pakai environment", () => {
    expect(effectiveSetting(null, "628123")).toBe("628123");
    expect(effectiveSetting(undefined, "628123")).toBe("628123");
  });

  it("DICABUT dari konsol (`\"\"` / spasi) → environment TIDAK dipakai", () => {
    expect(effectiveSetting("", "628123")).toBeUndefined();
    expect(effectiveSetting("   ", "628123")).toBeUndefined();
  });

  it("nilai dari konsol menang atas environment, dan di-trim", () => {
    expect(effectiveSetting("628999", "628123")).toBe("628999");
    expect(effectiveSetting("  628999  ", "628123")).toBe("628999");
  });

  it("keduanya kosong → tidak ada nilai (kanalnya memang tidak ada)", () => {
    expect(effectiveSetting(null, undefined)).toBeUndefined();
    expect(effectiveSetting("", undefined)).toBeUndefined();
  });

  it("`db || env` TIDAK cukup — ini yang dijaga tes di atas", () => {
    /* Bentuk yang salah akan memulangkan "628123" di sini. Kalau baris ini
       suatu hari gagal, yang berubah bukan tesnya: presedensinya yang rusak. */
    const salah = (db: string | null, env?: string) => db || env;
    expect(salah("", "628123")).toBe("628123");
    expect(effectiveSetting("", "628123")).not.toBe(salah("", "628123"));
  });
});

describe("pengaturan BENAR-BENAR dipakai permukaan yang membutuhkannya", () => {
  const baca = (...bagian: string[]) => readFileSync(join(__dirname, "..", ...bagian), "utf8");

  it("kelima pembaca memakai resolver efektif, bukan env telanjang", () => {
    /* Penjaga ini ada karena satu env telanjang yang tertinggal membuat satu
       permukaan memajang nomor LAMA sementara yang lain sudah berganti — dan
       perbedaan itu hanya terlihat oleh orang yang membuka keduanya. */
    const pembaca: [string, string[]][] = [
      ["landing-faq", ["src", "components", "landing", "landing-faq.tsx"]],
      ["landing-whatsapp", ["src", "components", "landing", "landing-whatsapp.tsx"]],
      ["landing-pricing", ["src", "components", "landing", "landing-pricing.tsx"]],
      ["register", ["src", "app", "(app)", "(auth)", "register", "page.tsx"]],
    ];
    for (const [nama, jalur] of pembaca) {
      const src = baca(...jalur);
      expect(src, `${nama} memakai resolver`).toContain("resolveContactChannels");
      expect(src, `${nama} tidak membaca env kontak langsung`).not.toContain(
        "process.env.PLATFORM_CONTACT"
      );
    }

    const panel = baca(
      "src", "app", "(app)", "(tenant)", "(panel)", "platform", "subscription-section.tsx"
    );
    expect(panel).toContain("resolveManualPaymentInstructions");
  });
});
