/**
 * Rincian Pemasok — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**: seluruh pembacaan uang muka, target kompensasi,
 * dan riwayat transaksi berjalan lewat Prisma di sini, dan yang menyeberang ke
 * peramban hanyalah tiga panel client sebagai DAUN. Karena itu tanpa `antd` dan
 * tanpa `theme.useToken()`; warna dari `Badge`/`Money` dan dari variabel
 * `--ant-…` di dalam `<Card>`.
 *
 * ── Satu hal yang HILANG dan disengaja: `[&>td]:align-top` ────────────────
 * Baris pembayaran bisa membawa daftar alokasi bertingkat, jadi tabel lama
 * meratakan semua selnya ke ATAS lewat satu kelas varian. Saat gelombang ini
 * dikerjakan `SaiColumn` hanya menerima `className` (Tailwind — dilarang di
 * sini) dan `rowStyle` `StaticTable` memasang gayanya pada `<tr>`, tempat
 * `vertical-align: top` kalah dari perataan tengah milik `TableCell`. Jadi
 * baris tinggi kini rata TENGAH, sama seperti bawaan tabel AntD.
 *
 * Alat untuk mengembalikannya SUDAH ADA sejak #203: `SaiColumn.cellStyle`
 * memasang gaya pada SELnya. Yang belum dilakukan hanyalah menyetel
 * `verticalAlign: "top"` pada kolom-kolom tabel ini — perubahan tampilan yang
 * pantas berdiri sebagai perubahannya sendiri, bukan diselipkan ke dalam PR
 * pencabutan Tailwind.
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDoneOutlined } from "@ant-design/icons";
import { SupplierTransactionForm } from "./transaction-form";
import { AllocationEditor } from "./allocation-editor";
import { SupplierAdvancePanel } from "./advance-panel";
import {
  getAdvances,
  getSupplierPurchaseTargets,
  isCompensationTarget,
} from "@/lib/advances";
import type { AppliedAdvance } from "@/components/shared/advance-compensation";
import { toBase } from "@/lib/receivables";
import { getT } from "@/lib/i18n/server";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

export const dynamic = "force-dynamic";

/** `marginLG` 24 — token AntD sebagai angka (tanpa hook di berkas server). */
const SECTION_GAP = 24;
/** Lebar dasar satu pasang istilah–nilai. */
const INFO_BASIS = 240;
/** Jarak antar pasangan pada daftar info. */
const INFO_GAP = 16;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Label tampilan untuk `SupplierTransaction.type` — nilai DB tidak berubah. */
const transactionTypeLabels = (t: Awaited<ReturnType<typeof getT>>): Record<string, string> => ({
  purchase: t("suppliers.typePurchase"),
  payment: t("suppliers.typePayment"),
});

