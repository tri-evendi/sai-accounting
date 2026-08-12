/**
 * `/docs` — SATU halaman, DUA kulit. Ketiga keadaannya, dibuktikan.
 *
 * ══ APA YANG SALAH SEBELUM INI ═════════════════════════════════════════════
 * Dokumentasi selalu memakai kepala publik yang ramping, termasuk untuk orang
 * yang sedang bersesi — padahal pintu masuk yang paling sering dipakai adalah
 * menu Bantuan DI DALAM aplikasi. Satu klik dari sana melempar penggunanya
 * keluar dari chrome-nya ke halaman telanjang: tanpa menu samping, tanpa bilah
 * atas, tanpa jalan kembali selain tombol Back. Kelas cacat yang sama sudah
 * diperbaiki untuk `/companies/new` dan wisaya penyiapan.
 *
 * ══ KENAPA TIGA KEADAAN, DAN KENAPA YANG KEDUA YANG PALING MAHAL ═══════════
 * Perbaikan yang jelas — "pakai kerangka dasbor kalau ada sesi" — RUSAK di
 * keadaan 2, dan rusaknya sunyi: `(dashboard)/layout.tsx` menyusun menunya dari
 * `session.user.role`, yaitu peran DI SEBUAH PT, dan ketika peran itu `null` ia
 * harfiah `return <PageLoader …>`. Pemilik tenant yang belum punya satu pun PT
 * akan melihat pemutar memuat selamanya, di halaman yang sengaja dibuat publik.
 * Karena itu ketiganya dinyatakan sebagai DAFTAR UJI, bukan sebagai temuan
 * belakangan:
 *
 *   1. bersesi, dengan PT terbuka       → kulit APLIKASI + jalan pulang ke buku
 *   2. bersesi, tanpa satu pun PT       → kulit APLIKASI, menu TIDAK kosong
 *   3. tanpa sesi                       → kulit PUBLIK, tetap terbaca
 *   4. bersesi, tanpa keanggotaan tenant → kulit PUBLIK (nama tenant tak ada)
 *
 * ══ KENAPA HALAMANNYA BENAR-BENAR DIRENDER ═════════════════════════════════
 * Pembacaan sumber akan lulus pada kulit yang tidak pernah terpasang, dan
 * fungsi murni sendirian tidak membuktikan bahwa layout MEMAKAI jawabannya.
 * Jadi yang dijalankan di sini adalah `(docs)/layout.tsx` yang asli membungkus
 * `(docs)/docs/page.tsx` yang asli; yang dipalsukan hanya sumber datanya (sesi,
 * direktori tenant, kamus) dan `PlatformShell` — kulit panel akun diuji di
 * tempatnya sendiri, dan menyeretnya ke sini berarti menguji lambang produk,
 * pemilih bahasa, dan sakelar tema untuk ketiga kalinya.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

import { LocaleProvider } from "@/lib/i18n/client";
import { translate, type Dictionary, type DictionaryKey } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { kulitDokumentasi, navDokumentasi, type PembacaDokumentasi } from "@/lib/docs-chrome";
import { isTenantScopedPath, legacyTenantScopedPath } from "@/lib/tenant-routes";

const dict = id as unknown as Dictionary;
const T = (key: DictionaryKey, values?: Record<string, string | number>) =>
  translate(dict, key, values);

interface SesiUji {
  user: {
    id: string;
    name: string;
    tenantSlug: string | null;
    companySlug: string | null;
  };
}

const state = {
  session: null as SesiUji | null,
  membership: null as {
    tenantId: number;
    tenantSlug: string;
    tenantName: string;
    tenantStatus: string;
    role: string;
  } | null,
  /** Berapa kali direktori tenant dibaca — untuk pembaca ANONIM harus 0. */
  bacaanDirektori: 0,
  /** Basis data kendali sedang tidak bisa dihubungi. */
  direktoriMati: false,
};

vi.mock("@/lib/auth", () => ({
  auth: async () => state.session,
}));

vi.mock("@/lib/tenant-directory", () => ({
  tenantMembershipForUser: async () => {
    state.bacaanDirektori += 1;
    if (state.direktoriMati) throw new Error("control db down");
    return state.membership;
  },
}));

vi.mock("@/lib/i18n/server", () => ({
  getT: async () => T,
  getLocale: async () => "id",
  getRequestI18n: async () => ({ locale: "id", dictionary: dict, t: T }),
}));

/* `ButtonLink` (kepala publik) dan `Link` memakai hook router; yang diuji di
   sini markupnya, bukan navigasinya. */
vi.mock("next/navigation", () => ({
  usePathname: () => "/docs",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
}));

/** Penanda kulit — satu-satunya cara membedakan keduanya dari markup. */
const PENANDA_APLIKASI = "data-uji-kulit-aplikasi";

