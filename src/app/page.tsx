/**
 * `/` — HALAMAN PENDARATAN publik.
 *
 * ══ APA YANG BERUBAH DAN KENAPA ════════════════════════════════════════════
 * Sampai sekarang berkas ini hanya memantulkan: bersesi → `/dashboard`, tidak
 * → `/login`. Akibatnya orang asing yang mengetik alamat produk ini disambut
 * FORMULIR KATA SANDI — layar yang berkata "Anda mestinya sudah jadi
 * pelanggan". Tautan `/register` memang ada, tetapi baru terlihat SESUDAH
 * orang itu mendarat di formulir yang bukan untuknya.
 *
 * Pemantulan untuk yang SUDAH bersesi tidak berubah: mereka tidak sedang
 * mencari halaman pemasaran, dan `/dashboard` yang menentukan tujuan
 * sebenarnya lewat `resolvePostLoginPath` (aturan tunggal yang sama dengan
 * halaman masuk).
 *
 * ══ BERKAS INI MENYUSUN, TIDAK MENGGAMBAR (issue #245) ═════════════════════
 * Sampai #245 sebagian bentuk pemasaran — hero, kisi kartu, ajakan penutup,
 * kaki halaman — ditulis langsung di sini. Sekarang tidak lagi, dan itu bukan
 * kerapian: `app/page.tsx` adalah SATU-SATUNYA berkas di luar
 * `components/landing/**` yang boleh mengimpor apa pun dari sana
 * (`tests/landing-boundary.test.ts`). Selama bentuk pemasaran masih bisa
 * ditulis di sebuah `page.tsx`, "jangan tiru gaya pendaratan di app internal"
 * tetap imbauan; setelah bentuk itu hanya ada sebagai komponen di satu
 * direktori berpagar, menyalinnya menjadi impor yang GAGAL di tes.
 *
 * ══ KENAPA HALAMAN INI BOLEH BERGAYA "LANDING" ═════════════════════════════
 * MASTER.md §Pemasaran vs App menyatakan pendaratan dalam token — skala hero,
 * bobot CTA, irama antar-seksi, lebar maksimum — dan menyatakan pula bahwa
 * keempatnya berhenti di akar yang dipasang `LandingShell` (penjaga menolak
 * penyebutan atributnya di luar direktori itu, termasuk di komentar seperti
 * ini — jadi namanya sengaja tidak ditulis). Halaman ini bukan app internal: ia
 * satu-satunya permukaan yang dibaca orang yang belum punya akun. Aturan yang
 * TETAP berlaku penuh: primitif `Button`/`Card`, ikon `@ant-design/icons`,
 * target sentuh 40px, kontras, dan tinjauan di kedua tema. Ketentuan per
 * halaman ada di `design-system/sai-accounting/pages/landing.md`.
 *
 * ══ KLAIM HARUS BISA DITELUSURI ════════════════════════════════════════════
 * Tidak ada angka yang diketik ke dalam kalimat pemasaran di sini. Harga dan
 * kuota datang dari katalog (`activePlans()`), lama uji coba dari `TRIAL_DAYS`
 * (konstanta yang sama yang menghitungnya), tarif PPN dari `lib/tax.ts`. Klaim
 * yang tidak punya sumber di kode ini — "tanpa kartu kredit", "gratis
 * selamanya" — sengaja tidak ada.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingAudience } from "@/components/landing/landing-audience";
import { LandingClosingCta } from "@/components/landing/landing-closing-cta";
import { LandingContact } from "@/components/landing/landing-contact";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingIntegrations } from "@/components/landing/landing-integrations";
import { LandingModules } from "@/components/landing/landing-modules";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingShell } from "@/components/landing/landing-shell";
import { LandingTrust } from "@/components/landing/landing-trust";
import { auth } from "@/lib/auth";
import type { ContactOutcome } from "@/lib/contact-actions";
import { APP_NAME } from "@/lib/constants";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { publicAppUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

/**
 * ══ METADATA: HALAMAN INI ADALAH YANG DIBAGIKAN, BUKAN YANG DIBUKA ═════════
 * Sampai sekarang satu-satunya metadata aplikasi ini adalah `title` +
 * `description` di `app/layout.tsx`. Untuk app internal itu memang cukup — tak
 * ada yang menempelkan alamat halaman piutang ke grup WhatsApp. Untuk halaman
 * INI tidak: ia satu-satunya permukaan yang dibagikan orang, dan tanpa
 * `openGraph` ia dibagikan sebagai tautan telanjang tanpa judul, tanpa
 * kalimat, tanpa gambar — di kanal yang justru menjadi jalur penjualan
 * sebenarnya di Indonesia.
 *
 * ⚠ TANPA `alternates.languages`, DAN ITU DISENGAJA. `hreflang` menuntut satu
 * ALAMAT per bahasa. Aplikasi ini menyimpan bahasa di COOKIE, bukan di segmen
 * rute — keputusan yang alasannya panjang dan masih berlaku
 * (`lib/i18n/config.ts` §"locale di COOKIE, bukan segmen rute `[lang]`"). Jadi
 * ketiga bahasa berbagi SATU alamat, dan `hreflang` yang menunjuk alamat yang
 * sama tiga kali bukan sekadar tidak berguna: ia memberi tahu mesin pencari
 * sesuatu yang tidak benar. Kalau kelak bahasa pindah ke `/(id|en|zh)/…`,
 * di sinilah `alternates` dipasang — bukan sebelum itu.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  const asal = publicAppUrl();
  const judul = `${APP_NAME} — ${dictionary.landing.heroHeading}`;

  return {
    metadataBase: asal,
    title: judul,
    /* Kalimat pembuka hero, bukan kalimat pemasaran kedua: dua kalimat untuk
       satu janji akan menyimpang pada hari salah satunya disunting. */
    description: dictionary.landing.heroBody,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: APP_NAME,
      title: judul,
      description: dictionary.landing.heroBody,
      url: asal.toString(),
      /* Gambarnya TIDAK disebut di sini — `app/opengraph-image.tsx` sudah
         terpasang otomatis oleh Next dan menyebutnya kedua kali justru
         menimpanya dengan jalur yang harus dijaga sendiri. */
    },
    twitter: {
      card: "summary_large_image",
      title: judul,
      description: dictionary.landing.heroBody,
    },
    robots: { index: true, follow: true },
  };
}

