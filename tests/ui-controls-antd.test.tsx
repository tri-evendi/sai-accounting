/**
 * Primitif kendali di atas Ant Design (issue #187, fase B1).
 *
 * Yang dijaga di sini adalah janji-janji yang berpindah tuan saat isi primitif
 * ditulis ulang: sebelumnya dijamin string kelas Tailwind yang bisa dibaca di
 * sumbernya, sekarang dijamin TOKEN dan pemetaan prop yang hasilnya baru
 * terlihat setelah AntD menghitung gayanya. Tiga kelas kegagalan yang khusus
 * dijaga:
 *
 *  1. **Pemetaan prop yang bertabrakan nama.** `type` berarti hal yang berbeda
 *     di HTML dan di AntD, dan yang salah tidak pernah gagal di `tsc`: tombol
 *     `type="submit"` yang diam-diam berhenti mengirim formulirnya.
 *  2. **Ukuran & warna yang datang dari token, bukan dari komponen.** Target
 *     sentuh 40px dan cincin fokus keyboard sekarang keputusan
 *     `ConfigProvider`; kalau tokennya lepas, tidak ada satu berkas pun di
 *     `src/components/ui` yang berubah — jadi tidak ada diff untuk ditinjau.
 *     Karena itu gayanya benar-benar DIHITUNG di sini lewat `extractStyle`,
 *     bukan diperiksa sebagai string kelas.
 *  3. **Kontras label status.** `Tag` menaruh teks 12px di atas latar tipis;
 *     bawaan AntD gagal 4,5:1 di empat dari delapan kombinasi. Rasionya
 *     dihitung ulang setiap kali suite berjalan, terhadap paket `antd` yang
 *     benar-benar terpasang — bump versi tidak bisa menggesernya diam-diam.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigProvider, theme } from "antd";
import { StyleProvider, createCache, extractStyle } from "@ant-design/cssinjs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { focusRingColor, tagStatusTokens } from "@/lib/theme/antd-tokens";

/** Sama dengan `CONTROL_HEIGHT` di `components/providers/antd-provider.tsx`. */
const CONTROL_HEIGHT = 40;

const render = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

/* ------------------------------------------------------------------ */
/* Kontras — rumus WCAG 2.x, ditulis ulang di sini dengan sengaja       */
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

/** Kalibrasi: angka yang sudah tertulis di MASTER.md harus keluar dari rumus ini. */
it("rumus kontras terkalibrasi", () => {
  expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
  expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
});

const TOKENS = {
  light: theme.getDesignToken({
    algorithm: theme.defaultAlgorithm,
    token: { controlHeight: CONTROL_HEIGHT },
  }),
  dark: theme.getDesignToken({
    algorithm: theme.darkAlgorithm,
    token: { controlHeight: CONTROL_HEIGHT },
  }),
} as const;

const SURFACES = (mode: "light" | "dark") => [
  TOKENS[mode].colorBgContainer,
  TOKENS[mode].colorBgLayout,
  TOKENS[mode].colorBgElevated,
];

const worst = (color: string, mode: "light" | "dark") =>
  Math.min(...SURFACES(mode).map((bg) => contrast(color, bg)));

/* ------------------------------------------------------------------ */
/* Gaya yang benar-benar dihitung AntD                                  */
/* ------------------------------------------------------------------ */

/**
 * Merender di bawah `ConfigProvider` dengan token yang sama dengan aplikasi,
 * lalu MENGAMBIL CSS yang dihasilkan cssinjs. Ini satu-satunya cara memeriksa
 * hal yang tidak muncul di markup: tinggi kendali dan cincin fokus keduanya
 * hidup di stylesheet, bukan di atribut.
 */
function styleSheet(node: React.ReactNode, resolved: "light" | "dark" = "light") {
  const cache = createCache();
  renderToStaticMarkup(
    <StyleProvider cache={cache}>
      <ConfigProvider
        theme={{
          algorithm: resolved === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            controlHeight: CONTROL_HEIGHT,
            colorPrimaryBorder: focusRingColor(resolved),
          },
          components: { Tag: tagStatusTokens(resolved) },
        }}
      >
        {node}
      </ConfigProvider>
    </StyleProvider>
  );
  return extractStyle(cache, true);
}

