/**
 * Warna grafik (issue #202, fase D2) — dikunci sebagai TOKEN, bukan sebagai hex.
 *
 * ── Kenapa tesnya berbentuk begini ────────────────────────────────────────
 * Godaan yang jelas adalah menuliskan `#237804` di sini dan membandingkannya
 * dengan apa yang dikembalikan `chartPalette`. Tes seperti itu akan tetap HIJAU
 * setelah paletnya berubah — ia hanya membuktikan dua salinan hex yang sama-sama
 * usang masih cocok. Karena itu setiap pembandingan di bawah mengambil sisi
 * kanannya dari SUMBERNYA (`moneyTokens`, `borderTokens`, token AntD yang
 * dihitung ulang), dan angka kontrasnya DIHITUNG di sini, bukan disalin.
 *
 * ── Tiga hal yang dijaga, semuanya pernah gagal diam-diam ─────────────────
 *  1. **Warna seri di recharts adalah TEKS.** `Pie` menyalin `entry.fill` ke
 *     label irisannya dan `DefaultTooltipContent` mewarnai setiap barisnya
 *     `entry.color`. Karena itu ambang yang berlaku 4,5:1, bukan 3:1 non-teks —
 *     dan `colorSuccess` bawaan AntD (2,08:1 terukur) gagal di sana persis
 *     seperti ia gagal di kolom uang (#186).
 *  2. **Urutan nada status.** Nada dipasang per POSISI. Membalik urutan data —
 *     atau menyaring nilai nol SEBELUM nada dipasang — menukar arti warnanya
 *     tanpa satu galat: stok habis menjadi hijau, dan grafiknya tetap wajar.
 *  3. **Tooltip bawaan recharts tidak bertema.** `backgroundColor: '#fff'`
 *     ditulis mati di `DefaultTooltipContent`; tanpa `contentStyle` ia kotak
 *     putih di halaman gelap.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { theme } from "antd";
import { DefaultTooltipContent } from "recharts";

import {
  chartPalette,
  tonedSlices,
  tooltipSurface,
  type ChartToken,
} from "@/components/shared/dashboard-charts";
import { borderTokens, moneyTokens, neutralTextTokens } from "@/lib/theme/antd-tokens";
import type { ResolvedTheme } from "@/lib/theme/config";

/* ------------------------------------------------------------------ */
/* Kontras — rumus yang sama dengan tests/antd-tokens.test.ts          */
/* ------------------------------------------------------------------ */

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

/**
 * Token seperti yang BENAR-BENAR sampai ke grafik: algoritma AntD + override
 * yang didaftarkan `AntdProvider` (#186 uang, #207 teks netral, #208 batas).
 * Membangunnya di sini berarti tes ini ikut gagal kalau salah satu override itu
 * dicabut — grafik memakainya, bukan menyalinnya.
 */
function tokenFor(mode: ResolvedTheme): ChartToken {
  return theme.getDesignToken({
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      ...moneyTokens(mode),
      ...neutralTextTokens(mode),
      ...borderTokens(mode),
    },
  }) as ChartToken;
}

const MODES = ["light", "dark"] as const;
const TOKENS = { light: tokenFor("light"), dark: tokenFor("dark") } as const;

/** Ketiga latar tempat teks grafik mendarat; yang dipakai adalah yang terburuk. */
const surfaces = (mode: ResolvedTheme) => [
  TOKENS[mode].colorBgContainer,
  TOKENS[mode].colorBgLayout,
  TOKENS[mode].colorBgElevated,
];

const worst = (color: string, mode: ResolvedTheme) =>
  Math.min(...surfaces(mode).map((bg) => contrast(color, bg)));

/** Ambang teks biasa — berlaku karena label/legenda/tooltip recharts ADALAH teks. */
const AA = 4.5;

/** Ambang non-teks WCAG 1.4.11 — kisi. */
const NON_TEXT = 3;

/** Peran warna yang benar-benar dipakai sebagai warna SERI. */
const seriesRoles = (mode: ResolvedTheme) => {
  const p = chartPalette(TOKENS[mode]);
  return {
    "status aman/sah": p.statusTones[0],
    "status menipis/menunggu": p.statusTones[1],
    "status habis/dibatalkan": p.statusTones[2],
    "uang masuk": p.moneyIn,
    "uang keluar": p.moneyOut,
    "hitungan utama": p.countPrimary,
    "hitungan kedua": p.countSecondary,
  };
};

/* ------------------------------------------------------------------ */