/** Hasil kiriman formulir kontak yang sah muncul di `?kontak=`. */
const HASIL_KONTAK = new Set<ContactOutcome>([
  "terkirim",
  "gagal",
  "takbenar",
  "terlalu-sering",
]);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session) redirect("/dashboard");

  /*
   * Hasil formulir kontak dibaca dari kueri, bukan dari state — itulah yang
   * membuat formulirnya bekerja tanpa JavaScript (alasan lengkap di
   * `lib/contact-actions.ts`). Nilainya DISARING terhadap daftar yang sah:
   * `?kontak=` bisa diisi siapa saja, dan nilai sembarang tidak boleh menjadi
   * kunci pencarian pesan.
   */
  const kontak = (await searchParams).kontak;
  const hasilKontak = HASIL_KONTAK.has(kontak as ContactOutcome)
    ? (kontak as ContactOutcome)
    : undefined;

  return (
    <LandingShell>
      <LandingHero />
      {/* Urutan disengaja: empat kartu "yang Anda dapatkan" menjawab "kenapa
          produk ini", bagian modul menjawab "apakah PEKERJAAN SAYA ada di
          dalamnya", dan baru sesudah itu harga. Menaruh harga sebelum jawaban
          itu memaksa orang menimbang angka untuk sesuatu yang belum ia tahu
          isinya. */}
      <LandingFeatures />
      <LandingModules />
      {/* "Untuk siapa" SESUDAH daftar modul, bukan sesudah manfaat (#398):
          kartunya menyebut modul lewat NAMANYA, jadi ia rujukan ke sesuatu
          yang baru saja dibaca — "dari sepuluh itu, mana yang untuk saya".
          Lalu "Integrasi & jalan keluar data" sebagai pita di antara dua
          seksi polos berkartu nada (untuk siapa, kepercayaan): tanpa pita
          itu halaman memajang tiga kisi kartu bernada berturut-turut. Alasan
          lengkapnya di kepala kedua berkas komponennya. */}
      <LandingAudience />
      <LandingIntegrations />
      {/* Bukti SEBELUM harga, dan itu urutan yang disengaja: dua keberatan
          terbesar pada pembukuan multi-PT — "apakah data saya bisa tercampur"
          dan "apakah saya bisa keluar lagi" — muncul saat orang membayangkan
          memakainya, bukan saat ia melihat angkanya. Menjawabnya sesudah harga
          berarti menjawabnya kepada orang yang sudah pergi. */}
      <LandingTrust />
      <LandingPricing />
      {/* FAQ tepat SESUDAH harga: di situlah keberatan muncul — orang sudah
          melihat angkanya dan sedang mencari alasan untuk tidak melanjutkan.
          Menaruhnya sebelum harga berarti menjawab pertanyaan yang belum
          ditanyakan siapa pun. */}
      <LandingFaq />
      {/* Kontak SESUDAH FAQ: enam pertanyaan menjawab keberatan umum, dan
          yang tersisa sesudahnya memang perlu orang. Menaruhnya sebelum FAQ
          berarti meminta orang mengetik pertanyaan yang jawabannya ada satu
          layar di bawahnya. */}
      <LandingContact outcome={hasilKontak} />
      <LandingClosingCta />
    </LandingShell>
  );
}
