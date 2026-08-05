/**
 * Kontras token uang (issue #186) — audit yang dijalankan ulang, bukan dicatat.
 *
 * Tabel rasio di kepala `lib/theme/antd-tokens.ts` adalah hasil pengukuran
 * terhadap paket `antd` yang terpasang saat itu. Nilai tema gelap AntD adalah
 * keluaran ALGORITMA (`darkAlgorithm`), bukan konstanta yang dijamin stabil
 * antar-versi — jadi sebuah bump versi bisa menggeser latar di bawah angka
 * kita tanpa satu baris diff pun di `src/`. Berkas ini menghitung ulang seluruh
 * tabel itu setiap kali suite berjalan, langsung dari `theme.getDesignToken()`.
 *
 * Rumusnya WCAG 2.x (relative luminance sRGB), ditulis ulang di sini dengan
 * sengaja: kalau ia mengimpor helper dari `src/`, tes ini hanya akan
 * membuktikan bahwa dua salinan kode yang sama sepakat. Kalibrasinya di bawah
 * yang membuktikan rumusnya benar — angkanya harus cocok dengan yang sudah
 * tertulis di `design-system/sai-accounting/MASTER.md`.
 */

import { describe, expect, it } from "vitest";
import { theme } from "antd";

import {
  MONEY_TOKENS_DARK,
  MONEY_TOKENS_LIGHT,
  moneyPalette,
  moneyTokens,
  type MoneyTokens,
} from "@/lib/theme/antd-tokens";

