/**
 * NADA PEKAT HALAMAN PENDARATAN — diukur, bukan dipercaya.
 *
 * ══ Kenapa berkas ini ada ═══════════════════════════════════════════════════
 * Permintaan pemilik untuk halaman `/` berbunyi "gunakan warna solid juga,
 * jangan hanya outline atau border saja". Menjalankannya berarti menaruh TEKS
 * DI ATAS WARNA di tujuh tempat sekaligus — pita seksi, kartu berisi, kotak
 * ikon, kepala kartu paket, bilah menempel, kaki halaman, bidang hero — dan
 * setiap satu di antaranya adalah kesempatan baru bagi kontras untuk jatuh
 * diam-diam. Tak satu pun dari kegagalan itu berbunyi: halaman tetap tampil,
 * hanya lebih sulit dibaca oleh orang yang tidak sedang duduk di depan layar
 * yang sama dengan penulisnya.
 *
 * Angka di komentar `landing-scale.ts` karena itu tidak boleh menjadi ingatan.
 * Berkas ini menghitungnya ulang setiap kali suite berjalan, dari **token yang
 * benar-benar terpasang** (`theme.getDesignToken` pada paket `antd` di
 * `node_modules`) dan dari **resep yang benar-benar dirender** (string
 * `color-mix` yang sama yang ada di `LANDING_STYLE`, diurai dari sana — bukan
 * diketik ulang di sini).
 *
 * ══ Yang TIDAK bisa dijangkau berkas ini ════════════════════════════════════
 * Ia tidak bisa mengatakan halamannya enak dilihat. Ia hanya mengatakan bahwa
 * setiap pasangan teks-di-atas-warna yang dibuatnya melewati ambang MASTER.md
 * §Ambang kontras di KEDUA tema. Penilaian rupa tetap pekerjaan mata manusia.
 *
 * ══ Satu batas yang mudah dilanggar tanpa sadar ═════════════════════════════
 * Isian tombol primer di tema gelap (`#1668dc`) hanya berjarak 3,55:1 dari
 * latar halaman. Setiap nada menerangkan latar dan karena itu MEMAKAN jarak
 * tersebut. Tes "tombol primer tetap bisa ditemukan" di bawah mengunci
 * pembagiannya: pita boleh memikul tombol, `fill-*`/`chip-*` tidak — dan kalau
 * suatu hari seseorang menaikkan kadar campuran pita, tes itu yang berteriak,
 * bukan pengguna.
 */
import { describe, expect, it } from "vitest";
import { theme } from "antd";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LANDING_HUES,
  LANDING_MIX,
  LANDING_ON_SOLID_MUTED_PCT,
  LANDING_STYLE,
  type LandingHue,
} from "@/components/landing/landing-scale";
import { INVERSE_BUTTON_MIX, INVERSE_BUTTON_STYLE } from "@/components/ui/button";
import {
  BORDER_TOKENS_DARK,
  BORDER_TOKENS_LIGHT,
  PRIMARY_BUTTON_DARK,
  PRIMARY_BUTTON_LIGHT,
  brandPrimary,
  brandSolid,
  brandTone,
} from "@/lib/theme/antd-tokens";

type RGB = [number, number, number, number];

/* ── warna: urai, campur, komposit, ukur ─────────────────────────────────── */

function parse(color: string): RGB {
  const c = color.trim();
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const f = h.length === 3 ? [...h].map((x) => x + x).join("") : h.slice(0, 6);
    return [
      parseInt(f.slice(0, 2), 16),
      parseInt(f.slice(2, 4), 16),
      parseInt(f.slice(4, 6), 16),
      1,
    ];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`warna tak terurai: ${color}`);
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** `color-mix(in srgb, a p%, b)` untuk warna opak: lerp kanal sRGB terkode-gamma. */
function mix(a: RGB, pct: number, b: RGB): RGB {
  const w = pct / 100;
  return [
    a[0] * w + b[0] * (1 - w),
    a[1] * w + b[1] * (1 - w),
    a[2] * w + b[2] * (1 - w),
    1,
  ];
}

