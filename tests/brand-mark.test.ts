/**
 * Penjaga LAMBANG PRODUK — satu lambang, satu warna, satu sumber.
 *
 * ══ KEADAAN YANG TES INI LAHIR UNTUK MENUTUP ═══════════════════════════════
 * Sebelum perombakan merek Okt 2026, produk ini punya TIGA lambang sekaligus:
 * buku besar navy di dalam aplikasi, **diagram batang biru** di ikon tab/layar
 * depan (warna merek LAMA, dikomit sekali pada #471 lalu tak pernah menyusul),
 * dan **huruf "S"** di kartu pratinjau WhatsApp. Tak satu pun dari ketiganya
 * tahu keberadaan yang lain, dan tak satu pun gagal ketika menyimpang — itulah
 * sebabnya ia bertahan berbulan-bulan.
 *
 * Yang dijaga di sini karena itu bukan "lambangnya bagus" (tidak bisa diperiksa
 * mesin) melainkan tiga hal yang bisa:
 *
 *   1. geometrinya hidup di SATU berkas, dan permukaan lain mengimpornya;
 *   2. ikon raster yang dilayani ke peramban memang lambang itu, dalam warna
 *      merek — bukan PNG lama yang tertinggal;
 *   3. warna "bidang merek" tidak bercabang dua lagi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BRAND_MARK_PATH, brandMarkSvg } from "@/lib/brand/mark";
import { BRAND_HEX, BRAND_SOLID_LIGHT } from "@/lib/theme/antd-tokens";

const ROOT = join(__dirname, "..");
const baca = (...bagian: string[]) => readFileSync(join(ROOT, ...bagian), "utf8");

describe("geometri lambang hidup di satu berkas", () => {
  /** Potongan awal path yang cukup khas untuk dicari, tanpa menyalin seluruhnya. */
  const SIDIK = BRAND_MARK_PATH.slice(0, 40);

  it("path-nya tidak tertulis di berkas sumber mana pun selain modulnya", () => {
    const pemakai = [
      ["src", "components", "ui", "brand-mark.tsx"],
      ["src", "app", "(marketing)", "opengraph-image.tsx"],
      ["scripts", "build-brand-icons.ts"],
    ];
    for (const jalur of pemakai) {
      const src = baca(...jalur);
      expect(src, `${jalur.join("/")} menyalin path lambang`).not.toContain(SIDIK);
    }
  });

  it("ketiga permukaan MENGIMPOR dari modul lambang", () => {
    expect(baca("src", "components", "ui", "brand-mark.tsx")).toContain('from "@/lib/brand/mark"');
    expect(baca("src", "app", "(marketing)", "opengraph-image.tsx")).toContain(
      'from "@/lib/brand/mark"'
    );
    expect(baca("scripts", "build-brand-icons.ts")).toContain("/src/lib/brand/mark");
  });

  it("kartu pratinjau sosial berhenti memakai huruf awal produk", () => {
    /* `APP_NAME.slice(0, 1)` adalah bentuk lamanya: satu-satunya permukaan yang
       memperlihatkan "lambang" yang tidak pernah ada di dalam produk. */
    const og = baca("src", "app", "(marketing)", "opengraph-image.tsx");
    expect(og).not.toContain("APP_NAME.slice(0, 1)");
  });

  it("SVG yang dibangkitkan membawa path, warna, dan kotak yang diminta", () => {
    const svg = brandMarkSvg({ size: 64, background: "#000000", foreground: "#ffffff" });
    expect(svg).toContain(BRAND_MARK_PATH);
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('width="64"');
  });

  it("`radiusRatio: 0` menghasilkan sudut SIKU — bentuk ikon maskable", () => {
    /* Android memotong sudutnya sendiri; membulatkannya di sini berarti dua
       kali dibulatkan, dan sisanya tepi kosong di sekeliling lambang. */
    expect(brandMarkSvg({ size: 512, background: "#000", foreground: "#fff", radiusRatio: 0 }))
      .toContain('rx="0"');
  });
});

describe("ikon raster = lambang itu, dalam warna merek", () => {
  /**
   * Piksel diperiksa dengan `sharp` — pustaka yang SUDAH dipakai generatornya,
   * jadi tes ini tidak menambah satu dependensi pun. Yang dibandingkan BUKAN
   * byte berkasnya (itu akan putus setiap kali versi `sharp` berubah
   * kompresinya) melainkan dua piksel yang menjawab pertanyaan sebenarnya:
   * apakah ikon ini kotak merek dengan glif terang di tengahnya?
   */
  async function piksel(relatif: string, x: number, y: number) {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(join(ROOT, relatif))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  }

  const NAVY = { r: 0x1e, g: 0x3a, b: 0x5f };

  it("ikon 512 berlatar navy, bukan biru merek lama", async () => {
    /* Biru lamanya `#1677ff` — kalau PNG batang biru itu kembali, nilai b-nya
       akan mendekati 255 dan baris ini merah. */
    const sudut = await piksel("public/icons/icon-512.png", 256, 24);
    expect(Math.abs(sudut.r - NAVY.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(sudut.g - NAVY.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(sudut.b - NAVY.b)).toBeLessThanOrEqual(2);
  });

  it("glifnya terang dan berada di tengah ikon", async () => {
    const tengah = await piksel("public/icons/icon-512.png", 300, 256);
    expect(tengah.r).toBeGreaterThan(240);
    expect(tengah.g).toBeGreaterThan(240);
    expect(tengah.b).toBeGreaterThan(240);
  });

  it("maskable memberi ruang aman: tepinya masih latar di 20% pertama", async () => {
    /* Lingkaran aman Android 80%; glif 0,44 berarti tepi 512×0,28 = 143px
       pertama harus latar polos berapa pun bentuk potongan peluncurnya. */
    const tepi = await piksel("public/icons/icon-maskable-512.png", 60, 256);
    expect(Math.abs(tepi.r - NAVY.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(tepi.b - NAVY.b)).toBeLessThanOrEqual(2);
  });
});

describe("warna bidang merek tidak bercabang dua", () => {
  it("`BRAND_HEX` (bilah status & manifest) = isian merek tema terang", () => {
    /* Sampai Okt 2026 keduanya berbeda: `#1677ff` di bilah status, navy di
       setiap lambang. Pada aplikasi yang dipasang ke layar depan itu terlihat
       berdampingan — ikon navy, bilah status biru. */
    expect(BRAND_HEX).toBe(BRAND_SOLID_LIGHT);
  });
});
