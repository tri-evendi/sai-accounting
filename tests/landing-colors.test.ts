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

import {
  LANDING_HUES,
  LANDING_MIX,
  LANDING_STYLE,
  type LandingHue,
} from "@/components/landing/landing-scale";
import {
  BORDER_TOKENS_DARK,
  BORDER_TOKENS_LIGHT,
  PRIMARY_BUTTON_DARK,
  PRIMARY_BUTTON_LIGHT,
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
    hue: (h: LandingHue, step: number) => parse(t[`${HUE_TOKEN[h]}${step}`]),
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
  const m = LANDING_STYLE.match(
    new RegExp(
      `--sai-landing-${nama}:\\s*color-mix\\(\\s*in srgb,\\s*var\\(--ant-([a-z]+)-6\\)\\s*(\\d+)%,\\s*var\\(--ant-color-bg-(container|elevated)\\)\\s*\\)`
    )
  );
  if (!m) throw new Error(`resep --sai-landing-${nama} tidak ditemukan di LANDING_STYLE`);
  return { hue: m[1], pct: Number(m[2]), base: m[3] as "container" | "elevated" };
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
    return mix(parse(raw[`${hue}6`]), pct, base[b]);
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
  "band-accent", // ujung pekat hero + ajakan penutup
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
    const lolos = TANPA_TOMBOL.filter((n) => ratio(t.buttonPrimary, s[n]) >= 3);
    expect(
      lolos,
      "Nada berikut kini ≥3:1 terhadap isian tombol primer di tema gelap:\n\n  " +
        lolos.join("\n  ") +
        "\n\nKalau itu disengaja, kartu paket boleh berbadan nada dan komentar " +
        "di `landing-pricing.tsx` harus ikut diperbarui. Kalau tidak disengaja, " +
        "kadar campurannya baru saja turun tanpa ada yang memintanya."
    ).toEqual([]);
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