describe("Button — pemetaan prop", () => {
  it("merender komponen AntD, bukan lagi kelas Tailwind", () => {
    const html = render(<Button>Simpan</Button>);
    expect(html).toContain("ant-btn");
    expect(html).not.toContain("bg-primary");
  });

  it("`type` tetap berarti HTML — bukan varian AntD", () => {
    // Kegagalan yang dijaga: AntD memakai `type` untuk VARIAN dan `htmlType`
    // untuk HTML, dan `htmlType` bawaannya `button`. Kalau penerjemahan ini
    // lepas, 60 tombol kirim di aplikasi ini berhenti mengirim formulirnya
    // tanpa satu galat pun.
    expect(render(<Button type="submit">Simpan</Button>)).toContain('type="submit"');
    expect(render(<Button>Simpan</Button>)).toContain('type="button"');
  });

  it("varian domain dipetakan ke type/danger AntD", () => {
    expect(render(<Button variant="primary">x</Button>)).toContain("ant-btn-variant-solid");
    expect(render(<Button variant="secondary">x</Button>)).toContain(
      "ant-btn-variant-outlined"
    );
    expect(render(<Button variant="danger">x</Button>)).toContain("ant-btn-color-dangerous");
    expect(render(<Button variant="ghost">x</Button>)).toContain("ant-btn-variant-text");
    expect(render(<Button variant="link">x</Button>)).toContain("ant-btn-variant-link");
  });

  it("alias shadcn menghasilkan markup identik dengan nama domain", () => {
    // Kalau keduanya sempat menyimpang, tombol hapus di satu halaman bisa
    // berbeda rupa dari halaman lain tanpa ada yang sadar.
    expect(render(<Button variant="destructive">x</Button>)).toBe(
      render(<Button variant="danger">x</Button>)
    );
    expect(render(<Button variant="default">x</Button>)).toBe(
      render(<Button variant="primary">x</Button>)
    );
  });

  it("ukuran dipetakan ke small/middle/large, `icon` ke shape circle", () => {
    expect(render(<Button size="sm">x</Button>)).toContain("ant-btn-sm");
    expect(render(<Button size="lg">x</Button>)).toContain("ant-btn-lg");
    expect(render(<Button size="icon">x</Button>)).toContain("ant-btn-circle");
    // `md` adalah bawaan AntD (`middle`) dan sengaja tidak menulis kelas ukuran.
    const md = render(<Button>x</Button>);
    expect(md).not.toContain("ant-btn-sm");
    expect(md).not.toContain("ant-btn-lg");
  });

  it("meneruskan className, disabled, dan atribut aria", () => {
    const html = render(
      <Button className="w-full" disabled aria-label="Simpan faktur">
        x
      </Button>
    );
    expect(html).toContain("w-full");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Simpan faktur"');
  });
});

describe("Button asChild — tautan, bukan tombol bersarang", () => {
  it("merender SATU <a href>, bukan <a><button>", () => {
    const html = render(
      <Button asChild variant="outline">
        <a href="/platform">Platform</a>
      </Button>
    );
    expect(html).toContain("<a");
    expect(html).toContain('href="/platform"');
    // Inti pemetaannya: tidak ada elemen interaktif bersarang.
    expect(html).not.toContain("<button");
    expect(html).toContain("Platform");
  });

  it("membawa serta atribut anchor anaknya", () => {
    const html = render(
      <Button asChild>
        <a href="/api/tenant/export" download>
          Unduh
        </a>
      </Button>
    );
    expect(html).toContain("download");
    expect(html).toContain('href="/api/tenant/export"');
  });

  it("tetap bergaya tombol", () => {
    expect(
      render(
        <Button asChild size="lg">
          <a href="/register">Daftar</a>
        </Button>
      )
    ).toContain("ant-btn-lg");
  });
});

