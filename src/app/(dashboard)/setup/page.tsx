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
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
        <Breadcrumb items={[{ label: "Setup" }]} />
        <h1 className="text-2xl font-bold text-gray-900">Setup Perusahaan</h1>

        <div className="mt-4 mb-6 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
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
                <dt className="font-medium text-gray-500">Nama</dt>
                <dd className="text-gray-900">{settings.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Alamat</dt>
                <dd className="text-gray-900">{settings.address || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Mata Uang Dasar</dt>
                <dd className="text-gray-900">{settings.baseCurrency}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Awal Tahun Buku</dt>
                <dd className="text-gray-900">{formatDate(settings.fiscalYearStart)}</dd>
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
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4 font-medium">Akun</th>
                      <th className="py-2 pr-4 text-right font-medium">Debit (IDR)</th>
                      <th className="py-2 text-right font-medium">Kredit (IDR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lines.map((l) => (
                      <tr key={l.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-900">
                          <span className="text-gray-500">{l.account.code}</span> {l.account.name}
                          {l.memo ? (
                            <span className="block text-xs text-gray-400">{l.memo}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-gray-900">
                          {Number(l.baseDebit) > 0 ? formatCurrency(Number(l.baseDebit), "IDR") : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-900">
                          {Number(l.baseCredit) > 0 ? formatCurrency(Number(l.baseCredit), "IDR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                Saldo awal ini sudah tercermin di{" "}
                <Link href="/reports" className="text-blue-700 underline">
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
      <Breadcrumb items={[{ label: "Setup" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Setup Perusahaan &amp; Saldo Awal</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Siapkan buku dari posisi yang benar. Langkah ini hanya dijalankan sekali.
      </p>
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
