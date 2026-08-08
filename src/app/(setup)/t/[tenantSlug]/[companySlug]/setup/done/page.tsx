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
 *
 * Sumber warnanya sama dengan `../page.tsx` (issue #203): seluruhnya token AntD
 * lewat `var(--ant-…)`, di dalam maupun di luar `Card` — sejak #227 kelas
 * `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root layout, jadi variabelnya tidak
 * lagi bergantung pada ada-tidaknya komponen AntD di atasnya.
 */
import { redirect } from "next/navigation";
import { AccountBookOutlined, ArrowRightOutlined, CheckCircleOutlined, ReconciliationOutlined } from "@ant-design/icons";
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

/** Pita "sudah dibukukan" — DI LUAR `Card`, tapi tetap token AntD (kepala). */
const DONE_BANNER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 24,
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid var(--ant-color-success-border)",
  background: "var(--ant-color-success-bg)",
  fontSize: 14,
  color: "var(--ant-color-money-positive)",
};

/**
 * Tiga fakta yang membagi lebarnya sendiri — pengganti `sm:grid-cols-3`.
 * Turun jadi satu kolom di 375px tanpa satu pun media query.
 */
const FACTS_GRID: React.CSSProperties = {
  display: "grid",
  gap: 16,
  margin: 0,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
};

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
    <div style={{ width: "100%" }}>
      <PageHeader title={t("setup.doneTitle")} description={t("setup.doneDescription")} />

      <div style={DONE_BANNER}>
        <CheckCircleOutlined aria-hidden="true" style={{ fontSize: 20, marginTop: 2, flexShrink: 0 }} />
        <p style={{ margin: 0 }}>
          {t("setup.doneBanner", { date: formatDate(settings.fiscalYearStart) })}
        </p>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <CardContent>
          <dl style={FACTS_GRID}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt
                  style={{
                    fontSize: "var(--ant-font-size)",
                    fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  {fact.label}
                </dt>
                <dd
                  style={{
                    margin: "var(--ant-margin-xxs) 0 0",
                    fontSize: "var(--ant-font-size-lg)",
                    fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                    color: "var(--ant-color-text)",
                  }}
                >
                  {fact.value}
                </dd>
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid var(--ant-color-border-secondary)",
              }}
            >
              <Button href={`/journal/${journal.id}`} variant="outline">
                <AccountBookOutlined aria-hidden="true" />
                {t("setup.doneViewJournal", { number: journal.number })}
              </Button>
              <Button href="/reports/balance-sheet" variant="outline">
                <ReconciliationOutlined aria-hidden="true" />
                {t("reports.balanceSheetTitle")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Button href="/dashboard" variant="primary" size="lg">
        {t("setup.doneStartWorking")}
        <ArrowRightOutlined aria-hidden="true" />
      </Button>
    </div>
  );
}
