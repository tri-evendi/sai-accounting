/**
 * Buku Besar per akun — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**: `getAccountLedger()` membaca buku besar lewat
 * Prisma dan hasilnya dirender jadi HTML di sini. Karena itu tanpa `antd` dan
 * tanpa `theme.useToken()` (`tests/rsc-boundary.test.ts`); warna datang dari
 * `Money` (primitif yang mewarnai dirinya sendiri) dan dari variabel `--ant-…`
 * yang hanya dipakai DI DALAM `<Card>`.
 *
 * ── Saldo awal: baris biasa, bukan baris ber-`colSpan` ────────────────────
 * `StaticTable` hanya menyediakan `colSpan` di baris KAKI, bukan di badan —
 * dan itu memang batas yang benar: sel badan ber-`colSpan` membuat jumlah `<td>`
 * per baris tidak lagi tetap, yang persis cara sebuah baris total meleset satu
 * kolom. Saldo awal karena itu jadi baris biasa dengan katanya di kolom
 * pertama (tempat tanggal berdiri di baris lain — konvensi buku besar), diberi
 * latar `colorFillQuaternary` lewat `rowStyle` (#229) supaya tetap terbaca
 * sebagai baris pembuka dan bukan sebagai mutasi.
 */
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { getAccountLedger } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { StaticTable, type SummaryRow } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { formatDateShort } from "@/lib/utils";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { accountTypeLabel } from "@/lib/i18n/labels";
import { LedgerFilter } from "./ledger-filter";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { costCenterFilterLabel, costCenterFilterOptions } from "@/lib/cost-center-options";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

/** `marginLG` 24 — token AntD sebagai angka (tanpa hook di berkas server). */
const SECTION_GAP = 24;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/**
 * Satu baris buku besar. Baris SALDO AWAL memakai bentuk yang sama dengan
 * `kind: "opening"` — supaya tabelnya punya satu tipe baris, bukan dua jalur
 * render yang bisa menyimpang.
 */
