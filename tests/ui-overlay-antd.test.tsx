/**
 * Primitif overlay & umpan balik di atas Ant Design (issue #190, fase B4).
 *
 * Yang dijaga di sini adalah janji-janji yang berpindah tuan saat tujuh
 * primitif ditulis ulang: dulu dijamin Radix UI dan `sonner` — dua pustaka yang
 * memang membangun aksesibilitas overlay sebagai fitur utamanya — sekarang
 * dijamin AntD, yang sebagian di antaranya TIDAK menyediakannya. Empat kelas
 * kegagalan yang khusus dijaga:
 *
 *  1. **Tirai yang berbalik arah.** `dialog.tsx` lama memakai `bg-black/50`
 *     dengan pengecualian lint tertulis, karena token `--foreground` ikut
 *     berbalik di tema gelap dan pernah membuat tirai menjadi kabut PUTIH —
 *     halaman justru lebih TERANG saat dialog dibuka. Token AntD yang
 *     menggantikannya diperiksa di sini, di kedua tema, terhadap paket yang
 *     benar-benar terpasang.
 *  2. **Pesan tanpa tema.** Tanpa `<App>` yang membungkus aplikasi,
 *     `message` AntD memakai akar React-nya sendiri dan tidak pernah melihat
 *     `ConfigProvider` — kotak putih di halaman gelap.
 *  3. **Pesan yang tak terdengar.** `sonner` mengumumkan notifikasinya lewat
 *     `aria-live`; `message` AntD tidak punya satu pun. Pembungkus ber-`role`
 *     di `toast.tsx` adalah penggantinya, dan tanpa penjaga ia akan hilang pada
 *     penyederhanaan pertama.
 *  4. **Konfirmasi destruktif yang bisa hilang karena salah klik.**
 *     `maskClosable: false` adalah alasan `AlertDialog` ada.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { theme } from "antd";

import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { LocaleProvider } from "@/lib/i18n/client";

/* ------------------------------------------------------------------ */
/* Perekam prop — satu-satunya cara melihat kontrak ke AntD di node    */
/* ------------------------------------------------------------------ */

/*
 * `Modal` dan `Popover` AntD merender lewat portal, dan portal tidak
 * menghasilkan markup apa pun di server. Jadi tidak ada HTML untuk diperiksa —
 * yang bisa diperiksa adalah PROP yang diserahkan primitif kita kepada AntD,
 * yaitu tepat tempat setiap keputusan issue ini hidup (tirai bisa diklik atau
 * tidak, Escape hidup atau tidak, panel dilepas saat ditutup atau tidak).
 *
 * `App` sengaja TIDAK diganti komponennya — hanya `useApp`-nya. Dengan begitu
 * `AntdProvider` tetap merender `<App>` yang asli, dan tes "apakah `<App>`
 * benar-benar terpasang" di bawah tetap menguji barang aslinya lewat
 * `antd/es/app/useApp`, jalur yang tidak ikut ter-mock.
 */
const modalProps: Record<string, unknown>[] = [];
const popoverProps: Record<string, unknown>[] = [];
const messageSpy = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

/**
 * `App.useApp` yang ASLI, disimpan sebelum diganti perekam.
 *
 * Diambil dari dalam pabrik mock, bukan lewat `import "antd/es/app/useApp"`:
 * resolusi node memilih entri `main` (`antd/lib/…`) untuk paket ini, sehingga
 * jalur `es/` adalah salinan modul yang BERBEDA — konteksnya lain, dan
 * probenya akan selalu melihat nilai bawaan "tidak ada instansi" apa pun yang
 * dipasang provider.
 */
const real = vi.hoisted(() => ({
  useApp: null as null | (() => { message: { success?: unknown } }),
}));

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("antd")>();
  const RealApp = actual.App;
  real.useApp = RealApp.useApp;

  const FakeApp = (props: Record<string, unknown>) => <RealApp {...props} />;
  FakeApp.useApp = () => ({ message: messageSpy });

  const FakeModal = (props: Record<string, unknown>) => {
    modalProps.push(props);
    return null;
  };
  const FakePopover = (props: Record<string, unknown>) => {
    popoverProps.push(props);
    return <>{props.children as React.ReactNode}</>;
  };

  return { ...actual, App: FakeApp, Modal: FakeModal, Popover: FakePopover };
});

