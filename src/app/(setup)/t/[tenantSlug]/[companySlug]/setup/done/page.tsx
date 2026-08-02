/**
 * "Penyiapan selesai" — satu layar antara wizard dan pekerjaan pertama.
 *
 * ── Kenapa layar ini ada ────────────────────────────────────────────────────
 *
 * Sampai audit ini, wizard menutup dirinya dengan `router.push("/reports")`.
 * Hal pertama yang dilihat pelanggan baru setelah menyelesaikan penyiapan
 * adalah karena itu sebuah LAPORAN atas perusahaan yang baru punya satu jurnal
 * — permukaan "melihat" yang diberikan kepada orang yang belum punya apa pun
 * untuk dilihat, dan yang tidak menyebut satu kata pun tentang apa yang barusan
 * terjadi atau apa yang harus dikerjakan berikutnya.
 *
 * Layar ini mengambil satu tugas saja: MENYATAKAN APA YANG BARU DIBUAT, dengan
 * tautan agar bisa langsung diperiksa. Ia sengaja TIDAK ikut mendaftar
 * "langkah pertama" — daftar itu tinggal di beranda (`FirstStepsPanel`), tempat
 * ia bisa mencentang dirinya sendiri saat pekerjaannya benar-benar dikerjakan.
 * Dua layar yang sama-sama berkata "sekarang lakukan ini" hanya membuat
 * keduanya lebih mudah diabaikan.
 *
 * Tinggal di grup rute `(setup)` supaya kerangkanya masih ramping: satu jalan
 * ke depan, tanpa ~40 menu yang belum ada isinya. Tombol utamanya adalah pintu
 * keluar dari kerangka itu.
 */
import { Link } from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenCheck, CheckCircle2, Scale } from "lucide-react";

import { requirePagePermission } from "@/lib/page-auth";
import { tenantPath, type TenantScopedParams } from "@/lib/tenant-routes";
import { getCompanySettings } from "@/lib/opening-balance";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function SetupDonePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("setup.manage", params);
  const { tenantSlug, companySlug } = await params;

  const settings = await getCompanySettings();

  // Belum disiapkan = layar ini tidak punya apa pun untuk dinyatakan. Bukan
  // jalan buntu: kirim ke wizard yang memang belum dijalankan — di jalur
  // perusahaan ini, bukan jalur lama yang akan dipantulkan ke PT di sesi.
  if (!settings?.isSetup) redirect(tenantPath(tenantSlug, companySlug, "/setup"));

  const t = await getT();

  const journal = settings.openingJournalId
    ? await prisma.journal.findUnique({
        where: { id: settings.openingJournalId },
        select: { id: true, number: true },
      })
    : null;

  const facts = [
    { label: t("common.name"), value: settings.name },
    { label: t("setup.fiscalYearStartLabel"), value: formatDate(settings.fiscalYearStart) },
    { label: t("setup.baseCurrencyLabel"), value: settings.baseCurrency },
  ];

  return (
    <div className="w-full">
      <PageHeader title={t("setup.doneTitle")} description={t("setup.doneDescription")} />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-strong">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>{t("setup.doneBanner", { date: formatDate(settings.fiscalYearStart) })}</p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm font-medium text-muted-foreground">{fact.label}</dt>
                <dd className="mt-0.5 text-base font-semibold text-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {/*
           * Tautan pemeriksaan, bukan hiasan.
           *
           * Saldo awal adalah satu-satunya angka di aplikasi ini yang TIDAK
           * lahir dari sebuah transaksi yang bisa ditelusuri kembali — ia
           * diketik sekali lalu menjadi titik nol semua laporan sesudahnya.
           * Karena itu ia harus bisa dibuka justru pada saat ia masih segar di
           * ingatan orang yang mengetiknya, bukan berbulan-bulan kemudian
           * ketika neracanya tidak cocok.
           */}
          {journal && (
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
              <Button asChild variant="outline">
                <Link href={`/journal/${journal.id}`}>
                  <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                  {t("setup.doneViewJournal", { number: journal.number })}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/reports/balance-sheet">
                  <Scale className="h-4 w-4" aria-hidden="true" />
                  {t("reports.balanceSheetTitle")}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/dashboard">
          {t("setup.doneStartWorking")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
