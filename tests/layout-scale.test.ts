/**
 * Penjaga SKALA JARAK — angka tata letak datang dari satu tempat.
 *
 * ══ KEADAAN YANG TES INI LAHIR UNTUK MENUTUP ═══════════════════════════════
 * MASTER.md §Jarak menyatakan jaraknya token AntD dan tidak ada lapisan kedua.
 * Di CSS itu benar. Tetapi prop `gap` milik `<Flex>`/`<Space>` AntD bertipe
 * `number`, dan `var(--ant-…)` tidak bisa masuk ke sana — jadi setiap halaman
 * mendeklarasikan angkanya sendiri. Diukur sebelum `lib/layout-scale.ts` ada:
 *
 *   • `SECTION_GAP` — **41 deklarasi** (38×24, 2×16, 1×40);
 *   • `CARD_GAP` — **14 deklarasi** (12×16, 2×12);
 *   • `INLINE_GAP` — 5 deklarasi.
 *
 * Enam puluh deklarasi untuk tiga keputusan. Tak satu pun cabangnya salah, dan
 * itulah yang membuatnya bertahan: tidak ada yang gagal, jadi tidak ada yang
 * memperbaikinya — dan pada hari seseorang mengetik `26`, tetap tidak ada yang
 * gagal.
 *
 * Dua hal yang dijaga di bawah:
 *   1. **angkanya tidak diketik ulang** di halaman mana pun;
 *   2. **skalanya tidak menyimpang dari token AntD** — berkas itu satu-satunya
 *      salinan nilai token di repo ini, dan salinan yang tidak dibandingkan
 *      adalah salinan yang akan berbeda.
 */
import { describe, expect, it } from "vitest";
import { akarSumber } from "./akar-sumber";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { theme } from "antd";

import {
  CARD_GAP,
  INLINE_GAP,
  SECTION_GAP,
  SPACE_LG,
  SPACE_MD,
  SPACE_SM,
  SPACE_XL,
  SPACE_XS,
  SPACE_XXL,
  SPACE_XXS,
} from "@sai/ui/layout-scale";

const ROOT = join(__dirname, "..");

function berkasSumber(dir: string): string[] {
  const out: string[] = [];
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) out.push(...berkasSumber(jalur));
    else if (nama.endsWith(".tsx") || nama.endsWith(".ts")) out.push(jalur);
  }
  return out;
}

describe("skala = token AntD, bukan angka yang kebetulan mirip", () => {
  /* Token sungguhan, diturunkan algoritma AntD dari seed-nya — bukan daftar
     kedua yang diketik di dalam tes. Kalau AntD mengubah skalanya, baris-baris
     ini merah dan keputusannya diambil sadar. */
  const token = theme.getDesignToken();

  it("setiap anak tangga sama dengan token yang disebut namanya", () => {
    expect(SPACE_XXS).toBe(token.marginXXS);
    expect(SPACE_XS).toBe(token.marginXS);
    expect(SPACE_SM).toBe(token.marginSM);
    expect(SPACE_MD).toBe(token.margin);
    expect(SPACE_LG).toBe(token.marginLG);
    expect(SPACE_XL).toBe(token.marginXL);
    expect(SPACE_XXL).toBe(token.marginXXL);
  });

  it("padding sesumbu dengan margin — satu skala, bukan dua", () => {
    expect(SPACE_SM).toBe(token.paddingSM);
    expect(SPACE_MD).toBe(token.padding);
    expect(SPACE_LG).toBe(token.paddingLG);
  });

  it("peran adalah ALIAS, bukan nilai baru", () => {
    expect(SECTION_GAP).toBe(SPACE_LG);
    expect(CARD_GAP).toBe(SPACE_MD);
    expect(INLINE_GAP).toBe(SPACE_XS);
  });
});

/**
 * Satu-satunya halaman yang boleh mengetik angkanya sendiri, beserta alasannya.
 *
 * Daftar sempit dan beralasan, bukan pengecualian yang tumbuh diam-diam —
 * bentuk yang sama dengan `PREFIKS_DINAMIS` di penjaga kunci yatim.
 */
const DIIZINKAN: ReadonlyArray<{ berkas: string; alasan: string }> = [
  {
    berkas: "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/page.tsx",
    alasan:
      "`SECTION_GAP = 40` — warisan `space-y-10` dari migrasi #203, dan ia memang " +
      "DI LUAR skala: anak tangga AntD melompat 32 → 48. Menaikkannya ke 48 mengubah " +
      "irama beranda (seksi terbanyak di app) tanpa ada yang memintanya, dan " +
      "menurunkannya ke 32 merapatkannya. Dibiarkan, dan ketidakcocokannya DITULIS " +
      "di sebelah angkanya — bukan disembunyikan dengan membulatkannya diam-diam.",
  },
];

describe("angka jarak tidak diketik ulang di halaman", () => {
  const berkas = akarSumber().flatMap((d) => berkasSumber(d));
  const PERAN = /^const (SECTION_GAP|CARD_GAP|INLINE_GAP|CONTROL_GAP|GRID_GAP) = \d+;/m;

  it("sapuannya benar-benar membaca banyak berkas", () => {
    expect(berkas.length).toBeGreaterThan(200);
  });

  it("tidak ada deklarasi berangka telanjang di luar daftar-izin", () => {
    const izin = new Set(DIIZINKAN.map((d) => d.berkas));
    const pelanggar: string[] = [];
    for (const jalur of berkas) {
      const relatif = jalur.replace(`${ROOT}/`, "");
      if (izin.has(relatif)) continue;
      if (PERAN.test(readFileSync(jalur, "utf8"))) pelanggar.push(relatif);
    }
    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Jarak tata letak diketik sebagai angka di:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nAmbil dari `@/lib/layout-scale` (`SECTION_GAP`, `CARD_GAP`, " +
            "`INLINE_GAP`, atau anak tangga `SPACE_*`). Kalau angkanya memang di LUAR " +
            "skala AntD, tambahkan berkasnya ke DIIZINKAN beserta alasannya — bukan " +
            "bulatkan diam-diam ke tetangga terdekat."
    ).toEqual([]);
  });

  it("daftar-izinnya tidak basi — entri yang sudah patuh harus dicabut", () => {
    for (const { berkas: relatif } of DIIZINKAN) {
      const src = readFileSync(join(ROOT, relatif), "utf8");
      expect(PERAN.test(src), `${relatif} sudah patuh — cabut dari DIIZINKAN`).toBe(true);
    }
  });

  it("daftar-izinnya tetap pendek", () => {
    expect(DIIZINKAN.length).toBeLessThanOrEqual(3);
  });
});
