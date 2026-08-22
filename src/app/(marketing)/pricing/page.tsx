/**
 * `/pricing` — HALAMAN HARGA publik (issue #399).
 *
 * ══ KENAPA ADA, PADAHAL `/` SUDAH PUNYA SEKSI HARGA ════════════════════════
 * Semua situs pembukuan yang ditinjau di #397 punya alamat harga sendiri; kita
 * hanya punya jangkar `/#harga`. Jangkar bukan alamat:
 * kueri "harga software akuntansi" tidak punya halaman tujuan, dan tautan yang
 * ditempel orang ke WhatsApp menuju ke halaman pendaratan yang harus digulung
 * dulu. Halaman ini memberi katalog paket alamatnya sendiri — kanonik sendiri,
 * judul sendiri, masuk `sitemap.ts`.
 *
 * ══ KOMPONEN YANG SAMA, BUKAN SALINAN ══════════════════════════════════════
 * Isinya `LandingPricing` + `LandingFaq` — komponen yang PERSIS SAMA dengan
 * yang dirender `/`. Tidak ada satu pun kalimat harga yang ditulis di sini:
 * harga & kuota tetap dari `activePlans()`, PPN dari `lib/tax.ts`, uji coba
 * dari `TRIAL_DAYS`, dan salinan kedua yang bisa menyimpang tidak pernah
 * lahir. Yang berbeda hanya TINGKAT judulnya: di sini seksi harga adalah yang
 * pertama, jadi judulnya `<h1>` (`headingLevel`), bukan `<h2>` seperti di `/`.
 *
 * ══ PENGUNJUNG BERSESI DIPANTULKAN — SAMA SEPERTI `/` ═══════════════════════
 * Halaman ini memakai `LandingShell` yang bilahnya memajang "Masuk"/"Daftar"
 * kepada siapa pun; bagi orang yang SUDAH masuk itu bilah yang salah, dan
 * pilihan paketnya ada di `/platform/billing/plans` (yang juga bisa mengubah
 * paket). Jadi aturannya disamakan dengan `/`: bersesi → `/dashboard`, yang
 * menentukan tujuan sebenarnya lewat `resolvePostLoginPath`.
 *
 * Berkas ini adalah pintu masuk KEDUA ke `components/landing/**`, terdaftar di
 * `PINTU_MASUK` (`tests/landing-boundary.test.ts`), dan jalurnya dilepaskan
 * `isPublicPath` di `proxy.ts` (dijaga `tests/authz-coverage`).
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingShell } from "@/components/landing/landing-shell";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { publicAppUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

/**
 * Metadata sendiri, kanonik sendiri (`/pricing`) — tanpa itu mesin pencari
 * membaca halaman ini sebagai salinan `/` dan tetap tidak punya alamat untuk
 * kueri harga. Judul & deskripsinya kalimat seksi harga yang SAMA dengan yang
 * dirender di bawah; gambar pratinjau (`opengraph-image.tsx`) diwarisi dari
 * grup `(marketing)`, jadi tidak disebut di sini.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  const asal = publicAppUrl();
  const judul = `${APP_NAME} — ${dictionary.landing.pricingHeading}`;

  return {
    metadataBase: asal,
    title: judul,
    description: dictionary.landing.pricingBody,
    alternates: { canonical: "/pricing" },
    openGraph: {
      type: "website",
      siteName: APP_NAME,
      title: judul,
      description: dictionary.landing.pricingBody,
      url: new URL("/pricing", asal).toString(),
    },
    twitter: {
      card: "summary_large_image",
      title: judul,
      description: dictionary.landing.pricingBody,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PricingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <LandingShell>
      <LandingPricing headingLevel="h1" />
      {/* FAQ tepat sesudah harga, dengan alasan yang sama dengan di `/`: di
          situlah keberatan muncul. Kontak & ajakan penutup sengaja TIDAK
          ikut — kaki halaman sudah menautkan `/#kontak`, dan tiap kartu paket
          sudah memikul ajakannya sendiri. */}
      <LandingFaq />
    </LandingShell>
  );
}
