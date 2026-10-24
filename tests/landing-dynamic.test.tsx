/**
 * TAMPILAN HALAMAN DEPAN DARI KONSOL `/landing` — yang benar-benar dirender.
 *
 * `tests/landing-settings.test.ts` menjaga aturan murninya; berkas ini menjaga
 * bahwa halaman `/` dan `/pricing` MEMAKAI aturan itu:
 *
 *   1. tidak diatur → halaman persis seperti sebelumnya (semua seksi, jangkar,
 *      tautan, FAQ kamus, tanpa bilah);
 *   2. seksi yang disembunyikan TIDAK dirender dan tautannya di bilah atas &
 *      kaki halaman ikut hilang (jangkar yang menunjuk ke kekosongan hanya
 *      menggulung ke puncak tanpa penjelasan);
 *   3. daftar FAQ dari konsol menggantikan daftar kamus, dan `FAQPage` JSON-LD
 *      memuat pertanyaan yang SAMA dengan yang tampil;
 *   4. tautan pemesanan demo mengalihkan "Jadwalkan demo" (tab baru,
 *      `noopener`), dan hanya itu;
 *   5. bilah pengumuman tampil hanya selama aktif dan belum ditutup.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

import { translate, type Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";
import {
  ANNOUNCEMENT_DISMISS_COOKIE,
  DEFAULT_LANDING_SETTINGS,
  announcementFingerprint,
  type LandingAnnouncement,
  type LandingSettings,
} from "@sai/core/landing-settings";

const dict = id as unknown as Dictionary;
const T = (key: string, values?: Record<string, string | number>) => translate(dict, key, values);

const state = {
  settings: DEFAULT_LANDING_SETTINGS as LandingSettings,
  cookie: null as string | null,
};

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect: ${to}`);
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === ANNOUNCEMENT_DISMISS_COOKIE && state.cookie !== null ? { name, value: state.cookie } : undefined,
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

vi.mock("@sai/platform/i18n/server", () => ({
  getT: async () => T,
  getLocale: async () => "id",
  getDictionary: async () => dict,
}));

vi.mock("@/lib/plan-catalog", () => ({ activePlans: async () => null }));

/* Sumber setelan diganti; ATURANNYA tidak — halaman memanggil fungsi murni
   yang sama (`isSectionVisible`, `isAnnouncementActive`, …) dari inti. */
vi.mock("@sai/platform/landing-settings", () => ({
  landingSettings: async () => state.settings,
  resolveLandingWhatsappUrl: async () => undefined,
}));

const { default: LandingPage } = await import("@/app/(marketing)/page");
const { default: PricingPage } = await import("@/app/(marketing)/pricing/page");

async function renderTree(tree: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(tree);
  const html = await new Response(stream).text();
  return html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const POLA_JSONLD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const tanpaJsonLd = (html: string) => html.replace(POLA_JSONLD, "");
function faqJsonLd(html: string): { name: string; acceptedAnswer: { text: string } }[] | null {
  for (const [, isi] of html.matchAll(POLA_JSONLD)) {
    const data = JSON.parse(isi) as { "@type": string; mainEntity?: unknown };
    if (data["@type"] === "FAQPage") return data.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
  }
  return null;
}
/** Pertanyaan yang TAMPAK — isi `<dt>` di panel FAQ. */
function pertanyaanTampak(html: string): string[] {
  return [...tanpaJsonLd(html).matchAll(/<dt>([\s\S]*?)<\/dt>/g)].map(([, q]) => q);
}

beforeEach(() => {
  state.settings = DEFAULT_LANDING_SETTINGS;
  state.cookie = null;
  /* Pendaftaran DITUTUP (bawaan gagal-tertutup) — keadaan yang memunculkan
     "Jadwalkan demo". Dinyatakan, bukan diwarisi. */
  delete process.env.SELF_SERVE_SIGNUP;
});

describe("tidak diatur = halaman hari ini", () => {
  it("semua seksi, jangkar, dan tautan ada; FAQ dari kamus; tanpa bilah pengumuman", async () => {
    const html = await renderTree(await LandingPage());
    for (const kunci of [
      "landing.featuresHeading",
      "landing.modulesHeading",
      "landing.audienceHeading",
      "landing.integrationsHeading",
      "landing.trustHeading",
      "landing.faqHeading",
    ]) {
      expect(html, kunci).toContain(T(kunci));
    }
    expect(html).toContain('id="modul"');
    expect(html).toContain('id="tanya"');
    expect(html).toContain('href="/#modul"');
    expect(html).toContain('href="/#tanya"');
    expect(html).not.toContain("data-landing-announcement");
    expect(pertanyaanTampak(html)[0]).toBe(T("landing.faqTrialQ"));
  });

  it("\"Jadwalkan demo\" tetap menuju `/register` tanpa tautan pemesanan", async () => {
    const html = await renderTree(await LandingPage());
    expect(html).toContain(T("landing.demoCta"));
    expect(html).not.toContain('target="_blank" rel="noopener noreferrer"');
  });
});

describe("seksi yang disembunyikan", () => {
  it("tidak dirender, dan tautan bilah atas + kaki halaman ke jangkarnya hilang", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, hiddenSections: ["modules", "faq"] };
    const html = await renderTree(await LandingPage());
    expect(html).not.toContain(T("landing.modulesHeading"));
    expect(html).not.toContain(T("landing.faqHeading"));
    expect(html).not.toContain('id="modul"');
    expect(html).not.toContain('id="tanya"');
    expect(html).not.toContain('href="/#modul"');
    expect(html).not.toContain('href="/#tanya"');
    expect(faqJsonLd(html)).toBeNull();
    /* Yang tidak disembunyikan tetap ada, termasuk tautan harga. */
    expect(html).toContain(T("landing.featuresHeading"));
    expect(html).toContain('href="/pricing"');
  });

  it("keempat seksi lain juga bisa disembunyikan; pahlawan & ajakan penutup tetap", async () => {
    state.settings = {
      ...DEFAULT_LANDING_SETTINGS,
      hiddenSections: ["features", "audience", "integrations", "trust"],
    };
    const html = await renderTree(await LandingPage());
    expect(html).not.toContain(T("landing.featuresHeading"));
    expect(html).not.toContain(T("landing.audienceHeading"));
    expect(html).not.toContain(T("landing.integrationsHeading"));
    expect(html).not.toContain(T("landing.trustHeading"));
    expect(html).toContain(T("landing.heroHeading"));
    expect(html).toContain(T("landing.ctaHeading"));
  });

  it("FAQ yang disembunyikan hilang dari `/pricing` juga", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, hiddenSections: ["faq"] };
    const html = await renderTree(await PricingPage());
    expect(html).not.toContain(T("landing.faqHeading"));
    expect(faqJsonLd(html)).toBeNull();
  });
});