const { AntdProvider } = await import("@/components/providers/antd-provider");
const { ConfirmDialog } = await import("@/components/ui/confirm-dialog");
const { Dialog, DialogContent, DialogTitle, writeDialogAria } = await import(
  "@/components/ui/dialog"
);
const { LearnMore } = await import("@/components/ui/learn-more");
const { Popover, PopoverContent, PopoverTrigger } = await import("@/components/ui/popover");
const { TermTooltip } = await import("@/components/ui/term-tooltip");
const { useToast } = await import("@/components/ui/toast");

const dictionary = id as unknown as Dictionary;

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={dictionary}>
      {node}
    </LocaleProvider>
  );

/** Prop terakhir yang diterima `Modal`/`Popover` pada render sebelumnya. */
const lastModal = () => modalProps[modalProps.length - 1];
const lastPopover = () => popoverProps[popoverProps.length - 1];

/* ------------------------------------------------------------------ */
/* Kontras — rumus WCAG 2.x, sama dengan tests/ui-controls-antd        */
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

/** Warna `fg` (boleh beralfa) dikomposit di atas `bg`. */
function composite(fg: string, bg: string): [number, number, number] {
  const f = parse(fg);
  const b = parse(bg);
  return f.rgb.map((c, i) => c * f.alpha + b.rgb[i] * (1 - f.alpha)) as [
    number,
    number,
    number,
  ];
}

const CONTROL_HEIGHT = 40;

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

/**
 * Dua permukaan gelap yang BUKAN token halaman, dan karena itu tetap harus
 * diuji terpisah dari `colorBgLayout` di bawah.
 *
 * Sampai #203 keduanya adalah `--background` milik `globals.css` di kedua tema;
 * token itu sudah dicabut dan latar halaman kini `colorBgLayout` AntD, yang
 * sudah ikut diuji bersama permukaan lain. Yang tersisa di sini adalah
 * `#001529` — permukaan `Layout.Sider theme="dark"`, gelap permanen di KEDUA
 * tema, satu-satunya bidang yang bisa membuat tirai terlihat "menerangkan"
 * kalau maskernya kelak berubah menjadi kabut putih.
 */
const PAGE_BACKGROUND = { light: "#001529", dark: "#001529" } as const;

describe("tirai dialog — arahnya diperiksa di KEDUA tema", () => {
  it("`colorBgMask` adalah warna yang SAMA di terang dan gelap", () => {
    // Inti temuannya: mask AntD bukan turunan `colorTextBase` (yang berbalik
    // saat tema berganti) melainkan konstanta hitam beralfa di
    // `themes/shared/genColorMapToken.js`. Karena itu ia tidak bisa mengulang
    // bug "kabut putih" yang membuat `dialog.tsx` lama memakai `bg-black/50`
    // dengan pengecualian lint.
    expect(TOKENS.light.colorBgMask).toBe(TOKENS.dark.colorBgMask);
    expect(TOKENS.light.colorBgMask).toBe("rgba(0,0,0,0.45)");
  });

  it("tirai selalu MENGGELAPKAN apa pun yang ada di bawahnya", () => {
    for (const mode of ["light", "dark"] as const) {
      const surfaces = [
        TOKENS[mode].colorBgContainer,
        TOKENS[mode].colorBgLayout,
        TOKENS[mode].colorBgElevated,
        PAGE_BACKGROUND[mode],
      ];
      for (const surface of surfaces) {
        const before = luminance(parse(surface).rgb);
        const after = luminance(composite(TOKENS[mode].colorBgMask, surface));
        expect(
          after,
          `Tirai di tema ${mode} membuat ${surface} lebih TERANG (${before.toFixed(4)} -> ` +
            `${after.toFixed(4)}). Itu persis bug yang baru ditutup: halaman menjadi ` +
            "lebih terang saat dialog dibuka, sehingga dialognya tidak lagi terbaca " +
            "sebagai lapisan di atas halaman."
        ).toBeLessThanOrEqual(before);
      }
    }
  });

  it("panel dialog selalu lebih TERANG dari halaman yang sudah ditirai", () => {
    // Arah inilah isi bug lama: kabut putih membuat halaman lebih terang dari
    // panelnya, sehingga dialog berhenti terbaca sebagai lapisan di ATAS
    // halaman. Angkanya kecil di tema gelap (1,18:1 — lihat catatan di
    // `lib/theme/antd-tokens.ts`); yang dikunci di sini adalah arahnya.
    for (const mode of ["light", "dark"] as const) {
      const page = luminance(composite(TOKENS[mode].colorBgMask, PAGE_BACKGROUND[mode]));
      const panel = luminance(parse(TOKENS[mode].colorBgElevated).rgb);
      expect(panel, `Panel dialog lebih gelap dari halamannya di tema ${mode}`).toBeGreaterThan(
        page
      );
    }
  });
});

