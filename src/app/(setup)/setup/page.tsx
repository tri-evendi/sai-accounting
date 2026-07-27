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
 */
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/ui/money";
import { formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/opening-balance";
import { COMPANY_NAME, COMPANY_ADDRESS, CURRENCIES } from "@/lib/constants";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SetupWizard } from "./setup-wizard";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requirePagePermission("setup.manage");
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
      <div className="w-full">
        <PageHeader
          className="mb-0"
          title={t("setup.title")}
          actions={
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t("setup.backToApp")}
              </Link>
            </Button>
          }
        />

        <div className="mt-4 mb-6 flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-strong">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{t("setup.doneNote")}</span>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("setup.identityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">{t("common.name")}</dt>
                <dd className="text-foreground">{settings.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">{t("common.address")}</dt>
                <dd className="text-foreground">{settings.address || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  {t("setup.baseCurrencyLabel")}
                </dt>
                <dd className="text-foreground">{settings.baseCurrency}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  {t("setup.fiscalYearStartLabel")}
                </dt>
                <dd className="text-foreground">{formatDate(settings.fiscalYearStart)}</dd>
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
              {/* Tabel ringkas (py-2, tanpa padding tepi) — padding rapat
                  sengaja menimpa bawaan primitif agar sama dengan tampilan
                  sebelum migrasi. */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-auto py-2 pr-4 pl-0">{t("common.account")}</TableHead>
                    <TableHead className="h-auto py-2 pr-4 pl-0 text-right">
                      {t("journal.colDebitIdr")}
                    </TableHead>
                    <TableHead className="h-auto px-0 py-2 text-right">
                      {t("journal.colCreditIdr")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journal.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="py-2 pr-4 pl-0 text-foreground">
                        <span className="text-muted-foreground">{l.account.code}</span> {l.account.name}
                        {l.memo ? (
                          <span className="block text-xs text-muted-foreground">{l.memo}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2 pr-4 pl-0 text-right tabular-nums text-foreground">
                        {Number(l.baseDebit) > 0 ? (
                          <Money value={Number(l.baseDebit)} currency="IDR" hideCurrency />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="px-0 py-2 text-right tabular-nums text-foreground">
                        {Number(l.baseCredit) > 0 ? (
                          <Money value={Number(l.baseCredit)} currency="IDR" hideCurrency />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("setup.reflectedBefore")}{" "}
                <Link href="/reports" className="text-primary underline">
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
  const [coaCount, cashAccounts, customers, suppliers] = await Promise.all([
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
    <div className="w-full">
      <PageHeader
        title={t("setup.wizardTitle")}
        description={t("setup.wizardDescription")}
      />
      <SetupWizard
        defaults={{ name: COMPANY_NAME, address: COMPANY_ADDRESS, baseCurrency: "IDR" }}
        currencies={[...CURRENCIES]}
        coaCount={coaCount}
        cashAccounts={cashAccounts}
        customers={customers}
        suppliers={suppliers}
      />
    </div>
  );
}
