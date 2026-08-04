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
 * ══ KENAPA HALAMAN INI BOLEH BERGAYA "LANDING" ═════════════════════════════
 * MASTER.md §Anti-Patterns menolak gaya landing/CTA — dan penolakan itu
 * berlaku untuk APP INTERNAL ("hero raksasa, CTA 'Start trial' di app
 * internal"). Halaman ini bukan app internal: ia satu-satunya permukaan yang
 * dibaca orang yang belum punya akun. Aturan yang TETAP berlaku penuh: token
 * semantik (bukan kelas palet mentah), primitif `Button`/`Card`, ikon
 * `lucide-react`, target sentuh 40px, kontras, dan tinjauan di kedua tema.
 * Ketentuannya ditulis di `design-system/sai-accounting/pages/landing.md`,
 * yang meng-override MASTER untuk halaman ini.
 *
 * ══ KLAIM HARUS BISA DITELUSURI ════════════════════════════════════════════
 * Tidak ada angka yang diketik ke dalam kalimat pemasaran di sini. Harga dan
 * kuota datang dari katalog (`activePlans()`), lama uji coba dari `TRIAL_DAYS`
 * (konstanta yang sama yang menghitungnya), tarif PPN dari `lib/tax.ts`. Klaim
 * yang tidak punya sumber di kode ini — "tanpa kartu kredit", "gratis
 * selamanya" — sengaja tidak ada.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, FileText, Languages, ShieldCheck } from "lucide-react";

import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingModules } from "@/components/landing/landing-modules";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  const t = await getT();

  const features = [
    {
      icon: Building2,
      title: t("landing.featureCompaniesTitle"),
      body: t("landing.featureCompaniesBody"),
    },
    {
      icon: ShieldCheck,
      title: t("landing.featureRolesTitle"),
      body: t("landing.featureRolesBody"),
    },
    { icon: FileText, title: t("landing.featureTaxTitle"), body: t("landing.featureTaxBody") },
    {
      icon: Languages,
      title: t("landing.featureLanguageTitle"),
      body: t("landing.featureLanguageBody"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Pengguna keyboard mendarat di tautan ini lebih dulu — tanpa itu ia
          harus menyusuri seluruh bilah atas sebelum sampai ke isi. */}
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("landing.skipToContent")}
      </a>

      <LandingNav />

      <main id="isi" className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Aksen yang sama dengan panel brand layar masuk: lembut, sekali,
              dan `pointer-events-none` supaya tidak pernah memakan klik. */}
          <div
            className="pointer-events-none absolute inset-0 bg-primary/[0.06]"
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("landing.heroHeading")}
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                {t("landing.heroBody")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">{t("landing.heroPrimary")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">{t("landing.heroSecondary")}</Link>
                </Button>
              </div>
              {/* Orang yang diundang rekan kerja TIDAK boleh mendaftar sendiri:
                  akun kedua membuatnya jadi tenant baru, bukan anggota tim yang
                  mengundangnya. Kalimat ini menahannya sebelum ia menekan
                  tombol yang salah. */}
              <p className="mt-4 text-sm text-muted-foreground">{t("landing.heroNote")}</p>
            </div>
          </div>
        </section>

        {/* ── Yang Anda dapatkan ─────────────────────────────────────────── */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("landing.featuresHeading")}
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature.title}>
                  <Card className="h-full">
                    <CardContent className="flex gap-4">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                        aria-hidden
                      >
                        <feature.icon className="size-5" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {feature.body}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Urutan disengaja: empat kartu di atas menjawab "kenapa produk ini",
            bagian modul menjawab "apakah PEKERJAAN SAYA ada di dalamnya", dan
            baru sesudah itu harga. Menaruh harga sebelum jawaban itu memaksa
            orang menimbang angka untuk sesuatu yang belum ia tahu isinya. */}
        <LandingModules />

        <LandingPricing />

        {/* FAQ tepat SESUDAH harga: di situlah keberatan muncul — orang sudah
            melihat angkanya dan sedang mencari alasan untuk tidak melanjutkan.
            Menaruhnya sebelum harga berarti menjawab pertanyaan yang belum
            ditanyakan siapa pun. */}
        <LandingFaq />

        {/* ── Ajakan penutup ─────────────────────────────────────────────── */}
        <section className="border-t border-border py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("landing.ctaHeading")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
              {t("landing.ctaBody")}
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/register">{t("landing.heroPrimary")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold text-foreground">{APP_NAME}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("landing.footerTagline")}</p>
          </div>
          {/* Pemilih bahasa & tema JUGA di sini, bukan hanya di bilah atas: di
              bawah 640px bilah atas menyembunyikan keduanya agar tombol Masuk
              dan Daftar tidak menyusut di bawah target sentuh 40px. Tanpa
              salinan ini, pengunjung ponsel — termasuk pembaca Mandarin yang
              belum punya akun — tidak punya SATU pun cara mengganti bahasa,
              dan menu akun yang biasanya menyediakannya baru ada setelah
              masuk. */}
          <div className="flex items-center gap-2 sm:hidden">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <nav aria-label={t("landing.footerLegal")} className="flex flex-col gap-2 text-sm">
            <Link
              href="/terms"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("landing.footerTerms")}
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("landing.footerPrivacy")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
