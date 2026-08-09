/**
 * NADA PEKAT `/platform` — diukur, bukan dipercaya (issue #303).
 *
 * ══ Kenapa berkas ini ada, dan kenapa ia bukan salinan penjaga pendaratan ══
 * Permintaan pemilik ("`/platform` dibuat lebih berwarna seperti halaman
 * pendaratan") dijalankan dengan RESEP yang sama (`lib/theme/tone-recipe.ts`)
 * tetapi ANGKA yang berbeda — dan perbedaannya bukan selera. `/platform`
 * berdiri di atas permukaan lain (`colorBgLayout` + `colorBgContainer`, bukan
 * `colorBgContainer` + `colorBgElevated`) dan memikul jenis tombol lain (tombol
 * GARIS di kepala kartu, bukan tombol primer di atas pita). Menyalin kadar
 * pendaratan ke sini akan menghasilkan angka yang benar untuk halaman lain.
 *
 * Berkas ini menghitung ulang setiap pasangan warna dari **token yang
 * benar-benar terpasang** (`theme.getDesignToken` pada paket `antd` di
 * `node_modules`) dan dari **resep yang benar-benar dirender** (string
 * `color-mix` diurai dari `PLATFORM_STYLE` itu sendiri, bukan diketik ulang di
 * sini). Kalau AntD kelak menggeser satu anak tangga palet, atau kalau
 * seseorang menyetel satu kadar, yang berteriak adalah tes ini — bukan
 * pengguna yang membuka halaman tagihan di layar yang lebih terang.
 *
 * ══ Yang TIDAK bisa dijangkau berkas ini ═══════════════════════════════════
 * Ia tidak bisa mengatakan halamannya enak dilihat, dan ia tidak bisa
 * mengatakan bahwa warnanya dipakai untuk hierarki alih-alih hiasan. Ia hanya
 * mengunci ambang MASTER.md §Ambang kontras di KEDUA tema, dan mengunci
 * pembagian "permukaan mana boleh memikul tombol apa".
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { theme } from "antd";

import {
  PLATFORM_HUES,
  PLATFORM_MIX,
  PLATFORM_STYLE,
  type PlatformHue,
} from "@/components/tenant/platform-tone";
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
  return [a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w), 1];
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

/* ── resep: DIURAI dari CSS-nya sendiri, bukan diimpor sebagai konstanta ─── */

type Base = "layout" | "container" | "elevated";

/**
 * Kadar & dasar sebuah nada, dibaca ulang dari `PLATFORM_STYLE`.
 *
 * Sengaja tidak memakai `toneMix()` untuk membangun ulang string yang
 * diharapkan: kalau tes memakai fungsi yang sama dengan yang dipakai komponen,
 * ia berhenti membuktikan bahwa yang BENAR-BENAR dirender adalah warna yang
 * diukur di sini. Yang diurai adalah teks CSS-nya.
 */
function kadar(nama: string): { hue: string; pct: number; base: Base } {
  const m = PLATFORM_STYLE.match(
    new RegExp(
      `--sai-platform-${nama}:\\s*color-mix\\(\\s*in srgb,\\s*var\\(--ant-([a-z]+)-6\\)\\s*(\\d+)%,\\s*var\\(--ant-color-bg-(layout|container|elevated)\\)\\s*\\)`
    )
  );
  if (!m) throw new Error(`resep --sai-platform-${nama} tidak ditemukan di PLATFORM_STYLE`);
  return { hue: m[1], pct: Number(m[2]), base: m[3] as Base };
}

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

function raw(mode: Mode) {
  return theme.getDesignToken({
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
  }) as unknown as Record<string, string>;
}

/** Peta hue → keluarga palet, juga dari CSS-nya. */
const HUE_TOKEN: Record<string, string> = Object.fromEntries(
  PLATFORM_HUES.map((hue) => [hue, kadar(`head-${hue}`).hue])
);

function tokens(mode: Mode) {
  const t = raw(mode);
  /* `colorBorder`/`colorBorderSecondary` DIGANTI app di #208 — bawaan AntD
     tidak berlaku di sini, dan memakainya akan mengukur tepi yang tidak pernah
     digambar siapa pun. */
  const border = mode === "dark" ? BORDER_TOKENS_DARK : BORDER_TOKENS_LIGHT;
  const button = mode === "dark" ? PRIMARY_BUTTON_DARK : PRIMARY_BUTTON_LIGHT;
  return {
    layout: parse(t.colorBgLayout),
    container: parse(t.colorBgContainer),
    text: parse(t.colorText),
    textSecondary: parse(t.colorTextSecondary),
    /** Tepi tombol `variant="outline"` (= AntD `type="default"`). */
    outlineEdge: parse(border.colorBorder),
    buttonPrimary: parse(button.colorPrimary),
    hue: (h: PlatformHue, step: number) => parse(t[`${HUE_TOKEN[h]}${step}`]),
  };
}

