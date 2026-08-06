/**
 * Setup wizard + Saldo Awal (issue #20).
 *
 * Runs ONCE: the first time, it walks a Manager through company identity, base
 * currency + fiscal year, confirming the seeded COA, and entering opening
 * balances — producing one balanced opening journal. After that (`is_setup`), it
 * shows a read-only summary instead, and the API refuses a second run.
 *
 * Berada di grup rute `(setup)`, bukan `(dashboard)` (issue #103): grup rute
 * tidak mengubah URL — halamannya tetap `/setup` — tapi kerangkanya jadi kepala
 * ramping tanpa sidebar, supaya layar wajib pertama tidak menawarkan ~40 menu
 * yang semuanya memantul kembali ke sini lewat gerbang setup.
 *
 * Konsekuensinya untuk ringkasan (setelah setup selesai): halaman ini masih
 * dibuka dari menu samping, dan di kerangka ramping tidak ada menu itu untuk
 * kembali. Karena itu HANYA cabang ringkasan yang membawa tautan kembali ke
 * Beranda — cabang wizard sengaja tidak: di sana gerbang setup memang belum
 * mengizinkan halaman lain, dan tautan yang memantul justru jebakan yang sama.
 *
 * ── Dua sumber warna di berkas ini, dan garis yang memisahkannya (#200) ───
 * Server component: tanpa `antd`, tanpa `theme.useToken()`. Variabel `--ant-…`
 * hanya teratasi DI DALAM sebuah komponen AntD (#227), dan di halaman ini yang
 * menjadi pembawanya adalah `Card`. Jadi:
 *
 *  • di dalam `Card` (daftar identitas, tabel jurnal, tautan neraca) → token
 *    AntD lewat `--ant-…`, sama seperti beranda (#199);
 *  • di LUARnya (pita "penyiapan selesai" yang berdiri sendiri di atas kartu
 *    pertama) → token `:root` aplikasi, karena di sana `--ant-…` akan jatuh
 *    diam-diam ke warisan.
 *
 * Pita itu adalah calon issue tersendiri: sebuah primitif `Notice` (AntD
 * `Alert` sebagai daun client) akan menghapus cabang kedua di atas — lihat
 * badan PR issue ini.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { Money } from "@/components/ui/money";
import { formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/opening-balance";
import { CURRENCIES } from "@/lib/constants";
import { getCompanyIdentity } from "@/lib/company-identity";
import { ArrowLeftOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { SetupWizard } from "./setup-wizard";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Pita "penyiapan selesai" — DI LUAR `Card`, jadi token `:root` aplikasi.
 * Ikon + kalimat, bukan warna sendirian (MASTER.md §Anti-Patterns).
 */
const DONE_NOTE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 24,
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid var(--success)",
  background: "var(--success-soft)",
  fontSize: 14,
  color: "var(--success-strong)",
};

/** Label istilah di daftar identitas — di dalam `Card`, jadi token AntD. */
const TERM: React.CSSProperties = {
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text-secondary)",
};

const DEFINITION: React.CSSProperties = {
  margin: 0,
  color: "var(--ant-color-text)",
};

