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

/* Diimpor dari INTI-nya, bukan pembungkus `server-only`-nya: itu juga modul
   yang sama dengan yang dimuat penjadwal, jadi tesnya menguji jalur yang
   sungguh dipakai di luar Next. */
import { effectiveSetting, ppnEnabledFrom, signupOpenFrom } from "@/lib/site-settings-core";

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

/*
 * ══ DUA GERBANG: PENDAFTARAN MANDIRI & PPN (migration 0017) ════════════════
 *
 * Keduanya pindah dari `.env` ke `/operator/settings`, dan pemindahan itu
 * membawa tiga cara gagal yang tidak dimiliki ketiga isian kontak di atas:
 *
 *  1. **Tiga keadaan diperas jadi dua.** Kolomnya `TINYINT(1) NULL`: `null`
 *     berarti "belum pernah disetel dari konsol". Menyederhanakannya jadi
 *     boolean membuat satu kali menyimpan formulir kontak ikut menuliskan
 *     keputusan gerbang yang tak pernah diambil siapa pun.
 *  2. **Gagal-tertutup pendaftaran hilang.** Basis data yang sekejap tak
 *     terbaca TIDAK boleh membuka corong komersial kepada publik.
 *  3. **Panel yang berbohong tentang uang.** PPN dibaca di jalur uang oleh
 *     penjadwal — proses `tsx` DI LUAR Next. Kalau ia tidak ikut membaca
 *     gerbangnya, menyalakan PPN di panel akan mengubah apa yang DIPAJANG
 *     halaman harga tanpa mengubah nominal yang benar-benar ditagih.
 */
describe("gerbang pendaftaran mandiri — presedensi & gagal-tertutup", () => {
  it("baris `null` → jatuh ke environment", () => {
    expect(signupOpenFrom(null, { SELF_SERVE_SIGNUP: "open" })).toBe(true);
    expect(signupOpenFrom(null, {})).toBe(false);
    expect(signupOpenFrom({ selfServeSignupOpen: null }, { SELF_SERVE_SIGNUP: "open" })).toBe(true);
  });

  it("keputusan konsol MENANG atas environment, di kedua arah", () => {
    expect(signupOpenFrom({ selfServeSignupOpen: true }, {})).toBe(true);
    expect(signupOpenFrom({ selfServeSignupOpen: false }, { SELF_SERVE_SIGNUP: "open" })).toBe(false);
  });

  it("GAGAL-TERTUTUP: baris tak terbaca + env kosong → tetap tertutup", () => {
    /* `siteSettings()` memulangkan `null` saat platform tak terjangkau, jadi
       inilah bentuk kegagalan yang sesungguhnya — dan ia harus menutup. */
    expect(signupOpenFrom(null, {})).toBe(false);
  });
});

describe("gerbang PPN — presedensi & bawaan AKTIF", () => {
  it("baris `null` → environment; bawaannya PPN AKTIF", () => {
    expect(ppnEnabledFrom(null, {})).toBe(true);
    expect(ppnEnabledFrom(null, { PLATFORM_PPN_DISABLED: "true" })).toBe(false);
    expect(ppnEnabledFrom({ ppnEnabled: null }, { PLATFORM_PPN_DISABLED: "true" })).toBe(false);
  });

  it("keputusan konsol MENANG atas environment, di kedua arah", () => {
    expect(ppnEnabledFrom({ ppnEnabled: true }, { PLATFORM_PPN_DISABLED: "true" })).toBe(true);
    expect(ppnEnabledFrom({ ppnEnabled: false }, {})).toBe(false);
  });

  it("arah bawaannya BERBEDA dari gerbang pendaftaran, dan itu disengaja", () => {
    /* Pendaftaran gagal-TERTUTUP (corong yang terbuka sendiri adalah kerugian
       komersial yang tak bisa ditarik), PPN gagal-AKTIF (tagihan yang terbit
       tanpa PPN menuntut nota pembetulan, sedangkan PPN yang ikut terbit saat
       mestinya tidak masih bisa dikoreksi sebelum dibayar). */
    expect(signupOpenFrom(null, {})).toBe(false);
    expect(ppnEnabledFrom(null, {})).toBe(true);
  });
});

describe("jalur uang & permukaan ikut MENDENGAR panel", () => {
  const baca = (...bagian: string[]) => readFileSync(join(__dirname, "..", ...bagian), "utf8");

  it("penjadwal membaca gerbang PPN dari basis data, bukan hanya env", () => {
    /* Penjaga terpenting berkas ini: lihat butir 3 di atas. Penjadwal tidak
       bisa memuat `lib/site-settings.ts` (ia `server-only` + `next/cache`),
       jadi jalurnya INTI + kliennya sendiri — dan itulah yang dijaga. */
    const src = baca("scripts", "subscription-scheduler.ts");
    expect(src).toContain("site-settings-core");
    expect(src).toContain("ppnEnabledFrom(await readSiteSettingsRow(platform)");
    expect(src, "penjadwal tidak boleh memuat pembungkus Next-nya").not.toContain(
      'from "../src/lib/site-settings"'
    );
  });

  it("permukaan PPN memakai resolver efektif, bukan env telanjang", () => {
    const pembaca: [string, string[]][] = [
      ["landing-pricing", ["src", "components", "landing", "landing-pricing.tsx"]],
      ["plan-change", ["src", "app", "api", "tenant", "billing", "plan-change", "route.ts"]],
      [
        "subscription-section",
        ["src", "app", "(app)", "(tenant)", "(panel)", "platform", "subscription-section.tsx"],
      ],
      ["platform-page", ["src", "app", "(app)", "(tenant)", "(panel)", "platform", "page.tsx"]],
    ];
    for (const [nama, jalur] of pembaca) {
      const src = baca(...jalur);
      expect(src, `${nama} memakai resolver`).toContain("resolvePpnEnabled");
      expect(src, `${nama} tidak membaca env PPN langsung`).not.toContain(
        "process.env.PLATFORM_PPN_DISABLED"
      );
    }
  });

  it("pendaftaran: route & halaman daftar memakai resolver efektif", () => {
    const route = baca("src", "app", "api", "auth", "register", "route.ts");
    const page = baca("src", "app", "(app)", "(auth)", "register", "page.tsx");
    for (const [nama, src] of [["route", route], ["page", page]] as const) {
      expect(src, `${nama} memakai resolver`).toContain("resolveSelfServeSignupOpen");
      expect(src, `${nama} tidak membaca env pendaftaran langsung`).not.toMatch(
        /selfServeSignupOpen\s*\(\s*process\.env/
      );
    }
  });
});