interface LedgerRow {
  key: string;
  kind: "opening" | "entry";
  date: string;
  journalId: number | null;
  number: string;
  memo: string;
  debit: number | null;
  credit: number | null;
  balance: number;
}

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ accountId?: string; from?: string; to?: string; costCenter?: string }>;
}) {
  const session = await requirePagePermission("ledger.read", params);
  // issue #103 — "Catat transaksi" menunjuk ke /finance/new, milik modul
  // `cash_bank`. Buku besar sendiri modul INTI, jadi halaman ini tetap ada
  // saat kas/bank dimatikan; ajakannya yang tidak boleh ikut bertahan.
  const canRecordCash = await canOpenPage(session.user, "cash.write");
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const sp = await searchParams;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });

  const accountId = sp.accountId ? parseInt(sp.accountId) : undefined;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;
  // issue #91 — pilahan per pusat biaya, termasuk saldo awalnya (lihat
  // `getAccountLedger`).
  const costCenter = parseCostCenterFilter(sp.costCenter);
  const [costCenterOptions, costCenterName] = await Promise.all([
    costCenterFilterOptions(),
    costCenterFilterLabel(sp.costCenter),
  ]);
  const ledger = accountId
    ? await getAccountLedger(accountId, from, to, undefined, costCenter)
    : null;

  const accountOptions = [
    { value: "", label: t("common.pickAccount") },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
  ];

  /** Sisi debit/kredit: nol berarti "baris ini bukan sisi itu" → "—". */
  const sideCell = (value: number | null) =>
    value != null && value > 0 ? (
      <Money value={value} currency="IDR" />
    ) : (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>—</span>
    );

  const columns: SaiColumns<LedgerRow> = [
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_v, row) =>
        row.kind === "opening" ? (
          <span style={{ fontStyle: "italic", color: "var(--ant-color-text-secondary)" }}>
            {t("ledger.openingBalance")}
          </span>
        ) : (
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {row.date}
          </span>
        ),
    },
    {
      key: "number",
      dataIndex: "number",
      title: t("ledger.colJournalNo"),
      align: "left",
      render: (_v, row) =>
        row.journalId == null ? null : (
          <Link
            href={`/journal/${row.journalId}`}
            style={{
              fontFamily: "var(--ant-font-family-code)",
              color: "var(--ant-color-link)",
            }}
          >
            {row.number}
          </Link>
        ),
    },
    {
      key: "memo",
      dataIndex: "memo",
      title: t("common.description"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.memo}</span>
      ),
    },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("common.debit"),
      align: "right",
      render: (_v, row) => (row.kind === "opening" ? null : sideCell(row.debit)),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("common.credit"),
      align: "right",
      render: (_v, row) => (row.kind === "opening" ? null : sideCell(row.credit)),
    },
    {
      key: "balance",
      dataIndex: "balance",
      title: t("common.balance"),
      align: "right",
      render: (_v, row) => (
        <Money
          style={{ fontWeight: "var(--ant-font-weight-strong)" }}
          value={row.balance}
          currency="IDR"
        />
      ),
    },
  ];

  const rows: LedgerRow[] = ledger
    ? [
        {
          key: "opening",
          kind: "opening",
          date: "",
          journalId: null,
          number: "",
          memo: "",
          debit: null,
          credit: null,
          balance: ledger.opening,
        },
        ...ledger.rows.map((r) => ({
          key: `line-${r.lineId}`,
          kind: "entry" as const,
          date: formatDateShort(r.date),
          journalId: r.journalId,
          number: r.number,
          memo: r.memo ?? r.note ?? "—",
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
        })),
      ]
    : [];

  const summary: readonly SummaryRow[] = ledger
    ? [
        {
          cells: {
            date: { content: t("ledger.totalAndClosing"), colSpan: 3, align: "left" },
            debit: <Money value={ledger.totalDebit} currency="IDR" />,
            credit: <Money value={ledger.totalCredit} currency="IDR" />,
            balance: <Money value={ledger.closing} currency="IDR" />,
          },
        },
      ]
    : [];

  return (
    <div>
      <PageHeader title={t("ledger.title")} />

      <LedgerFilter
        accountOptions={accountOptions}
        accountId={sp.accountId ?? ""}
        from={sp.from ?? ""}
        to={sp.to ?? ""}
        costCenterOptions={costCenterOptions}
        costCenter={sp.costCenter ?? ""}
      />

      {!ledger ? (
        <Card>
          <CardContent>
            <p
              style={{
                margin: 0,
                paddingBlock: "var(--ant-padding-xl)",
                textAlign: "center",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {t("ledger.pickAccountPrompt")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Kepala akun berdiri DI LUAR kartu, jadi tanpa warna token — yang
              membedakannya adalah ukuran & bentuk (kode monospace), bukan warna. */}
          <div style={{ marginBottom: SECTION_GAP }}>
            <h2 style={{ margin: 0 }}>
              <span style={{ fontFamily: "var(--ant-font-family-code)" }}>
                {ledger.account.code}
              </span>{" "}
              — {ledger.account.name}
            </h2>
            <p style={{ margin: 0 }}>
              <small>
                {accountTypeLabel(dictionary, ledger.account.type)} · {t("ledger.normalBalance")}{" "}
                {ledger.account.normalBalance === "debit" ? t("common.debit") : t("common.credit")}
                {costCenterName && (
                  <> · {t("costCenters.filterLabel")}: {costCenterName}</>
                )}
              </small>
            </p>
          </div>

          <Card>
            <StaticTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.key}
              summary={summary}
              // Baris saldo awal ditandai latar, bukan hanya kata — ia bukan
              // mutasi dan tidak boleh terbaca sebagai salah satunya.
              rowStyle={(row) =>
                row.kind === "opening"
                  ? { background: "var(--ant-color-fill-quaternary)" }
                  : undefined
              }
            />
            {/*
             * Keadaan kosong berdiri DI BAWAH tabel, bukan menggantikannya:
             * akun tanpa mutasi TETAP punya saldo awal & saldo akhir, dan
             * menyembunyikan keduanya demi satu kalimat "belum ada transaksi"
             * menghapus jawaban yang justru dicari orang yang membukanya.
             */}
            {ledger.rows.length === 0 && (
              <EmptyState
                icon={<BookOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
                title={t("ledger.emptyTitle")}
                description={t("ledger.emptyDescription")}
                actionLabel={canRecordCash ? t("ledger.emptyAction") : undefined}
                actionHref={canRecordCash ? "/finance/new" : undefined}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