describe("target sentuh & cincin fokus — datang dari token, bukan dari primitif", () => {
  it("token controlHeight benar-benar menentukan tinggi Button", () => {
    // Diverifikasi terhadap CSS yang dihitung, bukan terhadap sumber AntD:
    // `height: controlHeight` bisa saja diganti di versi berikutnya.
    const css = styleSheet(<Button>x</Button>);
    expect(css).toMatch(/--ant-control-height:\s*40px/);
    expect(css).toMatch(/\.ant-btn\b[^{]*\{[^}]*height:\s*var\(--ant-control-height\)/);
  });

  it("tombol ikon selebar tingginya — 40px, bukan ~28px rakitan tangan", () => {
    const css = styleSheet(<Button size="icon">x</Button>);
    expect(css).toMatch(
      /ant-btn-circle[^{]*\{[^}]*width:\s*var\(--ant-control-height\)/
    );
  });

  it("cincin fokus hanya untuk keyboard (:focus-visible), bukan :focus", () => {
    const css = styleSheet(<Button>x</Button>);
    const focusRules = css
      .split("}")
      .filter((rule) => /ant-btn/.test(rule) && /outline:/.test(rule) && /focus/.test(rule));
    expect(focusRules.length).toBeGreaterThan(0);
    for (const rule of focusRules) expect(rule).toContain(":focus-visible");
  });

  it("cincin fokus terlihat di KEDUA tema (≥ 3:1 terhadap latar terburuk)", () => {
    for (const mode of ["light", "dark"] as const) {
      const ring = focusRingColor(mode);
      expect(
        worst(ring, mode),
        `Cincin fokus ${ring} hanya ${worst(ring, mode).toFixed(2)}:1 di tema ${mode}. ` +
          "Bawaan AntD (`colorPrimaryBorder`) berada di 1,59:1 / 1,29:1 — penanda " +
          "fokus yang tak terlihat hanya merugikan pengguna yang tidak memakai tetikus."
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("cincin fokus memakai token yang didaftarkan, bukan bawaan AntD", () => {
    for (const mode of ["light", "dark"] as const) {
      const css = styleSheet(<Button>x</Button>, mode);
      expect(css).toContain(`--ant-color-primary-border:${focusRingColor(mode)}`);
      expect(css).not.toContain(`--ant-color-primary-border:${TOKENS[mode].colorPrimaryBorder}`);
    }
  });
});

describe("Badge — Tag berteks, bukan titik notifikasi", () => {
  it("merender AntD Tag dan isinya tetap KATA", () => {
    const html = render(<Badge variant="danger">Jatuh Tempo</Badge>);
    expect(html).toContain("ant-tag");
    expect(html).toContain("Jatuh Tempo");
    // `Badge` AntD (titik notifikasi) tidak boleh ikut terpakai.
    expect(html).not.toContain("ant-badge");
  });

  it("varian status dipetakan ke warna status Tag", () => {
    expect(render(<Badge variant="success">Lunas</Badge>)).toContain("ant-tag-success");
    expect(render(<Badge variant="warning">Menunggu</Badge>)).toContain("ant-tag-warning");
    expect(render(<Badge variant="danger">Jatuh Tempo</Badge>)).toContain("ant-tag-error");
    expect(render(<Badge variant="destructive">Jatuh Tempo</Badge>)).toBe(
      render(<Badge variant="danger">Jatuh Tempo</Badge>)
    );
  });

  it("hanya varian outline yang bergaris", () => {
    expect(render(<Badge>Draf</Badge>)).toContain("ant-tag-filled");
    expect(render(<Badge variant="outline">Draf</Badge>)).toContain("ant-tag-outlined");
  });

  it("teks statusnya lolos 4,5:1 di atas latar Tag, di KEDUA tema", () => {
    // Teks Tag adalah `fontSizeSM` = 12px, jadi tidak ada jalan keluar
    // "teks besar boleh 3:1".
    for (const mode of ["light", "dark"] as const) {
      expect(TOKENS[mode].fontSizeSM).toBeLessThan(18);
      const status = tagStatusTokens(mode);
      const pairs: [string, string, string][] = [
        ["success", status.colorSuccess, TOKENS[mode].colorSuccessBg],
        ["warning", status.colorWarning, TOKENS[mode].colorWarningBg],
        ["error", status.colorError, TOKENS[mode].colorErrorBg],
        ["processing", status.colorInfo, TOKENS[mode].colorInfoBg],
      ];
      for (const [role, fg, bg] of pairs) {
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `Tag ${role} (${mode}): ${fg} di atas ${bg} hanya ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("token Tag benar-benar mendarat di CSS-nya", () => {
    const css = styleSheet(<Badge variant="success">Lunas</Badge>);
    expect(css).toContain(`--ant-color-success:${tagStatusTokens("light").colorSuccess}`);
  });

  it("bawaan AntD memang gagal — kalau tidak, override ini boleh dicabut", () => {
    // Penjaga bagi penjaganya: kalau AntD kelak memperbaiki paletnya sendiri,
    // tes ini yang gagal lebih dulu dan memberi tahu bahwa `tagStatusTokens`
    // sudah tidak dibutuhkan lagi.
    expect(
      contrast(TOKENS.light.colorSuccess, TOKENS.light.colorSuccessBg)
    ).toBeLessThan(4.5);
  });
});

describe("Checkbox — API terkontrol lama di atas AntD", () => {
  it("merender kotak centang AntD dengan atributnya", () => {
    const html = render(<Checkbox id="terms" checked aria-label="Setuju" />);
    expect(html).toContain("ant-checkbox");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('id="terms"');
    expect(html).toContain('aria-label="Setuju"');
  });

  it("onCheckedChange menerima boolean, bukan event", () => {
    // Komponennya dipanggil langsung (tidak ada hook di dalamnya) supaya
    // penerjemahan `onChange(e) -> onCheckedChange(e.target.checked)` bisa
    // diuji tanpa DOM — suite ini berjalan di lingkungan node.
    const spy = vi.fn();
    const element = Checkbox({ onCheckedChange: spy }) as React.ReactElement<{
      onChange: (event: { target: { checked: boolean } }) => void;
    }>;
    element.props.onChange({ target: { checked: true } });
    expect(spy).toHaveBeenCalledWith(true);
    element.props.onChange({ target: { checked: false } });
    expect(spy).toHaveBeenLastCalledWith(false);
  });
});

describe("Label", () => {
  it("tetap <label> native dan menautkan kontrolnya", () => {
    const html = render(<Label htmlFor="rate">Kurs</Label>);
    expect(html).toContain("<label");
    expect(html).toContain('for="rate"');
  });
});

describe("Progress", () => {
  it("0–1 diterjemahkan ke persen AntD, dan dijepit", () => {
    expect(render(<Progress value={0.42} label="Penyiapan" />)).toContain(
      'aria-valuenow="42"'
    );
    expect(render(<Progress value={3} label="Penyiapan" />)).toContain('aria-valuenow="100"');
    expect(render(<Progress value={Number.NaN} label="Penyiapan" />)).toContain(
      'aria-valuenow="0"'
    );
  });

  it("bilahnya punya NAMA, bukan hanya angka", () => {
    const html = render(<Progress value={0.5} label="Menyiapkan buku besar" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Menyiapkan buku besar"');
  });
});
