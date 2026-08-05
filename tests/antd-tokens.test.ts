/**
 * Kontras token AntD kustom (issue #186) — audit yang dijalankan ulang, bukan
 * dicatat. Mencakup token uang dan token merek (teks/tautan + isian tombol
 * primer).
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
import { generate } from "@ant-design/colors";

import {
  BRAND_TEXT_DARK,
  BRAND_TEXT_LIGHT,
  MONEY_TOKENS_DARK,
  MONEY_TOKENS_LIGHT,
  NEUTRAL_TEXT_DARK,
  NEUTRAL_TEXT_LIGHT,
  PRIMARY_BUTTON_DARK,
  PRIMARY_BUTTON_LIGHT,
  brandTextTokens,
  moneyPalette,
  moneyTokens,
  neutralTextTokens,
  primaryButtonTokens,
  type BrandTextTokens,
  type MoneyTokens,
  type NeutralTextTokens,
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

/**
 * Token seperti yang BENAR-BENAR sampai ke komponen: seed -> map -> alias, lalu
 * override kita. Ini yang membedakan "kami menulis nilai baru" dari "nilai baru
 * itu berlaku": beberapa token yang kami perbaiki adalah induk dari token lain
 * (`colorTextDescription`, `colorIcon`), dan AntD menurunkannya DI ANTARA dua
 * tempat override ditempelkan (`theme/util/alias.ts`).
 */
const applied = (mode: "light" | "dark") =>
  theme.getDesignToken({
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: { ...neutralTextTokens(mode) },
  });

const APPLIED = { light: applied("light"), dark: applied("dark") } as const;

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

/**
 * Tangga palet AntD untuk sebuah benih, di tema yang diminta — persis cara AntD
 * sendiri menurunkan warnanya. Indeksnya 0-basis: `step(seed, "light")[7]` =
 * anak tangga ke-8.
 */
const step = (seed: string, mode: "light" | "dark") =>
  mode === "dark"
    ? generate(seed, { theme: "dark", backgroundColor: DARK.colorBgContainer })
    : generate(seed);

describe("token kustom tetap berasal dari palet AntD", () => {
  /*
   * Klaim "ini masih palet AntD, hanya anak tangganya yang berbeda" adalah
   * pembenaran utama seluruh keputusan #186 — dan sebuah kalimat di komentar
   * tidak membuktikan apa pun. Di sini setiap hex dicocokkan dengan tangga yang
   * DIHITUNG dari benih AntD yang sedang terpasang. Kalau AntD menggeser
   * benihnya, tes ini merah dan tabelnya harus diturunkan ulang — bukan
   * ditambal satu hex.
   */
  it("token uang = green-8 / red-8 / gold-9 / blue-7 dari benih AntD", () => {
    expect(MONEY_TOKENS_LIGHT.colorMoneyPositive).toBe(step(LIGHT.colorSuccess, "light")[7]);
    expect(MONEY_TOKENS_LIGHT.colorMoneyNegative).toBe(step(LIGHT.colorError, "light")[7]);
    expect(MONEY_TOKENS_LIGHT.colorMoneyPending).toBe(step(LIGHT.colorWarning, "light")[8]);
    expect(MONEY_TOKENS_LIGHT.colorMoneyInfo).toBe(step(LIGHT.colorPrimary, "light")[6]);
  });

  it("versi gelapnya diturunkan lewat algoritma gelap AntD", () => {
    expect(MONEY_TOKENS_DARK.colorMoneyPositive).toBe(step(LIGHT.colorSuccess, "dark")[7]);
    expect(MONEY_TOKENS_DARK.colorMoneyNegative).toBe(step(LIGHT.colorError, "dark")[7]);
    // Menunggu memakai gold-8 di tema gelap, bukan gold-9 seperti tema terang:
    // gold-9 gelap juga lolos tapi sudah nyaris krem dan berhenti terbaca
    // sebagai amber. Perbedaan ini disengaja — karena itu diuji, bukan
    // diseragamkan.
    expect(MONEY_TOKENS_DARK.colorMoneyPending).toBe(step(LIGHT.colorWarning, "dark")[7]);
    expect(MONEY_TOKENS_DARK.colorMoneyInfo).toBe(step(LIGHT.colorPrimary, "dark")[6]);
  });

  it("token merek = blue-7/8/9 dari benih colorPrimary yang sama", () => {
    const light = step(LIGHT.colorPrimary, "light");
    const dark = step(LIGHT.colorPrimary, "dark");
    expect(BRAND_TEXT_LIGHT.colorBrandText).toBe(light[6]);
    expect(BRAND_TEXT_LIGHT.colorBrandTextHover).toBe(light[7]);
    expect(BRAND_TEXT_LIGHT.colorBrandTextActive).toBe(light[8]);
    expect(BRAND_TEXT_DARK.colorBrandText).toBe(dark[6]);
    expect(BRAND_TEXT_DARK.colorBrandTextHover).toBe(dark[7]);
    expect(BRAND_TEXT_DARK.colorBrandTextActive).toBe(dark[8]);
  });

  it("colorPrimary tetap bawaan AntD — tidak ada brand kustom yang kembali", () => {
    // Keputusan pemilik: #1677ff, dan #1E40AF lama tidak dihidupkan lagi.
    expect(LIGHT.colorPrimary).toBe("#1677ff");
    expect(MONEY_TOKENS_LIGHT.colorMoneyInfo).toBe(BRAND_TEXT_LIGHT.colorBrandText);
  });
});