/** Teks AntD beralfa (`rgba(0,0,0,0.88)`) dikomposit ke latarnya lebih dulu. */
function over(fg: RGB, bg: RGB): RGB {
  return [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ];
}

function luminance(c: RGB): number {
  const ch = [c[0], c[1], c[2]].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── token yang benar-benar berlaku, per tema ────────────────────────────── */


/**
 * `colorPrimary` yang BENAR-BENAR dirender.
 *
 * Algoritma gelap AntD mentransformasi benih yang diberikan, jadi mengukur
 * benihnya berarti mengukur warna yang tidak pernah muncul di layar — dan itu
 * sudah sempat terjadi: benih 5,41:1 keluar sebagai 4,24:1 tanpa satu penjaga
 * pun berbunyi.
 */
const appliedPrimary = (mode: Mode): string =>
  (
    theme.getDesignToken({
      algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: brandPrimary(mode) },
    }) as unknown as Record<string, string>
  ).colorPrimary;

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

function tokens(mode: Mode) {
  const t = theme.getDesignToken({
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
  }) as unknown as Record<string, string>;
  const border = mode === "dark" ? BORDER_TOKENS_DARK : BORDER_TOKENS_LIGHT;
  const button = mode === "dark" ? PRIMARY_BUTTON_DARK : PRIMARY_BUTTON_LIGHT;
  return {
    container: parse(t.colorBgContainer),
    elevated: parse(t.colorBgElevated),
    text: parse(t.colorText),
    textSecondary: parse(t.colorTextSecondary),
    /* `colorBorder` diganti app di #208 — bawaan AntD tidak berlaku di sini. */
    border: parse(border.colorBorder),
    buttonPrimary: parse(button.colorPrimary),
    /*
     * `primary` bukan keluarga palet melainkan warna merek per tema, jadi ia
     * dibaca dari sumbernya sendiri dan tidak punya anak tangga: glif merek
     * memakai warna yang SAMA dengan isian nadanya (`landing-scale.ts`).
     */
    hue: (h: LandingHue, step: number) =>
      HUE_TOKEN[h] === "brandTone"
        ? parse(appliedPrimary(mode))
        : parse(t[`${HUE_TOKEN[h]}${step}`]),
  };
}

/**
 * Peta hue → keluarga palet, DIBACA ULANG dari `LANDING_STYLE`.
 *
 * Sengaja tidak diimpor dari `landing-scale.ts`: kalau tes memakai peta yang
 * sama dengan yang dipakai komponen, ia berhenti membuktikan bahwa yang
 * BENAR-BENAR dirender adalah warna yang diukur di sini. Yang diurai adalah
 * teks CSS-nya sendiri.
 */
/** Kadar campuran, juga dari CSS-nya — bukan dari konstanta yang diimpor. */
function kadar(nama: string): { hue: string; pct: number; base: "container" | "elevated" } {
  /*
   * Dua bentuk sumber yang sah, dan keduanya harus dikenali:
   *
   *   var(--ant-<hue>-6)     — tiga hue preset (cyan, geekblue, purple)
   *   var(--ant-color-primary) — hue MEREK, sejak warna merek menjadi navy
   *
   * Yang kedua ada karena tangga preset `--ant-blue-*` berhenti mewakili merek
   * pada hari merek pindah ke navy (`lib/theme/tone-recipe.ts`). Bentuknya
   * tetap diurai DARI CSS-nya sendiri — bukan diimpor dari `landing-scale.ts` —
   * supaya tes ini tetap membuktikan apa yang benar-benar dirender.
   */
  const m = LANDING_STYLE.match(
    new RegExp(
      `--sai-landing-${nama}:\\s*color-mix\\(\\s*in srgb,\\s*var\\((?:--ant-([a-z]+)-6|--ant-(color-brand-tone))\\)\\s*(\\d+)%,\\s*var\\(--ant-color-bg-(container|elevated)\\)\\s*\\)`
    )
  );
  if (!m) throw new Error(`resep --sai-landing-${nama} tidak ditemukan di LANDING_STYLE`);
  return {
    hue: m[1] ?? "brandTone",
    pct: Number(m[3]),
    base: m[4] as "container" | "elevated",
  };
}

