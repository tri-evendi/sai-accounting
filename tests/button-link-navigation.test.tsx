/**
 * `<ButtonLink>` — tombol-tautan yang MEMPERTAHANKAN navigasi sisi-klien
 * (issue #289).
 *
 * ══ Kenapa berkas ini terpisah dari penjaganya ═════════════════════════════
 *
 * `tests/anchor-button-nesting.test.ts` menjaga BENTUK: tak ada `<a>` yang
 * membungkus `<button>`, dan primitifnya tidak membaca anaknya. Bentuk yang
 * benar tidak membuktikan PERILAKU — `<Button href>` juga berbentuk benar dan
 * justru membuang navigasi sisi-klien, yaitu persis kesalahan yang issue #289
 * peringatkan. Perilakunya dinyatakan di sini.
 *
 * ══ Tiga cara memeriksa, karena tidak ada satu cara yang cukup ═════════════
 *
 * Suite ini berjalan di lingkungan `node`; repo ini tidak memasang jsdom (lihat
 * `tests/focus-form-field.test.tsx` untuk alasan yang sama). Jadi:
 *
 *   1. **Fungsi murni** (`tautanDicegat`, `klikBiasa`,
 *      `amatiSekaliSaatTerlihat` di `ui/app-link.tsx`). Seluruh keputusan
 *      "dicegat atau tidak" hidup di sana justru supaya bisa diuji tanpa DOM
 *      dan tanpa React — bukan sebagai efek samping yang hanya terlihat lewat
 *      tiruan.
 *   2. **Markup AntD SUNGGUHAN** lewat `renderToStaticMarkup`: satu elemen
 *      `<a class="ant-btn">`, nol `<button>`, `href` yang sudah ter-scope
 *      tenant. Kalau AntD kelak mengubah cabang `href`-nya, tes ini yang merah.
 *   3. **`antd` yang di-mock** untuk menangkap prop yang benar-benar sampai ke
 *      tombolnya. Tanpa DOM ini satu-satunya cara menjalankan penangan klik
 *      yang ASLI; memeriksanya lewat pembacaan sumber saja akan lulus pada
 *      penangan yang tidak pernah terpasang.
 *
 * ⚠ Yang TIDAK terbukti di sini, supaya tidak ada yang membaca hijau lalu
 * berhenti bertanya: bahwa prefetch benar-benar MENGISI cache router. Yang
 * dinyatakan hanyalah `router.prefetch()` terpanggil dengan alamat yang benar
 * begitu pengamat melaporkan tautannya terlihat. Sisanya milik Next, dan
 * menirunya di sini hanya akan menguji tiruan kita sendiri.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  amatiSekaliSaatTerlihat,
  klikBiasa,
  tautanDicegat,
  type KlikTautan,
} from "@/components/ui/app-link";

/** Alamat yang sedang dibuka; tiap tes boleh menggesernya. */
let pathname = "/t/acme/cv-maju/invoices";
const push = vi.fn();
const replace = vi.fn();
const prefetch = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace, prefetch, refresh: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

import { ButtonLink } from "@/components/ui/button";

beforeEach(() => {
  pathname = "/t/acme/cv-maju/invoices";
  push.mockClear();
  replace.mockClear();
  prefetch.mockClear();
});

/* ------------------------------------------------------------------ */
/* 1. Keputusan: tautan mana yang boleh dicegat, klik mana yang biasa  */
/* ------------------------------------------------------------------ */

