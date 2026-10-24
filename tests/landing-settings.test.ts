/**
 * TAMPILAN HALAMAN DEPAN — inti murni (`@sai/core/landing-settings`).
 *
 * Yang dijaga di sini adalah janji yang kalau meleset tidak berbunyi:
 *
 *   1. **Tidak diatur = halaman hari ini.** Baris tidak ada, kolom NULL, JSON
 *      rusak, atau bentuk yang tidak dikenal → bawaan, per medan. Halaman
 *      publik tidak boleh 500 (atau berubah) karena setelan pemasaran.
 *   2. **Tautan demo hanya https publik.** `javascript:`/`data:` di `href`
 *      adalah XSS; `http:` membuka kalender tanpa TLS; `user@host` menyamarkan
 *      tujuan.
 *   3. **Jendela pengumuman [mulai, akhir).** Pengumuman "sampai 17.00"
 *      berhenti TEPAT 17.00, dan yang belum mulai tidak tampil.
 *   4. **FAQ yang rusak tidak menghapus seluruh FAQ.** Butir tidak sah dibuang;
 *      daftar yang tersisa kosong = daftar bawaan kamus.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_SETTINGS,
  announcementFingerprint,
  isAnnouncementActive,
  isSectionVisible,
  isoToWibLocal,
  landingSettingsFromRow,
  localizedText,
  normalizeFaqItems,
  normalizeHiddenSections,
  parseAnnouncementHref,
  parseDemoBookingUrl,
  whatsappUrlWithText,
  wibLocalToIso,
  type LandingAnnouncement,
  type LandingSettingsRow,
} from "@sai/core/landing-settings";

const baris = (over: Partial<LandingSettingsRow> = {}): LandingSettingsRow => ({
  hiddenSectionsJson: null,
  demoBookingUrl: null,
  whatsappMessageJson: null,
  announcementJson: null,
  faqItemsJson: null,
  updatedBy: "vyn",
  updatedAt: new Date("2026-10-24T00:00:00Z"),
  ...over,
});

describe("tidak diatur = perilaku hari ini", () => {
  it("baris tidak ada / tak terbaca → bawaan", () => {
    expect(landingSettingsFromRow(null)).toEqual(DEFAULT_LANDING_SETTINGS);
    expect(landingSettingsFromRow(undefined)).toEqual(DEFAULT_LANDING_SETTINGS);
  });

  it("baris dengan semua kolom NULL → bawaan, persis", () => {
    expect(landingSettingsFromRow(baris())).toEqual(DEFAULT_LANDING_SETTINGS);
  });

  it("bawaan: semua seksi tampil, tanpa tautan demo, tanpa pengumuman, FAQ dari kamus", () => {
    for (const seksi of ["features", "modules", "audience", "integrations", "trust", "faq"] as const) {
      expect(isSectionVisible(DEFAULT_LANDING_SETTINGS, seksi), seksi).toBe(true);
    }
    expect(DEFAULT_LANDING_SETTINGS.demoBookingUrl).toBeNull();
    expect(DEFAULT_LANDING_SETTINGS.whatsappMessage).toBeNull();
    expect(isAnnouncementActive(DEFAULT_LANDING_SETTINGS.announcement)).toBe(false);
    expect(DEFAULT_LANDING_SETTINGS.faqItems).toBeNull();
  });

  it("JSON rusak / bentuk asing jatuh ke bawaan MEDAN ITU SAJA, bukan melempar", () => {
    const s = landingSettingsFromRow(
      baris({
        hiddenSectionsJson: "{bukan json",
        demoBookingUrl: "javascript:alert(1)",
        whatsappMessageJson: '"teks telanjang"',
        announcementJson: "[]",
        faqItemsJson: '{"a":1}',
      })
    );
    expect(s).toEqual(DEFAULT_LANDING_SETTINGS);

    const sebagian = landingSettingsFromRow(
      baris({ hiddenSectionsJson: '["faq"]', announcementJson: "{rusak" })
    );
    expect(sebagian.hiddenSections).toEqual(["faq"]);
    expect(sebagian.announcement).toBeNull();
  });

  it("kunci seksi asing dibuang, ganda dirapikan, urut seperti halaman", () => {
    expect(normalizeHiddenSections(["faq", "hero", "modules", "faq", 3, "pricing"])).toEqual(["modules", "faq"]);
    expect(normalizeHiddenSections("faq")).toEqual([]);
  });
});

describe("tautan pemesanan demo — https publik saja", () => {
  it.each([
    "https://calendly.com/sai/demo",
    "https://cal.com/sai?utm_source=landing",
    "  https://meet.google.com/abc-defg-hij  ",
  ])("diterima: %s", (url) => {
    expect(parseDemoBookingUrl(url)).toBe(url.trim());
  });

  it.each([
    ["http (tanpa TLS)", "http://calendly.com/sai"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["tanpa skema", "calendly.com/sai"],
    ["kredensial menyamarkan host", "https://bank.co.id@jahat.tld/demo"],
    ["host tanpa titik", "https://localhost/demo"],
    ["spasi di tengah", "https://cal.com/sai demo"],
    ["kosong", ""],
    ["terlalu panjang", `https://cal.com/${"a".repeat(600)}`],
    ["bukan teks", 42],
  ])("ditolak: %s", (_nama, url) => {
    expect(parseDemoBookingUrl(url)).toBeNull();
  });
});

describe("tautan pengumuman — https atau jalur internal", () => {
  it("jalur internal satu garis miring diterima", () => {
    expect(parseAnnouncementHref("/pricing")).toBe("/pricing");
    expect(parseAnnouncementHref("/docs/mulai?x=1#a")).toBe("/docs/mulai?x=1#a");
  });

  it("URL tanpa skema (`//host`) dan garis miring terbalik ditolak", () => {
    expect(parseAnnouncementHref("//jahat.tld")).toBeNull();
    expect(parseAnnouncementHref("/\\jahat.tld")).toBeNull();
    expect(parseAnnouncementHref("javascript:alert(1)")).toBeNull();
    expect(parseAnnouncementHref("http://contoh.id")).toBeNull();
  });
});

describe("jendela pengumuman [mulai, akhir)", () => {
  const dasar: LandingAnnouncement = {
    enabled: true,
    text: { id: "Promo akhir tahun" },
    href: null,
    startsAt: "2026-10-25T01:00:00.000Z",
    endsAt: "2026-10-31T10:00:00.000Z",
  };

  it("di dalam jendela → tampil; sebelum mulai / tepat di akhir / sesudahnya → tidak", () => {
    expect(isAnnouncementActive(dasar, new Date("2026-10-26T00:00:00Z"))).toBe(true);
    expect(isAnnouncementActive(dasar, new Date("2026-10-25T01:00:00Z"))).toBe(true);
    expect(isAnnouncementActive(dasar, new Date("2026-10-25T00:59:59Z"))).toBe(false);
    expect(isAnnouncementActive(dasar, new Date("2026-10-31T10:00:00Z"))).toBe(false);
    expect(isAnnouncementActive(dasar, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });

  it("mati = tidak tampil walau di dalam jendela; tanpa jendela = tampil selama nyala", () => {
    expect(isAnnouncementActive({ ...dasar, enabled: false }, new Date("2026-10-26T00:00:00Z"))).toBe(false);
    expect(isAnnouncementActive({ ...dasar, startsAt: null, endsAt: null }, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  it("baris dengan akhir ≤ mulai tidak sah → tidak ada pengumuman", () => {
    const s = landingSettingsFromRow(
      baris({ announcementJson: JSON.stringify({ ...dasar, endsAt: dasar.startsAt }) })
    );
    expect(s.announcement).toBeNull();
  });

  it("sidik berubah bila teks/tautan/jendela berubah (pengumuman baru tampil lagi)", () => {
    const a = announcementFingerprint(dasar);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(announcementFingerprint({ ...dasar })).toBe(a);
    expect(announcementFingerprint({ ...dasar, text: { id: "Promo lain" } })).not.toBe(a);
    expect(announcementFingerprint({ ...dasar, href: "/pricing" })).not.toBe(a);
    expect(announcementFingerprint({ ...dasar, endsAt: null })).not.toBe(a);
  });

  it("waktu konsol dinyatakan dalam WIB, pulang-pergi tanpa geser", () => {
    expect(wibLocalToIso("2026-10-25T08:00")).toBe("2026-10-25T01:00:00.000Z");
    expect(isoToWibLocal("2026-10-25T01:00:00.000Z")).toBe("2026-10-25T08:00");
    expect(wibLocalToIso("25/10/2026")).toBeNull();
    expect(isoToWibLocal(null)).toBe("");
  });
});

describe("daftar FAQ", () => {
  const butir = (key: string, q = "Tanya?", a = "Jawab.") => ({ key, question: { id: q }, answer: { id: a } });

  it("butir sah dipertahankan berurutan", () => {
    const items = normalizeFaqItems([butir("b"), butir("a")]);
    expect(items?.map((i) => i.key)).toEqual(["b", "a"]);
  });

  it("butir tidak sah dibuang, kunci ganda: yang pertama menang", () => {
    const items = normalizeFaqItems([
      butir("satu"),
      { key: "BESAR", question: { id: "x" }, answer: { id: "y" } },
      { key: "dua", question: { en: "only english" }, answer: { id: "y" } },
      butir("satu", "Ganda?"),
      butir("tiga"),
    ]);
    expect(items?.map((i) => i.key)).toEqual(["satu", "tiga"]);
    expect(items?.[0].question.id).toBe("Tanya?");
  });

  it("tidak ada butir sah tersisa → `null` = daftar bawaan kamus", () => {
    expect(normalizeFaqItems([])).toBeNull();
    expect(normalizeFaqItems([{ key: "x" }])).toBeNull();
    expect(normalizeFaqItems("bukan larik")).toBeNull();
  });

  it("bahasa yang tidak diisi jatuh ke Indonesia", () => {
    const t = { id: "Halo", en: "Hello" };
    expect(localizedText(t, "en")).toBe("Hello");
    expect(localizedText(t, "zh")).toBe("Halo");
    expect(localizedText(t, "id")).toBe("Halo");
  });
});

describe("kalimat pembuka WhatsApp", () => {
  it("tanpa kalimat = tautan apa adanya (perilaku hari ini)", () => {
    expect(whatsappUrlWithText("https://wa.me/628123", null)).toBe("https://wa.me/628123");
    expect(whatsappUrlWithText("https://wa.me/628123", "   ")).toBe("https://wa.me/628123");
  });

  it("kalimat di-encode — `&`/`#`/`?` tidak memotong kueri", () => {
    expect(whatsappUrlWithText("https://wa.me/628123", "Halo, saya mau demo & harga #1?")).toBe(
      "https://wa.me/628123?text=Halo%2C%20saya%20mau%20demo%20%26%20harga%20%231%3F"
    );
  });
});
