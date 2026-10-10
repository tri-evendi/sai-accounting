/**
 * ISI HALAMAN PENDARATAN yang bisa disunting operator — penjaga bagian MURNInya.
 *
 * ══ Empat hal yang dijaga di sini, dan kenapa masing-masing ════════════════
 *
 *  1. **Namespace `landing` tetap DATAR.** Seluruh mesin penimpaan berdiri di
 *     atas satu asumsi: `landing.<nama>`, satu tingkat, nilainya string.
 *     Kalau suatu hari ada kunci bersarang, kunci itu akan diam-diam TIDAK
 *     BISA disunting dari konsol — dan tidak ada yang akan menyadarinya, sebab
 *     ia hanya tidak muncul di layar. Tes pertama di bawah itulah yang
 *     bersuara.
 *
 *  2. **Hanya `landing.*`.** Penimpa atas `errors.*`/`validation.*` berarti
 *     operator bisa mengubah — atau mengosongkan — kalimat yang dipakai
 *     aplikasi untuk MENJELASKAN KEGAGALAN kepada pelanggan. Pemeriksaannya
 *     ada di dua lapis (skema zod, lalu `isEditableContentKey` di server
 *     action); yang diuji di sini lapis keduanya, yaitu yang menanggung
 *     keputusannya.
 *
 *  3. **Gerbang JALUR.** `isSiteContentPath` adalah satu-satunya hal yang
 *     menahan satu query basis data platform agar tidak ikut ke SETIAP render
 *     halaman aplikasi. Kalau ia melonggar menjadi awalan, `/pricing-internal`
 *     dan `/statusz` ikut membayarnya.
 *
 *  4. **Setiap kunci punya rumah di konsol.** Pengelompokan bagian memakai
 *     pencocokan awalan; kunci pendaratan baru yang namanya tak terduga harus
 *     mendarat di penampung terakhir, bukan menghilang.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import id from "@/lib/i18n/dictionaries/id.json";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { LOCALES } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/dictionary";
import {
  SITE_CONTENT_KEY_MAX,
  SITE_CONTENT_PATHS,
  SITE_CONTENT_PREFIX,
  SITE_CONTENT_SECTIONS,
  applySiteContent,
  isEditableContentKey,
  isSiteContentLocale,
  isSiteContentPath,
  resolveSection,
  sectionOf,
  siteContentDefaults,
} from "@/lib/site-content";

const dictionary = id as Dictionary;

describe("namespace yang disunting tetap datar", () => {
  it("setiap nilai `landing.*` adalah string, bukan objek bersarang", () => {
    const bersarang = Object.entries(dictionary.landing)
      .filter(([, value]) => typeof value !== "string")
      .map(([name]) => name);

    expect(
      bersarang,
      bersarang.length === 0
        ? ""
        : "Kunci `landing.*` berikut bukan string:\n\n  " +
            bersarang.join("\n  ") +
            "\n\nSeluruh mesin penimpaan isi pendaratan berdiri di atas bentuk " +
            "`landing.<nama>` satu tingkat (lihat `siteContentDefaults`). Kunci " +
            "bersarang TIDAK akan bisa disunting dari konsol operator, dan " +
            "kegagalannya tidak bersuara — ia hanya tidak muncul di layar. " +
            "Kalau bentuk bersarang memang dibutuhkan, `siteContentDefaults`, " +
            "`isEditableContentKey`, dan `applySiteContent` harus ikut berubah."
    ).toEqual([]);
  });

  it("bawaannya memuat SELURUH kunci pendaratan, berawalan jalur-titik", () => {
    const defaults = siteContentDefaults(dictionary);
    expect(defaults.size).toBe(Object.keys(dictionary.landing).length);
    expect(defaults.size).toBeGreaterThan(100);
    for (const key of defaults.keys()) expect(key.startsWith(SITE_CONTENT_PREFIX)).toBe(true);
    expect(defaults.get("landing.heroHeading")).toBe(dictionary.landing.heroHeading);
  });

  it("tidak satu pun kunci melewati batas kolom basis data", () => {
    for (const key of siteContentDefaults(dictionary).keys()) {
      expect(key.length, key).toBeLessThanOrEqual(SITE_CONTENT_KEY_MAX);
    }
  });
});

describe("hanya `landing.*` yang boleh disunting", () => {
  it("menerima kunci pendaratan yang benar-benar ada", () => {
    expect(isEditableContentKey(dictionary, "landing.heroHeading")).toBe(true);
    expect(isEditableContentKey(dictionary, "landing.footerTagline")).toBe(true);
  });

  it("MENOLAK namespace lain — kalimat sistem bukan pemasaran", () => {
    for (const key of [
      "errors.notFound",
      "validation.dateRequired",
      "common.save",
      "operator.consoleTitle",
      "app.description",
    ]) {
      expect(isEditableContentKey(dictionary, key), key).toBe(false);
    }
  });

  it("menolak kunci pendaratan yang tidak ada, bersarang, kosong, atau kepanjangan", () => {
    expect(isEditableContentKey(dictionary, "landing.tidakAdaKunciIni")).toBe(false);
    expect(isEditableContentKey(dictionary, "landing.hero.heading")).toBe(false);
    expect(isEditableContentKey(dictionary, "landing.")).toBe(false);
    expect(isEditableContentKey(dictionary, "")).toBe(false);
    expect(isEditableContentKey(dictionary, `landing.${"x".repeat(SITE_CONTENT_KEY_MAX)}`)).toBe(
      false
    );
  });
});

describe("penimpaan kamus", () => {
  it("mengganti nilai yang disebut, dan hanya itu", () => {
    const hasil = applySiteContent(dictionary, { "landing.heroHeading": "Judul baru" });
    expect(hasil.landing.heroHeading).toBe("Judul baru");
    /* Tetangganya tidak ikut berubah, dan namespace lain tidak tersentuh. */
    expect(hasil.landing.heroBody).toBe(dictionary.landing.heroBody);
    expect(hasil.common.save).toBe(dictionary.common.save);
  });

  it("TIDAK mengubah kamus aslinya (ia dibagi seluruh permintaan)", () => {
    const sebelum = dictionary.landing.heroHeading;
    applySiteContent(dictionary, { "landing.heroHeading": "Judul lain" });
    expect(dictionary.landing.heroHeading).toBe(sebelum);
  });

  it("mengabaikan kunci asing — termasuk yang menyasar kalimat sistem", () => {
    const hasil = applySiteContent(dictionary, {
      "errors.notFound": "diganti operator",
      "landing.tidakAda": "hantu",
      "common.save": "diganti juga",
    });
    expect(hasil.errors.notFound).toBe(dictionary.errors.notFound);
    expect(hasil.common.save).toBe(dictionary.common.save);
    expect("tidakAda" in hasil.landing).toBe(false);
  });

  it("mengabaikan nilai KOSONG — kosong berarti `pakai bawaan`", () => {
    const hasil = applySiteContent(dictionary, { "landing.heroHeading": "" });
    expect(hasil.landing.heroHeading).toBe(dictionary.landing.heroHeading);
  });

  it("memulangkan objek yang SAMA bila tidak ada yang berlaku (jalur panas)", () => {
    expect(applySiteContent(dictionary, {})).toBe(dictionary);
    expect(applySiteContent(dictionary, { "errors.notFound": "x" })).toBe(dictionary);
  });

  it("hasilnya tetap bisa dibaca `translate()` dengan placeholder utuh", () => {
    const hasil = applySiteContent(dictionary, {
      "landing.heroTrialCta": "Coba {days} hari gratis",
    });
    expect(translate(hasil, "landing.heroTrialCta", { days: 14 })).toBe("Coba 14 hari gratis");
  });
});

