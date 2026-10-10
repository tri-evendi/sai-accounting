/**
 * APA YANG BOLEH DIJANJIKAN HALAMAN PENDARATAN — penjaga janji, bukan penjaga
 * gaya.
 *
 * ══ Kenapa penjaga ini ada ═════════════════════════════════════════════════
 * Menutup pendaftaran mandiri (`SELF_SERVE_SIGNUP`, Fase A) menciptakan satu
 * cara baru bagi halaman pendaratan untuk BERBOHONG: empat tombolnya tetap
 * berbunyi "Coba gratis 14 hari" dan dua catatan di bawahnya tetap menyebut uji
 * coba — lalu mendarat di layar yang mengatakan pendaftaran sedang ditutup.
 *
 * Halaman ini satu-satunya permukaan yang dibaca orang yang BELUM punya akun,
 * dan tombol-tombol itu satu-satunya alasan ia ada. Janji yang tidak bisa
 * ditepati membuang pengunjung paling bersemangat tepat di langkah terakhir.
 *
 * Yang dijaga: (1) kedua keadaan memulangkan kunci yang benar-benar ADA di
 * kamus, (2) keadaan tertutup tidak menyebut `{days}` sama sekali, dan (3)
 * keempat permukaan benar-benar MEMAKAI keputusan itu — penjaga yang hanya
 * menguji fungsinya akan tetap hijau sementara sebuah komponen memanggil
 * `t("landing.heroTrialCta")` langsung.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import id from "@/lib/i18n/dictionaries/id.json";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { translate } from "@/lib/i18n/dictionary";
import { askValues, landingAsk } from "@/lib/landing-ask";
import { selfServeSignupOpen } from "@/lib/registration";

const dictionary = id as Dictionary;
const LANDING = join(__dirname, "..", "src", "components", "landing");
const baca = (nama: string) => readFileSync(join(LANDING, nama), "utf8");

describe("keputusan janji pendaratan", () => {
  it("kedua keadaan memulangkan kunci yang BENAR-BENAR ada di kamus", () => {
    for (const open of [true, false]) {
      const ask = landingAsk(open);
      for (const key of [ask.heroCta, ask.cardCta, ask.priceNote, ask.ctaNote, ask.faqTrialAnswer]) {
        /* `translate` memulangkan kuncinya sendiri bila kalimatnya tidak ada. */
        expect(translate(dictionary, key), `${key} (open=${open})`).not.toBe(key);
      }
    }
  });

  it("TERBUKA: menyebut uji coba, dan placeholder {days} terisi", () => {
    const ask = landingAsk(true);
    expect(ask.needsDays).toBe(true);
    expect(translate(dictionary, ask.heroCta, askValues(ask, 14))).toContain("14");
    expect(translate(dictionary, ask.heroCta, askValues(ask, 14))).not.toContain("{days}");
  });

  it("TERTUTUP: tidak satu pun kalimatnya menjanjikan uji coba lewat {days}", () => {
    const ask = landingAsk(false);
    expect(ask.needsDays).toBe(false);
    for (const key of [ask.heroCta, ask.cardCta, ask.priceNote, ask.ctaNote, ask.faqTrialAnswer]) {
      const teks = translate(dictionary, key, askValues(ask, 14));
      /* Placeholder yang tak terisi mendarat sebagai teks "{days}" di halaman
         publik — itu yang `needsDays` ada untuk mencegah. */
      expect(teks, key).not.toContain("{days}");
      expect(teks.length, key).toBeGreaterThan(5);
    }
  });

  it("TERTUTUP: ajakan hero & kartu memakai kunci yang SAMA — satu ajakan, bukan dua", () => {
    const ask = landingAsk(false);
    expect(ask.cardCta).toBe(ask.heroCta);
  });

  it("catatan harga TIDAK dihapus saat tertutup — ruangnya tetap menjelaskan", () => {
    /* Menghapusnya hanya memindahkan pertanyaan "bagaimana saya dapat akun?"
       ke kepala pembaca. */
    expect(landingAsk(false).priceNote).not.toBe(landingAsk(true).priceNote);
    expect(translate(dictionary, landingAsk(false).priceNote).length).toBeGreaterThan(20);
    /* Dan catatan penutup punya kuncinya SENDIRI saat terbuka — melebur
       keduanya pernah membuat `landing.ctaTrialNote` jadi kunci yatim. */
    expect(landingAsk(true).ctaNote).not.toBe(landingAsk(true).priceNote);
  });
});

