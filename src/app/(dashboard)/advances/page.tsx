/**
 * Uang Muka — advances received/paid and how much of each is left (issue #26).
 *
 * The number a user actually needs is "how much does this buyer still have on
 * account?", so `Sisa` is the column that carries the page. It is shown in the
 * advance's OWN currency (a CNY down-payment is a CNY fact, and an application
 * is always a slice of one advance, so that remainder is exact) with the IDR
 * base beside it — the only unit in which advances across currencies may be
 * added, which is what the summary tiles use. An advance with no rate has no
 * IDR value at all and is labelled as such rather than folded in at 1:1.
 */
import { Link } from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/page-auth";
import { getAdvances, summarizeAdvances } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { HandCoins, Info, Plus } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdvancesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePagePermission("advance.read");
  const t = await getT();
  const sp = await searchParams;
  const type = sp.type === "sales" || sp.type === "purchase" ? sp.type : undefined;

  const rows = await getAdvances({ type });
  const open = rows.filter((r) => !r.isFullyApplied);
  const summary = summarizeAdvances(open);
  // Nama akun tempat uang muka mendarat — dipakai sebagai keterangan di kolom Jenis.
  const typeLabels = { sales: t("advanceType.sales"), purchase: t("advanceType.purchase") };

  return (
    <div>
      <PageHeader
        title={t("advances.title")}
        description={
          <>
            {t("advances.descriptionBefore")} <strong>{t("advances.descriptionStrong")}</strong>{" "}
            {t("advances.descriptionAfter")}
          </>
        }
        actions={
          <Link href="/advances/new">
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("advances.record")}
            </Button>
          </Link>
        }
      />

      {/* Filter — plain links, no client JS needed for three states. */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { key: "all", label: t("advances.filterAll"), href: "/advances", active: !type },
          {
            key: "sales",
            label: t("advances.filterSales"),
            href: "/advances?type=sales",
            active: type === "sales",
          },
          {
            key: "purchase",
            label: t("advances.filterPurchase"),
            href: "/advances?type=purchase",
            active: type === "purchase",
          },
        ].map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("advances.outstandingLabel")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(summary.outstandingBase, "IDR")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("advances.outstandingHint", { count: summary.count })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("advances.unratedLabel")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {summary.unresolvedCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("advances.unratedHint")}
          </p>
        </Card>
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t("advances.noteBefore")} <strong>{t("advances.noteSalesAccount")}</strong>{" "}
          {t("advances.noteLiability")} <strong>{t("advances.notePurchaseAccount")}</strong>{" "}
          {t("advances.noteAssetBefore")} <strong>{t("advances.noteNot")}</strong>{" "}
          {t("advances.noteAfter")} <strong>{t("advances.noteCompensate")}</strong>{" "}
          {t("advances.noteTail")}
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-12 w-12" />}
          title={t("advances.emptyTitle")}
          description={t("advances.emptyDescription")}
          actionLabel={t("advances.record")}
          actionHref="/advances/new"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("advances.colNumber")}</TableHead>
                <TableHead>{t("advances.colType")}</TableHead>
                <TableHead>{t("advances.colParty")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("advances.colContract")}</TableHead>
                <TableHead className="text-right">{t("advances.colValue")}</TableHead>
                <TableHead className="text-right">{t("advances.colApplied")}</TableHead>
                <TableHead className="text-right">{t("advances.colRemaining")}</TableHead>
                <TableHead className="text-right">{t("common.remainingIdr")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.advanceNo}</TableCell>
                  <TableCell>
                    {/* Badge always carries text — colour is never the only signal. */}
                    <Badge variant={r.type === "sales" ? "success" : "warning"}>
                      {r.type === "sales" ? t("advances.badgeReceived") : t("advances.badgePaid")}
                    </Badge>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {typeLabels[r.type]}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground">{r.partyName}</TableCell>
                  <TableCell className="text-foreground">{formatDateShort(r.date)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.contractNo ? (
                      <Link
                        href={`/contracts/${r.contractId}`}
                        className="cursor-pointer text-primary transition-colors hover:underline"
                      >
                        {r.contractNo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.amount} currency={r.currency} />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.applied} currency={r.currency} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money value={r.remaining} currency={r.currency} />
                    {r.isFullyApplied && (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {t("advances.usedUp")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.remainingBase != null ? (
                      <Money value={r.remainingBase} currency="IDR" />
                    ) : (
                      <span className="text-xs text-warning-strong">{t("common.rateMissing")}</span>
                    )}
                    {r.unratedApplications > 0 && (
                      <span className="mt-0.5 block text-xs text-warning-strong">
                        {t("advances.unratedApplications", { count: r.unratedApplications })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