describe("warna merek sebagai TEKS", () => {
  it("colorPrimary bawaan GAGAL sebagai teks — inilah sebab token merek ada", () => {
    expect(contrast(LIGHT.colorPrimary, LIGHT.colorBgContainer)).toBeCloseTo(4.1, 1);
    expect(worst(LIGHT.colorPrimary, "light")).toBeLessThan(AA);
    expect(worst(DARK.colorPrimary, "dark")).toBeLessThan(AA);
  });

  it("hover bawaan AntD lebih buruk lagi — tautan lenyap saat disentuh", () => {
    // Terukur: #69b1ff terang = 2,06:1 dan #15417e gelap = 1,64:1 (terburuk di
    // ketiga latar). Angka inilah yang membuat colorLinkHover wajib ikut
    // diganti, bukan hanya colorLink — keduanya bahkan gagal ambang 3:1.
    expect(worst(LIGHT.colorLinkHover, "light")).toBeLessThan(3);
    expect(worst(DARK.colorLinkHover, "dark")).toBeLessThan(3);
  });

  const roles: (keyof BrandTextTokens)[] = [
    "colorBrandText",
    "colorBrandTextHover",
    "colorBrandTextActive",
  ];
  for (const role of roles) {
    it(`${role} lolos 4,5:1 di KEDUA tema, di ketiga latar`, () => {
      expect(worst(BRAND_TEXT_LIGHT[role], "light")).toBeGreaterThanOrEqual(AA);
      expect(worst(BRAND_TEXT_DARK[role], "dark")).toBeGreaterThanOrEqual(AA);
    });
  }

  it("keadaan berikutnya selalu MENJAUH dari latar, tidak mendekat", () => {
    // Aturan yang membuat tangga hover/aktif bisa diturunkan tanpa mengukur
    // ulang setiap kali: hover lebih kontras dari diam, aktif lebih dari hover.
    for (const [tokens, mode] of [
      [BRAND_TEXT_LIGHT, "light"],
      [BRAND_TEXT_DARK, "dark"],
    ] as const) {
      expect(worst(tokens.colorBrandTextHover, mode)).toBeGreaterThan(
        worst(tokens.colorBrandText, mode)
      );
      expect(worst(tokens.colorBrandTextActive, mode)).toBeGreaterThan(
        worst(tokens.colorBrandTextHover, mode)
      );
    }
  });

  it("rasio terhitung cocok dengan tabel di kepala antd-tokens.ts", () => {
    const round = (n: number) => Math.round(n * 100) / 100;
    expect(round(worst(BRAND_TEXT_LIGHT.colorBrandText, "light"))).toBe(5.65);
    expect(round(worst(BRAND_TEXT_LIGHT.colorBrandTextHover, "light"))).toBe(8.23);
    expect(round(worst(BRAND_TEXT_LIGHT.colorBrandTextActive, "light"))).toBe(11.08);
    expect(round(worst(BRAND_TEXT_DARK.colorBrandText, "dark"))).toBe(4.66);
    expect(round(worst(BRAND_TEXT_DARK.colorBrandTextHover, "dark"))).toBe(6.69);
    expect(round(worst(BRAND_TEXT_DARK.colorBrandTextActive, "dark"))).toBe(9.01);
  });
});