describe("daftar FAQ dari konsol", () => {
  const items = [
    { key: "harga", question: { id: "Berapa harganya?" }, answer: { id: "Lihat halaman harga." } },
    {
      key: "data",
      question: { id: "Di mana data <saya>?", en: "Where is my data?" },
      answer: { id: "Di server Indonesia & terpisah per PT." },
    },
  ];

  it("menggantikan daftar kamus, urut seperti disusun", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, faqItems: items };
    const html = await renderTree(await LandingPage());
    expect(pertanyaanTampak(html)).toEqual(["Berapa harganya?", "Di mana data &lt;saya&gt;?"]);
    expect(tanpaJsonLd(html)).not.toContain(T("landing.faqTrialQ"));
  });

  it("JSON-LD `FAQPage` sama persis dengan yang tampil (pertanyaan & jawaban)", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, faqItems: items };
    const html = await renderTree(await LandingPage());
    const ld = faqJsonLd(html);
    expect(ld?.map((q) => q.name)).toEqual(items.map((i) => i.question.id));
    expect(ld?.map((q) => q.acceptedAnswer.text)).toEqual(items.map((i) => i.answer.id));
    /* `<` tetap diloloskan di blok skrip — nilai operator tidak bisa menutup elemennya. */
    expect(html).not.toContain("<saya>");
  });

  it("tanpa daftar konsol, JSON-LD memuat daftar kamus yang tampil", async () => {
    const html = await renderTree(await LandingPage());
    expect(faqJsonLd(html)?.map((q) => q.name)).toEqual(pertanyaanTampak(html));
  });
});

describe("tautan pemesanan demo", () => {
  it("mengalihkan \"Jadwalkan demo\" di pahlawan & bilah atas ke tab baru dengan noopener", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, demoBookingUrl: "https://cal.com/sai/demo" };
    const html = await renderTree(await LandingPage());
    const tautan = [...html.matchAll(/<a[^>]*href="https:\/\/cal\.com\/sai\/demo"[^>]*>/g)].map(([a]) => a);
    expect(tautan).toHaveLength(2);
    for (const a of tautan) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain("noopener");
    }
    /* "Minta penawaran" (penutup) tetap ke `/register`. */
    expect(html).toContain('href="/register"');
  });

  it("saat pendaftaran TERBUKA, ajakan \"Coba gratis\" tidak dialihkan", async () => {
    process.env.SELF_SERVE_SIGNUP = "open";
    state.settings = { ...DEFAULT_LANDING_SETTINGS, demoBookingUrl: "https://cal.com/sai/demo" };
    const html = await renderTree(await LandingPage());
    expect(html).not.toContain("https://cal.com/sai/demo");
    delete process.env.SELF_SERVE_SIGNUP;
  });
});

describe("bilah pengumuman", () => {
  const aktif: LandingAnnouncement = {
    enabled: true,
    text: { id: "Diskon 20% sampai akhir bulan" },
    href: "/pricing",
    startsAt: null,
    endsAt: null,
  };

  it("tampil di `/` dan `/pricing` selama aktif, dengan tautan dan tombol tutup", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, announcement: aktif };
    for (const halaman of [LandingPage, PricingPage]) {
      const html = await renderTree(await halaman());
      expect(html).toContain("data-landing-announcement");
      expect(html).toContain("Diskon 20% sampai akhir bulan");
      expect(html).toContain(T("landing.announcementDismiss"));
    }
  });

  it("mati, belum mulai, atau sudah lewat → tidak ada bilah", async () => {
    for (const a of [
      { ...aktif, enabled: false },
      { ...aktif, startsAt: "2999-01-01T00:00:00.000Z" },
      { ...aktif, endsAt: "2000-01-01T00:00:00.000Z" },
    ]) {
      state.settings = { ...DEFAULT_LANDING_SETTINGS, announcement: a };
      const html = await renderTree(await LandingPage());
      expect(html).not.toContain("data-landing-announcement");
    }
  });

  it("sudah ditutup pengunjung ini → tidak dirender; pengumuman yang diubah tampil lagi", async () => {
    state.settings = { ...DEFAULT_LANDING_SETTINGS, announcement: aktif };
    state.cookie = announcementFingerprint(aktif);
    expect(await renderTree(await LandingPage())).not.toContain("data-landing-announcement");

    state.settings = { ...DEFAULT_LANDING_SETTINGS, announcement: { ...aktif, text: { id: "Pengumuman baru" } } };
    expect(await renderTree(await LandingPage())).toContain("Pengumuman baru");
  });
});
