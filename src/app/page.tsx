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
import { redirect } from "next/navigation";

import { LandingClosingCta } from "@/components/landing/landing-closing-cta";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingModules } from "@/components/landing/landing-modules";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingShell } from "@/components/landing/landing-shell";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

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
      <LandingPricing />
      {/* FAQ tepat SESUDAH harga: di situlah keberatan muncul — orang sudah
          melihat angkanya dan sedang mencari alasan untuk tidak melanjutkan.
          Menaruhnya sebelum harga berarti menjawab pertanyaan yang belum
          ditanyakan siapa pun. */}
      <LandingFaq />
      <LandingClosingCta />
    </LandingShell>
  );
}
