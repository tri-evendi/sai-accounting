/**
 * Rincian Jurnal — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 *
 * ── Jurnal harus TERLIHAT seimbang ─────────────────────────────────────────
 * Debit = kredit tidak boleh hanya divalidasi di server; ia harus terbaca di
 * layar. Baris totalnya karena itu lewat `summary` `StaticTable` — satu baris
 * kaki dengan label ber-`colSpan`, `Badge` berteks "Seimbang"/"Tidak seimbang"
 * di sebelahnya, lalu kedua kolom nominalnya berdiri tepat di bawah angkanya
 * sendiri. `Badge` mewarnai dirinya sendiri (token `Tag`), jadi warnanya benar
 * tanpa satu pun hook di berkas server ini — dan katanya tetap ada, karena
 * warna tak pernah jadi penanda tunggal.
 *
 * ── Peringatan pembalikan: ikon + kata, bukan warna ────────────────────────
 * Kedua pemberitahuan ("sudah dibalik" / "ini jurnal pembalik") berdiri DI LUAR
 * `<Card>`, dan di luar pohon komponen AntD variabel `--ant-…` tidak teratasi
 * (lihat kepala `shared/aging.tsx`). Statusnya karena itu dibawa `Badge` di
 * slot `badge` `PageHeader` — sebuah primitif yang mewarnai dirinya sendiri —
 * sedangkan kalimat penjelasnya memakai IKON + KATA, jalan yang sama dengan
 * yang dipilih #194/#195.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable, type SummaryRow } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "@/components/ui/app-link";
import { ReverseButton } from "./reverse-button";
import { getT } from "@/lib/i18n/server";
import { RollbackOutlined, UndoOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/** `marginXS` 8 · `marginXXS` 4 — token AntD sebagai angka (tanpa hook di sini). */
const INLINE_GAP = 8;
const TIGHT_GAP = 4;
/** Jarak antar pemberitahuan di atas kartu. */
const NOTICE_GAP = 16;