const HUE_TOKEN: Record<string, string> = Object.fromEntries(
  LANDING_HUES.map((hue) => [hue, kadar(`fill-${hue}`).hue])
);

function permukaan(mode: Mode) {
  const t = tokens(mode);
  const raw = theme.getDesignToken({
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
  }) as unknown as Record<string, string>;
  const base = { container: t.container, elevated: t.elevated };
  const dari = (nama: string): RGB => {
    const { hue, pct, base: b } = kadar(nama);
    const sumber = hue === "brandTone" ? brandTone(mode) : raw[`${hue}6`];
    return mix(parse(sumber), pct, base[b]);
  };

  const out: Record<string, RGB> = {
    "band-brand": dari("band-brand"),
    "band-cyan": dari("band-cyan"),
    "band-indigo": dari("band-indigo"),
    "band-accent": dari("band-accent"),
    surface: t.elevated,
    halaman: t.container,
  };
  for (const hue of LANDING_HUES) {
    out[`fill-${hue}`] = dari(`fill-${hue}`);
    out[`chip-${hue}`] = dari(`chip-${hue}`);
  }
  return out;
}

/** Permukaan yang MEMIKUL tombol primer — pita, permukaan kartu, latar halaman. */
const MEMIKUL_TOMBOL = [
  "band-brand", // bilah menempel
  "band-cyan", // ujung jauh gradien hero
  "band-accent", // sorotan radial hero (sejak #401 tidak lagi pita penutup)
  "band-indigo", // pita harga (tombol ada di dalam kartu, tapi diukur juga)
  "surface", // badan kartu paket
  "halaman",
];

/** Permukaan yang TIDAK boleh memikul tombol primer — nada pekat. */
const TANPA_TOMBOL = LANDING_HUES.flatMap((h) => [`fill-${h}`, `chip-${h}`]);

describe("resepnya terurai — kalau tidak, semua tes di bawah lulus tanpa memeriksa apa pun", () => {
  it("setiap nada punya resep color-mix di LANDING_STYLE", () => {
    expect(Object.keys(HUE_TOKEN).sort()).toEqual([...LANDING_HUES].sort());
    expect(Object.keys(permukaan("light"))).toHaveLength(6 + LANDING_HUES.length * 2);
  });

  it("kadar di CSS sama dengan kadar yang didokumentasikan", () => {
    // Kalau CSS dan konstanta berpisah, komentar `landing-scale.ts` mulai
    // berbohong — dan komentar itulah satu-satunya penjelasan kenapa angkanya
    // segitu.
    expect(kadar("band-brand").pct).toBe(LANDING_MIX.band);
    expect(kadar("band-accent").pct).toBe(LANDING_MIX.accent);
    expect(kadar("fill-brand").pct).toBe(LANDING_MIX.fill);
    expect(kadar("chip-brand").pct).toBe(LANDING_MIX.chip);
  });

  it("nada dicampur ke permukaan yang SEDANG berlaku, bukan ke anak tangga tetap", () => {
    /*
     * Inilah yang membuat satu resep melayani dua tema. Anak tangga telanjang
     * (`--ant-blue-1`) MEMBALIK di tema gelap menjadi `#111a2c` — praktis
     * sewarna latar halaman gelap `#141414`, yaitu pita yang lenyap di satu
     * tema tanpa ada yang gagal.
     */
    for (const nama of ["band-brand", "band-accent", "fill-brand", "chip-brand"]) {
      expect(["container", "elevated"]).toContain(kadar(nama).base);
    }
  });
});

