/**
 * Transaksi Berulang — daftar templat + kapan masing-masing terbit lagi
 * (issue #469, tahap 3).
 *
 * **Tetap server component**: tanpa `antd`, tanpa `theme.useToken()`. Warnanya
 * dari primitif yang mewarnai dirinya sendiri (`Badge`) dan variabel `--ant-…`
 * di dalam pohon `<Card>` — aturan yang sama dengan daftar master lain.
 *
 * ══ TIGA HAL YANG WAJIB TERBACA DI SINI ═════════════════════════════════════
 *  1. **Kapan terbit berikutnya** — dihitung, bukan disimpan. Kolom yang
 *     menyimpannya akan basi diam-diam setiap kali aturannya disunting.
 *  2. **Bahwa yang terbit MENUNGGU PERSETUJUAN.** Pengguna yang mengira
 *     dokumennya langsung masuk buku akan bingung mencarinya di laporan, lalu
 *     membuatnya lagi secara manual — dan bukunya berisi dua.
 *  3. **Kejadian yang DITAHAN**, beserta sebabnya. Penahanan yang hanya hidup
 *     di log adalah fitur yang tampak rusak.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";
import { formatDateShort } from "@/lib/utils";
import { nextOccurrence, type RecurrenceRule } from "@/lib/recurring";
import { RetweetOutlined } from "@ant-design/icons";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;
/** Berapa kejadian terakhir yang diperlihatkan per templat. */
const HISTORY_ROWS = 5;

interface TemplateRow {
  id: number;
  name: string;
  kind: string;
  sourceId: number;
  frequency: string;
  isActive: boolean;
  nextAt: Date | null;
}

export default async function RecurringPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("invoice.read", params);
  const t = await getT();

  const templates = await prisma.recurringTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
    include: {
      occurrences: { orderBy: { occurrenceDate: "desc" }, take: HISTORY_ROWS },
    },
  });

  const today = new Date();
  const rows: TemplateRow[] = templates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    kind: tpl.kind,
    sourceId: tpl.sourceId,
    frequency: tpl.frequency,
    isActive: tpl.isActive,
    nextAt: tpl.isActive ? nextOccurrence(ruleOf(tpl), today) : null,
  }));

  const freqLabel = (f: string) =>
    f === "weekly"
      ? t("recurring.freqWeekly")
      : f === "yearly"
        ? t("recurring.freqYearly")
        : t("recurring.freqMonthly");

  const columns: SaiColumns<TemplateRow> = [
    {
      key: "name",
      dataIndex: "name",
      title: t("recurring.colName"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/recurring/${row.id}/edit`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "kind",
      dataIndex: "kind",
      title: t("recurring.colKind"),
      align: "left",
      render: (_v, row) =>
        row.kind === "journal" ? t("recurring.kindJournal") : t("recurring.kindInvoice"),
    },
    {
      key: "frequency",
      dataIndex: "frequency",
      title: t("recurring.colFrequency"),
      align: "left",
      render: (_v, row) => freqLabel(row.frequency),
    },
    {
      key: "source",
      dataIndex: "sourceId",
      title: t("recurring.colSource"),
      align: "left",
      render: (_v, row) =>
        row.kind === "invoice" ? (
          <Link href={`/invoices/${row.sourceId}`} style={{ color: "var(--ant-color-link)" }}>
            #{row.sourceId}
          </Link>
        ) : (
          <span>#{row.sourceId}</span>
        ),
    },
    {
      key: "next",
      dataIndex: "nextAt",
      title: t("recurring.colNext"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {row.nextAt ? formatDateShort(row.nextAt) : t("recurring.nextNone")}
        </span>
      ),
    },
    {
      key: "status",
      dataIndex: "isActive",
      title: t("recurring.colStatus"),
      align: "left",
      render: (_v, row) => (
        <Badge variant={row.isActive ? "success" : "default"}>
          {row.isActive ? t("recurring.statusActive") : t("recurring.statusInactive")}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("recurring.title")}
        description={t("recurring.description")}
        /* Halaman ini BUKAN tempat templat dibuat — sebuah templat selalu
            lahir dari faktur yang sudah ada. Jadi tombolnya `secondary`, dan
            keadaan kosongnya yang mengarahkan ke jalan yang benar. */
        actions={
          <ButtonLink href="/recurring/new" variant="secondary">
            {t("recurring.addNew")}
          </ButtonLink>
        }
      />

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<RetweetOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("recurring.emptyTitle")}
              description={t("recurring.emptyDescription")}
            />
          }
        />
      </Card>

      {/* Riwayat kejadian — termasuk yang DITAHAN beserta sebabnya. Penahanan
          yang hanya hidup di log adalah fitur yang tampak rusak. */}
      {templates.some((tpl) => tpl.occurrences.length > 0) && (
        <Card style={{ marginTop: 24 }}>
          <CardHeader>
            <CardTitle level={2}>{t("recurring.historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.flatMap((tpl) =>
                tpl.occurrences.map((o) => (
                  <p key={o.id} style={{ margin: 0, fontSize: "var(--ant-font-size-sm)" }}>
                    <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{tpl.name}</span>{" "}
                    · <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatDateShort(o.occurrenceDate)}
                    </span>{" "}
                    ·{" "}
                    {o.status === "created"
                      ? t("recurring.statusCreated")
                      : o.status === "held_period"
                        ? t("recurring.statusHeldPeriod")
                        : t("recurring.statusHeldSource")}
                    {o.note && (
                      <span style={{ color: "var(--ant-color-text-secondary)" }}> — {o.note}</span>
                    )}
                  </p>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card style={{ marginTop: 24 }}>
        <CardContent>
          <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
            {t("recurring.approvalNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ruleOf(tpl: {
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  maxOccurrences: number | null;
}): RecurrenceRule {
  return {
    frequency: tpl.frequency as RecurrenceRule["frequency"],
    startDate: tpl.startDate,
    endDate: tpl.endDate,
    maxOccurrences: tpl.maxOccurrences,
  };
}