/** Setiap nada yang benar-benar dideklarasikan, dihitung untuk satu tema. */
function permukaan(mode: Mode) {
  const t = tokens(mode);
  const r = raw(mode);
  const base = { layout: t.layout, container: t.container, elevated: parse(r.colorBgElevated) };
  const dari = (nama: string): RGB => {
    const { hue, pct, base: b } = kadar(nama);
    return mix(parse(r[`${hue}6`]), pct, base[b]);
  };
  const out: Record<string, RGB> = {};
  for (const hue of PLATFORM_HUES) {
    out[`head-${hue}`] = dari(`head-${hue}`);
    out[`chip-${hue}`] = dari(`chip-${hue}`);
  }
  return out;
}

const HEADS = PLATFORM_HUES.map((h) => `head-${h}`);
const CHIPS = PLATFORM_HUES.map((h) => `chip-${h}`);

describe("resepnya terurai — kalau tidak, semua tes di bawah lulus tanpa memeriksa apa pun", () => {
  it("setiap nada punya resep color-mix di PLATFORM_STYLE", () => {
    expect(Object.keys(HUE_TOKEN).sort()).toEqual([...PLATFORM_HUES].sort());
    expect(Object.keys(permukaan("light"))).toHaveLength(PLATFORM_HUES.length * 2);
  });

  it("kadar di CSS sama dengan kadar yang didokumentasikan", () => {
    // Kalau CSS dan konstanta berpisah, komentar `platform-tone.ts` mulai
    // berbohong — dan komentar itulah satu-satunya penjelasan kenapa angkanya
    // segitu.
    for (const hue of PLATFORM_HUES) {
      expect(kadar(`head-${hue}`).pct).toBe(PLATFORM_MIX.head);
      expect(kadar(`chip-${hue}`).pct).toBe(PLATFORM_MIX.chip);
    }
  });

  it("nada dicampur ke permukaan KARTU, bukan ke permukaan halaman", () => {
    /*
     * Kedua peran digambar DI DALAM sebuah `Card`, dan `Card` di app internal
     * adalah `colorBgContainer`. Mencampur ke `colorBgLayout` (`#000000` di
     * tema gelap!) atau ke `colorBgElevated` menghasilkan angka kontras yang
     * benar di atas kertas dan salah di layar — nada yang diukur bukan nada
     * yang digambar.
     */
    for (const nama of [...HEADS, ...CHIPS]) {
      expect(kadar(nama).base).toBe("container");
    }
  });
});

describe("teks di atas nada memenuhi ambang MASTER.md §Ambang kontras", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: colorText & colorTextSecondary ≥ 4,5:1 di setiap nada`, () => {
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
        "Teks 14px di atas nada `/platform` turun di bawah 4,5:1:\n\n  " +
          gagal.join("\n  ") +
          "\n\nJudul kartu di sini 16px dan kalimat penjelasnya 14px — jalan " +
          'keluar "pakai teks besar saja" tidak tersedia. Turunkan kadarnya di ' +
          "`components/tenant/platform-tone.ts`, jangan mengganti warna " +
          "teksnya: warna teks adalah token global milik seluruh aplikasi."
      ).toEqual([]);
    });
  }
});

describe("tombol GARIS tetap bisa ditemukan di atas kepala kartu bernada", () => {
  /*
   * ⚠ INILAH YANG MENGIKAT KADAR `head`, dan ia berbeda dari yang mengikat
   * pendaratan. Di pendaratan yang berdiri di atas nada adalah tombol PRIMER,
   * jadi batasnya isian `#1668dc` di tema gelap. Di `/platform` tidak ada satu
   * pun tombol primer di atas nada — yang ada tombol `variant="outline"`
   * (kepala kartu "Perusahaan", pita masa coba tenang), dan tombol seperti itu
   * dikenali dari TEPINYA. Tepi itu mengikat lebih cepat di tema TERANG.
   */
  for (const mode of MODES) {
    it(`tema ${mode}: colorBorder ≥ 3:1 di atas setiap nada \`head-*\``, () => {
      const t = tokens(mode);
      const s = permukaan(mode);
      const gagal: string[] = [];
      for (const nama of HEADS) {
        const r = ratio(t.outlineEdge, s[nama]);
        if (r < 3) gagal.push(`${nama} = ${r.toFixed(2)}`);
      }
      expect(
        gagal,
        "Tepi tombol garis turun di bawah 3:1 (grafis non-teks) di atas:\n\n  " +
          gagal.join("\n  ") +
          "\n\nTombol yang tepinya tidak terlihat bukan tombol yang labelnya " +
          "sulit dibaca — ia tombol yang tidak terlihat sebagai tombol sama " +
          "sekali. `head` = 16% adalah kadar TERBESAR yang masih lolos pada " +
          "ketiga nada di kedua tema; violet tema terang yang mengikatnya " +
          "(3,05:1 pada 16%, 2,94:1 pada 18%)."
      ).toEqual([]);
    });
  }
});