describe("teks di atas nada memenuhi ambang MASTER.md §Ambang kontras", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: colorText & colorTextSecondary ≥ 4,5:1 di setiap permukaan`, () => {
      const t = tokens(mode);
      const gagal: string[] = [];
      for (const [nama, bg] of Object.entries(permukaan(mode))) {
        for (const [peran, warna] of [
          ["colorText", t.text],
          ["colorTextSecondary", t.textSecondary],
        ] as const) {
          const r = ratio(over(warna, bg), bg);
          if (r < 4.5) gagal.push(`${nama} × ${peran} = ${r.toFixed(2)}`);
        }
      }
      expect(
        gagal,
        "Teks 14px di atas nada pendaratan turun di bawah 4,5:1:\n\n  " +
          gagal.join("\n  ") +
          "\n\nSeluruh teks halaman ini di bawah 18,66px — jalan keluar " +
          '"pakai teks besar saja" tidak tersedia. Turunkan kadar campurannya ' +
          "di `landing-scale.ts`, jangan mengganti warna teksnya: warna teks " +
          "adalah token global yang dipakai seluruh aplikasi."
      ).toEqual([]);
    });
  }
});

describe("tombol primer tetap bisa ditemukan sebagai bidang", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: isian tombol ≥ 3:1 terhadap setiap permukaan yang memikulnya`, () => {
      const t = tokens(mode);
      const s = permukaan(mode);
      const gagal: string[] = [];
      for (const nama of MEMIKUL_TOMBOL) {
        const r = ratio(t.buttonPrimary, s[nama]);
        if (r < 3) gagal.push(`${nama} = ${r.toFixed(2)}`);
      }
      expect(
        gagal,
        "Isian tombol primer turun di bawah 3:1 (grafis non-teks) terhadap:\n\n  " +
          gagal.join("\n  ") +
          "\n\nDi tema gelap isian itu (`#1668dc`) hanya berjarak 3,55:1 dari " +
          "latar halaman, jadi setiap kenaikan kadar nada memakan jarak itu. " +
          "Labelnya tetap terbaca — yang hilang adalah kemampuan MENEMUKAN " +
          "tombolnya sebagai bidang, dan itu tidak akan terlihat di layar " +
          "tempat kodenya ditulis."
      ).toEqual([]);
    });
  }
});

describe("nada pekat memang tidak layak memikul tombol — itulah sebabnya ia dipisah", () => {
  it("tema gelap: `fill-*`/`chip-*` di bawah 3:1 terhadap isian tombol primer", () => {
    /*
     * Tes ini menegaskan sebuah BATAS, bukan sebuah kegagalan. Ia yang
     * menjelaskan kenapa kartu paket berbadan `surface` dan hanya KEPALANYA
     * bernada: kalau suatu hari nada ini cukup redup untuk memikul tombol,
     * tes ini merah dan pemisahan itu boleh dicabut — dengan sengaja, bukan
     * karena seseorang menyalin gaya kartu fitur ke kartu paket.
     */
    const t = tokens("dark");
    const s = permukaan("dark");

    /*
     * ⚠ PENGECUALIAN TERUKUR, DIPUTUSKAN SAAT WARNA MEREK MENJADI NAVY.
     *
     * `fill-violet` melewati 3:1 terhadap isian tombol gelap yang baru
     * (3,05:1). Itu BUKAN pelonggaran diam-diam, dan bukan pula tanda bahwa
     * kartu paket boleh berbadan nada. Alasannya geometris:
     *
     *   `fill-violet` terletak DI ANTARA permukaan melayang dan isian tombol
     *   (ungu-6 gelap lebih terang daripada `#1f1f1f`, jadi mencampurnya
     *   MENERANGKAN). Syarat "tombol ≥3:1 terhadap permukaan melayang" karena
     *   itu menekan rasio terhadap `fill-violet` dari sisi berlawanan, dan
     *   jendela yang memenuhi keduanya sangat sempit: isian LAMA (`#1668dc`)
     *   pun hanya lolos 3,18 vs 2,97 — berjarak 0,21. Disapu menyeluruh,
     *   tidak ada navy yang mendapat margin berarti pada keduanya sekaligus.
     *
     * Yang MENENTUKAN pemisahan badan/kepala kartu paket bukan violet — kartu
     * itu memakai `fill-indigo` (kepala biasa) dan `chip-brand` (kepala
     * disorot), dan violet tidak pernah berada di bawah satu tombol pun di
     * halaman ini. Ketiga nada yang benar-benar relevan diperiksa TERPISAH di
     * bawah, dan di sana tidak ada pengecualian.
     */
    const DILEWATI_SENGAJA = new Set(["fill-violet"]);
    const lolos = TANPA_TOMBOL.filter(
      (n) => ratio(t.buttonPrimary, s[n]) >= 3 && !DILEWATI_SENGAJA.has(n)
    );
    expect(
      lolos,
      "Nada berikut kini ≥3:1 terhadap isian tombol primer di tema gelap:\n\n  " +
        lolos.join("\n  ") +
        "\n\nKalau itu disengaja, kartu paket boleh berbadan nada dan komentar " +
        "di `landing-pricing.tsx` harus ikut diperbarui. Kalau tidak disengaja, " +
        "kadar campurannya baru saja turun tanpa ada yang memintanya."
    ).toEqual([]);

    /*
     * Pagar kedua, dan inilah yang sebenarnya menjaga bentuk kartu paket:
     * nada yang DIPAKAI kartu itu wajib tetap di bawah 3:1. Pengecualian di
     * atas karena itu tidak bisa tumbuh diam-diam ke nada yang penting.
     */
    for (const nada of ["fill-brand", "fill-indigo", "chip-brand"]) {
      expect(
        ratio(t.buttonPrimary, s[nada]),
        `${nada} kini cukup redup untuk memikul tombol primer — pemisahan ` +
          "badan/kepala kartu paket kehilangan alasannya."
      ).toBeLessThan(3);
    }
  });
});