describe("warna grafik datang dari token, bukan dari sumbernya sendiri", () => {
  it.each(MODES)("%s: nada status = token uang #186 apa adanya", (mode) => {
    const money = moneyTokens(mode);
    expect(chartPalette(TOKENS[mode]).statusTones).toEqual([
      money.colorMoneyPositive,
      money.colorMoneyPending,
      money.colorMoneyNegative,
    ]);
  });

  it.each(MODES)("%s: arah uang memakai nada yang sama dengan `Money`", (mode) => {
    const money = moneyTokens(mode);
    const palette = chartPalette(TOKENS[mode]);
    expect(palette.moneyIn).toBe(money.colorMoneyPositive);
    expect(palette.moneyOut).toBe(money.colorMoneyNegative);
  });

  it.each(MODES)("%s: hitungan TIDAK memakai hijau/merah — ia tanpa arah", (mode) => {
    const money = moneyTokens(mode);
    const palette = chartPalette(TOKENS[mode]);
    expect(palette.countPrimary).toBe(money.colorMoneyInfo);
    expect(palette.countSecondary).toBe(money.colorMoneyPending);
    expect(palette.countPrimary).not.toBe(money.colorMoneyPositive);
    expect(palette.countPrimary).not.toBe(money.colorMoneyNegative);
  });

  it.each(MODES)("%s: kisi & sumbu ikut keputusan #208/#207, bukan warna sendiri", (mode) => {
    const palette = chartPalette(TOKENS[mode]);
    expect(palette.grid).toBe(borderTokens(mode).colorBorderSecondary);
    expect(palette.tick).toBe(TOKENS[mode].colorTextSecondary);
    expect(palette.tickStrong).toBe(TOKENS[mode].colorText);
    expect(palette.cursor).toBe(TOKENS[mode].colorFillSecondary);
  });

  it("setiap peran BERGANTI di tema gelap — tak satu pun tertinggal", () => {
    const light = chartPalette(TOKENS.light);
    const dark = chartPalette(TOKENS.dark);
    const roles = Object.keys(seriesRoles("light")) as (keyof ReturnType<typeof seriesRoles>)[];
    for (const role of roles) {
      expect(seriesRoles("light")[role]).not.toBe(seriesRoles("dark")[role]);
    }
    expect(light.grid).not.toBe(dark.grid);
    expect(light.tick).not.toBe(dark.tick);
  });
});