describe("`<App>` — pesan mendapat konteks tema", () => {
  /** Peringatan cssVar milik `<App component={false}>` — lihat `it` terakhir. */
  function withSilencedAntdWarning<T>(fn: () => T): [T, string[]] {
    const captured: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => captured.push(String(args[0]));
    try {
      return [fn(), captured];
    } finally {
      console.error = original;
    }
  }

  it("AntdProvider memasang instansi message/notification", () => {
    function Probe() {
      const app = real.useApp!();
      return <i data-message={typeof app.message.success} />;
    }

    const [html] = withSilencedAntdWarning(() =>
      render(
        <AntdProvider locale="id">
          <Probe />
        </AntdProvider>
      )
    );
    expect(html).toContain('data-message="function"');

    // Tanpa provider tidak ada instansi sama sekali — inilah keadaan yang
    // membuat pesan muncul tanpa tema sebelum issue ini.
    expect(render(<Probe />)).toContain('data-message="undefined"');
  });

  it("`component={false}` — tidak ada elemen `.ant-app` yang membungkus aplikasi", () => {
    /*
     * Bukan kerapian DOM: `.ant-app` membawa `font-family`/`font-size`
     * (14px)/`line-height`/`color` milik AntD. Dipasang membungkus seluruh
     * aplikasi, ia menurunkan teks dasar dari 16px (MASTER.md) dan mengganti
     * Inter dengan tumpukan font sistem AntD di setiap halaman sekaligus.
     */
    const [html, warnings] = withSilencedAntdWarning(() =>
      render(
        <AntdProvider locale="id">
          <p>isi</p>
        </AntdProvider>
      )
    );
    expect(html).not.toContain("ant-app");
    expect(html).toContain("<p>isi</p>");

    /*
     * Peringatan yang MEMANG diharapkan, dipaku di sini supaya ia tidak
     * dibaca sebagai bug oleh orang berikutnya: AntD menyarankan `component`
     * berupa elemen agar variabel CSS punya tempat menempel. Sudah diperiksa
     * dan tidak berlaku untuk pemakaian ini — `useMessage`/`useNotification`
     * memasang kelas `css-var-*` sendiri pada wadah portalnya. Kalau
     * peringatan ini HILANG di versi AntD berikutnya, `component={false}`
     * boleh dianggap resmi dan komentarnya boleh dipangkas.
     */
    expect(warnings.join("\n")).toContain("[antd: App]");
    expect(warnings.join("\n")).toContain("cssVar");
  });
});