describe("tombol PRIMER berdiri di badan kartu, dan badan kartu tidak bernada", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: isian tombol primer ≥ 3:1 terhadap colorBgContainer`, () => {
      /*
       * Tombol "Pilih paket ini" hidup di `CardContent`, yaitu
       * `colorBgContainer` telanjang. Tes ini mengunci permukaan itu tetap
       * telanjang: kalau suatu hari badan kartu ikut bernada, angka di bawah
       * turun dan berkas ini merah — sebelum ada yang menyerahkannya.
       */
      const t = tokens(mode);
      const r = ratio(t.buttonPrimary, t.container);
      expect(
        r,
        `Isian tombol primer hanya ${r.toFixed(2)}:1 terhadap badan kartu. ` +
          "Di tema gelap jaraknya memang hanya 3,55:1, jadi setiap nada yang " +
          "ditambahkan ke `colorBgContainer` memakannya."
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("nada `chip` memang tidak layak memikul tombol — itulah sebabnya ia dipisah", () => {
  it("tema gelap: setiap `chip-*` di bawah 3:1 terhadap isian tombol primer", () => {
    /*
     * Tes ini menegaskan sebuah BATAS, bukan sebuah kegagalan. Ia yang
     * menjelaskan kenapa kartu paket berbadan `colorBgContainer` dan hanya
     * KEPALANYA bernada, dan kenapa `chip` = 32% dan bukan 30%: pada 30%
     * violet masih 3,01:1 dan aturan "tidak ada tombol di atas chip" kembali
     * menjadi janji yang harus diingat orang.
     */
    const t = tokens("dark");
    const s = permukaan("dark");
    const lolos = CHIPS.filter((n) => ratio(t.buttonPrimary, s[n]) >= 3);
    expect(
      lolos,
      "Nada berikut kini ≥3:1 terhadap isian tombol primer di tema gelap:\n\n  " +
        lolos.join("\n  ") +
        "\n\nKalau itu disengaja, kartu paket boleh berbadan nada dan komentar " +
        "di `platform-tone.ts` harus ikut diperbarui. Kalau tidak disengaja, " +
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
      for (const hue of PLATFORM_HUES) {
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

describe("nada benar-benar terlihat sebagai bidang, bukan sebagai kartu polos", () => {
  for (const mode of MODES) {
    it(`tema ${mode}: setiap nada berbeda dari badan kartu di bawahnya`, () => {
      /*
       * Lantai 1,05:1 bukan ambang WCAG — tidak ada ambang WCAG untuk "warnanya
       * terlihat". Ia lantai yang DIPILIH, dan angkanya diambil dari MASTER.md
       * §Jenjang permukaan: kartu vs halaman di app ini 1,09:1 (terang) /
       * 1,14:1 (gelap), dan itu sudah dianggap terlalu tipis di issue #266.
       * Apa pun di bawah 1,05 berarti nada yang secara harfiah tidak ada di
       * layar — yaitu `colorFillQuaternary` yang baru saja digantikan.
       */
      const t = tokens(mode);
      const s = permukaan(mode);
      const pucat = Object.entries(s)
        .filter(([, v]) => ratio(v, t.container) < 1.05)
        .map(([n, v]) => `${n} = ${ratio(v, t.container).toFixed(3)}`);
      expect(pucat, "Nada yang praktis sewarna badan kartu:\n\n  " + pucat.join("\n  ")).toEqual(
        []
      );
    });
  }
});

/* ── batas: nada `/platform` tidak bisa dipanggil dari luar `/platform` ──── */

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    // Klien Prisma hasil `prisma generate` — bukan kode kita, dan tidak di git.
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");
const files = new Map<string, string>(
  sourceFiles(SRC).map((f) => [rel(f), readFileSync(f, "utf8")])
);

/** Satu-satunya berkas yang boleh MENYEBUT nama variabelnya. */
const RUMAH = "components/tenant/platform-tone.ts";
/** Satu-satunya berkas yang boleh MEMASANG akarnya. */
const AKAR = "components/tenant/platform-shell.tsx";

describe("nada `/platform` terkurung di dalam [data-platform]", () => {
  it("pemindainya memindai yang benar", () => {
    // Kalau pemindainya rusak (jalur salah, filter kelewat rakus), tes di bawah
    // lulus dengan daftar kosong. Ini yang menahan kegagalan diam itu.
    expect(files.size).toBeGreaterThan(400);
    expect(files.get(RUMAH), `${RUMAH} tidak ditemukan — jalurnya berubah?`).toBeDefined();
  });

  it("string `--sai-platform-` tidak muncul di berkas lain mana pun", () => {
    const pelanggar = [...files]
      .filter(([file, code]) => file !== RUMAH && code.includes("--sai-platform-"))
      .map(([file]) => file);

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Berkas berikut menyebut variabel nada `/platform` langsung:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nVariabel itu HANYA dideklarasikan di dalam `[data-platform]`, " +
            "jadi di luar kerangka `/platform` ia tidak pernah teratasi: " +
            "elemennya diam-diam mewarisi latar induknya dan tidak ada yang " +
            "gagal. Ambil nadanya lewat `platformHead()`/`platformChip()` — " +
            "keduanya bisa dilacak balik, sebuah string tidak."
    ).toEqual([]);
  });

  it("akarnya dipasang tepat satu berkas: platform-shell.tsx", () => {
    const akar = [...files]
      .filter(([, code]) => /data-platform=""/.test(code))
      .map(([file]) => file);
    expect(
      akar,
      "Atribut `data-platform` dipasang di tempat yang bukan kerangkanya. " +
        "Menyalinnya tidak membawa nadanya ikut — blok gayanya hanya ada di " +
        "dokumen yang merender `PlatformShell` — tapi ia MENGAKU sebagai " +
        "permukaan `/platform`, dan penjaga di atas jadi berbohong."
    ).toEqual([AKAR]);
  });

  it("deklarasinya tidak berada di selektor global", () => {
    const blok = [...PLATFORM_STYLE.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
      selektor: m[1].trim(),
      isi: m[2],
    }));
    expect(blok.length).toBeGreaterThan(0);
    expect(blok.some((b) => b.isi.includes("--sai-platform-"))).toBe(true);

    const bocor = blok
      .filter((b) => /--sai-platform-[a-z-]+\s*:/.test(b.isi))
      .filter((b) => !b.selektor.includes("[data-platform]"))
      .map((b) => b.selektor);

    expect(
      bocor,
      "Nada `/platform` dideklarasikan di selektor yang bukan " +
        "`[data-platform]`:\n\n  " +
        bocor.join("\n  ") +
        "\n\nDeklarasi di `:root` (atau `html`/`body`/`*`) membuat nada ini " +
        "tersedia bagi SETIAP halaman aplikasi — termasuk halaman yang membaca " +
        "buku besar. Justru pengurungan inilah yang membuat batasnya mekanisme, " +
        "bukan imbauan."
    ).toEqual([]);
  });

  it("setiap variabel yang DIPAKAI juga dideklarasikan", () => {
    /*
     * Peta `HEAD`/`CHIP` di `platform-tone.ts` menulis nama variabelnya UTUH,
     * dan justru itu yang membuat tes ini mungkin. Salah ketik pada properti
     * kustom TIDAK menghasilkan galat apa pun — nilainya kosong dan elemennya
     * mewarisi induknya. Ini satu-satunya tempat yang bisa menangkapnya.
     */
    const dideklarasikan = new Set(
      [...PLATFORM_STYLE.matchAll(/(--sai-platform-[a-z-]+)\s*:/g)].map((m) => m[1])
    );
    const dipakai = new Set(
      [...(files.get(RUMAH) ?? "").matchAll(/var\((--sai-platform-[a-z-]+)/g)].map((m) => m[1])
    );

    expect(dipakai.size).toBe(PLATFORM_HUES.length * 2);
    const hantu = [...dipakai].filter((v) => !dideklarasikan.has(v)).sort();
    expect(
      hantu,
      "Nada dipakai tapi tidak pernah dideklarasikan:\n\n  " + hantu.join("\n  ")
    ).toEqual([]);
  });
});
