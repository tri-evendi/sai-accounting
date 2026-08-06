/**
 * Riwayat PUTARAN PENJADWAL — konsol operator (issue #154).
 *
 * Membaca `scheduler_runs` (ditulis scripts/subscription-scheduler.ts di akhir
 * setiap putaran): apa yang terbit, apa yang diingatkan, transisi status apa
 * yang terjadi, dan apa yang gagal — jawaban yang sebelumnya hanya hidup di
 * stdout cron. Platform mati ATAU migrasi 0005 belum diterapkan → kalimat
 * jujur; belum ada baris → keadaan kosong dengan perintah cron-nya.
 *
 * ── Setelah AntD (issue #200) ────────────────────────────────────────────
 * Tabel putaran pindah ke `StaticTable` (aturan #189: sepuluh baris terakhir,
 * tanpa satu pun kendali interaktif — tidak ada yang dibeli dengan rc-table).
 * Warnanya token `:root` aplikasi karena konsol ini tidak menggambar komponen
 * AntD di atas isinya (#227); `Badge` dan `EmptyState` mewarnai dirinya sendiri.
 *
 * Kolom "Galat" tetap MERAH HANYA saat angkanya bukan nol, dan angkanya sendiri
 * yang jadi penanda utama — warna bukan sinyal tunggal (MASTER.md).
 */

import { CalendarOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { requireOperatorPage } from "@/lib/operator/guard";
import { schedulerRunsForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const H1: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  color: "var(--foreground)",
};

const MUTED: React.CSSProperties = { margin: 0, fontSize: 14, color: "var(--muted-foreground)" };

const NOTICE: React.CSSProperties = {
  ...MUTED,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--muted)",
  lineHeight: 1.625,
};

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const NOWRAP_MUTED: React.CSSProperties = {
  whiteSpace: "nowrap",
  color: "var(--muted-foreground)",
};

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function RunList({
  heading,
  items,
  emptyLabel,
}: {
  heading: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
        {heading}
      </h3>
      {items.length === 0 ? (
        <p style={MUTED}>{emptyLabel}</p>
      ) : (
        <ul
          style={{
            listStyle: "disc",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            margin: 0,
            paddingInlineStart: 20,
            fontSize: 14,
            color: "var(--foreground)",
          }}
        >
          {items.map((item, index) => (
            <li key={`${index}-${item}`} style={{ overflowWrap: "anywhere" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SchedulerRun = NonNullable<Awaited<ReturnType<typeof schedulerRunsForOperator>>>[number];

export default async function OperatorSchedulerPage() {
  await requireOperatorPage();
  const t = await getT();

  const runs = await schedulerRunsForOperator(10);
  const latest = runs?.[0] ?? null;

  /** Kolom hitungan — semuanya rata kanan + tabular (MASTER.md §Angka). */
  const countColumn = (
    key: string,
    title: string,
    read: (run: SchedulerRun) => number
  ): SaiColumns<SchedulerRun>[number] => ({
    key,
    title,
    align: "right",
    render: (_v, run) => <span style={TABULAR}>{read(run)}</span>,
  });

  const columns: SaiColumns<SchedulerRun> = [
    {
      key: "started",
      title: t("operator.scheduler.colStarted"),
      align: "left",
      render: (_v, run) => <span style={NOWRAP_MUTED}>{formatDateTime(run.startedAt)}</span>,
    },
    {
      key: "finished",
      title: t("operator.scheduler.colFinished"),
      align: "left",
      render: (_v, run) => <span style={NOWRAP_MUTED}>{formatDateTime(run.finishedAt)}</span>,
    },
    {
      key: "status",
      title: t("operator.scheduler.colStatus"),
      align: "left",
      render: (_v, run) => (
        <Badge variant={run.status === "ok" ? "success" : "danger"}>
          {run.status === "ok"
            ? t("operator.scheduler.statusOk")
            : t("operator.scheduler.statusError")}
        </Badge>
      ),
    },
    countColumn("issued", t("operator.scheduler.colIssued"), (r) => r.invoicesIssued),
    countColumn("reminders", t("operator.scheduler.colReminders"), (r) => r.remindersSent),
    countColumn("transitions", t("operator.scheduler.colTransitions"), (r) => r.statusChanges),
    countColumn("adoptions", t("operator.scheduler.colAdoptions"), (r) => r.adoptions),
    {
      key: "errors",
      title: t("operator.scheduler.colErrors"),
      align: "right",
      render: (_v, run) =>
        run.errorCount > 0 ? (
          <span style={{ ...TABULAR, fontWeight: 500, color: "var(--destructive-strong)" }}>
            {run.errorCount}
          </span>
        ) : (
          <span style={TABULAR}>{run.errorCount}</span>
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={H1}>{t("operator.scheduler.heading")}</h1>
        <p style={MUTED}>{t("operator.scheduler.description")}</p>
      </div>

      {runs === null ? (
        <p style={NOTICE}>{t("operator.scheduler.unavailable")}</p>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<CalendarOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
          title={t("operator.scheduler.empty")}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <StaticTable columns={columns} rows={runs} rowKey={(run) => run.id} />

          {latest && (
            <section
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: 16,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <h2
                style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}
              >
                {t("operator.scheduler.lastRunHeading", {
                  date: formatDateTime(latest.startedAt),
                })}
              </h2>
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
                }}
              >
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
