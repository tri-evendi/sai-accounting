/**
 * Laporan Kas & Bank — saldo awal, perubahan, dan saldo akhir tiap akun kas &
 * bank pada satu periode (katalog: `cash-bank`).
 *
 * ── Kenapa halaman sendiri, bukan `/finance` ─────────────────────────────────
 * Kartu katalog ini dulu menunjuk halaman modul keuangan. Halaman itu tempat
 * MENCATAT kas masuk & keluar: daftar transaksinya terpaginasi dan disaring per
 * jenis/mata uang. Laporan ini menjawab pertanyaan lain — bukan "transaksi apa
 * saja", melainkan "tiap rekening bergerak dari berapa ke berapa".
 *
 * ── Pembaca yang sama dengan Arus Kas ────────────────────────────────────────
 * Angkanya datang dari `getCashFlow`, bukan penghitungan kedua. Itu disengaja:
 * "perubahan" di laporan ini adalah arus kas bersih di laporan sebelah, dan dua
 * penghitung yang berselisih akan membuat dua laporan pada satu periode
 * menyebut angka berbeda untuk hal yang sama.
 *
 * ── Konversi ke `StaticTable` + token AntD (issue #198) ────────────────────
 * **Tetap server component.** Kolomnya disusun dari daftar id `cashBankColumns()`
 * — penentu yang sama dengan PDF & lembar sebarnya — satu id → satu kolom lewat
 * `columnFor`, bukan daftar kolom kedua di sebelahnya.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getCashFlow } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { reportById, resolvePeriod, columnLabels } from "@/lib/report-catalog";
import { cashBankPayload } from "@/lib/report-payload";
import { cashBankColumns, type CashBankColumnId } from "@/lib/statement-layout";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { BankOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Satu baris laporan — bentuk yang dibaca kolom di bawah. */
interface CashBankRow {
  code: string;
  name: string;
  opening: number;
  net: number;
  closing: number;
}

export default async function CashBankReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string; cols?: string }>;
}) {
  // Izin KAS, bukan `report.read`: isinya mutasi rekening, dan sebuah laporan
  // tidak melonggarkan siapa yang boleh melihat datanya.
  await requirePagePermission("cash.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  const cf = await getCashFlow(from, to);
  // Katalog adalah sumber daftar kolomnya. Entri yang hilang berarti kontraknya
  // hilang — `notFound()` lebih jujur daripada merender laporan tanpa bentuk
  // yang disepakati layar dan berkasnya.
  const definition = reportById("cash-bank");
  if (!definition) notFound();
  const payload = cashBankPayload(definition, from, to, cf, sp.cols);

  const cols = cashBankColumns(payload);
  /* Judul kolom DITURUNKAN dari katalog (#324): pilihan kuncinya hidup di
     satu tempat, jadi tidak ada kunci kedua yang bisa menyimpang. */
  const HEADERS = columnLabels<CashBankColumnId>("cash-bank", t);

  /** Satu id kolom -> satu kolom tabel. Tidak ada id yang tak punya bentuk. */
  function columnFor(id: CashBankColumnId): SaiColumns<CashBankRow>[number] {
    if (id === "account") {
      return {
        key: "account",
        dataIndex: "name",
        title: HEADERS.account,
        align: "left",
        render: (_v, r) => (
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
      };
    }
    const column = moneyColumn<CashBankRow>({ dataIndex: id, title: HEADERS[id] });
    // Saldo akhir adalah angka yang dicari orang di baris ini — tebal, seperti
    // sebelum konversi.
    return id === "closing"
      ? {
          ...column,
          render: (_v, r) => (
            <Money
              value={r.closing}
              currency="IDR"
              style={{ fontWeight: "var(--ant-font-weight-strong)" }}
            />
          ),
        }
      : column;
  }

  const columns: SaiColumns<CashBankRow> = cols.map(columnFor);

  // Baris total dipetakan per KUNCI kolom, jadi ia ikut menyusut bersama
  // pilihan kolom pengguna dan tak bisa meleset satu kolom.
  const summary: Record<string, React.ReactNode> = {
    account: t("common.total"),
    opening: <Money value={payload.openingCash} currency="IDR" />,
    net: <Money value={payload.netChange} currency="IDR" />,
    closing: <Money value={payload.closingCash} currency="IDR" />,
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.cash_bank.title") },
        ]}
        title={t("reports.catalogReport.cash_bank.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/cash-bank" from={fromISO} to={toISO} />

      <Card>
        {/* `StaticTable`: laporan ini hanya MENAMPILKAN — periodenya dipilih di
            atas dan memuat ulang di server. */}
        <StaticTable<CashBankRow>
          columns={columns}
          rows={payload.rows}
          rowKey={(r) => r.code}
          summary={summary}
          empty={
            <EmptyState
              icon={<BankOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("reports.noCashMovement")}
            />
          }
        />
      </Card>
    </div>
  );
}