/** Satu baris jurnal, diratakan supaya kolomnya bertipe penuh. */
interface LineRow {
  id: number;
  code: string;
  name: string;
  /** Keterangan valas & memo, sudah dirangkai — kosong bila tak ada. */
  aside: string | null;
  debit: number;
  credit: number;
  costCenter: string;
}

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("journal.read", params);
  const t = await getT();
  const { id } = await params;

  const journal = await prisma.journal.findUnique({
    where: { id: parseInt(id) },
    include: {
      // issue #91 — pusat biaya dibaca PER BARIS, karena di situlah dimensinya
      // hidup: satu jurnal boleh mencakup lebih dari satu cabang.
      lines: { include: { account: true, costCenter: true }, orderBy: { id: "asc" } },
      reversalOf: true,
      reversals: true,
    },
  });

  if (!journal) notFound();

  const totalDebit = journal.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalCredit = journal.lines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const balanced = totalDebit === totalCredit;
  const canReverse = !journal.isReversed && journal.type !== "reversal";
  // Kolomnya hanya muncul bila jurnal ini memang bertag — jurnal lama (dan
  // perusahaan yang belum memakai pusat biaya) tak perlu melihat kolom kosong.
  const showCostCenter = journal.lines.some((l) => l.costCenterId != null);

  const rows: LineRow[] = journal.lines.map((l) => {
    const foreign =
      l.currency !== "IDR"
        ? `(${formatCurrency(Number(l.debit) || Number(l.credit), l.currency)} @ ${Number(l.rate)})`
        : null;
    const memo = l.memo ? `— ${l.memo}` : null;
    return {
      id: l.id,
      code: l.account.code,
      name: l.account.name,
      aside: [foreign, memo].filter(Boolean).join(" ") || null,
      debit: Number(l.baseDebit),
      credit: Number(l.baseCredit),
      costCenter: l.costCenter ? `${l.costCenter.code} — ${l.costCenter.name}` : "—",
    };
  });

  /** Nominal sisi debit/kredit: nol berarti "baris ini bukan sisi itu" → "—". */
  const sideCell = (value: number) =>
    value > 0 ? (
      <Money value={value} currency="IDR" hideCurrency />
    ) : (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>—</span>
    );

  const columns: SaiColumns<LineRow> = [
    {
      key: "code",
      dataIndex: "code",
      title: t("journal.colCode"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontFamily: "var(--ant-font-family-code)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      key: "name",
      dataIndex: "name",
      title: t("common.account"),
      align: "left",
      render: (_v, row) => (
        <>
          {row.name}
          {row.aside && (
            <span style={{ color: "var(--ant-color-text-secondary)" }}>
              {" "}
              <small>{row.aside}</small>
            </span>
          )}
        </>
      ),
    },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("journal.colDebitIdr"),
      align: "right",
      render: (_v, row) => sideCell(row.debit),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("journal.colCreditIdr"),
      align: "right",
      render: (_v, row) => sideCell(row.credit),
    },
    ...(showCostCenter
      ? [
          {
            key: "costCenter",
            dataIndex: "costCenter" as const,
            title: t("journal.colCostCenter"),
            align: "left" as const,
            render: (_v: unknown, row: LineRow) => (
              <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.costCenter}</span>
            ),
          },
        ]
      : []),
  ];

  /**
   * Baris total. Label + lencana keseimbangan membentang di atas dua kolom
   * pertama, lalu Σ debit dan Σ kredit berdiri tepat di bawah kolomnya —
   * sehingga "debit = kredit" bisa DIBACA, bukan cuma dipercaya.
   */
  const summary: readonly SummaryRow[] = [
    {
      cells: {
        code: {
          content: (
            <span
              style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: INLINE_GAP,
              }}
            >
              {t("common.total")}
              {balanced ? (
                <Badge variant="success">{t("journal.balanced")}</Badge>
              ) : (
                <Badge variant="danger">{t("journal.unbalanced")}</Badge>
              )}
            </span>
          ),
          colSpan: 2,
          align: "left",
        },
        debit: <Money value={totalDebit} currency="IDR" hideCurrency />,
        credit: <Money value={totalCredit} currency="IDR" hideCurrency />,
      },
    },
  ];

  /** Satu pemberitahuan di atas kartu — ikon + kata, tanpa warna token. */
  const notice = (Icon: typeof UndoOutlined, body: React.ReactNode) => (
    <p
      style={{
        margin: 0,
        marginBottom: NOTICE_GAP,
        display: "flex",
        alignItems: "flex-start",
        gap: TIGHT_GAP,
      }}
    >
      <Icon aria-hidden="true" style={{ flexShrink: 0, marginTop: TIGHT_GAP / 2 }} />
      <span>{body}</span>
    </p>
  );

  const monoLink = (href: string, label: string) => (
    <Link href={href} style={{ fontFamily: "var(--ant-font-family-code)" }}>
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("journal.breadcrumb"), href: "/journal" }, { label: journal.number }]}
        title={<span style={{ fontFamily: "var(--ant-font-family-code)" }}>{journal.number}</span>}
        description={formatDate(journal.date)}
        badge={
          journal.isReversed ? (
            <Badge variant="warning">{t("journal.statusReversed")}</Badge>
          ) : journal.type === "reversal" ? (
            <Badge variant="default">{t("journal.statusReversal")}</Badge>
          ) : undefined
        }
        actions={canReverse && <ReverseButton journalId={journal.id} />}
      />

      {journal.isReversed &&
        notice(
          UndoOutlined,
          journal.reversals[0] ? (
            <>
              {t("journal.reversedByBefore")}{" "}
              {monoLink(`/journal/${journal.reversals[0].id}`, journal.reversals[0].number)}
              {t("journal.reversedByAfter")}
            </>
          ) : (
            <>
              {t("journal.reversedNotice")}
              {t("common.fullStop")}
            </>
          )
        )}

      {journal.reversalOf &&
        notice(
          RollbackOutlined,
          <>
            {t("journal.reversalOfBefore")}{" "}
            {monoLink(`/journal/${journal.reversalOf.id}`, journal.reversalOf.number)}
            {t("journal.reversalOfAfter")}
          </>
        )}

      {journal.note && (
        <p style={{ margin: 0, marginBottom: NOTICE_GAP }}>
          <strong>{t("journal.noteLabel")}</strong> {journal.note}
        </p>
      )}

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          summary={summary}
        />
      </Card>
    </div>
  );
}
