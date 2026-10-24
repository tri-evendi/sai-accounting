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
 *     (tabel `site_content_entries`). Kalimat yang dipaku di kode diam-diam lolos
 *     dari permukaan yang dibuat untuk menyuntingnya.
 *
 * ══ MURNI: MENERIMA BOOLEAN, TIDAK MEMBACANYA SENDIRI ══════════════════════
 * `signupOpen` dioper, bukan dibaca dari `process.env` di dalam sini — supaya
 * kedua cabangnya bisa diuji tanpa menyentuh environment, dan supaya tidak ada
 * tempat KEDUA yang menjawab "apakah pendaftaran terbuka?" (jawabannya milik
 * `selfServeSignupOpen` di `lib/registration.ts`, satu-satunya).
 */

import type { DictionaryKey } from "@sai/core/i18n/dictionary";

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
  /** Label tombol utama di BILAH NAVIGASI (menempel sepanjang gulungan). */
  navCta: DictionaryKey;
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

/**
 * Terbuka = janji uji coba; tertutup = alur DEMO-FIRST (keputusan pemilik
 * 24 Okt 2026): "Jadwalkan demo" di hero & bilah navigasi, "Minta penawaran" di
 * kartu paket & penutup. Tidak ada keadaan ketiga.
 *
 * Kedua ajakan tertutup tetap menuju `/register` — halaman yang, saat tertutup,
 * MENJADI halaman kontak: langkah demo → penawaran → akun uji coba, dan tombol
 * WhatsApp/surel dari `contactChannels()` (`tests/button-emphasis` mengunci
 * satu tujuan untuk ajakan yang diulang).
 */
export function landingAsk(signupOpen: boolean): LandingAsk {
  if (signupOpen) {
    return {
      heroCta: "landing.heroTrialCta",
      cardCta: "landing.heroPrimary",
      navCta: "landing.signUp",
      priceNote: "landing.pricingTrialNote",
      ctaNote: "landing.ctaTrialNote",
      faqTrialAnswer: "landing.faqTrialA",
      needsDays: true,
    };
  }
  return {
    /* Demo dulu: pembeli multi-PT tidak membeli secara swalayan
       (`docs/KOMERSIALISASI.md` §2), dan tanpa gerbang pembayaran jalan masuk
       satu-satunya adalah percakapan. */
    heroCta: "landing.demoCta",
    cardCta: "landing.quoteCta",
    navCta: "landing.demoCta",
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

/**
 * Parameter `/register` yang meminta LAYAR PENAWARAN walau pendaftaran mandiri
 * terbuka — `/register?quote=1`.
 */
export const QUOTE_PARAM = "quote";

/**
 * Ke mana pengunjung dikirim untuk MEMINTA PENAWARAN saat harga publik
 * disembunyikan (migration platform 0013): tautan "Minta penawaran" di bilah
 * atas & kaki, dan tujuan pengalihan `/pricing`.
 *
 * Tertutup → `/register`, yang saat itu memang halaman kontak (tujuan yang
 * sama dengan ajakan demo-first di atas). Terbuka → `/register` adalah
 * formulir DAFTAR, dan orang yang meminta penawaran tidak sedang mendaftar;
 * `?quote=1` membuat halaman yang sama merender layar penawarannya. Satu
 * halaman kontak, bukan dua.
 */
export function quoteContactHref(signupOpen: boolean): string {
  return signupOpen ? `/register?${QUOTE_PARAM}=1` : "/register";
}
