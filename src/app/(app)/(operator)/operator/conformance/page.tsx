/**
 * Riwayat SAPUAN KESESUAIAN DATA — konsol operator.
 *
 * Membaca `conformance_runs` (migration platform 0018, ditulis
 * `scripts/check-data-conformance.ts` di akhir setiap putaran). Sebelum tabel
 * itu lahir, temuan sapuan HANYA hidup di stdout container — dan pada cadensi
 * MINGGUAN itu berarti cacat bisa berumur berbulan-bulan sebelum ada yang
 * membuka lognya. Dua layanan latar lain sudah punya jejak yang bisa ditanyai;
 * yang ini dulu satu-satunya yang tidak.
 *
 * ── Bentuknya meniru `/operator/scheduler`, dengan sengaja ────────────────
 * `StaticTable` (aturan #189: sepuluh baris terakhir, nol kendali interaktif —
 * tidak ada yang dibeli dengan rc-table), `ConsolePanel`/`ConsoleNotice` dari
 * `components/operator/console-ui`, warna lewat token `var(--ant-…)` (#203).
 * Pola yang sudah terbukti tidak perlu ditemukan ulang, dan pembacanya jadi
 * bisa memakai bentuk berpikir yang sama di kedua halaman.
 *
 * ── TIGA status, bukan dua ────────────────────────────────────────────────
 * `ok` (bersih) · `findings` (berjalan dan MENEMUKAN sesuatu — bukan kegagalan
 * layanan) · `error` (ada buku yang GAGAL diperiksa). Yang terakhir ditandai
 * sekeras `findings` dengan sengaja: buku yang tidak terperiksa BUKAN buku yang
 * bersih, dan sapuan yang melewatkan satu buku akan terbaca hijau selamanya
 * kalau kegagalannya diperlakukan sebagai catatan pinggir.
 *
 * Angka temuan & kegagalan jadi penanda utamanya; warna hanya menguatkan —
 * warna bukan sinyal tunggal (MASTER.md).
 */

import { FileSearchOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
} from "@/components/operator/console-ui";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperatorPage } from "@/lib/operator/guard";
import { conformanceRunsForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { SPACE_XS } from "@/lib/layout-scale";

export const dynamic = "force-dynamic";

const MUTED = CONSOLE_MUTED;

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const NOWRAP_MUTED: React.CSSProperties = {
  whiteSpace: "nowrap",
  color: "var(--ant-color-text-secondary)",
};

/** Angka yang MENUNTUT perhatian: tebal + merah, tapi angkanya tetap yang utama. */
const PERLU_TINDAKAN: React.CSSProperties = {
  ...TABULAR,
  fontWeight: 500,
  color: "var(--ant-color-money-negative)",
};

function RunList({
  heading,
  items,
  emptyLabel,
  note,
}: {
  heading: string;
  items: string[];
  emptyLabel: string;
  note?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE_XS }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ant-color-text)" }}>
        {heading}
      </h3>
      {items.length === 0 ? (
        <p style={MUTED}>{emptyLabel}</p>
      ) : (
        <>
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
          {note && <p style={MUTED}>{note}</p>}
        </>
      )}
    </div>
  );
}

type ConformanceRun = NonNullable<Awaited<ReturnType<typeof conformanceRunsForOperator>>>[number];

export default async function OperatorConformancePage() {
  await requireOperatorPage();
  const t = await getT();

  const runs = await conformanceRunsForOperator(10);
  const latest = runs?.[0] ?? null;

  const columns: SaiColumns<ConformanceRun> = [
    {
      key: "started",
      title: t("operator.conformance.colStarted"),
      align: "left",
      render: (_v, run) => <span style={NOWRAP_MUTED}>{formatDateTime(run.startedAt)}</span>,
    },
    {
      key: "finished",
      title: t("operator.conformance.colFinished"),
      align: "left",
      render: (_v, run) => <span style={NOWRAP_MUTED}>{formatDateTime(run.finishedAt)}</span>,
    },
    {
      key: "status",
      title: t("operator.conformance.colStatus"),
      align: "left",
      render: (_v, run) => (
        <Badge
          variant={
            run.status === "ok" ? "success" : run.status === "findings" ? "warning" : "danger"
          }
        >
          {run.status === "ok"
            ? t("operator.conformance.statusOk")
            : run.status === "findings"
              ? t("operator.conformance.statusFindings")
              : t("operator.conformance.statusError")}
        </Badge>
      ),
    },
    {
      key: "checked",
      title: t("operator.conformance.colChecked"),
      align: "right",
      render: (_v, run) => <span style={TABULAR}>{run.companiesChecked}</span>,
    },
    {
      key: "failed",
      title: t("operator.conformance.colFailed"),
      align: "right",
      /* Buku yang tidak terperiksa bukan buku yang bersih — ditandai sekeras
         temuan, bukan sebagai catatan pinggir. */
      render: (_v, run) => (
        <span style={run.companiesFailed > 0 ? PERLU_TINDAKAN : TABULAR}>
          {run.companiesFailed}
        </span>
      ),
    },
    {
      key: "findings",
      title: t("operator.conformance.colFindings"),
      align: "right",
      render: (_v, run) => (
        <span style={run.findingCount > 0 ? PERLU_TINDAKAN : TABULAR}>{run.findingCount}</span>
      ),
    },
  ];

  return (
    /* Kepala di luar kolom berjarak: `PageHeader` membawa jarak bawahnya
       sendiri — pola yang sama dengan `/operator/scheduler`. */
    <div>
      <PageHeader
        title={t("operator.conformance.heading")}
        description={t("operator.conformance.description")}
      />
      <div style={CONSOLE_PAGE}>
        {runs === null ? (
          <ConsoleNotice>{t("operator.conformance.unavailable")}</ConsoleNotice>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<FileSearchOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
            title={t("operator.conformance.empty")}
          />
        ) : (
          <div style={CONSOLE_PAGE}>
            {/* Tanpa judul panel: `<h1>` halaman sudah menyebutnya, dan judul
                kedua yang mengulangnya memberi pembaca layar dua simpul untuk
                satu wilayah. */}
            <ConsolePanel flush>
              <StaticTable columns={columns} rows={runs} rowKey={(run) => run.id} />
            </ConsolePanel>

            {latest && (
              <ConsolePanel
                title={t("operator.conformance.lastRunHeading", {
                  date: formatDateTime(latest.startedAt),
                })}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
                  <RunList
                    heading={t("operator.conformance.listFindings")}
                    items={latest.details?.findings ?? []}
                    emptyLabel={t("operator.conformance.listEmpty")}
                    /* Jejaknya memang dipangkas di sumbernya (200 baris): satu
                       putaran bisa menghasilkan ribuan temuan, dan halaman ini
                       dibaca untuk tahu APA yang harus diperiksa — bukan untuk
                       menggantikan pemeriksaannya. Jumlah utuhnya disebut,
                       supaya pembacanya tidak menyangka ini daftar lengkap. */
                    note={
                      latest.findingCount > (latest.details?.findings.length ?? 0)
                        ? t("operator.conformance.findingsTruncated", {
                            shown: String(latest.details?.findings.length ?? 0),
                            total: String(latest.findingCount),
                          })
                        : undefined
                    }
                  />
                  <RunList
                    heading={t("operator.conformance.listFailures")}
                    items={latest.details?.failures ?? []}
                    emptyLabel={t("operator.conformance.listEmpty")}
                    note={t("operator.conformance.failuresWhy")}
                  />
                </div>
              </ConsolePanel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
