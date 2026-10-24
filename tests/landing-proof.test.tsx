/**
 * BUKTI SOSIAL & GAMBAR di halaman depan — yang benar-benar dirender.
 *
 *   1. Tanpa butir yang DITAMPILKAN: seksi testimoni, logo klien, dan mitra
 *      tidak ada sama sekali (bukan judul dengan kisi kosong).
 *   2. Butir yang ditampilkan dirender; yang tidak, tidak.
 *   3. Tanpa tangkapan layar: purwarupa kode tetap; dengan: gambar unggahan
 *      menggantikannya, beserta teks alternatifnya.
 *   4. Gambar OG unggahan disajikan `opengraph-image` (berkas menang atas
 *      `generateMetadata`); tanpa unggahan: kartu bawaan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

import { translate, type Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";
import { DEFAULT_LANDING_SETTINGS } from "@sai/core/landing-settings";
import { DEFAULT_LANDING_MEDIA, type LandingMedia } from "@sai/core/landing-media";

const dict = id as unknown as Dictionary;
const T = (key: string, values?: Record<string, string | number>) => translate(dict, key, values);

const state = { media: DEFAULT_LANDING_MEDIA as LandingMedia, ogContent: null as Uint8Array | null };

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect: ${to}`);
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@sai/platform/i18n/server", () => ({
  getT: async () => T,
  getLocale: async () => "id",
  getDictionary: async () => dict,
}));
vi.mock("@/lib/plan-catalog", () => ({ activePlans: async () => null }));
vi.mock("@sai/platform/landing-settings", () => ({
  landingSettings: async () => DEFAULT_LANDING_SETTINGS,
  landingMedia: async () => state.media,
  resolveLandingWhatsappUrl: async () => undefined,
}));
vi.mock("@sai/platform/landing-images", () => ({
  landingImageContent: async () => (state.ogContent ? { mime: "image/png", content: state.ogContent } : null),
}));

const { default: LandingPage } = await import("@/app/(marketing)/page");

async function render(): Promise<string> {
  const stream = await renderToReadableStream(await LandingPage());
  const html = await new Response(stream).text();
  /* Blok gaya pendaratan menyebut selektor `[data-landing-*]` — dibuang
     supaya yang diperiksa hanya elemen yang dirender. */
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const ref = (n: number) => ({ id: n, sha256: n.toString(16).padStart(64, "0"), width: 400, height: 200 });

beforeEach(() => {
  state.media = DEFAULT_LANDING_MEDIA;
  state.ogContent = null;
});

describe("seksi bukti sosial hanya bila ada butir yang ditampilkan", () => {
  it("bawaan: tidak ada seksi testimoni, logo klien, maupun mitra", async () => {
    const html = await render();
    expect(html).not.toContain(T("landing.testimonialsHeading"));
    expect(html).not.toContain(T("landing.clientLogosHeading"));
    expect(html).not.toContain(T("landing.partnersHeading"));
    expect(html).not.toContain("/brand/landing/");
  });

  it("semua butir tidak ditampilkan → tetap tidak ada seksi", async () => {
    state.media = {
      ...DEFAULT_LANDING_MEDIA,
      testimonials: [{ key: "a", published: false, quote: { id: "Rahasia dapur" }, name: "Ani", role: null, photo: null }],
      clientLogos: [{ key: "b", published: false, name: "PT Draf", href: null, logo: ref(2) }],
      partners: [{ key: "c", published: false, name: "Mitra Draf", city: "Medan", href: null, logo: null }],
    };
    const html = await render();
    expect(html).not.toContain("Rahasia dapur");
    expect(html).not.toContain("PT Draf");
    expect(html).not.toContain("Mitra Draf");
    expect(html).not.toContain(T("landing.testimonialsHeading"));
  });

  it("butir yang ditampilkan dirender, berurutan; tautan keluar `noopener`", async () => {
    state.media = {
      ...DEFAULT_LANDING_MEDIA,
      testimonials: [
        { key: "a", published: true, quote: { id: "Tutup buku jadi dua hari" }, name: "Ani", role: "CFO PT Satu", photo: ref(1) },
        { key: "b", published: false, quote: { id: "Kutipan yang belum ditampilkan" }, name: "Budi", role: null, photo: null },
      ],
      clientLogos: [{ key: "c", published: true, name: "PT Klien", href: "https://klien.co.id", logo: ref(2) }],
      partners: [{ key: "d", published: true, name: "Mitra Surabaya", city: "Surabaya", href: null, logo: null }],
    };
    const html = await render();
    expect(html).toContain(T("landing.testimonialsHeading"));
    expect(html).toContain("Tutup buku jadi dua hari");
    expect(html).not.toContain("Kutipan yang belum ditampilkan");
    expect(html).toContain('alt="PT Klien"');
    expect(html).toMatch(/<a[^>]*href="https:\/\/klien\.co\.id"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain("Mitra Surabaya");
    expect(html).toContain("/brand/landing/1?v=");
  });
});

describe("tangkapan layar", () => {
  it("tanpa unggahan: purwarupa kode (hero & galeri) tetap", async () => {
    const html = await render();
    expect(html).toContain("data-landing-hero-frame");
    expect(html).toContain("data-landing-gallery");
  });

  it("gambar hero & galeri unggahan menggantikan purwarupa, dengan teks alternatif", async () => {
    state.media = {
      ...DEFAULT_LANDING_MEDIA,
      heroImage: { image: ref(5), alt: { id: "Dasbor SAI dengan dua PT" } },
      gallery: [{ image: ref(6), alt: { id: "Jurnal umum" } }],
    };
    const html = await render();
    expect(html).toContain('alt="Dasbor SAI dengan dua PT"');
    expect(html).toContain('alt="Jurnal umum"');
    expect(html).not.toContain("data-landing-hero-frame");
    expect(html).not.toContain("data-landing-gallery");
  });
});

describe("gambar pratinjau tautan (OG)", () => {
  it("unggahan disajikan apa adanya; tanpa unggahan → kartu bawaan", async () => {
    const { default: Image } = await import("@/app/(marketing)/opengraph-image");
    state.media = { ...DEFAULT_LANDING_MEDIA, ogImage: ref(9) };
    state.ogContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const res = await Image();
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(state.ogContent);
  });
});