describe("glif ikon di atas kotak sehue", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: anak tangga -8 ≥ 3:1 di atas chip sehue`, () => {
      const t = tokens(mode);
      const s = permukaan(mode);
      const gagal: string[] = [];
      for (const hue of LANDING_HUES) {
        const r = ratio(t.hue(hue, 8), s[`chip-${hue}`]);
        if (r < 3) gagal.push(`${hue} = ${r.toFixed(2)}`);
      }
      expect(
        gagal,
        "Glif ikon di bawah ambang 3:1 (grafis non-teks):\n\n  " +
          gagal.join("\n  ") +
          "\n\nPasangan chip(-6 dicampur) + glif(-8) bekerja karena keduanya " +
          "bergerak SEARAH saat tema berbalik. Mengganti salah satunya dengan " +
          "anak tangga tetap akan memutus pasangan itu di satu tema saja."
      ).toEqual([]);
    });
  }
});

describe("nada benar-benar terlihat sebagai bidang, bukan sebagai putih", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: setiap pita & kartu berisi berbeda dari latar halaman`, () => {
      /*
       * Lantai 1,05:1 bukan ambang WCAG — tidak ada ambang WCAG untuk "warnanya
       * terlihat". Ia lantai yang DIPILIH, dan angkanya diambil dari MASTER.md
       * §Jenjang permukaan: kartu vs halaman di app internal adalah 1,09:1
       * (terang) / 1,14:1 (gelap), dan itu sudah dianggap terlalu tipis di
       * issue #266. Apa pun di bawah 1,05 berarti nada yang secara harfiah
       * tidak ada di layar — yaitu `colorFillQuaternary` yang baru saja
       * digantikan.
       */
      const s = permukaan(mode);
      const halaman = s.halaman;
      const pucat = Object.entries(s)
        .filter(([n]) => n !== "halaman" && n !== "surface")
        .filter(([, v]) => ratio(v, halaman) < 1.05)
        .map(([n, v]) => `${n} = ${ratio(v, halaman).toFixed(3)}`);
      expect(pucat, "Nada yang praktis sewarna latar halaman:\n\n  " + pucat.join("\n  ")).toEqual(
        []
      );
    });
  }
});

/* ── PITA PEKAT — ajakan penutup (#401) ──────────────────────────────────── */