describe("label tombol primer", () => {
  /** Label solid AntD selalu putih (`colorTextLightSolid`). */
  const LABEL = "#ffffff";

  it("isian colorPrimary bawaan menjatuhkan label putih di tema TERANG", () => {
    expect(contrast(LABEL, LIGHT.colorPrimary)).toBeCloseTo(4.1, 1);
    expect(contrast(LABEL, LIGHT.colorPrimary)).toBeLessThan(AA);
  });

  it("di tema GELAP isian bawaan justru lolos — jadi tidak diubah", () => {
    // Asimetri yang sama seperti token uang: satu tema tidak bisa dijadikan
    // patokan untuk yang lain.
    expect(contrast(LABEL, DARK.colorPrimary)).toBeCloseTo(5.19, 1);
    expect(contrast(LABEL, DARK.colorPrimary)).toBeGreaterThanOrEqual(AA);
    expect(PRIMARY_BUTTON_DARK.colorPrimary).toBe(DARK.colorPrimary);
  });

  it("colorPrimaryHover bawaan terang justru MEMPERBURUK label", () => {
    // #4096ff = blue-5, lebih terang dari benihnya. Ini yang membuat "pakai
    // colorPrimaryHover saja" bukan jalan keluar.
    expect(contrast(LABEL, LIGHT.colorPrimaryHover)).toBeLessThan(
      contrast(LABEL, LIGHT.colorPrimary)
    );
  });

  it("membesarkan huruf BUKAN jalan keluar: 14px belum tergolong teks besar", () => {
    // Ambang 3:1 baru berlaku pada >=18,66px tebal. 4,10:1 memang lolos 3:1,
    // tapi hanya dengan label tombol 19px tebal di seluruh aplikasi.
    expect(LIGHT.fontSize).toBeLessThan(18.66);
    expect(contrast(LABEL, LIGHT.colorPrimary)).toBeGreaterThanOrEqual(3);
  });

  it("setiap keadaan tombol menahan label putih di atas 4,5:1", () => {
    for (const tokens of [PRIMARY_BUTTON_LIGHT, PRIMARY_BUTTON_DARK]) {
      expect(contrast(LABEL, tokens.colorPrimary)).toBeGreaterThanOrEqual(AA);
      expect(contrast(LABEL, tokens.colorPrimaryHover)).toBeGreaterThanOrEqual(AA);
      expect(contrast(LABEL, tokens.colorPrimaryActive)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("tombol dalam keadaan DIAM tetap terpisah dari halamannya (3:1 non-teks)", () => {
    // Yang harus bisa "ditemukan" adalah keadaan diam; saat hover, kursor
    // pengguna sendiri sudah menandai letaknya. Karena itu ambang ini sengaja
    // hanya diberlakukan pada keadaan diam.
    expect(worst(PRIMARY_BUTTON_LIGHT.colorPrimary, "light")).toBeGreaterThanOrEqual(3);
    expect(worst(PRIMARY_BUTTON_DARK.colorPrimary, "dark")).toBeGreaterThanOrEqual(3);
  });
});

/* ========================================================================== */
/* issue #207 — teks bantuan & placeholder                                    */
/* ========================================================================== */

describe("teks bantuan bawaan AntD (#207)", () => {
  it("colorTextTertiary GAGAL 4,5:1 di KEDUA tema — sebab token ini ada", () => {
    // Mengunci kegagalan. Kalau ini hijau, AntD mengubah tangga alfanya:
    // ukur ulang dan pertimbangkan apakah override-nya masih perlu.
    expect(worst(LIGHT.colorTextTertiary, "light")).toBeLessThan(AA);
    expect(worst(DARK.colorTextTertiary, "dark")).toBeLessThan(AA);
  });

  it("teks bantuan memang mewarisi tersier — jadi ia ikut gagal", () => {
    // `colorTextDescription` adalah yang dipakai untuk kalimat penjelas; kalau
    // ia berhenti menunjuk tersier, seluruh alasan issue ini berubah.
    expect(LIGHT.colorTextDescription).toBe(LIGHT.colorTextTertiary);
    expect(DARK.colorTextDescription).toBe(DARK.colorTextTertiary);
  });

  it("placeholder LEBIH buruk lagi, dan bukan dari tersier", () => {
    // Temuan yang mudah terlewat: memperbaiki tersier saja tidak menyentuh
    // placeholder sama sekali, karena aliasnya menunjuk kuartener (α 0,25).
    expect(LIGHT.colorTextPlaceholder).toBe(LIGHT.colorTextQuaternary);
    expect(LIGHT.colorTextPlaceholder).not.toBe(LIGHT.colorTextTertiary);
    expect(worst(LIGHT.colorTextPlaceholder, "light")).toBeLessThan(
      worst(LIGHT.colorTextTertiary, "light")
    );
    expect(worst(DARK.colorTextPlaceholder, "dark")).toBeLessThan(
      worst(DARK.colorTextTertiary, "dark")
    );
  });

  it("tangga alfa AntD tak punya anak tangga antara 0,45 dan 0,65", () => {
    // Ini yang membuat "ambil saja nilai di tengah" bukan pilihan yang ada.
    // 0,45 = tersier, 0,65 = sekunder; tidak ada apa pun di antaranya.
    expect(LIGHT.colorTextTertiary).toBe("rgba(0,0,0,0.45)");
    expect(LIGHT.colorTextSecondary).toBe("rgba(0,0,0,0.65)");
    expect(DARK.colorTextTertiary).toBe("rgba(255,255,255,0.45)");
    expect(DARK.colorTextSecondary).toBe("rgba(255,255,255,0.65)");
  });
});

describe("token teks netral kustom (#207)", () => {
  const roles: (keyof NeutralTextTokens)[] = ["colorTextTertiary", "colorTextPlaceholder"];

  for (const role of roles) {
    it(`${role} lolos 4,5:1 di KEDUA tema, di ketiga latar`, () => {
      expect(worst(NEUTRAL_TEXT_LIGHT[role], "light")).toBeGreaterThanOrEqual(AA);
      expect(worst(NEUTRAL_TEXT_DARK[role], "dark")).toBeGreaterThanOrEqual(AA);
    });
  }

  it("nilainya = anak tangga 0,65 milik AntD sendiri, bukan alfa karangan", () => {
    // Pembenaran yang sama dengan token uang: paletnya tidak ditolak, hanya
    // anak tangganya yang dipindah. Di tangga netral, "palet" = daftar alfa.
    for (const role of roles) {
      expect(NEUTRAL_TEXT_LIGHT[role]).toBe(LIGHT.colorTextSecondary);
      expect(NEUTRAL_TEXT_DARK[role]).toBe(DARK.colorTextSecondary);
    }
  });

  it("rasio terhitung cocok dengan tabel di kepala antd-tokens.ts", () => {
    const round = (n: number) => Math.round(n * 100) / 100;
    expect(round(worst(NEUTRAL_TEXT_LIGHT.colorTextTertiary, "light"))).toBe(6.76);
    expect(round(worst(NEUTRAL_TEXT_DARK.colorTextTertiary, "dark"))).toBe(7.65);
  });

  it("teks penjelas & ikon IKUT naik — override merambat ke turunannya", () => {
    // Kalau AntD memindahkan derivasi ini ke belakang spread override, angka
    // di layar akan diam-diam kembali ke bawaan sementara berkas token
    // terlihat benar. Karena itu yang diuji adalah token terpakai, bukan
    // konstanta kita.
    for (const mode of ["light", "dark"] as const) {
      const t = APPLIED[mode];
      expect(t.colorTextDescription).toBe(neutralTextTokens(mode).colorTextTertiary);
      expect(t.colorIcon).toBe(neutralTextTokens(mode).colorTextTertiary);
      expect(t.colorTextPlaceholder).toBe(neutralTextTokens(mode).colorTextPlaceholder);
      expect(worst(t.colorTextDescription, mode)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("teks NONAKTIF sengaja TIDAK ikut naik — WCAG mengecualikannya", () => {
    // Sebabnya override ditempel di alias `colorTextPlaceholder`, bukan di
    // `colorTextQuaternary` yang menjadi induk keduanya. Kendali nonaktif yang
    // kontrasnya dinaikkan berhenti terlihat nonaktif.
    for (const mode of ["light", "dark"] as const) {
      const base = mode === "dark" ? DARK : LIGHT;
      expect(APPLIED[mode].colorTextDisabled).toBe(base.colorTextQuaternary);
      expect(worst(APPLIED[mode].colorTextDisabled, mode)).toBeLessThan(AA);
    }
  });
});

describe("moneyTokens / moneyPalette", () => {
  it("memberi tabel yang sesuai temanya", () => {
    expect(moneyTokens("light")).toEqual(MONEY_TOKENS_LIGHT);
    expect(moneyTokens("dark")).toEqual(MONEY_TOKENS_DARK);
    expect(brandTextTokens("light")).toEqual(BRAND_TEXT_LIGHT);
    expect(brandTextTokens("dark")).toEqual(BRAND_TEXT_DARK);
    expect(primaryButtonTokens("light")).toEqual(PRIMARY_BUTTON_LIGHT);
    expect(primaryButtonTokens("dark")).toEqual(PRIMARY_BUTTON_DARK);
    expect(neutralTextTokens("light")).toEqual(NEUTRAL_TEXT_LIGHT);
    expect(neutralTextTokens("dark")).toEqual(NEUTRAL_TEXT_DARK);
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
