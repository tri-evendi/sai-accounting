"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Lock,
  LockOpen,
  Link2,
  Unlink,
  Upload,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";

const EPSILON = 0.005;

interface StatementInfo {
  id: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  status: string;
}
interface BookRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  matched: boolean;
  matchedLineId: number | null;
}
interface LineRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  matched: boolean;
  cashMovementId: number | null;
}
interface Summary {
  difference: number;
  statementNet: number;
  matchedBookTotal: number;
  bookTotal: number;
  statementTotal: number;
  complete: boolean;
  unmatchedBookCount: number;
  unmatchedStatementCount: number;
}

/**
 * Signed money, never colour-only: sign + arrow icon + red/green.
 *
 * Sengaja BUKAN `Money`/`MoneyCell` (issue #52): warnanya mengikuti arah kas
 * (masuk/keluar, pasangan `*-strong`) dan selalu disertai ikon panah + tanda
 * +/−, sedangkan `Money` hanya mewarnai nilai negatif.
 */
function Amount({ value, currency }: { value: number; currency: string }) {
  const inflow = value >= 0;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 tabular-nums ${
        inflow ? "text-success-strong" : "text-destructive-strong"
      }`}
    >
      {inflow ? (
        <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>
        {inflow ? "+" : "−"}
        {formatCurrency(Math.abs(value), currency)}
      </span>
    </span>
  );
}

export function ReconciliationWorkspace({
  statement,
  bookRows,
  lineRows,
  summary,
}: {
  statement: StatementInfo;
  bookRows: BookRow[];
  lineRows: LineRow[];
  summary: Summary;
}) {
  const router = useRouter();
  const t = useT();
  const locked = statement.status === "locked";
  const currency = statement.currency;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const bookById = useMemo(() => new Map(bookRows.map((b) => [b.id, b])), [bookRows]);
  const lineById = useMemo(() => new Map(lineRows.map((l) => [l.id, l])), [lineRows]);

  const unmatchedBook = bookRows.filter((b) => !b.matched);
  const unmatchedLines = lineRows.filter((l) => !l.matched);
  const matchedLines = lineRows.filter((l) => l.matched);

  const selectedBookRow = selectedBook != null ? bookById.get(selectedBook) : undefined;
  const selectedLineRow = selectedLine != null ? lineById.get(selectedLine) : undefined;
  const amountsAgree =
    selectedBookRow != null &&
    selectedLineRow != null &&
    Math.abs(selectedBookRow.amount - selectedLineRow.amount) < EPSILON;

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setRowErrors([]);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
        const detail = data.details?.fieldErrors;
        const fieldMsg = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
        setError(String(fieldMsg || data.error || t("reconciliation.genericError")));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function doMatch() {
    if (selectedBook == null || selectedLine == null) return;
    const ok = await call(`/api/reconciliation/${statement.id}/match`, "POST", {
      lineId: selectedLine,
      cashMovementId: selectedBook,
    });
    if (ok) {
      setSelectedBook(null);
      setSelectedLine(null);
      router.refresh();
    }
  }

  async function doUnmatch(lineId: number) {
    const ok = await call(`/api/reconciliation/${statement.id}/match`, "DELETE", { lineId });
    if (ok) router.refresh();
  }

  async function toggleLock() {
    const ok = await call(
      `/api/reconciliation/${statement.id}/lock`,
      locked ? "DELETE" : "POST"
    );
    if (ok) router.refresh();
  }

  async function addManualLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const ok = await call(`/api/reconciliation/${statement.id}/lines`, "POST", {
      date: data.get("date"),
      description: data.get("description"),
      amount: Number(data.get("amount")),
    });
    if (ok) {
      form.reset();
      router.refresh();
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    e.target.value = "";
    const ok = await call(`/api/reconciliation/${statement.id}/import`, "POST", { csv });
    if (ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        className="mb-0"
        breadcrumbs={[
          { label: t("reconciliation.title"), href: "/reconciliation" },
          { label: t("reconciliation.workspaceTitle", { currency }) },
        ]}
        title={t("reconciliation.workspaceTitle", { currency })}
        description={t("reconciliation.workspacePeriod", {
          from: formatDateShort(statement.periodStart),
          to: formatDateShort(statement.periodEnd),
        })}
        actions={
          <>
            {locked ? (
              <Badge variant="success">
                <Lock className="mr-1 h-3 w-3" aria-hidden="true" /> {t("reconciliation.statusLocked")}
              </Badge>
            ) : (
              <Badge variant="warning">{t("reconciliation.statusDraft")}</Badge>
            )}
            <Button variant={locked ? "secondary" : "primary"} size="sm" disabled={busy} onClick={toggleLock}>
              {locked ? (
                <>
                  <LockOpen className="mr-1 h-4 w-4" aria-hidden="true" /> {t("reconciliation.reopen")}
                </>
              ) : (
                <>
                  <Lock className="mr-1 h-4 w-4" aria-hidden="true" /> {t("reconciliation.lockAction")}
                </>
              )}
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
          {error}
          {rowErrors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 space-y-0.5">
              {rowErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Difference summary */}
      <Card>
        <CardContent className="py-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("reconciliation.summaryOpeningClosing")}</p>
              <p className="text-sm font-medium text-foreground tabular-nums">
                {formatCurrency(statement.openingBalance, currency)} →{" "}
                {formatCurrency(statement.closingBalance, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("reconciliation.summaryStatementNet")}</p>
              <p className="text-sm font-medium tabular-nums">
                <Amount value={summary.statementNet} currency={currency} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("reconciliation.summaryMatchedBook")}</p>
              <p className="text-sm font-medium tabular-nums">
                <Amount value={summary.matchedBookTotal} currency={currency} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("reconciliation.summaryDifference")}</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  Math.abs(summary.difference) < EPSILON ? "text-success-strong" : "text-destructive-strong"
                }`}
              >
                {formatCurrency(summary.difference, currency)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            {summary.complete ? (
              <span className="inline-flex items-center gap-1 text-success-strong">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("reconciliation.summaryComplete")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning-strong">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t("reconciliation.summaryIncomplete", {
                  book: summary.unmatchedBookCount,
                  statement: summary.unmatchedStatementCount,
                })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Matching: two columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Book side */}
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.bookSideTitle")}</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {unmatchedBook.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-4 py-6 text-center text-muted-foreground">
                    {t("reconciliation.bookAllMatched")}
                  </TableCell>
                </TableRow>
              ) : (
                unmatchedBook.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="w-8 px-2 py-2">
                      <input
                        type="radio"
                        name="book"
                        aria-label={t("reconciliation.pickBookRow", { description: b.description })}
                        checked={selectedBook === b.id}
                        disabled={locked}
                        onChange={() => setSelectedBook(b.id)}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2 text-muted-foreground whitespace-nowrap">{formatDateShort(b.date)}</TableCell>
                    <TableCell className="px-2 py-2 text-foreground">{b.description}</TableCell>
                    <TableCell className="px-2 py-2 text-right">
                      <Amount value={b.amount} currency={currency} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Statement side */}
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.statementSideTitle")}</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {unmatchedLines.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-4 py-6 text-center text-muted-foreground">
                    {t("reconciliation.statementAllMatched")}
                  </TableCell>
                </TableRow>
              ) : (
                unmatchedLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="w-8 px-2 py-2">
                      <input
                        type="radio"
                        name="line"
                        aria-label={t("reconciliation.pickStatementRow", { description: l.description })}
                        checked={selectedLine === l.id}
                        disabled={locked}
                        onChange={() => setSelectedLine(l.id)}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2 text-muted-foreground whitespace-nowrap">{formatDateShort(l.date)}</TableCell>
                    <TableCell className="px-2 py-2 text-foreground">{l.description}</TableCell>
                    <TableCell className="px-2 py-2 text-right">
                      <Amount value={l.amount} currency={currency} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Match action bar */}
      {!locked && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted px-4 py-3">
          <Button size="sm" disabled={busy || selectedBook == null || selectedLine == null} onClick={doMatch}>
            <Link2 className="mr-1 h-4 w-4" aria-hidden="true" /> {t("reconciliation.matchAction")}
          </Button>
          {selectedBookRow && selectedLineRow && !amountsAgree && (
            <span className="inline-flex items-center gap-1 text-sm text-warning-strong">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("reconciliation.amountsDiffer", {
                book: formatCurrency(selectedBookRow.amount, currency),
                statement: formatCurrency(selectedLineRow.amount, currency),
              })}
            </span>
          )}
          {(selectedBook != null || selectedLine != null) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0 text-muted-foreground"
              onClick={() => {
                setSelectedBook(null);
                setSelectedLine(null);
              }}
            >
              {t("reconciliation.clearSelection")}
            </Button>
          )}
        </div>
      )}

      {/* Matched pairs */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reconciliation.matchedTitle", { count: matchedLines.length })}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto px-4 py-2">{t("reconciliation.colBook")}</TableHead>
              <TableHead className="h-auto px-4 py-2">{t("reconciliation.colStatement")}</TableHead>
              <TableHead className="h-auto px-4 py-2 text-right">{t("reconciliation.colAmount")}</TableHead>
              <TableHead className="h-auto px-4 py-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matchedLines.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {t("reconciliation.noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              matchedLines.map((l) => {
                const b = l.cashMovementId != null ? bookById.get(l.cashMovementId) : undefined;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="px-4 py-2 text-foreground">
                      {b ? (
                        <>
                          <span className="text-muted-foreground">{formatDateShort(b.date)}</span> · {b.description}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-foreground">
                      <span className="text-muted-foreground">{formatDateShort(l.date)}</span> · {l.description}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <Amount value={l.amount} currency={currency} />
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      {!locked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:bg-destructive-soft hover:text-destructive"
                          disabled={busy}
                          onClick={() => doUnmatch(l.id)}
                        >
                          <Unlink className="h-3.5 w-3.5" aria-hidden="true" /> {t("reconciliation.unmatchAction")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add lines: manual + CSV */}
      {!locked && (
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.addLineTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addManualLine} className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <Input id="line-date" name="date" type="date" label={t("common.date")} required />
              <div className="sm:col-span-2">
                <Input id="line-desc" name="description" label={t("reconciliation.lineDescription")} required />
              </div>
              <div>
                <Input
                  id="line-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  className="text-right tabular-nums"
                  label={t("reconciliation.lineAmount")}
                  required
                />
              </div>
              <div className="sm:col-span-4">
                <Button type="submit" size="sm" disabled={busy}>
                  {t("reconciliation.addLineAction")}
                </Button>
              </div>
            </form>

            <div className="mt-4 border-t border-border pt-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t("reconciliation.importCsv")}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={busy} />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("reconciliation.csvHintColumns")} <code>date, description, amount</code>{" "}
                {t("reconciliation.csvHintOr")} <code>debit</code> {t("reconciliation.csvHintAnd")}{" "}
                <code>credit</code>
                {t("reconciliation.csvHintDateBefore")} <code>YYYY-MM-DD</code>{" "}
                {t("reconciliation.csvHintDateMiddle")} <code>DD/MM/YYYY</code>
                {t("reconciliation.csvHintTail")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
