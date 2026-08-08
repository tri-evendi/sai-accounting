/**
 * Retur penjualan & pembelian (issue #27).
 *
 * A return reverses part of an invoice or purchase: it reduces piutang/utang,
 * penjualan/persediaan and PPN, and moves stock back. Each row links to its
 * origin document and carries a nota-retur PDF. Values are shown in the return's
 * own currency (inherited from the origin), right-aligned and tabular, per MASTER.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { InfoCircleOutlined, PlusOutlined, RollbackOutlined, WarningOutlined } from "@ant-design/icons";
import { ReturnPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

/**
 * Berkas ini server component — tanpa `antd`, tanpa `theme.useToken()`. Angka
 * di bawah SAMA dengan tokennya (`marginLG` 24, `marginXS` 8, `marginXXS` 4).
 */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
const TIGHT_GAP = 4;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Satu baris daftar retur, diratakan supaya kolomnya bertipe penuh. */
interface ReturnRow {
  key: string;
  returnNo: string;
  canceled: boolean;
  date: string;
  originLabel: string;
  partyName: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  /** `null` = kurs belum diketahui — ditulis dengan kata, tak pernah Rp 0. */
  baseAmount: number | null;
  pdf: React.ReactNode;
}

export default async function ReturnsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requirePagePermission("return.read", params);
  const t = await getT();
  const sp = await searchParams;
  const tab = sp.tab === "purchase" ? "purchase" : "sales";
  const page = parsePageParam(sp.page);
  const perPage = 20;

  // Hanya tab yang sedang dibuka yang barisnya diambil (berpaginasi); lencana
  // jumlah di kedua tab cukup dari `count` — bukan dua daftar penuh + relasi
  // setiap kali halaman dibuka.
  const [salesCount, purchaseCount, salesReturns, purchaseReturns] = await Promise.all([
    prisma.salesReturn.count(),
    prisma.purchaseReturn.count(),
    tab === "sales"
      ? prisma.salesReturn.findMany({
          orderBy: { date: "desc" },
          include: {
            items: true,
            invoice: { select: { invoiceNo: true } },
            customer: { select: { name: true } },
          },
          skip: (page - 1) * perPage,
          take: perPage,
        })
      : Promise.resolve([]),
    tab === "purchase"
      ? prisma.purchaseReturn.findMany({
          orderBy: { date: "desc" },
          include: { items: true, supplier: { select: { name: true } } },
          skip: (page - 1) * perPage,
          take: perPage,
        })
      : Promise.resolve([]),
  ]);

  const totalCount = tab === "sales" ? salesCount : purchaseCount;
  const totalPages = Math.ceil(totalCount / perPage);
  const source = tab === "sales" ? salesReturns : purchaseReturns;

  const rows: ReturnRow[] = source.map((r) => {
    const subtotal = Number(r.subtotal);
    const tax = Number(r.taxAmount);
    const isSales = "invoice" in r;
    const originLabel = isSales
      ? (r as (typeof salesReturns)[number]).invoice.invoiceNo
      : `TRX-${(r as (typeof purchaseReturns)[number]).purchaseId}`;
    const partyName =
      (isSales
        ? (r as (typeof salesReturns)[number]).customer?.name
        : (r as (typeof purchaseReturns)[number]).supplier?.name) ?? null;
    return {
      key: `${tab}-${r.id}`,
      returnNo: r.returnNo,
      canceled: r.status === "canceled",
      date: formatDateShort(r.date),
      originLabel,
      partyName,
      currency: r.currency,
      subtotal,
      tax,
      total: subtotal + tax,
      baseAmount: r.baseAmount == null ? null : Number(r.baseAmount),
      pdf: (
        <ReturnPdfButton
          data={{
            kind: isSales ? "sales" : "purchase",
            returnNo: r.returnNo,
            date: r.date.toISOString(),
            originLabel,
            partyName: partyName ?? undefined,
            currency: r.currency,
            taxAmount: tax,
            taxRate: r.taxRate == null ? null : Number(r.taxRate),
            reason: r.reason,
            items: r.items.map((it) => ({
              itemName: it.itemName,
              quantity: Number(it.quantity),
              price: Number(it.price),
            })),
          }}
        />
      ),
    };
  });

  const columns: SaiColumns<ReturnRow> = [
    {
      key: "returnNo",
      dataIndex: "returnNo",
      title: t("returns.colNo"),
      align: "left",
      render: (_v, r) => (
        <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>
          {r.returnNo}{" "}
          {/* Retur batal tidak memposting jurnal & tak dihitung kaps retur —
              tanpa lencana ia tampak hidup. */}
          {r.canceled && <Badge variant="default">{t("returns.statusCanceled")}</Badge>}
        </span>
      ),
    },
    { key: "date", dataIndex: "date", title: t("common.date"), align: "left" },
    {
      key: "origin",
      dataIndex: "originLabel",
      title: tab === "sales" ? t("returns.colOriginSales") : t("returns.colOriginPurchase"),
      align: "left",
      render: (_v, r) => (
        <>
          {r.originLabel}
          {r.partyName && (
            <small style={{ display: "block", color: "var(--ant-color-text-secondary)" }}>
              {r.partyName}
            </small>
          )}
        </>
      ),
    },
    {
      key: "subtotal",
      dataIndex: "subtotal",
      title: t("returns.colDpp"),
      align: "right",
      render: (_v, r) => <Money value={r.subtotal} currency={r.currency} />,
    },
    {
      key: "tax",
      dataIndex: "tax",
      title: t("common.vat"),
      align: "right",
      // Nol PPN dinyatakan dengan LENCANA "0%", bukan "Rp 0": ia menyatakan
      // tarifnya, bukan nominal yang kebetulan nol.
      render: (_v, r) =>
        r.tax > 0 ? (
          <Money value={r.tax} currency={r.currency} />
        ) : (
          <Badge variant="default">0%</Badge>
        ),
    },
    {
      key: "total",
      dataIndex: "total",
      title: t("common.total"),
      align: "right",
      render: (_v, r) => (
        <Money
          style={{ fontWeight: "var(--ant-font-weight-strong)" }}
          value={r.total}
          currency={r.currency}
        />
      ),
    },
    {
      key: "baseAmount",
      dataIndex: "baseAmount",
      title: t("returns.colTotalIdr"),
      align: "right",
      // Tanpa kurs nilainya BELUM DIKETAHUI — ditulis dengan kata + ikon,
      // tidak pernah Rp 0. Warnanya tidak bisa dibaca di server component,
      // jadi ikon + kalimat yang jadi penandanya.
      render: (_v, r) =>
        r.baseAmount != null ? (
          <Money value={r.baseAmount} currency="IDR" />
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: TIGHT_GAP,
            }}
          >
            <WarningOutlined aria-hidden="true" style={{ flexShrink: 0 }} />
            <small>{t("common.rateMissing")}</small>
          </span>
        ),
    },
    {
      key: "pdf",
      dataIndex: "pdf",
      title: t("returns.colNota"),
      align: "right",
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("returns.title")}
        description={t("returns.description")}
        actions={
          <Link href={`/returns/new?type=${tab}`}>
            {/* Aksi utama layar ini (#267). CTA keadaan-kosong menunjuk tempat
                yang sama dan sengaja `secondary` — lihat `ui/empty-state.tsx`. */}
            <Button variant="primary">
              {/* Jarak ikon–teks dari `iconGap` `.ant-btn`. */}
              <PlusOutlined aria-hidden="true" />
              {t("returns.addNew")}
            </Button>
          </Link>
        }
      />

      {/* Tab penjualan/pembelian. Dulu `<a>` bergaya tombol yang dirakit dari
          kelas; kini `Button` primitif — target sentuh 40px, ring fokus, dan
          warna aktif semuanya datang dari token, bukan dari kelas yang harus
          dijaga sendiri. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: CONTROL_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        {[
          {
            label: t("returns.tabSales", { count: salesCount }),
            href: "/returns?tab=sales",
            active: tab === "sales",
          },
          {
            label: t("returns.tabPurchase", { count: purchaseCount }),
            href: "/returns?tab=purchase",
            active: tab === "purchase",
          },
        ].map((f) => (
          <Link key={f.label} href={f.href}>
            {/* Tab = KEADAAN, bukan ajakan: aktif `secondary` (berbingkai),
                sisanya `ghost`. Berpindah tab hanya menyaring — isian penuh di
                sini bersaing dengan "Catat Retur" di kepala halaman (#267). */}
            <Button variant={f.active ? "secondary" : "ghost"}>{f.label}</Button>
          </Link>
        ))}
      </div>

      {/* Catatan "retur membalik jurnal asalnya". Berkas ini di luar pohon
          komponen AntD, jadi penandanya ikon + kata — bukan warna latar yang
          variabelnya tak teratasi di sini. */}
      <p
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: CONTROL_GAP,
          marginTop: 0,
          marginBottom: SECTION_GAP,
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <small>
          {t("returns.noteA")} <strong>{t("returns.noteStrong")}</strong> {t("returns.noteB")}
        </small>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<RollbackOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={tab === "sales" ? t("returns.emptySales") : t("returns.emptyPurchase")}
          description={t("returns.emptyDescription")}
          actionLabel={t("returns.addNew")}
          actionHref={`/returns/new?type=${tab}`}
        />
      ) : (
        <Card>
          <StaticTable columns={columns} rows={rows} rowKey={(r) => r.key} />
          {/* `sp` diteruskan utuh — komponen Pagination membawa `tab` yang
              sedang aktif ke tautan halamannya. */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/returns"
            searchParams={sp}
          />
        </Card>
      )}
    </div>
  );
}