describe("Toast — pesan yang terlihat DAN terdengar", () => {
  function Fire({ type, text }: { type?: "success" | "error" | "info"; text: string }) {
    const { toast } = useToast();
    toast(text, type);
    return null;
  }

  const fired = (type: "success" | "error" | "info") => {
    messageSpy.success.mockClear();
    messageSpy.error.mockClear();
    messageSpy.info.mockClear();
    render(<Fire type={type} text="Faktur tersimpan" />);
    return messageSpy[type].mock.calls[0][0] as React.ReactElement<{
      role: string;
      children: string;
    }>;
  };

  it("memetakan jenisnya ke API message yang benar", () => {
    expect(fired("success")).toBeTruthy();
    expect(messageSpy.success).toHaveBeenCalledTimes(1);
    expect(fired("error")).toBeTruthy();
    expect(messageSpy.error).toHaveBeenCalledTimes(1);
    expect(fired("info")).toBeTruthy();
    expect(messageSpy.info).toHaveBeenCalledTimes(1);
  });

  it("membungkus isinya dengan role live — `alert` untuk gagal, `status` untuk sisanya", () => {
    // `message` AntD tidak punya `aria-live`, `role="alert"`, maupun
    // `role="status"` di mana pun (diperiksa pada paket terpasang). Tanpa
    // pembungkus ini, satu-satunya umpan balik setelah menyimpan tidak
    // terdengar oleh pengguna pembaca layar.
    expect(fired("error").props.role).toBe("alert");
    expect(fired("success").props.role).toBe("status");
    expect(fired("info").props.role).toBe("status");
    expect(fired("success").props.children).toBe("Faktur tersimpan");
  });

  it("bawaannya `success` — sama seperti sebelum migrasi", () => {
    messageSpy.success.mockClear();
    render(<Fire text="Tersimpan" />);
    expect(messageSpy.success).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog — kontrak yang diserahkan ke Modal", () => {
  it("bisa ditutup dengan klik-luar, Escape, dan tombol X", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Pratinjau</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const props = lastModal();
    expect(props.mask).toEqual({ closable: true });
    expect(props.keyboard).toBe(true);
    // Label tombol X datang dari kamus, bukan "Close" bawaan AntD.
    expect(props.closable).toEqual({ "aria-label": "Tutup" });
  });

  it("dilepas saat ditutup — `<iframe>` pratinjau tidak hidup di latar", () => {
    render(
      <Dialog open>
        <DialogContent />
      </Dialog>
    );
    expect(lastModal().destroyOnHidden).toBe(true);
    expect(lastModal().footer).toBeNull();
  });

  it("tidak merender Modal sama sekali sebelum dibuka pun tetap terkendali", () => {
    render(
      <Dialog>
        <DialogContent />
      </Dialog>
    );
    expect(lastModal().open).toBe(false);
  });
});

describe("AlertDialog lewat ConfirmDialog — sifat yang WAJIB bertahan", () => {
  it("klik di luar TIDAK menutup konfirmasi destruktif", () => {
    render(
      <ConfirmDialog open title="Hapus faktur?" message="Tindakan ini permanen." onConfirm={() => {}} />
    );
    expect(
      lastModal().mask,
      "Konfirmasi destruktif harus DIJAWAB, bukan hilang karena salah klik di " +
        "sebelahnya. `mask.closable` wajib false."
    ).toEqual({ closable: false });
  });

  it("Escape tetap hidup, dan tombol X sengaja tidak ada", () => {
    render(<ConfirmDialog open title="Hapus?" message="Permanen." onConfirm={() => {}} />);
    expect(lastModal().keyboard).toBe(true);
    expect(lastModal().closable).toBe(false);
  });

  it("pola `trigger` bertahan — 21 pemanggil bergantung padanya", () => {
    const html = render(
      <ConfirmDialog
        title="Hapus?"
        message="Permanen."
        onConfirm={() => {}}
        trigger={<button type="button">Hapus</button>}
      />
    );
    expect(html).toContain("Hapus");
  });
});

describe("Pelabelan dialog — ditulis tangan karena Modal tidak menyediakannya", () => {
  function recorder() {
    const written: Record<string, string> = {};
    return {
      written,
      target: { setAttribute: (name: string, value: string) => (written[name] = value) },
    };
  }

  it("menulis peran dan nama dialognya", () => {
    const { written, target } = recorder();
    writeDialogAria(target, { role: "alertdialog", titleId: "t1", descriptionId: "d1" });
    expect(written).toEqual({
      role: "alertdialog",
      "aria-labelledby": "t1",
      "aria-describedby": "d1",
    });
  });

  it("tidak pernah merujuk deskripsi yang tidak dirender", () => {
    // Rujukan `aria-describedby` ke id yang tidak ada bukan sekadar sia-sia:
    // sebagian pembaca layar berhenti mengumumkan apa pun untuk dialog itu.
    const { written, target } = recorder();
    writeDialogAria(target, { role: "dialog", titleId: "t1" });
    expect(written["aria-describedby"]).toBeUndefined();
    expect(written["aria-labelledby"]).toBe("t1");
  });
});

describe("Popover — penempatan & fokus", () => {
  it("side+align Radix diterjemahkan ke placement AntD", () => {
    const cases: [("top" | "bottom" | "left" | "right"), ("start" | "center" | "end"), string][] = [
      ["bottom", "start", "bottomLeft"],
      ["bottom", "center", "bottom"],
      ["top", "end", "topRight"],
      ["right", "start", "rightTop"],
    ];
    for (const [side, align, placement] of cases) {
      render(
        <Popover open>
          <PopoverTrigger asChild>
            <button type="button">?</button>
          </PopoverTrigger>
          <PopoverContent side={side} align={align} />
        </Popover>
      );
      expect(lastPopover().placement).toBe(placement);
    }
  });

  it("hanya klik yang memicunya, dan panelnya dilepas saat ditutup", () => {
    render(
      <Popover open>
        <PopoverTrigger asChild>
          <button type="button">?</button>
        </PopoverTrigger>
        <PopoverContent />
      </Popover>
    );
    // `destroyOnHidden` bukan optimasi: ia yang membuat "terpasang" dan
    // "terbuka" menjadi peristiwa yang sama, sehingga pemindahan &
    // pengembalian fokus bisa bersandar pada siklus hidup komponen.
    expect(lastPopover().destroyOnHidden).toBe(true);
    expect(lastPopover().trigger).toEqual(["click"]);
  });
});

describe("TermTooltip — pintu ke Kamus Istilah, bukan hiasan", () => {
  it("merender label bahasa tugas dengan pemicu yang bisa di-Tab", () => {
    const html = render(<TermTooltip term="faktur">Tagihan Penjualan</TermTooltip>);
    expect(html).toContain("Tagihan Penjualan");
    // `<button>` sungguhan, bukan `title=` dan bukan `<span>` ber-onClick.
    expect(html).toContain("<button");
    expect(html).toContain("Penjelasan istilah:");
  });

  it("istilah tak dikenal tidak pernah menjatuhkan halaman", () => {
    expect(render(<TermTooltip term="tidak-ada-di-kamus">Apa pun</TermTooltip>)).toContain(
      "Apa pun"
    );
  });
});

describe("LearnMore — tautan yang TIDAK boleh memuat ulang halaman", () => {
  it("tetap `<a href>` menuju entri kamusnya", () => {
    const html = render(<LearnMore term="piutang" />);
    expect(html).toContain("<a");
    expect(html).toContain("href=\"/glossary#istilah-piutang\"");
    // Kalau ini berubah menjadi tombol/anchor AntD biasa, satu klik dari
    // tengah formulir stok akan membuang seluruh isian yang belum disimpan.
    expect(html).not.toContain("<button");
  });
});

/* ------------------------------------------------------------------ */
/* Penjaga terhadap paket terpasang                                     */
/* ------------------------------------------------------------------ */

/**
 * Dua sifat yang seluruh issue ini bersandar padanya datang dari dalam AntD,
 * bukan dari kode kita, dan keduanya tidak bisa dijalankan di lingkungan tanpa
 * DOM: Escape menutup overlay paling atas, dan fokus kembali ke pemicunya.
 *
 * Karena itu keduanya DIPAKU ke sumber paket yang benar-benar terpasang —
 * bentuk yang sama dengan cara `tests/ui-controls-antd.test.tsx` menghitung
 * kontras terhadap `antd` yang terpasang. Kalau tes ini gagal setelah versi
 * naik, jawabannya bukan menghapusnya: bacalah sumbernya lagi dan pastikan
 * kedua perilaku itu masih ada.
 */
describe("perilaku yang datang dari rc-dialog / rc-portal", () => {
  const require_ = createRequire(import.meta.url);
  const source = (spec: string) => readFileSync(require_.resolve(spec), "utf8");

  it("Escape ditangani satu tumpukan global, dan hanya yang paling atas menutup", () => {
    const code = source("@rc-component/portal/es/useEscKeyDown.js");
    expect(code).toContain("'Escape'");
    // `top: i === len - 1` — inilah yang membuat Escape di dalam popover yang
    // berada di atas dialog hanya menutup popovernya.
    expect(code).toContain("top: i === len - 1");
  });

  it("fokus kembali ke elemen yang aktif sebelum dialog dibuka", () => {
    const code = source("@rc-component/dialog/es/Dialog/index.js");
    expect(code).toContain("focusTriggerAfterClose = true");
    expect(code).toContain("lastOutSideActiveElementRef.current.focus(");
  });
});
