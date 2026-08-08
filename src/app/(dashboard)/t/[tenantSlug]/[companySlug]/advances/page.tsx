/**
 * Uang Muka — advances received/paid and how much of each is left (issue #26).
 *
 * The number a user actually needs is "how much does this buyer still have on
 * account?", so `Sisa` is the column that carries the page. It is shown in the
 * advance's OWN currency (a CNY down-payment is a CNY fact, and an application
 * is always a slice of one advance, so that remainder is exact) with the IDR
 * base beside it — the only unit in which advances across currencies may be
 * added, which is what the summary tiles use. An advance with no rate has no
 * IDR value at all and is labelled as such rather than folded in at 1:1.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component.** Aturan warnanya sama dengan /receivables: hanya
 * primitif yang mewarnai dirinya sendiri, plus variabel `--ant-…` di dalam
 * `<Card>`. Catatan akun di bawah kartu berdiri di luar pohon itu, jadi ia
 * memakai ikon + kata.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getAdvances, summarizeAdvances, type AdvanceRow } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { formatDateShort } from "@/lib/utils";
import { InfoCircleOutlined, MoneyCollectOutlined, PlusOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 · `marginXS` 8 — token AntD sebagai angka. */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const CONTROL_GAP = 8;
const EMPTY_ICON_SIZE = 48;
/** Lebar dasar satu kartu angka: dua berjajar di layar lebar, satu di 375px. */
const STAT_BASIS = 280;