export default async function SetupPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("setup.manage", params);
  const t = await getT();

  const settings = await getCompanySettings();

  // ── Already set up → read-only summary (run-once) ──
  if (settings?.isSetup) {
    const journal = settings.openingJournalId
      ? await prisma.journal.findUnique({
          where: { id: settings.openingJournalId },
          include: { lines: { include: { account: true } } },
        })
      : null;

    return (
      <div style={{ width: "100%" }}>
        <PageHeader
          title={t("setup.title")}
          actions={
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <ArrowLeftOutlined aria-hidden="true" />
                {t("setup.backToApp")}
              </Link>
            </Button>
          }
        />

        <div style={DONE_NOTE}>
          <CheckCircleOutlined aria-hidden="true" style={{ fontSize: 20, marginTop: 2, flexShrink: 0 }} />
          <span>{t("setup.doneNote")}</span>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <CardHeader>
            <CardTitle>{t("setup.identityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                margin: 0,
                fontSize: "var(--ant-font-size)",
              }}
            >
              <div>
                <dt style={TERM}>{t("common.name")}</dt>
                <dd style={DEFINITION}>{settings.name}</dd>
              </div>
              <div>
                <dt style={TERM}>{t("common.address")}</dt>
                <dd style={DEFINITION}>{settings.address || "—"}</dd>
              </div>
              <div>
                <dt style={TERM}>{t("setup.baseCurrencyLabel")}</dt>
                <dd style={DEFINITION}>{settings.baseCurrency}</dd>
              </div>
              <div>
                <dt style={TERM}>{t("setup.fiscalYearStartLabel")}</dt>
                <dd style={DEFINITION}>{formatDate(settings.fiscalYearStart)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {journal && (
          <Card>
            <CardHeader>
              <CardTitle>{t("setup.openingJournalTitle", { number: journal.number })}</CardTitle>
            </CardHeader>
            <CardContent>
              {/*
                * Tabel ringkas lewat `size="small"` (issue #229). Sebelum prop
                * itu ada, kerapatan hanya bisa dicapai dengan menimpa padding
                * primitif kelas demi kelas di setiap sel — sembilan kelas
                * Tailwind untuk sesuatu yang `DataTable` sudah punya, dan yang
                * karena itu memaksa memilih perender menurut GAYA alih-alih
                * menurut kebutuhan interaktivitas (kebalikan dari aturan #189).
                */}
              <StaticTable
                columns={[
                  {
                    key: "account",
                    title: t("common.account"),
                    align: "left",
                    render: (_v, l: (typeof journal.lines)[number]) => (
                      <>
                        <span style={{ color: "var(--ant-color-text-secondary)" }}>
                          {l.account.code}
                        </span>{" "}
                        {l.account.name}
                        {l.memo ? (
                          <span
                            style={{
                              display: "block",
                              fontSize: "var(--ant-font-size-sm)",
                              color: "var(--ant-color-text-secondary)",
                            }}
                          >
                            {l.memo}
                          </span>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: "debit",
                    title: t("journal.colDebitIdr"),
                    align: "right",
                    render: (_v, l: (typeof journal.lines)[number]) =>
                      Number(l.baseDebit) > 0 ? (
                        <Money value={Number(l.baseDebit)} currency="IDR" hideCurrency />
                      ) : (
                        "—"
                      ),
                  },
                  {
                    key: "credit",
                    title: t("journal.colCreditIdr"),
                    align: "right",
                    render: (_v, l: (typeof journal.lines)[number]) =>
                      Number(l.baseCredit) > 0 ? (
                        <Money value={Number(l.baseCredit)} currency="IDR" hideCurrency />
                      ) : (
                        "—"
                      ),
                  },
                ]}
                rows={journal.lines}
                rowKey={(l) => l.id}
                size="small"
              />
              <p
                style={{
                  marginTop: "var(--ant-margin)",
                  marginBottom: 0,
                  fontSize: "var(--ant-font-size)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("setup.reflectedBefore")}{" "}
                <Link
                  href="/reports"
                  style={{ color: "var(--ant-color-link)", textDecoration: "underline" }}
                >
                  {t("reports.balanceSheetTitle")}
                </Link>{" "}
                {t("setup.reflectedAfter", { date: formatDate(settings.fiscalYearStart) })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── First run → the wizard ──
  const [identity, coaCount, cashAccounts, customers, suppliers] = await Promise.all([
    getCompanyIdentity(),
    prisma.account.count({ where: { isActive: true } }),
    prisma.account.findMany({
      where: { type: "cash_bank", isActive: true },
      select: { id: true, code: true, name: true, currency: true },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        title={t("setup.wizardTitle")}
        description={t("setup.wizardDescription")}
      />
      {/* Prefill dari identitas perusahaan AKTIF (setting → nama registry PT
          ini), BUKAN konstanta pemasang pertama — satu "Lanjut" yang terlalu
          cepat tidak boleh menulis badan hukum PT lain ke buku PT ini. */}
      <SetupWizard
        defaults={{
          name: identity.name,
          address: identity.address,
          baseCurrency: "IDR",
        }}
        currencies={[...CURRENCIES]}
        coaCount={coaCount}
        cashAccounts={cashAccounts}
        customers={customers}
        suppliers={suppliers}
      />
    </div>
  );
}
