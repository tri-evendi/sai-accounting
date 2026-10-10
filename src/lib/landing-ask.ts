/**
 * APA YANG BOLEH DIJANJIKAN HALAMAN PENDARATAN — satu keputusan, satu tempat.
 *
 * ══ KENAPA MODUL INI ADA ═══════════════════════════════════════════════════
 * Sejak pendaftaran mandiri bisa DITUTUP (`SELF_SERVE_SIGNUP`, Fase A
 * komersialisasi), halaman pendaratan punya satu cara baru untuk berbohong:
 * empat tombolnya tetap berbunyi "Coba gratis 14 hari" dan dua catatan di
 * bawahnya tetap menyebut uji coba — lalu mendarat di layar yang mengatakan
 * pendaftaran sedang ditutup.
 *
 * Itu bukan sekadar janggal. Halaman ini adalah satu-satunya permukaan yang
 * dibaca orang yang BELUM punya akun, dan satu-satunya alasan ia ada adalah
 * tombol-tombol itu. Menjanjikan sesuatu yang tidak bisa diberikan membuang
 * pengunjung yang paling bersemangat tepat di langkah terakhir.
 *
 * ══ BENTUKNYA: KUNCI KAMUS, BUKAN KALIMAT ══════════════════════════════════
 * Modul ini tidak memuat satu kalimat pun — ia memulangkan KUNCI, dan kalimatnya
 * disusun di batas tampilan oleh `t()`. Dua alasannya:
 *
 *   • tiga bahasa (`tests/i18n.test.ts` menuntut kelengkapannya), dan kalimat
 *     yang dipaku di sini akan tetap berbahasa Indonesia bagi pembaca en/zh;
 *   • kunci `landing.*` BISA DISUNTING OPERATOR dari `/operator/content`
 *     (tabel `site_contents`). Kalimat yang dipaku di kode diam-diam lolos
 *     dari permukaan yang dibuat untuk menyuntingnya.
 *
 * ══ MURNI: MENERIMA BOOLEAN, TIDAK MEMBACANYA SENDIRI ══════════════════════
 * `signupOpen` dioper, bukan dibaca dari `process.env` di dalam sini — supaya
 * kedua cabangnya bisa diuji tanpa menyentuh environment, dan supaya tidak ada
 * tempat KEDUA yang menjawab "apakah pendaftaran terbuka?" (jawabannya milik
 * `selfServeSignupOpen` di `lib/registration.ts`, satu-satunya).
 */

import type { DictionaryKey } from "@/lib/i18n/dictionary";

export interface LandingAsk {
  /**
   * Label ajakan utama di HERO. Saat terbuka ia menyebut lama uji coba dan
   * karena itu menuntut `{ days }`; saat tertutup ia tidak menuntut apa pun —
   * `needsDays` yang mengatakannya, supaya placeholder yang tak terisi tidak
   * mendarat sebagai teks "{days}" di halaman publik.
   */
  heroCta: DictionaryKey;
  /** Label ajakan di KARTU PAKET dan di ajakan penutup. */
  cardCta: DictionaryKey;
  /**
   * Catatan di bawah HARGA. Saat tertutup ia BUKAN null melainkan kalimat
   * lain: ruang itu tetap harus menjelaskan bagaimana orang mendapatkan akun —
   * menghapusnya hanya memindahkan pertanyaannya ke kepala pembaca.
   */
  priceNote: DictionaryKey;
  /**
   * Catatan di bawah AJAKAN PENUTUP — kunci yang BERBEDA dari `priceNote`, dan
   * itu disengaja: di sebelah harga yang dijelaskan adalah apa yang didapat
   * untuk angka itu, sementara di penutup yang dijelaskan adalah langkah
   * berikutnya. Versi pertama modul ini meleburkan keduanya, dan akibatnya
   * `landing.ctaTrialNote` menjadi kunci yatim — satu kalimat yang punya
   * bunyinya sendiri, hilang tanpa ada yang memutuskan menghilangkannya
   * (ditangkap `tests/i18n-orphan-keys`).
   */
  ctaNote: DictionaryKey;
  /** Jawaban FAQ "apakah ada uji coba?" — pertanyaannya tetap sah ditanyakan. */
  faqTrialAnswer: DictionaryKey;
  /** Apakah kunci di atas memuat placeholder `{days}`. */
  needsDays: boolean;
}

/** Terbuka = janji uji coba; tertutup = janji PENAWARAN. Tidak ada keadaan ketiga. */
export function landingAsk(signupOpen: boolean): LandingAsk {
  if (signupOpen) {
    return {
      heroCta: "landing.heroTrialCta",
      cardCta: "landing.heroPrimary",
      priceNote: "landing.pricingTrialNote",
      ctaNote: "landing.ctaTrialNote",
      faqTrialAnswer: "landing.faqTrialA",
      needsDays: true,
    };
  }
  return {
    heroCta: "landing.quoteCta",
    cardCta: "landing.quoteCta",
    /* Saat tertutup KEDUANYA memakai kalimat yang sama, dan itu bukan
       kelalaian: yang perlu dikatakan di kedua tempat identik — "akun dibuka
       lewat penawaran". Dua kalimat berbeda untuk satu keadaan hanya akan
       menyimpang pada hari salah satunya disunting operator. */
    priceNote: "landing.quoteNote",
    ctaNote: "landing.quoteNote",
    faqTrialAnswer: "landing.faqTrialAQuote",
    needsDays: false,
  };
}

/**
 * Nilai placeholder untuk `t()` — `{ days }` hanya saat memang dibutuhkan.
 *
 * Dipisah supaya pemanggilnya tidak perlu menulis cabang `needsDays ? … : …`
 * di setiap tempat: `t(ask.heroCta, askValues(ask, TRIAL_DAYS))` benar di kedua
 * keadaan. `t()` mengabaikan nilai berlebih, tapi kunci yang MEMBUTUHKAN
 * `{days}` dan tidak mendapatkannya merender "{days}" apa adanya — itu yang
 * dicegah di sini.
 */
export function askValues(ask: LandingAsk, trialDays: number): { days: number } | undefined {
  return ask.needsDays ? { days: trialDays } : undefined;
}
