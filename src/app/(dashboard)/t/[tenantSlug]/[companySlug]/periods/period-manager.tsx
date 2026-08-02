"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  LockOpen,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PeriodCheck, PeriodSummary } from "@/lib/period-close";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

interface PeriodRow {
  year: number;
  month: number;
  label: string;
  status: string;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
}

/** Icon + wording per check outcome — never colour on its own (MASTER.md §2). */
const CHECK_STYLES: Record<
  PeriodCheck["status"],
  { icon: typeof CheckCircle2; tone: string; labelKey: "checkOk" | "checkWarning" | "checkBlocker" }
> = {
  ok: { icon: CheckCircle2, tone: "text-success", labelKey: "checkOk" },
  warning: { icon: AlertTriangle, tone: "text-warning", labelKey: "checkWarning" },
  blocker: { icon: XCircle, tone: "text-destructive", labelKey: "checkBlocker" },
};

const CHECK_LABEL_KEYS = {
  checkOk: "periods.checkOk",
  checkWarning: "periods.checkWarning",
  checkBlocker: "periods.checkBlocker",
} as const;

function StatusBadge({ status, t }: { status: string; t: TranslateFn }) {
  return status === "closed" ? (
    <Badge variant="danger">
      <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
      {t("periods.statusClosed")}
    </Badge>
  ) : (
    <Badge variant="success">
      <LockOpen className="mr-1 h-3 w-3" aria-hidden="true" />
      {t("periods.statusOpen")}
    </Badge>
  );
}

export function PeriodManager({ periods }: { periods: PeriodRow[] }) {
  const router = useRouter();
  const t = useT();

  const [selected, setSelected] = useState<{ year: number; month: number } | null>(
    periods[0] ? { year: periods[0].year, month: periods[0].month } : null
  );
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/periods/summary?year=${year}&month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("periods.summaryLoadFailed"));
        setSummary(null);
        return;
      }
      setSummary(await res.json());
    } catch {
      setError(t("periods.summaryLoadFailed"));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selected) loadSummary(selected.year, selected.month);
  }, [selected, loadSummary]);

  async function submit(url: string, body: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || fallback);
        return;
      }
      setNote("");
      setReason("");
      if (selected) await loadSummary(selected.year, selected.month);
      router.refresh();
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  const onClose = () =>
    submit(
      "/api/periods",
      { year: summary!.year, month: summary!.month, note: note || null },
      t("periods.closeFailed")
    );

  const onReopen = () =>
    submit(
      "/api/periods/reopen",
      { year: summary!.year, month: summary!.month, reason },
      t("periods.reopenFailed")
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ── Period list ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("periods.listTitle")}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("periods.colPeriod")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("periods.colClosed")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length > 0 ? (
              periods.map((p) => {
                const active = selected?.year === p.year && selected?.month === p.month;
                return (
                  <TableRow
                    key={`${p.year}-${p.month}`}
                    // Baris terpilih tetap bertanda meski kursor berpindah,
                    // jadi hover-nya dikunci ke warna terpilih.
                    className={active ? "bg-primary/10 hover:bg-primary/10" : undefined}
                  >
                    <TableCell className="font-medium text-foreground">{p.label}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} t={t} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.closedAt ? (
                        <span className="tabular-nums">
                          {formatDate(p.closedAt)}
                          {p.closedByName && (
                            <span className="block text-xs text-muted-foreground">
                              {t("periods.closedBy", { name: p.closedByName })}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={active ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => setSelected({ year: p.year, month: p.month })}
                        className="cursor-pointer"
                      >
                        {t("periods.review")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  {t("periods.emptyList")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Pre-close summary ── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>
            {summary ? t("periods.summaryOf", { label: summary.label }) : t("periods.summaryTitle")}
          </CardTitle>
          {selected && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => loadSummary(selected.year, selected.month)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("periods.reloadSummary")}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
          )}

          {loading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {!loading && !summary && !error && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("periods.pickPeriod")}
            </p>
          )}

          {!loading && summary && (
            <>
              <div className="mb-5 grid grid-cols-3 gap-4 border-b border-border pb-5">
                <div>
                  <p className="text-xs text-muted-foreground">{t("periods.journalCount")}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {summary.journalCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("periods.totalDebit")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(summary.totalDebit, "IDR")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("periods.totalCredit")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(summary.totalCredit, "IDR")}
                  </p>
                </div>
              </div>

              <ul className="space-y-3">
                {summary.checks.map((c) => {
                  const style = CHECK_STYLES[c.status];
                  const Icon = style.icon;
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${style.tone}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {c.label}{" "}
                          <span className={`text-xs font-normal ${style.tone}`}>
                            · {t(CHECK_LABEL_KEYS[style.labelKey])}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">{c.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 border-t border-border pt-5">
                {summary.status === "closed" ? (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {summary.closedAt && summary.closedByName
                        ? t("periods.lockedSinceBy", {
                            date: formatDate(summary.closedAt),
                            name: summary.closedByName,
                          })
                        : summary.closedAt
                          ? t("periods.lockedSince", { date: formatDate(summary.closedAt) })
                          : summary.closedByName
                            ? t("periods.lockedBy", { name: summary.closedByName })
                            : t("periods.lockedPlain")}
                      {summary.note && (
                        <span className="mt-1 block text-muted-foreground">
                          {t("periods.noteLine", { note: summary.note })}
                        </span>
                      )}
                    </p>
                    <label
                      htmlFor="reopen-reason"
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      {t("periods.reopenReasonLabel")}
                    </label>
                    <Textarea
                      id="reopen-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("periods.reopenReasonPlaceholder")}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("periods.reopenReasonHint")}
                    </p>
                    <div className="mt-3">
                      <ConfirmDialog
                        title={t("periods.reopenTitle", { label: summary.label })}
                        message={t("periods.reopenMessage", { label: summary.label })}
                        confirmLabel={t("periods.reopenConfirm")}
                        confirmVariant="danger"
                        onConfirm={onReopen}
                        trigger={
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy || reason.trim().length < 5}
                            className="cursor-pointer"
                          >
                            <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t("periods.reopenButton")}
                          </Button>
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label
                      htmlFor="close-note"
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      {t("periods.closeNoteLabel")}
                    </label>
                    <Textarea
                      id="close-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("periods.closeNotePlaceholder")}
                    />

                    {summary.blockerCount > 0 && (
                      <p className="mt-3 flex items-start gap-2 text-sm text-destructive-strong">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {t("periods.blockerWarning", { count: summary.blockerCount })}
                      </p>
                    )}

                    <div className="mt-3">
                      <ConfirmDialog
                        title={t("periods.closeTitle", { label: summary.label })}
                        message={t("periods.closeMessage", { label: summary.label })}
                        confirmLabel={t("periods.closeAction")}
                        confirmVariant="primary"
                        onConfirm={onClose}
                        trigger={
                          <Button
                            size="sm"
                            disabled={busy || !summary.canClose}
                            className="cursor-pointer"
                          >
                            <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t("periods.closeAction")}
                          </Button>
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
