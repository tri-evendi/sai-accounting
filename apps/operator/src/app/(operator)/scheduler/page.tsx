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
 * Warnanya variabel token AntD `var(--ant-…)` (#203) — teratasi walau konsol
 * ini tidak menggambar satu pun komponen AntD di atas isinya, sebab sejak #227
 * kelas `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root layout; `Badge` dan
 * `EmptyState` mewarnai dirinya sendiri.
 *
 * Kolom "Galat" tetap MERAH HANYA saat angkanya bukan nol, dan angkanya sendiri
 * yang jadi penanda utama — warna bukan sinyal tunggal (MASTER.md).
 *
 * ── Kenapa ANTREAN PEKERJAAN ada di halaman ini (02 §5, §14) ───────────────
 * Sejak tabel `jobs`, denyut jam berhenti MELAKSANAKAN dan hanya MENERBITKAN —
 * jadi halaman ini bidang penerbitnya, dan antrean adalah tempat terbitannya
 * jatuh. §11 menyuruh keduanya dibaca berpasangan, dan bukan demi kerapian:
 * antrean yang kosong terbaca sehat justru ketika penerbitnya MATI, sebab tak
 * ada baris yang pernah terbit. Yang membantah bacaan itu hanya riwayat putaran
 * di bawah. Memisahkan keduanya ke dua halaman berarti memisahkan sebuah angka
 * dari satu-satunya angka yang bisa membuktikannya bohong.
 *
 * Panelnya berdiri DI LUAR percabangan riwayat: riwayat yang kosong atau tak
 * terbaca tidak boleh ikut menyembunyikan antreannya.
 *
 * ── Panel ketiga: pemicu tahap 1d (09 §3.3, §9) ───────────────────────────
 * Di halaman ini karena ia bersebelahan dengan histogram durasi: durasi
 * menjawab "jalur mana yang lambat", panel ini menjawab "apakah kelambatan itu
 * menahan halaman atau memori" — pertanyaan yang membuka 1d. Vonisnya dari
 * `@sai/core/runtime-trigger`, bukan dihitung di sini.
 */

import { CalendarOutlined } from "@ant-design/icons";
import { Badge, type BadgeVariant } from "@sai/ui/badge";
import { EmptyState } from "@sai/ui/empty-state";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
} from "@op/components/operator/console-ui";
import { PageHeader } from "@sai/ui/page-header";
import { requireOperatorPage } from "@op/lib/operator/guard";
import {
  jobMetricsForOperator,
  queueSnapshotForOperator,
  runtimeSummaryForOperator,
  schedulerRunsForOperator,
} from "@op/lib/operator/store";
import { METRICS_WINDOW_MINUTES, drainMinutes, type LaneMetrics } from "@sai/platform/job-metrics";
import {
  QUEUE_AGE_LATE_SECONDS,
  QUEUE_AGE_WARN_SECONDS,
  type LaneQueueHealth,
  type QueueHealthStatus,
} from "@sai/core/queue-health";
import {
  RUNTIME_EVAL_WINDOW_DAYS,
  stage1dTriggered,
  type JobMemorySummary,
  type LoopSummary,
  type TriggerStatus,
  type TriggerVerdict,
} from "@sai/core/runtime-trigger";
import { getT } from "@sai/platform/i18n/server";
import { formatDateTime } from "@sai/core/utils";
import { SPACE_XS } from "@sai/ui/layout-scale";

export const dynamic = "force-dynamic";

const MUTED = CONSOLE_MUTED;

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const NOWRAP_MUTED: React.CSSProperties = {
  whiteSpace: "nowrap",
  color: "var(--ant-color-text-secondary)",
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ant-color-text)" }}>
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
            color: "var(--ant-color-text)",
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

const QUEUE_STATUS_KEY: Record<QueueHealthStatus, string> = {
  idle: "operator.scheduler.queueStatusIdle",
  ok: "operator.scheduler.queueStatusOk",
  warn: "operator.scheduler.queueStatusWarn",
  late: "operator.scheduler.queueStatusLate",
};

/*
 * `idle` TIDAK hijau, dan itu disengaja: antrean kosong bukan kabar baik maupun
 * kabar buruk, dan mewarnainya hijau menyatakan sesuatu yang tidak diketahui
 * halaman ini — apakah ada yang menerbitkan. Netral adalah jawaban yang jujur.
 */
const QUEUE_BADGE: Record<QueueHealthStatus, BadgeVariant> = {
  idle: "outline",
  ok: "success",
  warn: "warning",
  late: "danger",
};

/*
 * Vonis pemicu 1d. `insufficient` NETRAL, bukan hijau — alasan yang sama dengan
 * `idle` di atas: "sampel kurang" tidak menyatakan beban kerjanya sehat, ia
 * menyatakan halaman ini belum tahu. Teksnya selalu ikut; warna bukan sinyal
 * tunggal (MASTER.md).
 */
const TRIGGER_KEY: Record<TriggerStatus, string> = {
  triggered: "operator.scheduler.runtimeVerdictTriggered",
  not_triggered: "operator.scheduler.runtimeVerdictNotTriggered",
  insufficient: "operator.scheduler.runtimeVerdictInsufficient",
};

const TRIGGER_BADGE: Record<TriggerStatus, BadgeVariant> = {
  triggered: "warning",
  not_triggered: "success",
  insufficient: "outline",
};

/** Byte → MiB bulat. `—` untuk yang tak terukur, sama seperti panel metrik. */
const mib = (bytes: number | null) => (bytes === null ? null : Math.round(bytes / 1048576));

const SUBHEADING: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

interface TriggerRow {
  key: "loop" | "memory";
  label: string;
  verdict: TriggerVerdict;
  /** Angka teramati & ambang dalam satuan tampilannya. */
  observed: number | null;
  threshold: number;
}

type SchedulerRun = NonNullable<Awaited<ReturnType<typeof schedulerRunsForOperator>>>[number];

export default async function OperatorSchedulerPage() {
  await requireOperatorPage();
  const t = await getT();

  const [runs, queue, metrics, runtime] = await Promise.all([
    schedulerRunsForOperator(10),
    queueSnapshotForOperator(),
    jobMetricsForOperator(),
    runtimeSummaryForOperator(),
  ]);
  const latest = runs?.[0] ?? null;

  const queueColumns: SaiColumns<LaneQueueHealth> = [
    {
      key: "lane",
      title: t("operator.scheduler.queueColLane"),
      align: "left",
      render: (_v, lane) => lane.lane,
    },
    {
      key: "status",
      title: t("operator.scheduler.colStatus"),
      align: "left",
      render: (_v, lane) => (
        <Badge variant={QUEUE_BADGE[lane.status]}>
          {t(QUEUE_STATUS_KEY[lane.status] as Parameters<typeof t>[0])}
        </Badge>
      ),
    },
    {
      key: "waiting",
      title: t("operator.scheduler.queueColWaiting"),
      align: "right",
      render: (_v, lane) => <span style={TABULAR}>{lane.waiting}</span>,
    },
    {
      key: "age",
      /* Detik, satu satuan, tanpa pembulatan ke "beberapa menit": ambangnya
         SENDIRI ditulis dalam detik (420/600), dan angka yang satuannya
         berbeda dari ambangnya memaksa pembacanya menghitung di kepala tepat
         saat ia sedang panik. */
      title: t("operator.scheduler.queueColAge"),
      align: "right",
      render: (_v, lane) => (
        <span style={TABULAR}>{lane.ageSeconds === null ? "—" : lane.ageSeconds}</span>
      ),
    },
  ];

  /*
   * Kolom metrik (§11). `—` untuk setiap angka yang TIDAK ADA, dan itu bukan
   * kerapian tampilan: jalur yang tidak menjalankan apa pun dan jalur yang
   * menjalankan pekerjaan nol-milidetik terlihat sama bila keduanya dicetak
   * `0`. Yang pertama berarti "tidak ada bahan", yang kedua "cepat".
   */
  const angkaAtauStrip = (n: number | null) => (
    <span style={TABULAR}>{n === null ? "—" : n}</span>
  );

  const metricsColumns: SaiColumns<LaneMetrics> = [
    {
      key: "lane",
      title: t("operator.scheduler.queueColLane"),
      align: "left",
      render: (_v, m) => m.lane,
    },
    {
      key: "published",
      title: t("operator.scheduler.metricsColPublished"),
      align: "right",
      render: (_v, m) => <span style={TABULAR}>{m.publishedPerMin}</span>,
    },
    {
      key: "completed",
      title: t("operator.scheduler.metricsColCompleted"),
      align: "right",
      render: (_v, m) => <span style={TABULAR}>{m.completedPerMin}</span>,
    },
    {
      key: "drain",
      /* `—` ketika antrean kosong DAN ketika laju selesai nol — dua sebab, dan
         keduanya benar sebagai "tidak bisa diperkirakan". Yang kedua adalah
         keadaan paling gawat (pekerja mati), dan ia tidak boleh muncul sebagai
         angka besar: "4.812 menit" terbaca lambat, padahal tidak bergerak.
         Keadaan itu dijawab kolom umur di panel di atas, yang punya ambang. */
      title: t("operator.scheduler.metricsColDrain"),
      align: "right",
      render: (_v, m) => angkaAtauStrip(drainMinutes(m)),
    },
    {
      key: "p95",
      title: t("operator.scheduler.metricsColP95"),
      align: "right",
      render: (_v, m) => angkaAtauStrip(m.p95Ms),
    },
    {
      key: "p99",
      title: t("operator.scheduler.metricsColP99"),
      align: "right",
      render: (_v, m) => angkaAtauStrip(m.p99Ms),
    },
    {
      key: "samples",
      /* Ditampilkan BERSAMA persentilnya, dan itu syarat bukan hiasan: p95 atas
         tiga pekerjaan adalah angka, bukan fakta. Ambang per-jalur yang disetel
         dari sampel sekecil itu akan berteriak untuk hal normal. */
      title: t("operator.scheduler.metricsColSamples"),
      align: "right",
      render: (_v, m) => <span style={TABULAR}>{m.samples}</span>,
    },
  ];

  /*
   * Panel pemicu 1d (09 §3.3, §9). Jumlah sampel dicetak BERSAMA minimumnya
   * ("12 / 288"): vonis "belum terpicu" atas dua belas jendela bukan bukti
   * apa pun, dan pembaca yang hanya melihat lencananya tidak bisa tahu itu.
   */
  const verdictBadge = (status: TriggerStatus) => (
    <Badge variant={TRIGGER_BADGE[status]}>
      {t(TRIGGER_KEY[status] as Parameters<typeof t>[0])}
    </Badge>
  );

  const triggerRows: TriggerRow[] =
    runtime === null
      ? []
      : [
          {
            key: "loop",
            label: t("operator.scheduler.runtimeTriggerLoop"),
            verdict: runtime.loopVerdict,
            observed: runtime.loopVerdict.observed,
            threshold: runtime.loopVerdict.threshold,
          },
          {
            key: "memory",
            label: t("operator.scheduler.runtimeTriggerMemory"),
            verdict: runtime.memoryVerdict,
            observed: mib(runtime.memoryVerdict.observed),
            threshold: mib(runtime.memoryVerdict.threshold) ?? 0,
          },
        ];

  const triggerColumns: SaiColumns<TriggerRow> = [
    {
      key: "trigger",
      title: t("operator.scheduler.runtimeColTrigger"),
      align: "left",
      render: (_v, r) => r.label,
    },
    {
      key: "verdict",
      title: t("operator.scheduler.runtimeColVerdict"),
      align: "left",
      render: (_v, r) => verdictBadge(r.verdict.status),
    },
    {
      key: "observed",
      title: t("operator.scheduler.runtimeColObserved"),
      align: "right",
      render: (_v, r) => angkaAtauStrip(r.observed),
    },
    {
      key: "threshold",
      title: t("operator.scheduler.runtimeColThreshold"),
      align: "right",
      render: (_v, r) => <span style={TABULAR}>{r.threshold}</span>,
    },
    {
      key: "samples",
      title: t("operator.scheduler.runtimeColSamples"),
      align: "right",
      render: (_v, r) => (
        <span style={TABULAR}>
          {r.verdict.samples} / {r.verdict.minSamples}
        </span>
      ),
    },
  ];

  const loopColumns: SaiColumns<LoopSummary> = [
    {
      key: "source",
      title: t("operator.scheduler.runtimeColSource"),
      align: "left",
      render: (_v, l) => l.source,
    },
    {
      key: "snapshots",
      title: t("operator.scheduler.runtimeColSnapshots"),
      align: "right",
      render: (_v, l) => <span style={TABULAR}>{l.snapshots}</span>,
    },
    {
      key: "p50",
      title: t("operator.scheduler.runtimeColP50"),
      align: "right",
      render: (_v, l) => angkaAtauStrip(l.p50Ms),
    },
    {
      key: "p99",
      title: t("operator.scheduler.runtimeColP99"),
      align: "right",
      render: (_v, l) => angkaAtauStrip(l.p99Ms),
    },
    {
      key: "max",
      title: t("operator.scheduler.runtimeColMax"),
      align: "right",
      render: (_v, l) => angkaAtauStrip(l.maxMs),
    },
    {
      key: "rss",
      title: t("operator.scheduler.runtimeColRss"),
      align: "right",
      render: (_v, l) => angkaAtauStrip(mib(l.rssMaxBytes)),
    },
  ];

  const memoryColumns: SaiColumns<JobMemorySummary> = [
    {
      key: "lane",
      title: t("operator.scheduler.queueColLane"),
      align: "left",
      render: (_v, m) => m.lane,
    },
    {
      key: "runs",
      title: t("operator.scheduler.runtimeColRuns"),
      align: "right",
      render: (_v, m) => <span style={TABULAR}>{m.runs}</span>,
    },
    {
      key: "rssPeak",
      title: t("operator.scheduler.runtimeColRssPeak"),
      align: "right",
      render: (_v, m) => angkaAtauStrip(mib(m.rssPeakMaxBytes)),
    },
    {
      key: "heapPeak",
      title: t("operator.scheduler.runtimeColHeapPeak"),
      align: "right",
      render: (_v, m) => angkaAtauStrip(mib(m.heapPeakMaxBytes)),
    },
  ];

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
          <span style={{ ...TABULAR, fontWeight: 500, color: "var(--ant-color-money-negative)" }}>
            {run.errorCount}
          </span>
        ) : (
          <span style={TABULAR}>{run.errorCount}</span>
        ),
    },
  ];

  return (
    /* Kepala di luar kolom berjarak: `PageHeader` membawa jarak bawahnya
       sendiri, jadi menaruhnya DI DALAM kolom ber-`gap` menjumlahkan
       keduanya — pola yang sama dengan halaman dasbor. */
    <div>
      <PageHeader title={t("operator.scheduler.heading")} description={t("operator.scheduler.description")} />
      <div style={CONSOLE_PAGE}>

      <ConsolePanel title={t("operator.scheduler.queueHeading")}>
        {queue === null ? (
          <ConsoleNotice>{t("operator.scheduler.queueUnavailable")}</ConsoleNotice>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
            <StaticTable columns={queueColumns} rows={queue} rowKey={(lane) => lane.lane} />
            <p style={{ ...MUTED, margin: 0 }}>
              {t("operator.scheduler.queueNote", {
                warn: QUEUE_AGE_WARN_SECONDS,
                late: QUEUE_AGE_LATE_SECONDS,
              })}
            </p>
          </div>
        )}
      </ConsolePanel>

      <ConsolePanel title={t("operator.scheduler.metricsHeading")}>
        {metrics === null ? (
          <ConsoleNotice>{t("operator.scheduler.metricsUnavailable")}</ConsoleNotice>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
            <StaticTable columns={metricsColumns} rows={metrics} rowKey={(m) => m.lane} />
            <p style={{ ...MUTED, margin: 0 }}>
              {t("operator.scheduler.metricsNote", { window: METRICS_WINDOW_MINUTES })}
            </p>
          </div>
        )}
      </ConsolePanel>

      <ConsolePanel
        title={t("operator.scheduler.runtimeHeading")}
        description={t("operator.scheduler.runtimeDescription", { days: RUNTIME_EVAL_WINDOW_DAYS })}
        actions={
          runtime === null
            ? undefined
            : verdictBadge(
                stage1dTriggered(runtime.loopVerdict, runtime.memoryVerdict)
                  ? "triggered"
                  : "not_triggered"
              )
        }
      >
        {runtime === null ? (
          <ConsoleNotice>{t("operator.scheduler.runtimeUnavailable")}</ConsoleNotice>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
            <StaticTable columns={triggerColumns} rows={triggerRows} rowKey={(r) => r.key} />

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
              <h3 style={SUBHEADING}>{t("operator.scheduler.runtimeLoopHeading")}</h3>
              {runtime.loop.length === 0 ? (
                <p style={{ ...MUTED, margin: 0 }}>{t("operator.scheduler.runtimeLoopEmpty")}</p>
              ) : (
                <StaticTable columns={loopColumns} rows={runtime.loop} rowKey={(l) => l.source} />
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
              <h3 style={SUBHEADING}>{t("operator.scheduler.runtimeMemoryHeading")}</h3>
              {runtime.jobs.length === 0 ? (
                <p style={{ ...MUTED, margin: 0 }}>{t("operator.scheduler.runtimeMemoryEmpty")}</p>
              ) : (
                <StaticTable columns={memoryColumns} rows={runtime.jobs} rowKey={(m) => m.lane} />
              )}
            </div>

            <p style={{ ...MUTED, margin: 0 }}>{t("operator.scheduler.runtimeNote")}</p>
          </div>
        )}
      </ConsolePanel>

      {runs === null ? (
        <ConsoleNotice>{t("operator.scheduler.unavailable")}</ConsoleNotice>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<CalendarOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
          title={t("operator.scheduler.empty")}
        />
      ) : (
        <div style={CONSOLE_PAGE}>
          {/* Tabel putaran tanpa judul panel: `<h1>` halaman sudah menyebutnya
              ("Penjadwal"), dan judul kedua yang mengulangnya memberi pembaca
              layar dua simpul untuk satu wilayah. */}
          <ConsolePanel flush>
            <StaticTable columns={columns} rows={runs} rowKey={(run) => run.id} />
          </ConsolePanel>

          {latest && (
            <ConsolePanel
              title={t("operator.scheduler.lastRunHeading", {
                date: formatDateTime(latest.startedAt),
              })}
            >
              <div
                style={{
                  display: "grid",
                  gap: "var(--ant-margin)",
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
            </ConsolePanel>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
