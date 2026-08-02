/**
 * Laporan REKONSILIASI platform ↔ kendali — konsol operator (issue #154).
 *
 * Keluaran `runReconciliation` (scripts/reconcile-platform.ts) sebagai
 * halaman, bukan stdout: pemeriksaan yang sama persis dengan
 * `bun run reconcile:platform` dan putaran penjadwal — membaca kedua sisi,
 * TIDAK memperbaiki apa pun (setiap perbaikan penagihan adalah keputusan uang
 * yang diambil orang). Platform tak terjangkau → kalimat jujur, bukan 500.
 */

import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOperatorPage } from "@/lib/operator/guard";
import { reconciliationForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OperatorReconciliationPage() {
  await requireOperatorPage();
  const t = await getT();

  const report = await reconciliationForOperator();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("operator.reconciliation.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("operator.reconciliation.description")}</p>
      </div>

      {report === null ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
          {t("operator.reconciliation.unavailable")}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm tabular-nums text-muted-foreground">
            {t("operator.reconciliation.checked", { count: report.subscriptionsChecked })}
          </p>

          {report.findings.length === 0 ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg bg-success-soft p-4 text-sm text-success-strong"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("operator.reconciliation.clean")}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg bg-warning-soft p-4 text-sm text-warning-strong"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("operator.reconciliation.findings", { count: report.findings.length })}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("operator.reconciliation.colCheck")}</TableHead>
                    <TableHead>{t("operator.reconciliation.colDetail")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.findings.map((finding, index) => (
                    <TableRow key={`${finding.check}-${index}`}>
                      <TableCell>
                        <Badge variant="warning">{finding.check}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm text-foreground">
                        {finding.detail}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {report.skipped.length > 0 && (
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">
                {t("operator.reconciliation.skippedHeading")}
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {report.skipped.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