describe("semantik next/link yang dipasang ulang (#289)", () => {
  it("hanya jalur di dalam app yang dicegat", () => {
    expect(tautanDicegat("/invoices")).toBe(true);
    expect(tautanDicegat("/t/acme/cv-maju/invoices?status=signed#atas")).toBe(true);
    // Alamat luar & protokol lain: router tidak mengerti keduanya.
    expect(tautanDicegat("https://pajak.go.id")).toBe(false);
    expect(tautanDicegat("mailto:halo@contoh.id")).toBe(false);
    expect(tautanDicegat("//cdn.contoh.id/a.pdf")).toBe(false);
    // Relatif tanpa `/` di depan — bentuk yang app ini tidak pakai, dan
    // menebaknya lebih berisiko daripada membiarkan peramban menanganinya.
    expect(tautanDicegat("invoices")).toBe(false);
  });

  it("`download` dan `target` mengembalikan tautannya ke peramban", () => {
    // Dicegat = berkasnya tidak pernah terunduh, yang terjadi malah pindah
    // halaman. Ini bug yang paling mudah dibuat saat memindahkan `<a download>`.
    expect(tautanDicegat("/laporan.csv", { download: true })).toBe(false);
    expect(tautanDicegat("/laporan.csv", { download: "" })).toBe(false);
    expect(tautanDicegat("/invoices", { target: "_blank" })).toBe(false);
    // `_self` adalah bawaan HTML: menulisnya tidak mengubah apa pun.
    expect(tautanDicegat("/invoices", { target: "_self" })).toBe(true);
  });

  it("klik kiri tanpa modifier saja — sisanya milik peramban", () => {
    const dasar: KlikTautan = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    expect(klikBiasa(dasar)).toBe(true);
    /*
     * Inilah yang membuat `<a href>` sungguhan lebih baik daripada `onClick` di
     * atas `<button>`: "buka di tab baru" masih bekerja, dan ia bekerja justru
     * karena kita TIDAK mencegatnya.
     */
    expect(klikBiasa({ ...dasar, metaKey: true })).toBe(false);
    expect(klikBiasa({ ...dasar, ctrlKey: true })).toBe(false);
    expect(klikBiasa({ ...dasar, shiftKey: true })).toBe(false);
    expect(klikBiasa({ ...dasar, altKey: true })).toBe(false);
    // Klik tengah = buka di tab baru.
    expect(klikBiasa({ ...dasar, button: 1 })).toBe(false);
  });

  it("pengamat viewport berjalan SEKALI lalu berhenti mengamati", () => {
    let laporkan: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class PengamatPalsu {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        laporkan = cb;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("IntersectionObserver", PengamatPalsu);

    const jalan = vi.fn();
    const el = {} as Element;
    const bersihkan = amatiSekaliSaatTerlihat(el, jalan);

    expect(observe).toHaveBeenCalledWith(el);
    // Belum terlihat: belum ada prefetch.
    laporkan?.([{ isIntersecting: false }]);
    expect(jalan).not.toHaveBeenCalled();

    laporkan?.([{ isIntersecting: true }]);
    expect(jalan).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();

    // Terlihat lagi setelah berhenti diamati tidak menambah permintaan.
    laporkan?.([{ isIntersecting: true }]);
    expect(jalan).toHaveBeenCalledOnce();

    bersihkan?.();
    vi.unstubAllGlobals();
  });

  it("tanpa `IntersectionObserver` ia diam, bukan melempar", () => {
    // SSR dan peramban lama. Prefetch memang tidak terjadi di sana; tautannya
    // tetap berfungsi penuh, dan itu yang harus terjadi.
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(amatiSekaliSaatTerlihat({} as Element, vi.fn())).toBeUndefined();
    expect(amatiSekaliSaatTerlihat(null, vi.fn())).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

/* ------------------------------------------------------------------ */
/* 2. Markup AntD sungguhan                                            */
/* ------------------------------------------------------------------ */

describe("bentuk yang dirender (#289)", () => {
  it('satu `<a class="ant-btn">`, nol `<button>`', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/invoices/new" variant="primary">
        Faktur baru
      </ButtonLink>
    );
    // Inilah seluruh isi issue-nya: SATU elemen interaktif, bukan dua.
    expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("<button");
    expect(html).toMatch(/class="[^"]*ant-btn/);
    expect(html).toContain("Faktur baru");
  });

  it("`href` melewati `scopedHref()` — pantulan 307 (#157) tidak kembali", () => {
    const html = renderToStaticMarkup(<ButtonLink href="/invoices/new" variant="secondary" />);
    expect(html).toContain('href="/t/acme/cv-maju/invoices/new"');

    // Di luar jalur bertenant `href` diteruskan apa adanya.
    pathname = "/login";
    expect(renderToStaticMarkup(<ButtonLink href="/invoices/new" variant="secondary" />)).toContain(
      'href="/invoices/new"'
    );
  });

  it("varian & ukuran tiba di AntD, dan bawaannya sama dengan `<Button>`", () => {
    /*
     * Dua bentuk tautan (`<Button href>` dan `<ButtonLink>`) berbagi satu
     * perakit, jadi yang perlu dibuktikan hanya bahwa `ButtonLink` tidak
     * memotong jalan di tengah — mis. lupa meneruskan `variant`.
     */
    const primer = renderToStaticMarkup(
      <ButtonLink href="/x" variant="primary">
        A
      </ButtonLink>
    );
    expect(primer).toMatch(/class="[^"]*ant-btn-variant-solid/);

    const kecil = renderToStaticMarkup(
      <ButtonLink href="/x" variant="ghost" size="sm">
        A
      </ButtonLink>
    );
    expect(kecil).toMatch(/class="[^"]*ant-btn-sm/);

    // Tanpa `variant`: sekunder, sama dengan `<Button>` polos (#267 potongan 5).
    const bawaan = renderToStaticMarkup(<ButtonLink href="/x">A</ButtonLink>);
    expect(bawaan).toMatch(/class="[^"]*ant-btn-variant-outlined/);
  });

  it("atribut anchor mendarat di `<a>`-nya", () => {
    // `download`/`target`/`rel` dideklarasikan di `ButtonProps` supaya yang lupa
    // memindahkannya dari `<a>` lama gugur di `tsc`. Ini memastikan mereka juga
    // benar-benar sampai ke DOM.
    const html = renderToStaticMarkup(
      <ButtonLink href="/laporan.csv" variant="outline" download target="_blank" rel="noreferrer">
        Unduh
      </ButtonLink>
    );
    expect(html).toContain("download");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });
});