describe("warna seri di recharts adalah TEKS, jadi ambangnya 4,5:1", () => {
  it.each(MODES)("%s: setiap warna seri lolos AA di ketiga latar", (mode) => {
    for (const [role, color] of Object.entries(seriesRoles(mode))) {
      expect(worst(color, mode), `${role} (${color}) di tema ${mode}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("colorSuccess/colorWarning/colorError bawaan GAGAL — sebab token uang dipakai", () => {
    // Inilah pengukuran yang membuat "pakai bawaan AntD saja" tidak bisa
    // dijalankan untuk warna seri: sebagai label irisan dan baris tooltip,
    // ketiganya teks.
    const light = TOKENS.light;
    expect(worst(light.colorSuccess, "light")).toBeLessThan(AA);
    expect(worst(light.colorWarning, "light")).toBeLessThan(AA);
    expect(worst(light.colorError, "light")).toBeLessThan(AA);
    // Dan token uang memperbaikinya di tema yang sama, bukan sekadar berbeda.
    const palette = chartPalette(light);
    expect(worst(palette.statusTones[0], "light")).toBeGreaterThan(
      worst(light.colorSuccess, "light")
    );
  });

  it("kisi lolos 3:1 non-teks — orang melacak nilai batang lewat garis itu", () => {
    for (const mode of MODES) {
      expect(worst(chartPalette(TOKENS[mode]).grid, mode)).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  it("angka sumbu lolos AA — ia teks 11px, bukan hiasan", () => {
    for (const mode of MODES) {
      expect(worst(chartPalette(TOKENS[mode]).tick, mode)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe("urutan nada status menentukan artinya", () => {
  const data = [
    { name: "Aman", value: 12 },
    { name: "Menipis", value: 3 },
    { name: "Habis", value: 5 },
  ];

  it.each(MODES)("%s: irisan ke-n mendapat nada ke-n, bukan nada menurut namanya", (mode) => {
    const palette = chartPalette(TOKENS[mode]);
    expect(tonedSlices(data, palette).map((d) => d.fill)).toEqual([...palette.statusTones]);
  });

  it("status bernilai NOL tidak menggeser warna status sesudahnya", () => {
    // Regresi yang paling mudah dipicu: menyaring nilai nol lebih dulu, lalu
    // memasang nada. "Habis" akan mewarisi kuning "Menipis" dan tak ada yang
    // merah — tanpa satu galat pun.
    const palette = chartPalette(TOKENS.light);
    const withZero = [
      { name: "Aman", value: 12 },
      { name: "Menipis", value: 0 },
      { name: "Habis", value: 5 },
    ];
    expect(tonedSlices(withZero, palette)).toEqual([
      { name: "Aman", value: 12, fill: palette.statusTones[0] },
      { name: "Habis", value: 5, fill: palette.statusTones[2] },
    ]);
  });

  it("irisan ke-4 yang tak diharapkan mendapat netral, bukan mengulang hijau", () => {
    const palette = chartPalette(TOKENS.light);
    const four = [...data, { name: "Entah", value: 1 }];
    expect(tonedSlices(four, palette).at(-1)?.fill).toBe(palette.unknownTone);
  });
});

describe("tooltip recharts: putih pekat sampai kita menyebut lain", () => {
  const item = [{ name: "Uang masuk", value: 1000, color: "#123456", dataKey: "debit" }];

  it("bawaannya kotak PUTIH bertepi #ccc — di tema gelap itu menyilaukan", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markup = renderToStaticMarkup(<DefaultTooltipContent payload={item as any} />);
    expect(markup).toContain("background-color:#fff;");
    expect(markup).toContain("border:1px solid #ccc");
  });

  it.each(MODES)("%s: `tooltipSurface` menimpanya dengan permukaan bertema", (mode) => {
    const token = TOKENS[mode];
    const markup = renderToStaticMarkup(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <DefaultTooltipContent payload={item as any} contentStyle={tooltipSurface(token)} />
    );
    /*
     * Di tema TERANG bawaan putihnya kebetulan hampir benar (`colorBgElevated`
     * = `#ffffff`), jadi yang membuktikan penggantinya benar-benar berlaku
     * adalah kunci yang tidak bisa kebetulan: tepi dan latar harus datang dari
     * token, dan `border: 1px solid #ccc` bawaan harus lenyap di KEDUA tema.
     */
    expect(markup).toContain(`background-color:${token.colorBgElevated}`);
    expect(markup).toContain(`solid ${token.colorBorderSecondary}`);
    expect(markup).not.toContain("border:1px solid #ccc");
  });

  it("baris tooltip tetap berwarna SERI — di situlah warna seri jadi teks", () => {
    const markup = renderToStaticMarkup(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <DefaultTooltipContent payload={item as any} contentStyle={tooltipSurface(TOKENS.light)} />
    );
    expect(markup).toContain("color:#123456");
  });

  it("permukaannya sendiri seluruhnya token — tak satu pun angka ditulis lepas", () => {
    const token = TOKENS.dark;
    const surface = tooltipSurface(token);
    expect(surface.backgroundColor).toBe(token.colorBgElevated);
    expect(surface.color).toBe(token.colorText);
    expect(surface.borderRadius).toBe(token.borderRadiusLG);
    expect(surface.border).toContain(token.colorBorderSecondary);
    expect(surface.boxShadow).toBe(token.boxShadowSecondary);
  });
});

/**
 * Grafik umur piutang/utang (issue #355).
 *
 * Ditambahkan setelah koreksi audit: aplikasi ini SUDAH punya lapisan grafik
 * (recharts, warnanya token) di /contracts, /inventory, dan /reports/cash-flow.
 * Audit produksi 13 Agustus 2026 melaporkannya "nol grafik" — keliru, sebab
 * tenant yang diperiksa mematikan dua modul itu dan halaman ketiganya
 * menggantung grafiknya pada data yang kebetulan kosong.
 *
 * Yang memang belum punya visualisasi adalah laporan keuangan lain, dan umur
 * piutang adalah kasus terkuatnya: ia SUDAH berbentuk grafik batang, hanya
 * digambar sebagai lima kartu berjajar.
 */
describe("grafik umur piutang (#355)", () => {
  const src = readFileSync(
    join(__dirname, "..", "src", "components", "shared", "dashboard-charts.tsx"),
    "utf8"
  );
  const aging = readFileSync(
    join(__dirname, "..", "src", "components", "shared", "aging.tsx"),
    "utf8"
  );

  /**
   * Irisan komponennya dibatasi sampai `export` BERIKUTNYA, dan komentarnya
   * dibuang lebih dulu. Keduanya perlu, dan keduanya ketahuan saat berkas ini
   * ditulis: irisan sampai akhir berkas ikut menyeret komponen sesudahnya, dan
   * rujukan isu seperti `#123` / `#355` terbaca sebagai warna heksadesimal oleh
   * regex yang jujur — `1`, `2`, `3` semuanya digit hex yang sah.
   */
  const componentBody = (name: string) => {
    const start = src.indexOf(`export function ${name}`);
    const rest = src.slice(start + 1);
    const next = rest.indexOf("\nexport function ");
    const block = next === -1 ? rest : rest.slice(0, next);
    return block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  };

  it("memakai nada status dari palet token, bukan hex sendiri", () => {
    const block = componentBody("AgingChart");
    expect(block).toContain("palette.statusTones");
    // Tidak ada satu pun warna mentah yang lahir di dalam komponennya.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  /*
   * Empat ember, tiga nada: yang dibedakan warna adalah TINGKAT kekhawatiran,
   * bukan identitas embernya. Identitas dibawa sumbu X — kanal yang bertahan
   * pada deuteranopia maupun cetakan hitam-putih.
   */
  it("nama ember tercetak di sumbu, jadi warna bukan penanda tunggal", () => {
    const block = componentBody("AgingChart");
    expect(block).toContain('dataKey="label"');
    expect(block).toContain("XAxis");
  });

  it("semua ember nol menghasilkan keadaan kosong, bukan empat batang nol", () => {
    const block = componentBody("AgingChart");
    expect(block).toContain("d.amount <= 0");
    expect(block).toContain("charts.noAging");
  });

  /*
   * Grafiknya MELENGKAPI kartunya, tidak menggantikan. Angka tetap sumber
   * kebenaran yang bisa ditelusuri; label sumbu yang dipendekkan ("12,5 jt")
   * boleh ada justru karena angka penuhnya masih terbaca di atasnya.
   */
  it("dipasang DI BAWAH kartu ember, bukan menggantikannya", () => {
    expect(aging).toContain("AgingChart");
    expect(aging).toContain("aging.totalOutstanding");
    expect(aging.indexOf("aging.totalOutstanding")).toBeLessThan(aging.indexOf("<AgingChart"));
  });

  it("pemendek nominal hanya untuk sumbu, dan tidak memakai Intl compact", () => {
    expect(src).toContain("function compactMoney");
    /*
     * Diperiksa pada sumber TANPA komentar: `compactMoney` sendiri menjelaskan
     * kenapa `notation: "compact"` ditolak (keluarannya berubah antar versi
     * ICU, dan sumbu yang berubah bentuk antar-lingkungan membuat tangkapan
     * layar dokumentasi tak bisa dipercaya). Mencocokkan kalimat itu dengan
     * pemakaian sungguhan membuat penjelasan yang benar menjatuhkan tesnya.
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain('notation: "compact"');
  });
});

/**
 * Waterfall Laba/Rugi (issue #355) — rantai bertingkat #123 digambar apa adanya.
 */
describe("waterfall laba/rugi (#355)", () => {
  const src = readFileSync(
    join(__dirname, "..", "src", "components", "shared", "dashboard-charts.tsx"),
    "utf8"
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /*
   * Kumulatifnya dihitung fungsi MURNI di tingkat modul, bukan di badan
   * komponen: React Compiler menolak mutasi nilai turunan render
   * (`react-hooks/immutability`), dan lint memerahkannya saat berkas ini
   * ditulis. Menariknya kembali ke dalam komponen akan lolos tes tapi gagal
   * lint — jadi arahnya dikunci di sini juga.
   */
  it("kumulatifnya fungsi murni di tingkat modul", () => {
    expect(code).toContain("function buildWaterfall(");
    const body = code.slice(code.indexOf("export function IncomeWaterfallChart"));
    expect(body).not.toContain("let running");
  });

  it("subtotal menyetel ulang kumulatif, bukan ikut dijumlahkan", () => {
    const fn = code.slice(code.indexOf("function buildWaterfall"));
    expect(fn).toContain('kind === "subtotal"');
    expect(fn).toContain("running = s.value");
  });

  it("batang pengangkat tak terlihat dan tak masuk tooltip", () => {
    const body = code.slice(code.indexOf("export function IncomeWaterfallChart"));
    expect(body).toContain('fill="transparent"');
    expect(body).toContain('tooltipType="none"');
  });

  /* Nama tiap langkah ada di sumbu X — warna tak pernah penanda tunggal. */
  it("setiap langkah bernama di sumbu", () => {
    const body = code.slice(code.indexOf("export function IncomeWaterfallChart"));
    expect(body).toContain('dataKey="label"');
    expect(body).toContain("interval={0}");
  });

  it("subtotal memakai nada netral, delta memakai arah uang", () => {
    const body = code.slice(code.indexOf("export function IncomeWaterfallChart"));
    expect(body).toContain("palette.countPrimary");
    expect(body).toContain("palette.moneyOut");
    expect(body).toContain("palette.moneyIn");
  });
});
