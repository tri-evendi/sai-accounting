/**
 * Setup wizard + Saldo Awal (issue #20).
 *
 * Runs ONCE: the first time, it walks a Manager through company identity, base
 * currency + fiscal year, confirming the seeded COA, and entering opening
 * balances — producing one balanced opening journal. After that (`is_setup`), it
 * shows a read-only summary instead, and the API refuses a second run.
 */
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/opening-balance";
import { COMPANY_NAME, COMPANY_ADDRESS, CURRENCIES } from "@/lib/constants";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requirePageSession(["bos"]);

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
      <div className="max-w-3xl">
        <PageHeader className="mb-0" title="Setup Perusahaan" />

        <div className="mt-4 mb-6 flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-strong">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            Perusahaan sudah selesai disiapkan. Wizard hanya dijalankan sekali — di bawah
            ini ringkasan saldo awal yang tercatat.
          </span>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Identitas Perusahaan</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">Nama</dt>
                <dd className="text-foreground">{settings.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Alamat</dt>
                <dd className="text-foreground">{settings.address || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Mata Uang Dasar</dt>
                <dd className="text-foreground">{settings.baseCurrency}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Awal Tahun Buku</dt>
                <dd className="text-foreground">{formatDate(settings.fiscalYearStart)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {journal && (
          <Card>
            <CardHeader>
              <CardTitle>Jurnal Pembuka · {journal.number}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Akun</th>
                      <th className="py-2 pr-4 text-right font-medium">Debit (IDR)</th>
                      <th className="py-2 text-right font-medium">Kredit (IDR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border">
                        <td className="py-2 pr-4 text-foreground">
                          <span className="text-muted-foreground">{l.account.code}</span> {l.account.name}
                          {l.memo ? (
                            <span className="block text-xs text-muted-foreground">{l.memo}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {Number(l.baseDebit) > 0 ? formatCurrency(Number(l.baseDebit), "IDR") : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground">
                          {Number(l.baseCredit) > 0 ? formatCurrency(Number(l.baseCredit), "IDR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Saldo awal ini sudah tercermin di{" "}
                <Link href="/reports" className="text-primary underline">
                  Neraca
                </Link>{" "}
                per {formatDate(settings.fiscalYearStart)}.
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
    <div className="max-w-3xl">
      <PageHeader
        title={<>Setup Perusahaan &amp; Saldo Awal</>}
        description="Siapkan buku dari posisi yang benar. Langkah ini hanya dijalankan sekali."
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