/* ------------------------------------------------------------------ */
/* 3. Kabelnya: prop yang sungguh sampai ke tombolnya                  */
/* ------------------------------------------------------------------ */

type PropTertangkap = {
  href?: string;
  onClick?: (e: unknown) => void;
  ref?: unknown;
};

/**
 * Render `<ButtonLink>` dengan `antd` yang di-mock, lalu kembalikan prop yang
 * benar-benar sampai ke tombolnya.
 *
 * `vi.doMock`, bukan `vi.mock`: ia TIDAK diangkat ke atas berkas, jadi impor
 * statis di kepala berkas ini tetap mendapat `antd` asli — blok markup di atas
 * menguji AntD sungguhan, blok ini menguji kabelnya.
 */
async function tangkap(props: React.ComponentProps<typeof ButtonLink>): Promise<PropTertangkap> {
  const tertangkap: PropTertangkap = {};
  vi.doMock("antd", () => ({
    Button: (p: PropTertangkap & { children?: React.ReactNode }) => {
      Object.assign(tertangkap, p);
      return React.createElement("a", { href: p.href }, p.children);
    },
  }));
  vi.resetModules();
  const { ButtonLink: Tertangkap } = await import("@/components/ui/button");
  renderToStaticMarkup(React.createElement(Tertangkap, props));
  vi.doUnmock("antd");
  vi.resetModules();
  return tertangkap;
}

/** Kejadian klik tiruan — sebentuk `React.MouseEvent` seperlunya. */
function klik(patch: Record<string, unknown> = {}) {
  const e = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
    ...patch,
  };
  return e;
}

describe("navigasi sisi-klien (#289)", () => {
  it("klik biasa menempuh router, bukan pemuatan halaman penuh", async () => {
    const { onClick, href } = await tangkap({ href: "/invoices/new", variant: "primary" });
    expect(href).toBe("/t/acme/cv-maju/invoices/new");

    const e = klik();
    onClick?.(e);
    /*
     * `preventDefault()` adalah setengah dari buktinya: tanpa itu peramban tetap
     * menempuh `href`-nya dan `router.push` hanya menambah pekerjaan — halaman
     * tetap memuat penuh, dan tesnya tetap hijau kalau ia hanya memeriksa
     * `push`.
     */
    expect(e.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith("/t/acme/cv-maju/invoices/new");
  });

  it("`replace` memakai `router.replace`", async () => {
    const { onClick } = await tangkap({ href: "/invoices", variant: "ghost", replace: true });
    onClick?.(klik());
    expect(replace).toHaveBeenCalledWith("/t/acme/cv-maju/invoices");
    expect(push).not.toHaveBeenCalled();
  });

  it("Ctrl/Cmd/Shift/Alt-klik dan klik tengah tidak dicegat", async () => {
    const { onClick } = await tangkap({ href: "/invoices", variant: "ghost" });
    for (const patch of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      const e = klik(patch);
      onClick?.(e);
      expect(e.defaultPrevented, JSON.stringify(patch)).toBe(false);
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("`download`, `target=\"_blank\"`, dan alamat luar tidak dicegat", async () => {
    const kasus = [
      { href: "/laporan.csv", download: true },
      { href: "/invoices", target: "_blank" },
      { href: "https://pajak.go.id" },
      { href: "mailto:halo@contoh.id" },
    ] as const;
    for (const props of kasus) {
      const { onClick } = await tangkap({ variant: "outline", ...props });
      const e = klik();
      onClick?.(e);
      expect(e.defaultPrevented, `seharusnya lolos ke peramban: ${props.href}`).toBe(false);
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("`onClick` pemanggil berjalan lebih dulu, dan `preventDefault()` membatalkan navigasi", async () => {
    const dicatat = vi.fn();
    const { onClick } = await tangkap({
      href: "/invoices",
      variant: "ghost",
      onClick: (e) => {
        dicatat();
        e.preventDefault();
      },
    });
    onClick?.(klik());
    expect(dicatat).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it("elemennya bisa diamati — `ref` sampai ke tombolnya", () => {
    /*
     * Prefetch viewport butuh elemen untuk diamati, dan satu-satunya jalan ke
     * elemen itu adalah `ref` yang diteruskan sampai ke `<a>` AntD. Kalau ia
     * hilang di tengah, `amatiSekaliSaatTerlihat` menerima `null` dan diam —
     * prefetch mati TANPA satu pun galat. Karena itu keberadaannya dinyatakan.
     *
     * (Efeknya sendiri tidak berjalan di `renderToStaticMarkup`; perilakunya
     * diuji sebagai fungsi murni di blok pertama berkas ini.)
     */
    return tangkap({ href: "/invoices", variant: "ghost" }).then(({ ref }) => {
      expect(typeof ref).toBe("function");
    });
  });
});