vi.mock("@/components/tenant/platform-shell", () => ({
  PlatformShell: ({
    children,
    tenantName,
    nav,
    userName,
    role,
  }: {
    children: React.ReactNode;
    tenantName: string;
    nav: { href: string; label: string }[];
    userName: string;
    role: string;
  }) => (
    <div data-uji-kulit-aplikasi="">
      <p>{tenantName}</p>
      <nav>
        {nav.map((item) => (
          /* `data-uji-nav` bukan hiasan: tanpa penanda, "menunya tidak kosong"
             akan lulus dengan menghitung tautan HALAMAN (daftar isi, kaki) dan
             berhenti menjaga menu samping sama sekali — dilihat merah dengan
             mengosongkan `navDokumentasi`, lalu dikembalikan. */
          <a key={item.href} data-uji-nav="" href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <p>{userName}</p>
      <p>{role}</p>
      {/* `Layout.Content` yang asli merender `<main>`-nya sendiri; stub ini
          menirunya supaya "tidak ada <main> kedua" ikut terbukti di markup. */}
      <main>{children}</main>
    </div>
  ),
}));

const { default: DocsLayout } = await import("@/app/(docs)/layout");
const { default: DocsIndexPage } = await import("@/app/(docs)/docs/page");

async function renderDokumentasi(): Promise<string> {
  const stream = await renderToReadableStream(
    <LocaleProvider locale="id" dictionary={dict}>
      {await DocsLayout({ children: await DocsIndexPage() })}
    </LocaleProvider>
  );
  const html = await new Response(stream).text();
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Semua `href` di dalam markup — seluruh halaman, chrome maupun isi. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** `href` MENU SAMPING saja — butir yang benar-benar dioper ke kulit. */
const hrefsMenu = (html: string) =>
  [...html.matchAll(/<a\b[^>]*\bdata-uji-nav\b[^>]*>/g)]
    .map((m) => /href="([^"]*)"/.exec(m[0])?.[1])
    .filter((href): href is string => href !== undefined);

const SESI_BER_PT: SesiUji = {
  user: { id: "7", name: "Budi Santoso", tenantSlug: "acme", companySlug: "pt-satu" },
};
const SESI_TANPA_PT: SesiUji = {
  user: { id: "7", name: "Budi Santoso", tenantSlug: "acme", companySlug: null },
};
const KEANGGOTAAN = {
  tenantId: 1,
  tenantSlug: "acme",
  tenantName: "CV Acme Nusantara",
  tenantStatus: "active",
  role: "owner",
};

beforeEach(() => {
  state.session = null;
  state.membership = KEANGGOTAAN;
  state.bacaanDirektori = 0;
  state.direktoriMati = false;
});

/* ------------------------------------------------------------------ */
/* Keadaan 1 — bersesi, dengan PT terbuka                              */
/* ------------------------------------------------------------------ */

describe("keadaan 1: bersesi dengan PT terbuka", () => {
  beforeEach(() => {
    state.session = SESI_BER_PT;
  });

  it("dirender DI DALAM chrome aplikasi, bukan di kepala publik", async () => {
    const html = await renderDokumentasi();
    expect(html).toContain(PENANDA_APLIKASI);
    // Kepala publik menawarkan "masuk ke aplikasi"; orang ini sudah di dalamnya.
    expect(hrefs(html)).not.toContain("/login");
    expect(html).toContain("CV Acme Nusantara");
  });

  it("punya JALAN PULANG ke buku yang sedang dibuka — kanonik, bukan jalur lama", async () => {
    /*
     * Inilah keluhan aslinya: "tanpa jalan kembali selain tombol Back". Dan
     * alamatnya harus sudah kanonik sejak klik pertama — jalur lama
     * (`/dashboard`) memang sampai lewat pantulan 307 proxy, tapi pantulan itu
     * satu perjalanan bolak-balik tambahan dan sekejap memperlihatkan alamat
     * yang bukan alamat sebenarnya.
     */
    const html = await renderDokumentasi();
    expect(hrefsMenu(html)).toContain("/t/acme/pt-satu");
    expect(hrefs(html)).not.toContain("/dashboard");
    expect(html).toContain(T("docs.backToBook"));
  });

  it("prosanya tetap ada, dan kolom bacanya tetap 768px", async () => {
    const html = await renderDokumentasi();
    expect(html).toContain(T("docs.title"));
    expect(html).toContain(T("docs.branchUser"));
    // Area kerja dasbor lebar penuh; kolom baca TIDAK ikut melebar.
    expect(html).toContain("max-width:768px");
  });

  it("hanya SATU tengara `<main>` di seluruh halaman", async () => {
    const html = await renderDokumentasi();
    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Keadaan 2 — bersesi, TANPA satu pun PT                              */
/* ------------------------------------------------------------------ */

describe("keadaan 2: bersesi tanpa satu pun PT", () => {
  beforeEach(() => {
    state.session = SESI_TANPA_PT;
  });

  it("tetap merender halamannya di dalam chrome — bukan pemutar memuat, bukan lemparan", async () => {
    /*
     * Keadaan yang membunuh jawaban "pakai kerangka dasbor": tanpa peran di
     * sebuah PT, kerangka itu `return <PageLoader …>` selamanya.
     */
    const html = await renderDokumentasi();
    expect(html).toContain(PENANDA_APLIKASI);
    expect(html).toContain(T("docs.title"));
    expect(html).toContain("CV Acme Nusantara");
  });

  it("menunya TIDAK kosong, dan tidak satu butir pun menunjuk ke dalam sebuah buku", async () => {
    /*
     * Dua kegagalan yang keadaan ini paling mudah menghasilkannya, dan
     * keduanya terlihat "hampir benar" di layar: menu kosong (yang terbaca
     * sebagai "Anda tidak punya akses apa pun") dan menu berisi butir yang
     * setiap kliknya memantul karena tidak ada perusahaan untuk dimasuki.
     */
    const html = await renderDokumentasi();
    const menu = hrefsMenu(html);
    expect(menu.length).toBeGreaterThan(0);
    for (const href of menu) {
      expect(isTenantScopedPath(href), `${href} menuntut sebuah PT`).toBe(false);
      expect(legacyTenantScopedPath(href), `${href} menuntut sebuah PT`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Keadaan 3 — tanpa sesi                                              */
/* ------------------------------------------------------------------ */

describe("keadaan 3: tanpa sesi", () => {
  it("tetap terbaca, dengan kepala publik yang tidak berubah", async () => {
    const html = await renderDokumentasi();
    expect(html).not.toContain(PENANDA_APLIKASI);
    expect(hrefs(html)).toContain("/login");
    expect(html).toContain(T("docs.openApp"));
    expect(html).toContain(T("docs.title"));
    expect(html).toContain("max-width:768px");
  });

  it("tidak satu pun query berjalan untuk pembaca anonim", async () => {
    /*
     * Halaman publik yang menanyakan direktori tenant pada setiap kunjungan
     * anonim adalah biaya yang tidak pernah terlihat sampai halamannya
     * ditautkan dari luar.
     */
    await renderDokumentasi();
    expect(state.bacaanDirektori).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Keadaan 4 — bersesi, tanpa keanggotaan tenant                       */
/* ------------------------------------------------------------------ */

describe("keadaan 4: bersesi tanpa keanggotaan tenant (sisa adopsi #134)", () => {
  it("turun ke kulit publik alih-alih memajang nama tenant yang ditebak", async () => {
    state.session = SESI_BER_PT;
    state.membership = null;
    const html = await renderDokumentasi();
    expect(html).not.toContain(PENANDA_APLIKASI);
    expect(html).toContain(T("docs.title"));
  });

  it("basis data yang sedang tidak bisa dihubungi TIDAK menjatuhkan halamannya", async () => {
    /*
     * Chrome hiasan; prosa halamannya. 500 pada halaman yang bahkan tidak butuh
     * basis data untuk merender isinya adalah pertukaran yang salah.
     */
    state.session = SESI_BER_PT;
    state.direktoriMati = true;

    const html = await renderDokumentasi();
    expect(state.bacaanDirektori).toBe(1);
    expect(html).not.toContain(PENANDA_APLIKASI);
    expect(html).toContain(T("docs.title"));
  });
});

/* ------------------------------------------------------------------ */
/* Keputusannya sebagai fungsi murni                                   */
/* ------------------------------------------------------------------ */

describe("keputusan kulit sebagai fungsi murni", () => {
  const pembaca = (buku: PembacaDokumentasi["buku"]): PembacaDokumentasi => ({
    tenantName: "CV Acme Nusantara",
    tenantRole: "owner",
    userName: "Budi Santoso",
    buku,
  });

  it("dua kulit, tidak pernah tiga", () => {
    expect(kulitDokumentasi(null)).toBe("publik");
    expect(kulitDokumentasi(pembaca({ tenantSlug: "acme", companySlug: "pt-satu" }))).toBe(
      "aplikasi"
    );
    expect(kulitDokumentasi(pembaca(null))).toBe("aplikasi");
  });

  it("butir pertama adalah jalan pulang, dan hanya bila ada buku untuk dipulangi", () => {
    const dengan = navDokumentasi(pembaca({ tenantSlug: "acme", companySlug: "pt-satu" }), T);
    expect(dengan[0].href).toBe("/t/acme/pt-satu");
    expect(dengan[0].exact).toBe(true);

    const tanpa = navDokumentasi(pembaca(null), T);
    expect(tanpa.length).toBeGreaterThan(0);
    expect(tanpa.every((item) => !isTenantScopedPath(item.href))).toBe(true);
  });

  it("peran tenant yang paling sempit pun tetap mendapat menu", () => {
    // `member` tidak memegang satu pun izin panel selain pendaratannya. Menu
    // kosong di sini akan terbaca sebagai chrome yang rusak, bukan sebagai
    // kewenangan yang memang terbatas.
    const menu = navDokumentasi({ ...pembaca(null), tenantRole: "member" }, T);
    expect(menu.length).toBeGreaterThan(0);
  });
});