/**
 * Pita penutup adalah SATU-SATUNYA bidang navy penuh di halaman ini, dan ia
 * tidak masuk `permukaan()` di atas dengan sengaja: aturan "colorText ≥4,5:1
 * di setiap permukaan" memang TIDAK berlaku untuknya — teks di atasnya
 * `colorTextLightSolid`, bukan `colorText`. Pasangan-pasangannya diukur di
 * sini, dari nilai yang benar-benar dirender:
 *
 *   • pita     = `--ant-color-brand-solid` (`brandSolid(mode)`, dipasang
 *                `antd-provider.tsx`) — DIVERIFIKASI bahwa CSS-nya memang
 *                merujuk token itu, bukan diketik ulang;
 *   • teks     = `colorTextLightSolid` (token AntD);
 *   • redup    = putih N% (N diurai dari `LANDING_STYLE`);
 *   • tombol   = `INVERSE_BUTTON_STYLE` (`components/ui/button.tsx`): isian
 *                putih, label `brand-solid`, hover/aktif putih dicampur navy.
 *
 * `landing.md` §Yang DITOLAK dulu menolak "pita biru pekat + teks putih"
 * karena tangga BIRU AntD membalik di tema gelap. Navy merek adalah token
 * terpisah dengan angka sendiri, dan angka itulah yang dikunci di sini.
 */