/** Satu baris riwayat, diratakan supaya kolomnya bertipe penuh. */
interface TransactionRow {
  id: number;
  date: string;
  type: string;
  isPayment: boolean;
  amount: number;
  currency: string;
  note: string;
  allocations: { id: number; purchaseId: number | null; amount: number; currency: string }[];
  autoOpen: boolean;
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
  /** `?alokasi=1` arrives from the "Perkiraan" badge on /payables (issue #38). */
  searchParams: Promise<{ alokasi?: string }>;
}) {
  // Sejajar dengan halaman daftarnya — tanpa ini, ptg bisa membaca detail
  // pemasok + uang mukanya lewat URL langsung (temuan audit RBAC fase 0).
  await requirePagePermission("supplier.read", params);
  const t = await getT();
  const typeLabels = transactionTypeLabels(t);
  const { id } = await params;
  const { alokasi } = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(id) },
    include: {
      // Allocations come along so each payment row can show which purchases it
      // settles, and offer to change them (issue #38).
      transactions: { orderBy: { date: "desc" }, include: { allocationsMade: true } },
    },
  });

  if (!supplier) notFound();

  // Uang muka pembelian (issue #41). Three reads, one round trip: the advances
  // paid to this supplier with their balances, every purchase valued as a
  // compensation target, and the compensations already recorded against those
  // purchases (so each can be undone from where it is shown).
  const [purchaseAdvances, purchaseTargets, applications, contracts] = await Promise.all([
    getAdvances({ type: "purchase", supplierId: supplier.id }),
    getSupplierPurchaseTargets(supplier.id),
    prisma.advanceApplication.findMany({
      where: { purchase: { supplierId: supplier.id } },
      include: { advance: true },
      orderBy: { date: "asc" },
    }),
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      select: { id: true, contractNo: true, buyer: true },
      take: 200,
    }),
  ]);

  const appliedByPurchase: Record<number, AppliedAdvance[]> = {};
  for (const a of applications) {
    if (a.purchaseId == null) continue;
    (appliedByPurchase[a.purchaseId] ??= []).push({
      id: a.id,
      advanceNo: a.advance.advanceNo,
      date: a.date.toISOString(),
      amount: Number(a.amount),
      currency: a.currency,
      baseAmount: a.baseAmount == null ? null : Number(a.baseAmount),
    });
  }

  // IDR base only, and only from advances that HAVE an IDR value. An unrated
  // foreign advance is counted out loud instead of being folded in at 1:1
  // (issues #35/#36) — the panel shows the count next to the total.
  const openAdvances = purchaseAdvances.filter((a) => !a.isFullyApplied);
  const advanceOutstandingBase = Math.round(
    openAdvances.reduce((s, a) => s + (a.remainingBase ?? 0), 0) * 100
  ) / 100;
  const unratedAdvanceCount = openAdvances.filter((a) => a.remainingBase == null).length;

  const offerableTargets = purchaseTargets.filter((target) =>
    isCompensationTarget(target, (appliedByPurchase[target.id]?.length ?? 0) > 0)
  );
  const unratedPurchaseCount = purchaseTargets.filter((target) => target.remainingBase == null).length;

  // Landing here from the "Perkiraan" badge means the user has just seen a row
  // whose split is at least partly a FIFO guess. That guess is fed by every
  // payment whose RECORDED allocations do not exhaust its own IDR value — not
  // just the fully unallocated ones: a partially allocated payment spills its
  // remainder into the same pool (see `getPayables`). So open the editor on the
  // oldest payment that still has such a remainder (FIFO spends the oldest
  // money first), valuing both sides the way the ledger does (`toBase`), and
  // fall back to the oldest zero-allocation payment — an unrated foreign
  // payment has no IDR value to compare, yet is still the row worth fixing.
  // No candidate at all means the badge should not have been shown; then
  // nothing auto-opens and the page simply shows the payment list.
  const paymentsOldestFirst =
    alokasi === "1"
      ? supplier.transactions
          .filter((tx) => tx.type === "payment")
          .sort((a, b) => a.date.getTime() - b.date.getTime())
      : [];
  const autoOpenPaymentId =
    paymentsOldestFirst.find((p) => {
      const base = toBase(p);
      if (base == null) return false;
      const allocatedBase = p.allocationsMade.reduce((s, a) => s + (toBase(a) ?? 0), 0);
      return base - allocatedBase > EPSILON;
    })?.id ??
    paymentsOldestFirst.find((p) => p.allocationsMade.length === 0)?.id ??
    null;

  const transactionRows: TransactionRow[] = supplier.transactions.map((tx) => ({
    id: tx.id,
    date: formatDate(tx.date),
    type: typeLabels[tx.type] ?? tx.type,
    isPayment: tx.type === "payment",
    amount: Number(tx.amount),
    currency: tx.currency,
    note: tx.note || "-",
    allocations: tx.allocationsMade.map((a) => ({
      id: a.id,
      purchaseId: a.purchaseId,
      amount: Number(a.amount),
      currency: a.currency,
    })),
    autoOpen: autoOpenPaymentId === tx.id,
  }));

  const transactionColumns: SaiColumns<TransactionRow> = [
    { key: "date", dataIndex: "date", title: t("common.date"), align: "left" },
    { key: "type", dataIndex: "type", title: t("suppliers.colType"), align: "left" },
    moneyColumn<TransactionRow>({
      dataIndex: "amount",
      title: t("common.amount"),
      sorter: false,
      currency: (row) => row.currency,
    }),
    {
      key: "currency",
      dataIndex: "currency",
      title: t("common.currency"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.currency}</span>
      ),
    },
    {
      key: "note",
      dataIndex: "note",
      title: t("common.notes"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.note}</span>
      ),
    },
    {
      key: "allocation",
      title: t("suppliers.colAllocation"),
      align: "left",
      render: (_v, row) =>
        !row.isPayment ? (
          <span style={{ color: "var(--ant-color-text-secondary)" }}>-</span>
        ) : (
          <div>
            {row.allocations.length === 0 ? (
              <span title={t("suppliers.estimateTitle")}>
                <Badge variant="warning">{t("suppliers.estimateBadge")}</Badge>
              </span>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {row.allocations.map((a) => (
                  <li key={a.id} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <small>
                      TRX-{a.purchaseId} · <Money value={a.amount} currency={a.currency} />
                    </small>
                  </li>
                ))}
              </ul>
            )}
            <AllocationEditor
              supplierId={supplier.id}
              paymentId={row.id}
              paymentAmount={row.amount}
              paymentCurrency={row.currency}
              allocatedCount={row.allocations.length}
              autoOpen={row.autoOpen}
            />
          </div>
        ),
    },
  ];

  /** Satu pasang istilah–nilai pada kartu informasi. */
  const infoItem = (label: React.ReactNode, value: React.ReactNode) => (
    <div style={{ flex: `1 1 ${INFO_BASIS}px`, minWidth: 0 }}>
      <dt
        style={{
          color: "var(--ant-color-text-secondary)",
          fontWeight: "var(--ant-font-weight-strong)",
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: supplier.name },
        ]}
        title={supplier.name}
        actions={
          <>
            <ButtonLink href={`/suppliers/${id}/edit`} variant="secondary">
              {t("common.edit")}
            </ButtonLink>
            <ButtonLink href="/suppliers" variant="ghost">
              {t("common.back")}
            </ButtonLink>
          </>
        }
      />

      {/* Supplier Info */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader><CardTitle level={2}>{t("suppliers.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: INFO_GAP }}>
            {infoItem(t("common.name"), supplier.name)}
            {infoItem(t("common.address"), supplier.address || "-")}
            {infoItem(t("common.phone"), supplier.phone || "-")}
            {infoItem(t("common.email"), supplier.email || "-")}
          </dl>
        </CardContent>
      </Card>

      {/* Uang muka pembelian (issue #41) — money paid to this supplier before
          their goods/invoice arrived, and the flow that takes it off a purchase. */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("suppliers.advanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierAdvancePanel
            supplier={{ id: supplier.id, name: supplier.name }}
            contracts={contracts}
            advances={purchaseAdvances.map((a) => ({
              id: a.id,
              advanceNo: a.advanceNo,
              date: a.date.toISOString(),
              currency: a.currency,
              amount: a.amount,
              applied: a.applied,
              remaining: a.remaining,
              remainingBase: a.remainingBase,
              unratedApplications: a.unratedApplications,
              isFullyApplied: a.isFullyApplied,
              contractNo: a.contractNo,
            }))}
            outstandingBase={advanceOutstandingBase}
            unratedAdvanceCount={unratedAdvanceCount}
            purchases={offerableTargets.map((target) => ({
              id: target.id,
              label: target.label,
              date: target.date.toISOString(),
              currency: target.currency,
              amount: target.amount,
              // `isCompensationTarget` has already excluded the null case.
              remainingBase: target.remainingBase!,
            }))}
            unratedPurchaseCount={unratedPurchaseCount}
            appliedByPurchase={appliedByPurchase}
          />
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader><CardTitle level={2}>{t("suppliers.historyTitle")}</CardTitle></CardHeader>
        <CardContent>
          <SupplierTransactionForm supplierId={supplier.id} />
        </CardContent>
        <StaticTable
          columns={transactionColumns}
          rows={transactionRows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<FileDoneOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("suppliers.emptyTxTitle")}
              description={t("suppliers.emptyTxDescription")}
            />
          }
        />
      </Card>
    </div>
  );
}
