import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "@/components/ui/app-link";
import { ReverseButton } from "./reverse-button";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("journal.read", params);
  const t = await getT();
  const { id } = await params;

  const journal = await prisma.journal.findUnique({
    where: { id: parseInt(id) },
    include: {
      // issue #91 — pusat biaya dibaca PER BARIS, karena di situlah dimensinya
      // hidup: satu jurnal boleh mencakup lebih dari satu cabang.
      lines: { include: { account: true, costCenter: true }, orderBy: { id: "asc" } },
      reversalOf: true,
      reversals: true,
    },
  });

  if (!journal) notFound();

  const totalDebit = journal.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalCredit = journal.lines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const canReverse = !journal.isReversed && journal.type !== "reversal";
  // Kolomnya hanya muncul bila jurnal ini memang bertag — jurnal lama (dan
  // perusahaan yang belum memakai pusat biaya) tak perlu melihat kolom kosong.
  const showCostCenter = journal.lines.some((l) => l.costCenterId != null);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("journal.breadcrumb"), href: "/journal" }, { label: journal.number }]}
        title={<span className="font-mono">{journal.number}</span>}
        description={formatDate(journal.date)}
        actions={canReverse && <ReverseButton journalId={journal.id} />}
      />

      {journal.isReversed && (
        <div className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning-strong">
          {journal.reversals[0] ? (
            <>
              {t("journal.reversedByBefore")}{" "}
              <Link href={`/journal/${journal.reversals[0].id}`} className="font-mono underline">
                {journal.reversals[0].number}
              </Link>
              {t("journal.reversedByAfter")}
            </>
          ) : (
            <>
              {t("journal.reversedNotice")}
              {t("common.fullStop")}
            </>
          )}
        </div>
      )}
      {journal.reversalOf && (
        <div className="mb-4 rounded-md bg-muted p-3 text-sm text-foreground">
          {t("journal.reversalOfBefore")}{" "}
          <Link href={`/journal/${journal.reversalOf.id}`} className="font-mono underline">
            {journal.reversalOf.number}
          </Link>
          {t("journal.reversalOfAfter")}
        </div>
      )}

      {journal.note && (
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-muted-foreground">{t("journal.noteLabel")}</span> {journal.note}
        </p>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("journal.colCode")}</TableHead>
              <TableHead>{t("common.account")}</TableHead>
              <TableHead className="text-right">{t("journal.colDebitIdr")}</TableHead>
              <TableHead className="text-right">{t("journal.colCreditIdr")}</TableHead>
              {showCostCenter && <TableHead>{t("journal.colCostCenter")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-foreground tabular-nums">{l.account.code}</TableCell>
                <TableCell>
                  {l.account.name}
                  {l.currency !== "IDR" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formatCurrency(Number(l.debit) || Number(l.credit), l.currency)} @ {Number(l.rate)})
                    </span>
                  )}
                  {l.memo && <span className="ml-2 text-xs text-muted-foreground">— {l.memo}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(l.baseDebit) > 0 ? (
                    <Money value={Number(l.baseDebit)} currency="IDR" hideCurrency />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(l.baseCredit) > 0 ? (
                    <Money value={Number(l.baseCredit)} currency="IDR" hideCurrency />
                  ) : (
                    "—"
                  )}
                </TableCell>
                {showCostCenter && (
                  <TableCell className="text-muted-foreground">
                    {l.costCenter ? `${l.costCenter.code} — ${l.costCenter.name}` : "—"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>
                {t("common.total")}{" "}
                {totalDebit === totalCredit ? (
                  <Badge variant="success">{t("journal.balanced")}</Badge>
                ) : (
                  <Badge variant="danger">{t("journal.unbalanced")}</Badge>
                )}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={totalDebit} currency="IDR" hideCurrency />
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={totalCredit} currency="IDR" hideCurrency />
              </TableCell>
              {showCostCenter && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