export default async function AdvancesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePagePermission("advance.read", params);
  const t = await getT();
  const sp = await searchParams;
  const type = sp.type === "sales" || sp.type === "purchase" ? sp.type : undefined;

  const rows = await getAdvances({ type });
  const open = rows.filter((r) => !r.isFullyApplied);
  const summary = summarizeAdvances(open);
  // Nama akun tempat uang muka mendarat — dipakai sebagai keterangan di kolom Jenis.
  const typeLabels = { sales: t("advanceType.sales"), purchase: t("advanceType.purchase") };

  const subtle: React.CSSProperties = {
    display: "block",
    fontSize: "var(--ant-font-size-sm)",
    color: "var(--ant-color-text-secondary)",
  };

  const filters = [
    { key: "all", label: t("advances.filterAll"), href: "/advances", active: !type },
    {
      key: "sales",
      label: t("advances.filterSales"),
      href: "/advances?type=sales",
      active: type === "sales",
    },
    {
      key: "purchase",
      label: t("advances.filterPurchase"),
      href: "/advances?type=purchase",
      active: type === "purchase",
    },
  ];

  /** Kartu angka: keterangan kecil di atas, nilainya di bawah, catatan di kaki. */
  const statCard = (label: string, value: React.ReactNode, hint: string) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-heading-3)",
            fontWeight: "var(--ant-font-weight-strong)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
        <p style={{ margin: 0, marginTop: "var(--ant-margin-xxs)" }}>
          <small style={{ color: "var(--ant-color-text-secondary)" }}>{hint}</small>
        </p>
      </div>
    </Card>
  );

  const columns: SaiColumns<AdvanceRow> = [
    {
      key: "advanceNo",
      dataIndex: "advanceNo",
      title: t("advances.colNumber"),
      align: "left",
      render: (_v, r) => (
        <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{r.advanceNo}</span>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: t("advances.colType"),
      align: "left",
      render: (_v, r) => (
        <>
          {/* Badge always carries text — colour is never the only signal. */}
          <Badge variant={r.type === "sales" ? "success" : "warning"}>
            {r.type === "sales" ? t("advances.badgeReceived") : t("advances.badgePaid")}
          </Badge>
          <span style={{ ...subtle, marginTop: 2 }}>{typeLabels[r.type]}</span>
        </>
      ),
    },
    { key: "partyName", dataIndex: "partyName", title: t("advances.colParty"), align: "left" },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_v, r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatDateShort(r.date)}</span>
      ),
    },
    {
      key: "contractNo",
      dataIndex: "contractNo",
      title: t("advances.colContract"),
      align: "left",
      // Tanpa kontrak = uang muka berdiri sendiri; "—", bukan sel kosong.
      render: (_v, r) =>
        r.contractNo ? (
          <Link href={`/contracts/${r.contractId}`} style={{ color: "var(--ant-color-link)" }}>
            {r.contractNo}
          </Link>
        ) : (
          <span style={{ color: "var(--ant-color-text-secondary)" }}>—</span>
        ),
    },
    moneyColumn<AdvanceRow>({
      dataIndex: "amount",
      title: t("advances.colValue"),
      sorter: false,
      currency: (r) => r.currency,
    }),
    moneyColumn<AdvanceRow>({
      dataIndex: "applied",
      title: t("advances.colApplied"),
      sorter: false,
      currency: (r) => r.currency,
    }),
    {
      key: "remaining",
      dataIndex: "remaining",
      title: t("advances.colRemaining"),
      align: "right",
      render: (_v, r) => (
        <>
          <Money
            value={r.remaining}
            currency={r.currency}
            style={{ fontWeight: "var(--ant-font-weight-strong)" }}
          />
          {r.isFullyApplied && <span style={subtle}>{t("advances.usedUp")}</span>}
        </>
      ),
    },
    {
      key: "remainingBase",
      dataIndex: "remainingBase",
      title: t("common.remainingIdr"),
      align: "right",
      render: (_v, r) => (
        <>
          {/* Uang muka valas tanpa kurs tidak punya nilai IDR — dikatakan
              dengan kata, tidak pernah ditulis Rp 0 (MASTER.md). */}
          {r.remainingBase != null ? (
            <Money value={r.remainingBase} currency="IDR" />
          ) : (
            <small style={{ color: "var(--ant-color-money-pending)" }}>
              {t("common.rateMissing")}
            </small>
          )}
          {r.unratedApplications > 0 && (
            <span style={{ ...subtle, color: "var(--ant-color-money-pending)" }}>
              {t("advances.unratedApplications", { count: r.unratedApplications })}
            </span>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("advances.title")}
        description={
          <>
            {t("advances.descriptionBefore")} <strong>{t("advances.descriptionStrong")}</strong>{" "}
            {t("advances.descriptionAfter")}
          </>
        }
        actions={
          <Link href="/advances/new">
            {/* Aksi utama layar ini (#267): mencatat uang muka adalah satu-satunya
                hal yang MENGIKAT di sini; sisanya membaca & menyaring. */}
            <Button variant="primary">
              <PlusOutlined aria-hidden="true" />
              {t("advances.record")}
            </Button>
          </Link>
        }
      />

      {/* Filter — plain links, no client JS needed for three states. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: CONTROL_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        {/* Chip saringan: yang aktif `secondary` (berbingkai), sisanya `ghost`
            (tanpa bingkai) — BUKAN primer. Menyaring tidak mengikat apa pun
            (§Aksi utama per layar), dan isian penuh di sini bersaing dengan
            "Catat Uang Muka" di kepala halaman. Keadaan aktifnya tetap terbaca
            dari ada/tidaknya bingkai, bukan dari warna saja. */}
        {filters.map((f) => (
          <Link key={f.key} href={f.href}>
            <Button variant={f.active ? "secondary" : "ghost"} size="sm">
              {f.label}
            </Button>
          </Link>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: SECTION_GAP,
        }}
      >
        {statCard(
          t("advances.outstandingLabel"),
          <Money value={summary.outstandingBase} currency="IDR" />,
          t("advances.outstandingHint", { count: summary.count })
        )}
        {statCard(
          t("advances.unratedLabel"),
          summary.unresolvedCount,
          t("advances.unratedHint")
        )}
      </div>

      {/* Catatan di LUAR kartu: ikon + kata, tanpa warna token. */}
      <p
        style={{
          margin: 0,
          marginBottom: SECTION_GAP,
          display: "flex",
          alignItems: "flex-start",
          gap: CONTROL_GAP,
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <small>
          {t("advances.noteBefore")} <strong>{t("advances.noteSalesAccount")}</strong>{" "}
          {t("advances.noteLiability")} <strong>{t("advances.notePurchaseAccount")}</strong>{" "}
          {t("advances.noteAssetBefore")} <strong>{t("advances.noteNot")}</strong>{" "}
          {t("advances.noteAfter")} <strong>{t("advances.noteCompensate")}</strong>{" "}
          {t("advances.noteTail")}
        </small>
      </p>

      <Card>
        <StaticTable<AdvanceRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<MoneyCollectOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("advances.emptyTitle")}
              description={t("advances.emptyDescription")}
              actionLabel={t("advances.record")}
              actionHref="/advances/new"
            />
          }
        />
      </Card>
    </div>
  );
}