describe("gerbang jalur — penahan satu query di setiap render", () => {
  it("mengizinkan tepat tiga halaman pemasaran", () => {
    for (const path of SITE_CONTENT_PATHS) expect(isSiteContentPath(path), path).toBe(true);
    expect(SITE_CONTENT_PATHS).toEqual(["/", "/pricing", "/status"]);
  });

  it("querystring & fragment tidak mengubah jawabannya", () => {
    expect(isSiteContentPath("/pricing?ref=wa")).toBe(true);
    expect(isSiteContentPath("/#harga")).toBe(true);
  });

  it("MENOLAK halaman aplikasi, konsol, dan jalur yang hanya BERAWALAN sama", () => {
    for (const path of [
      "/dashboard",
      "/t/sai/pt-a/invoices",
      "/operator",
      "/operator/content",
      "/pricing-internal",
      "/pricingx",
      "/statusz",
      "/api/health",
      "",
      null,
      undefined,
    ]) {
      expect(isSiteContentPath(path), String(path)).toBe(false);
    }
  });

  it("bahasa asing tidak pernah lolos", () => {
    for (const locale of LOCALES) expect(isSiteContentLocale(locale)).toBe(true);
    for (const value of ["jp", "ID", "", null, undefined]) {
      expect(isSiteContentLocale(value), String(value)).toBe(false);
    }
  });
});

