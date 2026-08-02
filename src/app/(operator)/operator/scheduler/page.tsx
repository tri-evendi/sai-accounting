/**
 * Riwayat PUTARAN PENJADWAL — konsol operator (issue #154).
 *
 * Membaca `scheduler_runs` (ditulis scripts/subscription-scheduler.ts di akhir
 * setiap putaran): apa yang terbit, apa yang diingatkan, transisi status apa
 * yang terjadi, dan apa yang gagal — jawaban yang sebelumnya hanya hidup di
 * stdout cron. Platform mati ATAU migrasi 0005 belum diterapkan → kalimat
 * jujur; belum ada baris → keadaan kosong dengan perintah cron-nya.
 */

import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOperatorPage } from "@/lib/operator/guard";
import { schedulerRunsForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function RunList({ heading, items, emptyLabel }: { heading: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function OperatorSchedulerPage() {
  await requireOperatorPage();
  const t = await getT();

  const runs = await schedulerRunsForOperator(10);
  const latest = runs?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("operator.scheduler.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("operator.scheduler.description")}</p>
      </div>

      {runs === null ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
          {t("operator.scheduler.unavailable")}
        </p>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-12 w-12" aria-hidden="true" />}
          title={t("operator.scheduler.empty")}
        />
      ) : (
        <div className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("operator.scheduler.colStarted")}</TableHead>
                <TableHead>{t("operator.scheduler.colFinished")}</TableHead>
                <TableHead>{t("operator.scheduler.colStatus")}</TableHead>
                <TableHead className="text-right">{t("operator.scheduler.colIssued")}</TableHead>
                <TableHead className="text-right">{t("operator.scheduler.colReminders")}</TableHead>
                <TableHead className="text-right">{t("operator.scheduler.colTransitions")}</TableHead>
                <TableHead className="text-right">{t("operator.scheduler.colAdoptions")}</TableHead>
                <TableHead className="text-right">{t("operator.scheduler.colErrors")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(run.startedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(run.finishedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.status === "ok" ? "success" : "danger"}>
                      {run.status === "ok"
                        ? t("operator.scheduler.statusOk")
                        : t("operator.scheduler.statusError")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.invoicesIssued}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.remindersSent}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.statusChanges}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.adoptions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.errorCount > 0 ? (
                      <span className="font-medium text-destructive">{run.errorCount}</span>
                    ) : (
                      run.errorCount
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {latest && (
            <section className="space-y-4 rounded-xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">
                {t("operator.scheduler.lastRunHeading", {
                  date: formatDateTime(latest.startedAt),
                })}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RunList
                  heading={t("operator.scheduler.listIssued")}
                  items={latest.details?.issued ?? []}
                  emptyLabel={t("operator.scheduler.listEmpty")}
                />
                <RunList
                  heading={t("operator.scheduler.listReminders")}
                  items={latest.details?.reminders ?? []}
                  emptyLabel={t("operator.scheduler.listEmpty")}
                />
                <RunList
                  heading={t("operator.scheduler.listTransitions")}
                  items={latest.details?.transitions ?? []}
                  emptyLabel={t("operator.scheduler.listEmpty")}
                />
                <RunList
                  heading={t("operator.scheduler.listAdoptions")}
                  items={latest.details?.adoptions ?? []}
                  emptyLabel={t("operator.scheduler.listEmpty")}
                />
              </div>
              <RunList
                heading={t("operator.scheduler.listErrors")}
                items={latest.details?.errors ?? []}
                emptyLabel={t("operator.scheduler.listEmpty")}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