describe("keempat permukaan memakai keputusan itu", () => {
  const BERKAS = [
    "landing-hero.tsx",
    "landing-pricing.tsx",
    "landing-closing-cta.tsx",
    "landing-faq.tsx",
  ];

  it("masing-masing memanggil `landingAsk(await resolveSelfServeSignupOpen())`", () => {
    for (const nama of BERKAS) {
      const src = baca(nama);
      expect(src, nama).toContain("landingAsk(await resolveSelfServeSignupOpen())");
    }
  });

  it("TIDAK ada yang membaca environment langsung — konsol harus didengar", () => {
    /*
     * Dulu keempatnya memanggil `selfServeSignupOpen(process.env)` langsung, dan
     * itu benar selama sakelarnya hanya hidup di `.env`. Sejak gerbangnya bisa
     * disetel dari `/operator/settings` (migration 0017), pembacaan langsung
     * menjadi kelas bug yang paling sulit dilihat: halamannya tetap benar
     * menurut dirinya sendiri, tetapi pemilik yang MEMBUKA pendaftaran dari
     * panel akan melihat halaman depan tetap menutupnya — tanpa galat, tanpa
     * jejak, dan tanpa apa pun yang bisa dicurigai.
     *
     * `resolveSelfServeSignupOpen()` yang memikul presedensi basis-data→env
     * (dan gagal-lunaknya), jadi di permukaan pendaratan hanya ia yang sah.
     */
    const pelanggar: string[] = [];
    for (const nama of BERKAS) {
      const src = baca(nama);
      if (/selfServeSignupOpen\s*\(\s*process\.env/.test(src)) {
        pelanggar.push(`${nama} — selfServeSignupOpen(process.env…)`);
      }
    }
    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Gerbang pendaftaran dibaca dari environment, melewati konsol:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nPakai `resolveSelfServeSignupOpen()` (lib/site-settings.ts)."
    ).toEqual([]);
  });

  it("tidak ada lagi yang memanggil kunci janji uji coba SECARA LANGSUNG", () => {
    /* Inilah penjaga yang sebenarnya: tanpa ia, komponen pendaratan BERIKUTNYA
       akan menulis `t("landing.heroTrialCta", …)` lagi dan janji itu kembali
       tanpa bersuara — fungsinya tetap benar, halamannya tetap berbohong. */
    const TERLARANG = [
      't("landing.heroTrialCta"',
      't("landing.pricingTrialNote"',
      't("landing.ctaTrialNote"',
      't("landing.faqTrialA"',
    ];
    const pelanggar: string[] = [];
    for (const nama of BERKAS) {
      const src = baca(nama);
      for (const pola of TERLARANG) {
        if (src.includes(pola)) pelanggar.push(`${nama} — ${pola})`);
      }
    }
    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Kunci janji uji coba dipanggil langsung:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nPakai `landingAsk(selfServeSignupOpen())` — saat pendaftaran " +
            "mandiri ditutup, kunci itu menjanjikan sesuatu yang tidak bisa " +
            "diberikan siapa pun (lib/landing-ask.ts)."
    ).toEqual([]);
  });

  it("`selfServeSignupOpen` gagal-TERTUTUP — bawaan bukan `open`", () => {
    expect(selfServeSignupOpen({})).toBe(false);
    expect(selfServeSignupOpen({ SELF_SERVE_SIGNUP: "" })).toBe(false);
    expect(selfServeSignupOpen({ SELF_SERVE_SIGNUP: "OPEN" })).toBe(false);
    expect(selfServeSignupOpen({ SELF_SERVE_SIGNUP: "true" })).toBe(false);
    expect(selfServeSignupOpen({ SELF_SERVE_SIGNUP: "open" })).toBe(true);
    expect(selfServeSignupOpen({ SELF_SERVE_SIGNUP: " open " })).toBe(true);
  });
});