describe("setiap kunci punya rumah di konsol", () => {
  it("id bagian unik", () => {
    const ids = SITE_CONTENT_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("judul setiap bagian benar-benar ada di kamus", () => {
    for (const section of SITE_CONTENT_SECTIONS) {
      /* `translate` memulangkan kuncinya sendiri bila kalimatnya tidak ada —
         jadi "judul = kunci" berarti terjemahannya belum ditulis. */
      expect(translate(dictionary, section.labelKey), section.id).not.toBe(section.labelKey);
    }
  });

  it("setiap kunci `landing.*` mendarat di tepat satu bagian", () => {
    const perBagian = new Map<string, number>();
    for (const key of siteContentDefaults(dictionary).keys()) {
      const section = sectionOf(key);
      expect(section, key).toBeDefined();
      perBagian.set(section.id, (perBagian.get(section.id) ?? 0) + 1);
    }

    /* Penampung terakhir KOSONG hari ini, dan itu keadaan yang sehat: ia ada
       supaya kunci bernama tak terduga tidak menghilang, bukan supaya dipakai.
       Kalau ia mulai terisi, namanya memang perlu bagian sendiri. */
    expect(perBagian.get("other") ?? 0).toBe(0);

    /* Dan setiap bagian LAIN benar-benar memuat sesuatu — bagian kosong di
       dalam pemilih adalah pilihan yang membuang satu klik. */
    for (const section of SITE_CONTENT_SECTIONS) {
      if (section.id === "other") continue;
      expect(perBagian.get(section.id) ?? 0, section.id).toBeGreaterThan(0);
    }
  });

  it("`?section=` asing jatuh ke bagian pertama, bukan melempar", () => {
    expect(resolveSection("hero").id).toBe("hero");
    expect(resolveSection("tidak-ada").id).toBe(SITE_CONTENT_SECTIONS[0].id);
    expect(resolveSection(null).id).toBe(SITE_CONTENT_SECTIONS[0].id);
  });
});

describe("jalur panas tidak menyeret klien Prisma penagihan", () => {
  it("`i18n/server.ts` mengimpor store penimpa secara DINAMIS, bukan statis", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "i18n", "server.ts"), "utf8");

    /* Berkas ini diimpor nyaris setiap route. Impor STATIS ke
       `site-content-store` (yang mengimpor `lib/platform-db.ts`) akan menyeret
       klien Prisma penagihan ke bundel server setiap halaman buku besar —
       doktrin #137: penjaga & jalur panas bukan kode penagihan. */
    expect(src).not.toMatch(/^\s*import\s[^;]*site-content-store/m);
    expect(src).toMatch(/await import\(\s*["']@\/lib\/site-content-store["']\s*\)/);
  });

  it("modul murni `site-content.ts` tidak mengimpor Prisma, next/*, maupun server-only", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "site-content.ts"), "utf8");

    /* IMPORNYA yang diperiksa, bukan untaian katanya di mana pun: kepala berkas
       itu MENYEBUT `server-only` untuk menjelaskan kenapa ia tidak memakainya,
       dan pemeriksaan substring telanjang akan menyatakan kalimat penjelas itu
       sebagai pelanggaran. Pola yang sama dengan `tests/landing-boundary`:
       spesifier impor runtime MAUPUN tipe. */
    const impor = [...src.matchAll(/^\s*import\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)].map(
      (m) => m[1]
    );
    const pelanggar = impor.filter((spec) =>
      ["server-only", "next/", "platform-db", "@prisma/"].some((bad) => spec.includes(bad))
    );
    expect(pelanggar).toEqual([]);
    /* Dan pemindainya benar-benar melihat sesuatu — kalau regexnya rusak, tes
       di atas lulus dengan daftar kosong. */
    expect(impor.length).toBeGreaterThan(0);
  });
});