/** `#abc` / `#aabbcc` / `rgba(r,g,b,a)` -> kanal + alfa. */
function parse(color: string): { rgb: [number, number, number]; alpha: number } {
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (rgba) {
    const parts = rgba[1].split(",").map((s) => Number(s.trim()));
    return { rgb: [parts[0], parts[1], parts[2]], alpha: parts[3] ?? 1 };
  }
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return {
    rgb: [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ],
    alpha: 1,
  };
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Token `rgba()` DIKOMPOSIT dulu ke latarnya. Menghitung `rgba(0,0,0,0.45)`
 * seolah hitam pekat memberi jawaban yang terlalu optimistis — dan justru
 * token teks AntD yang paling sering dipakai berbentuk `rgba()`.
 */
function contrast(foreground: string, background: string): number {
  const bg = parse(background);
  const fg = parse(foreground);
  const composited = fg.rgb.map((c, i) => c * fg.alpha + bg.rgb[i] * (1 - fg.alpha)) as [
    number,
    number,
    number,
  ];
  const [hi, lo] = [luminance(composited), luminance(bg.rgb)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = theme.getDesignToken({ algorithm: theme.defaultAlgorithm });
const DARK = theme.getDesignToken({ algorithm: theme.darkAlgorithm });

/**
 * Ketiga latar tempat teks uang benar-benar mendarat: sel tabel biasa
 * (`colorBgContainer`), halaman/baris berselang (`colorBgLayout`), dan
 * Modal/Dropdown/Popover serta baris ter-hover (`colorBgElevated`). Yang
 * dipakai sebagai putusan adalah yang TERBURUK — bukan rata-rata.
 */
const SURFACES = {
  light: [LIGHT.colorBgContainer, LIGHT.colorBgLayout, LIGHT.colorBgElevated],
  dark: [DARK.colorBgContainer, DARK.colorBgLayout, DARK.colorBgElevated],
} as const;

const worst = (color: string, mode: "light" | "dark") =>
  Math.min(...SURFACES[mode].map((bg) => contrast(color, bg)));

/** Ambang teks biasa. Berlaku di mana-mana karena `fontSize` bawaan AntD 14px. */
const AA = 4.5;

describe("kalibrasi rumus kontras", () => {
  it("mereproduksi angka yang sudah tertulis di MASTER.md", () => {
    // Kalau ketiga angka ini bergeser, yang salah adalah rumus di berkas ini —
    // bukan token AntD-nya. Perbaiki di sini dulu sebelum mempercayai sisanya.
    expect(contrast("#16A34A", "#ffffff")).toBeCloseTo(3.3, 1);
    expect(contrast("#DC2626", "#ffffff")).toBeCloseTo(4.83, 1);
    expect(contrast("#166534", "#DCFCE7")).toBeCloseTo(6.49, 1);
  });
});

describe("palet bawaan AntD sebagai teks uang", () => {
  it("ukuran teks bawaan AntD menuntut ambang 4,5:1, bukan 3:1", () => {
    // Seluruh keputusan #186 bergantung pada ini: kalau teks bodinya besar,
    // warna penuh AntD masih boleh dipakai. 14px berarti tidak boleh.
    expect(LIGHT.fontSize).toBeLessThan(18.66);
  });

  it("colorSuccess / colorWarning / colorError bawaan GAGAL — inilah sebab token kustom ada", () => {
    // Tes ini sengaja mengunci sebuah KEGAGALAN. Kalau ia merah, artinya AntD
    // mengubah paletnya: ukur ulang, tulis angkanya di antd-tokens.ts, dan
    // pertimbangkan apakah token kustomnya masih perlu.
    expect(worst(LIGHT.colorSuccess, "light")).toBeLessThan(AA);
    expect(worst(LIGHT.colorWarning, "light")).toBeLessThan(AA);
    expect(worst(LIGHT.colorError, "light")).toBeLessThan(AA);
    // Merah adalah satu-satunya yang gagal di KEDUA tema (di atas colorBgElevated).
    expect(worst(DARK.colorError, "dark")).toBeLessThan(AA);
  });

  it("hijau bawaan AntD lebih buruk dari #16A34A yang sudah dianggap bug", () => {
    // Perbandingan ini yang menjawab "kenapa tidak pakai bawaan saja".
    expect(contrast(LIGHT.colorSuccess, LIGHT.colorBgContainer)).toBeLessThan(
      contrast("#16A34A", "#ffffff")
    );
  });
});

describe("token uang kustom", () => {
  const roles: (keyof MoneyTokens)[] = [
    "colorMoneyPositive",
    "colorMoneyNegative",
    "colorMoneyPending",
    "colorMoneyInfo",
  ];

  for (const role of roles) {
    it(`${role} lolos 4,5:1 di KEDUA tema, di ketiga latar`, () => {
      expect(worst(MONEY_TOKENS_LIGHT[role], "light")).toBeGreaterThanOrEqual(AA);
      expect(worst(MONEY_TOKENS_DARK[role], "dark")).toBeGreaterThanOrEqual(AA);
    });
  }

  it("rasio terhitung cocok dengan tabel di kepala antd-tokens.ts", () => {
    // Angka di komentar berhenti benar diam-diam; ini yang membuatnya berbunyi.
    const round = (n: number) => Math.round(n * 100) / 100;
    expect(round(worst(MONEY_TOKENS_LIGHT.colorMoneyPositive, "light"))).toBe(5.12);
    expect(round(worst(MONEY_TOKENS_DARK.colorMoneyPositive, "dark"))).toBe(9.23);
    expect(round(worst(MONEY_TOKENS_LIGHT.colorMoneyNegative, "light"))).toBe(6.0);
    expect(round(worst(MONEY_TOKENS_DARK.colorMoneyNegative, "dark"))).toBe(7.86);
    expect(round(worst(MONEY_TOKENS_LIGHT.colorMoneyPending, "light"))).toBe(6.23);
    expect(round(worst(MONEY_TOKENS_DARK.colorMoneyPending, "dark"))).toBe(10.69);
    expect(round(worst(MONEY_TOKENS_LIGHT.colorMoneyInfo, "light"))).toBe(5.65);
    expect(round(worst(MONEY_TOKENS_DARK.colorMoneyInfo, "dark"))).toBe(4.66);
  });

  it("positif dan negatif nyaris SAMA terangnya — sebab tanda minus wajib", () => {
    /*
     * Diukur, bukan diasumsikan: #237804 vs #b32430 = 1,17:1, dan
     * #8fd460 vs #f39c97 = 1,17:1. Artinya bagi pembaca dengan defisiensi
     * merah-hijau (dan pada cetakan hitam-putih) kedua warna uang itu
     * praktis satu warna abu yang sama.
     *
     * Ini BUKAN cacat yang harus diperbaiki dengan menggeser salah satu
     * warna: menaikkan beda luminansi antar-keduanya berarti salah satunya
     * menjauh dari ambang 4,5:1 terhadap latarnya, dan kontras terhadap latar
     * yang menentukan apakah angkanya terbaca sama sekali. Yang benar adalah
     * menerima bahwa warna TIDAK PERNAH menjadi penanda tunggal — tanda minus
     * dan judul kolom yang membawa maknanya (dijaga di `money-format.test.ts`
     * dan `ui-table.test.tsx`). Tes ini mengunci alasannya supaya aturan itu
     * tidak dianggap kehati-hatian berlebihan lalu dilonggarkan.
     */
    expect(
      contrast(MONEY_TOKENS_LIGHT.colorMoneyPositive, MONEY_TOKENS_LIGHT.colorMoneyNegative)
    ).toBeLessThan(1.5);
    expect(
      contrast(MONEY_TOKENS_DARK.colorMoneyPositive, MONEY_TOKENS_DARK.colorMoneyNegative)
    ).toBeLessThan(1.5);
  });
});

describe("moneyTokens / moneyPalette", () => {
  it("memberi tabel yang sesuai temanya", () => {
    expect(moneyTokens("light")).toEqual(MONEY_TOKENS_LIGHT);
    expect(moneyTokens("dark")).toEqual(MONEY_TOKENS_DARK);
  });

  it("memakai token yang didaftarkan ConfigProvider bila ada", () => {
    const palette = moneyPalette({
      colorBgContainer: DARK.colorBgContainer,
      ...MONEY_TOKENS_DARK,
    });
    expect(palette).toEqual(MONEY_TOKENS_DARK);
  });

  it("di luar AntdProvider, cadangannya mengikuti terang/gelapnya permukaan", () => {
    // Cadangan yang selalu memilih tabel terang akan menaruh #b32430 di atas
    // #141414 — 1,9:1, persis kegagalan yang token ini cegah.
    expect(moneyPalette({ colorBgContainer: LIGHT.colorBgContainer })).toEqual(
      MONEY_TOKENS_LIGHT
    );
    expect(moneyPalette({ colorBgContainer: DARK.colorBgContainer })).toEqual(
      MONEY_TOKENS_DARK
    );
  });
});
