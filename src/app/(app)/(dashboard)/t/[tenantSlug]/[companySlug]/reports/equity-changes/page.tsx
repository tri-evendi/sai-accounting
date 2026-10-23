/**
 * LAPORAN PERUBAHAN EKUITAS (issue #555 · PSAK).
 *
 * Satu dari lima laporan yang dituntut PSAK, dan satu-satunya yang sampai #555
 * MUSTAHIL dibuat: ia justru laporan yang memisahkan hasil tahun berjalan dari
 * tahun-tahun sebelumnya, dan tanpa tutup buku tahunan pemisahan itu tidak
 * pernah ada.
 *
 * ── Angkanya tidak dihitung DI SINI ────────────────────────────────────────
 * Seluruhnya dari `getEquityStatement`, yang kedua ujungnya diturunkan dari
 * `getBalanceSheet()` — bukan dari kueri ekuitas tersendiri. Itu yang membuat
 * rekonsiliasinya sifat KONSTRUKSI: laporan yang menghitung ekuitas dengan
 * caranya sendiri akan cocok hari ini dan berbeda pada aturan berikutnya yang
 * berubah di salah satunya.
 *
 * ── Kenapa TAMBAH dan KURANG dua kolom, bukan satu "mutasi" ────────────────
 * Satu kolom mutasi bersih menampilkan setoran Rp 500 juta yang pada periode
 * yang sama diikuti prive Rp 500 juta sebagai NOL — dua peristiwa yang sangat
 * berbeda artinya, terbaca seperti tidak ada yang terjadi. Laporan perubahan
 * ekuitas yang tidak menunjukkan keduanya tidak menjelaskan perubahan apa pun.
 *
 * ── Bentuknya milik `equityStatementLayout()` (berkas sejak 23 Okt 2026) ───
 * Sejak laporan ini punya Excel & PDF, barisnya — termasuk arah baris laba
 * belum ditutup dan kolom yang tak berlaku di baris Total — disusun di
 * `statement-layout.ts`, satu penentu untuk layar, kertas, dan lembar sebar.
 * Halaman ini tinggal menggambarnya dengan label kamus, dari `payload` yang
 * SAMA dengan yang diterima kedua tombol unduh.
 */
import { notFound } from "next/navigation";
import { LayoutOutlined } from "@ant-design/icons";

import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@sai/core/tenant-routes";
import { getEquityStatement } from "@/lib/reports";
import { Card } from "@sai/ui/card";
import { StaticTable, type SummaryRow } from "@sai/ui/static-table";
import { Money } from "@sai/ui/money";
import { moneyColumn } from "@sai/ui/money-column";
import type { SaiColumns } from "@sai/ui/table-columns";
import { EmptyState } from "@sai/ui/empty-state";
import { PageHeader } from "@sai/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { reportById, resolvePeriod } from "@/lib/report-catalog";
import { equityChangesPayload } from "@/lib/report-payload";
import { equityStatementLayout } from "@/lib/statement-layout";
import { formatDate } from "@sai/core/utils";
import { getT } from "@sai/platform/i18n/server";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — sama dengan laporan tetangganya. */
const EMPTY_ICON_SIZE = 48;

/** Satu baris tabel: komponen ekuitas ATAU laba yang belum ditutup. */
interface EquityRow {
  key: string;
  name: string;
  code: string | null;
  opening: number;
  additions: number;
  reductions: number;
  closing: number;
}

export default async function EquityChangesReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  const statement = await getEquityStatement(from, to);

  const definition = reportById("equity-changes");
  if (!definition) notFound();

  /*
   * SATU payload untuk tiga permukaan: tabel di layar, tombol PDF, dan tombol
   * Excel. Barisnya dari `equityStatementLayout()` dengan label kamus — laba
   * belum ditutup (baris TANPA kode akun; arah geraknya yang menentukan kolom
   * tambah/kurang, supaya rugi tidak tampil sebagai "penambahan negatif"), lalu
   * Total sebagai baris terakhir.
   */
  const payload = equityChangesPayload(from, to, statement);
  const layout = equityStatementLayout(payload, {
    unclosed: t("reports.unclosedIncomeRow"),
    total: t("common.total"),
    note: t("reports.equityReconcileNote"),
  });
  const total = layout[layout.length - 1]!;
  const rows: EquityRow[] = layout.slice(0, -1).map((r) => ({
    key: r.code ?? "unclosed",
    name: r.kind === "line" ? r.name! : r.label,
    code: r.kind === "line" ? r.code! : null,
    opening: r.opening,
    additions: r.additions ?? 0,
    reductions: r.reductions ?? 0,
    closing: r.closing,
  }));

  const money = (id: "opening" | "additions" | "reductions" | "closing", title: string) =>
    moneyColumn<EquityRow>({ dataIndex: id, title, currency: () => "IDR" });

  const columns: SaiColumns<EquityRow> = [
    {
      key: "component",
      title: t("reports.colEquityComponent"),
      align: "left",
      card: "title",
      render: (_v, r) =>
        r.code === null ? (
          /* Dibedakan dengan KATA dan gaya, bukan hanya dengan posisi: baris ini
             bukan akun, dan pembacanya harus tahu itu tanpa menghitung ke
             bawah. Pola yang sama dengan baris "tanpa proyek" di Laba Rugi per
             Proyek. */
          <span style={{ color: "var(--ant-color-text-secondary)", fontStyle: "italic" }}>
            {r.name}
          </span>
        ) : (
          <>
            <span
              style={{
                marginInlineEnd: 8,
                fontFamily: "var(--ant-font-family-code)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {r.code}
            </span>
            {r.name}
          </>
        ),
    },
    money("opening", t("reports.colOpening")),
    money("additions", t("reports.colAdditions")),
    money("reductions", t("reports.colReductions")),
    money("closing", t("reports.colClosing")),
  ];

  /* Baris total ADA, dan itu inti halaman ini: `totalClosing` yang bisa
     dibandingkan mata dengan Total Ekuitas di Neraca pada tanggal yang sama. */
  const summary: SummaryRow[] = [
    {
      cells: {
        component: { content: total.label, scope: "row" },
        opening: <Money value={total.opening} currency="IDR" />,
        additions: "",
        reductions: "",
        closing: <Money value={total.closing} currency="IDR" />,
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.equity_changes.title") },
        ]}
        title={t("reports.catalogReport.equity_changes.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            {/* `sumber` ikut SELALU: laporan ini `go-parity`
                (src/lib/report-engine.ts), dan begitu register beralih ke
                `go` lembar sebarnya dihitung pelari Go dari PARAMETER —
                tanpa `sumber` rute ekspor menjawab 400. */}
            <StatementExcelButton
              payload={payload}
              sumber={{ reportId: "equity-changes", params: { from: fromISO, to: toISO } }}
            />
          </>
        }
      />

      <PeriodFilter basePath="/reports/equity-changes" from={fromISO} to={toISO} />

      <Card>
        <StaticTable<EquityRow>
          cards
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          summary={summary}
          empty={
            <EmptyState
              icon={<LayoutOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("reports.catalogReport.equity_changes.title")}
              description={t("reports.equityReconcileNote")}
            />
          }
        />
      </Card>

      {/* Kalimat rekonsiliasi tetap tampil DI BAWAH tabel, bukan hanya pada
          keadaan kosong: ia janji laporan ini kepada pembacanya, dan justru
          berguna ketika tabelnya berisi. */}
      <p style={{ marginTop: "var(--ant-margin)", color: "var(--ant-color-text-secondary)" }}>
        {t("reports.equityReconcileNote")}
      </p>
    </div>
  );
}