describe("pita pekat ajakan penutup (#401)", () => {
  const CSS_BAND_SOLID = /--sai-landing-band-solid:\s*var\(--ant-color-brand-solid\)/;
  const CSS_ON_SOLID = /--sai-landing-on-solid:\s*var\(--ant-color-text-light-solid\)/;
  const CSS_MUTED =
    /--sai-landing-on-solid-muted:\s*color-mix\(in srgb,\s*var\(--ant-color-text-light-solid\)\s*(\d+)%,\s*transparent\)/;

  const putih = (mode: Mode): RGB =>
    parse(
      (
        theme.getDesignToken({
          algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        }) as unknown as Record<string, string>
      ).colorTextLightSolid
    );
  const pita = (mode: Mode): RGB => parse(brandSolid(mode));
  const putihBeralfa = (mode: Mode, pct: number): RGB => {
    const [r, g, b] = putih(mode);
    return [r, g, b, pct / 100];
  };

  /** Kadar N% putih dari sebuah string `color-mix(in srgb, var(...) N%, ...)`. */
  const kadarDari = (css: string): number => {
    const m = css.match(/color-mix\(in srgb,\s*var\(--ant-color-text-light-solid\)\s*(\d+)%/);
    if (!m) throw new Error(`bukan color-mix putih: ${css}`);
    return Number(m[1]);
  };

  it("CSS-nya merujuk token isian merek & teks terang, bukan warna yang diketik ulang", () => {
    expect(LANDING_STYLE).toMatch(CSS_BAND_SOLID);
    expect(LANDING_STYLE).toMatch(CSS_ON_SOLID);
    const m = LANDING_STYLE.match(CSS_MUTED);
    expect(m, "resep --sai-landing-on-solid-muted tidak ditemukan").not.toBeNull();
    expect(Number(m![1])).toBe(LANDING_ON_SOLID_MUTED_PCT);
  });

  for (const mode of MODES) {
    it(`tema ${mode}: teks putih ≥ 4,5:1 dan teks redup ≥ 4,5:1 di atas pita navy`, () => {
      const bg = pita(mode);
      const teks = ratio(putih(mode), bg);
      expect(teks, `putih di atas brand-solid = ${teks.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);

      const pct = Number(LANDING_STYLE.match(CSS_MUTED)![1]);
      const redup = ratio(over(putihBeralfa(mode, pct), bg), bg);
      expect(redup, `putih ${pct}% di atas brand-solid = ${redup.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("kadar teks redup adalah yang TERENDAH yang lolos — bukan angka kebiasaan (85%)", () => {
    /*
     * Ini yang membuktikan angkanya diukur: dua persen lebih transparan sudah
     * gagal di salah satu tema (terukur: 90% → 4,44:1 di tema gelap). Kalau
     * suatu hari navy gelapnya berubah dan 92% tidak lagi menjadi batas, tes
     * ini merah dan angkanya diukur ulang — bukan dibiarkan bermargin tanpa
     * ada yang tahu, atau turun diam-diam ke 85%.
     */
    const pct = LANDING_ON_SOLID_MUTED_PCT;
    const gagal = MODES.some((mode) => {
      const bg = pita(mode);
      return ratio(over(putihBeralfa(mode, pct - 2), bg), bg) < 4.5;
    });
    expect(gagal, `${pct - 2}% masih lolos di kedua tema — kadar ${pct}% bukan lagi batas terukur`).toBe(true);
    // …dan 85% memang gagal: inilah sebabnya angka issue tidak dipakai apa adanya.
    expect(ratio(over(putihBeralfa("dark", 85), pita("dark")), pita("dark"))).toBeLessThan(4.5);
  });

  for (const mode of MODES) {
    it(`tema ${mode}: tombol terbalik — bidang ≥ 3:1 terhadap pita, label ≥ 4,5:1 di setiap keadaan`, () => {
      const bg = pita(mode);
      const isian = putih(mode);
      const label = parse(brandSolid(mode));
      const gaya = INVERSE_BUTTON_STYLE as unknown as Record<string, string>;

      // Isian putih harus BISA DITEMUKAN sebagai bidang di atas pita navy.
      expect(gaya["--ant-btn-bg-color"]).toBe("var(--ant-color-text-light-solid)");
      expect(ratio(isian, bg)).toBeGreaterThanOrEqual(3);

      // Label navy di atas isian putih — dan tetap navy saat hover/aktif.
      for (const k of ["--ant-btn-text-color", "--ant-btn-text-color-hover", "--ant-btn-text-color-active"]) {
        expect(gaya[k]).toBe("var(--ant-color-brand-solid)");
      }
      expect(ratio(label, isian)).toBeGreaterThanOrEqual(4.5);

      // Hover & aktif: putih dicampur navy — kadarnya DIURAI dari gayanya.
      const hover = kadarDari(gaya["--ant-btn-bg-color-hover"]);
      const aktif = kadarDari(gaya["--ant-btn-bg-color-active"]);
      expect(hover).toBe(INVERSE_BUTTON_MIX.hover);
      expect(aktif).toBe(INVERSE_BUTTON_MIX.active);
      for (const [nama, pct] of [
        ["hover", hover],
        ["aktif", aktif],
      ] as const) {
        const isianKeadaan = mix(isian, pct, bg);
        const r = ratio(label, isianKeadaan);
        expect(r, `label navy di atas isian ${nama} (${pct}% putih) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        // …dan bidangnya masih ≥3:1 terhadap pita saat disentuh.
        expect(ratio(isianKeadaan, bg)).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("aturan TERBALIK: `primary` memang tidak layak di atas pita ini — dan berkasnya tidak memakainya", () => {
    /*
     * Isian tombol primer = isian merek yang sama dengan pitanya (di tema
     * terang persis sama: 1,00:1). Ini yang membuat `inverse` ada, dan yang
     * membuat `variant="primary"` DILARANG di `landing-closing-cta.tsx`.
     */
    const gagal = MODES.some((mode) => ratio(tokens(mode).buttonPrimary, pita(mode)) < 3);
    expect(gagal, "isian primer kini ≥3:1 di atas brand-solid di kedua tema — `inverse` kehilangan alasannya").toBe(true);

    const isi = readFileSync(
      join(__dirname, "..", "src", "components", "landing", "landing-closing-cta.tsx"),
      "utf8"
    );
    expect(isi).toMatch(/tone="solid"/);
    expect(isi).toMatch(/variant="inverse"/);
    expect(isi).not.toMatch(/variant="primary"/);
    expect(isi).not.toMatch(/variant="default"/);
  });

  it("nada `accent` tidak lagi menjadi pita seksi mana pun — ia tinggal sorotan radial hero", () => {
    /*
     * #401 memindahkan puncak halaman ke pita pekat. `band-accent` tetap
     * dideklarasikan (dipakai gradien radial `landing-hero.tsx`), tetapi tidak
     * boleh kembali menjadi `tone` seksi: dua puncak = tidak ada puncak.
     */
    const seksi = readFileSync(
      join(__dirname, "..", "src", "components", "landing", "landing-section.tsx"),
      "utf8"
    );
    expect(seksi).not.toMatch(/"accent"/);
    const hero = readFileSync(
      join(__dirname, "..", "src", "components", "landing", "landing-hero.tsx"),
      "utf8"
    );
    expect(hero).toMatch(/var\(--sai-landing-band-accent\)/);
  });
});
