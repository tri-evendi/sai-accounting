/**
 * Tabel Neraca Saldo untuk LAYAR (issue #275).
 *
 * ── Kenapa ia komponen sendiri, bukan bagian halamannya ────────────────────
 * Alasan yang sama dengan `<CashFlowStatement>` (#241) dan
 * `<BalanceSheetStatement>` (#258): penjaga bentuknya harus bisa MERENDERNYA.
 * Selama bentuk layar hidup di dalam `page.tsx` — server component async yang
 * membaca Prisma, sesi, dan kamus — satu-satunya cara mengujinya adalah
 * menyalin logikanya ke dalam tes, dan salinan yang setuju dengan dirinya
 * sendiri tidak menjaga apa pun. Di sini ia fungsi murni atas
 * `StatementPayload`: **payload yang sama persis** yang dikirim tombol PDF dan
 * tombol Excel di sebelahnya. Ketiga permukaan memakan satu masukan dan satu
 * penentu bentuk (`trialBalanceLayout()`).
 *
 * Tetap SERVER component: tidak ada `"use client"`, tidak ada impor `antd`
 * runtime. Halaman laporan tetap HTML.
 *
 * ── Buku kosong: keadaan kosong DI SINI, bukan di halamannya ───────────────
 * Bentuk kanonik sebuah buku kosong adalah satu baris kalimat tanpa baris
 * Total. Di layar kalimat itu digambar `EmptyState` — dengan penjelas dan,
 * bila penggunanya memang boleh mencatat, satu ajakan bertindak. Itu tambahan
 * yang tidak punya padanan di kertas, persis seperti lencana keseimbangan;
 * yang WAJIB sama di ketiga permukaan adalah bahwa barisnya ada, bahwa ia
 * diawali kalimat yang sama, dan bahwa tidak ada baris Total di belakangnya.
 *
 * Keadaan kosongnya dibangun di sini, bukan dioper halaman sebagai prop, supaya
 * yang dirender penjaga bentuk adalah keadaan kosong yang SUNGGUHAN.
 */
import { ReconciliationOutlined } from "@ant-design/icons";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import {
  splitTrialBalanceRows,
  trialBalanceLayout,
  type TrialBalanceLabels,
  type TrialBalanceLayoutRow,
} from "@/lib/statement-layout";

export type TrialBalancePayload = Extract<StatementPayload, { kind: "trial-balance" }>;

/** Penerjemah halaman, diteruskan apa adanya (server → server, tanpa serialisasi). */
export type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Kode akun: monospace + tabular supaya digitnya berbaris lurus ke bawah. */
const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Label baris dari kamus. Nilai Indonesia-nya SAMA PERSIS dengan
 * `TRIAL_BALANCE_PRINT_LABELS`, dan itu yang membuat penjaga bentuk bisa
 * membandingkan layar dengan cetakan tanpa tabel padanan.
 */
function screenLabels(t: T): TrialBalanceLabels {
  return {
    empty: t("reports.trialBalanceEmptyTitle"),
    total: t("common.total"),
  };
}

/**
 * Sel nominal layar. Tiga keadaan, dan ketiganya berbeda:
 *  • `null` — kolom ini tidak berlaku untuk baris ini → sel KOSONG;
 *  • `0` — berlaku tapi akun itu tidak bersaldo di sisi ini → "—", bukan "Rp 0";
 *  • sisanya — nominalnya.
 */
function amountCell(value: number | null) {
  return value === null ? null : <Money value={value || undefined} currency="IDR" />;
}

export function TrialBalanceStatement({
  payload,
  t,
  actionLabel,
  actionHref,
}: {
  payload: TrialBalancePayload;
  t: T;
  /** Ajakan bertindak keadaan kosong — hanya bila penggunanya boleh mencatat. */
  actionLabel?: string;
  actionHref?: string;
}) {
  const { body, foot } = splitTrialBalanceRows(trialBalanceLayout(payload, screenLabels(t)));
  // Baris `empty` bentuk kanonik digambar `EmptyState`, bukan baris tabel —
  // lihat kepala berkas.
  const lines = body.filter((row) => row.kind === "line");

  const columns: SaiColumns<TrialBalanceLayoutRow> = [
    {
      ...textColumn<TrialBalanceLayoutRow>({
        dataIndex: "code",
        title: t("accounts.colCode"),
      }),
      render: (_raw, row) => <span style={CODE_STYLE}>{row.code}</span>,
    },
    textColumn<TrialBalanceLayoutRow>({ dataIndex: "name", title: t("accounts.nameField") }),
    {
      /*
       * Judul kolom memakai kunci `journal.*` yang sudah ada — nilainya persis
       * "Debit (IDR)"/"Kredit (IDR)" di ketiga bahasa, dan itu memang judul
       * yang sama untuk angka yang sama. Menambah kunci kedua berbunyi identik
       * hanya menciptakan dua tempat yang bisa berbeda bunyi besok.
       */
      ...moneyColumn<TrialBalanceLayoutRow>({
        dataIndex: "debit",
        title: t("journal.colDebitIdr"),
      }),
      render: (_raw, row) => amountCell(row.debit),
    },
    {
      ...moneyColumn<TrialBalanceLayoutRow>({
        dataIndex: "credit",
        title: t("journal.colCreditIdr"),
      }),
      render: (_raw, row) => amountCell(row.credit),
    },
  ];

  return (
    <StaticTable<TrialBalanceLayoutRow>
      columns={columns}
      rows={lines}
      rowKey={(row) => row.code ?? row.label}
      /*
       * Kaki: label + lencana membentang dua kolom pertama, lalu kedua
       * totalnya. Larik ini KOSONG pada buku yang belum punya jurnal, dan itu
       * yang membuat layar, PDF, dan lembar sebar sepakat (issue #275).
       */
      summary={foot.map((row) => ({
        cells: {
          code: {
            content: (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
              >
                {row.name}
                {/* Keseimbangan: lencana di layar, tanda kurung di cetakan —
                    anotasi yang sama, bentuk yang berbeda per permukaan. */}
                {payload.balanced ? (
                  <Badge variant="success">{t("reports.balanced")}</Badge>
                ) : (
                  <Badge variant="danger">{t("reports.unbalanced")}</Badge>
                )}
              </span>
            ),
            colSpan: 2,
            scope: "row" as const,
          },
          debit: amountCell(row.debit),
          credit: amountCell(row.credit),
        },
      }))}
      empty={
        <EmptyState
          icon={<ReconciliationOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("reports.trialBalanceEmptyTitle")}
          description={t("reports.trialBalanceEmptyDescription")}
          actionLabel={actionLabel}
          actionHref={actionHref}
        />
      }
    />
  );
}
