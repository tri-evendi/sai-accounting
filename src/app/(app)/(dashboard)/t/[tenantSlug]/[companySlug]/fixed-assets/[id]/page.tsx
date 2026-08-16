/**
 * Satu aset tetap — nilai buku, riwayat penyusutan, pelepasan & pindah lokasi
 * (issue #28).
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component.** Jadwal penyusutan sebuah aset berumur 10 tahun
 * adalah 120 baris; ia dipindahkan ke `StaticTable` dengan `sticky` + `maxHeight`
 * (#229) — keduanya WAJIB berpasangan, karena `position: sticky` butuh sebuah
 * kotak yang benar-benar menggulung vertikal untuk ditempeli. Yang TIDAK dipakai
 * di sini adalah `DataTable`: baris jadwal tidak disortir maupun disaring
 * pengguna, dan perendernya dipilih menurut kebutuhan interaktivitas, bukan
 * menurut panjang tabel (#189).
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getFixedAsset } from "@/lib/fixed-assets";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { monthNames } from "@/lib/i18n/labels";
import { AssetActions } from "./asset-actions";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
/** Lebar dasar kolom kartu angka / definisi. */
const STAT_BASIS = 220;
const DEF_BASIS = 200;
/** Dua panel riwayat berdampingan di layar lebar, menumpuk di bawah ~2×360px. */
const PANEL_BASIS = 360;
/**
 * Tinggi kotak gulung jadwal penyusutan. Berpasangan dengan `sticky`: tanpa
 * batas tinggi, pembungkusnya tak pernah menggulung vertikal dan judul kolom
 * yang "menempel" tidak melakukan apa pun (lihat kepala `ui/table.tsx`).
 */
const SCHEDULE_MAX_HEIGHT = 420;

const grid = (basis: number, gap = CARD_GAP): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(${basis}px, 1fr))`,
});

const statValueStyle: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-heading-3)",
  fontWeight: "var(--ant-font-weight-strong)",
  fontVariantNumeric: "tabular-nums",
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--ant-color-text-secondary)",
};

interface DepreciationLine {
  id: number;
  period: string;
  amount: number;
  accumulatedAfter: number;
}

interface MoveLine {
  id: number;
  date: string;
  fromLocation: string | null;
  toLocation: string | null;
}

export default async function FixedAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("fixed_asset.read", params);
  const t = await getT();
  const months = monthNames(await getDictionary(await getLocale()));
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const asset = await getFixedAsset(id);
  if (!asset) notFound();

  const [depreciations, moves] = await Promise.all([
    prisma.fixedAssetDepreciation.findMany({
      where: { assetId: id },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.fixedAssetLocationHistory.findMany({
      where: { assetId: id },
      orderBy: { date: "desc" },
    }),
  ]);

  const pct =
    asset.depreciableBase > 0
      ? Math.min(1, asset.accumulatedDepreciation / asset.depreciableBase)
      : 0;

  const info: [string, React.ReactNode][] = [
    [t("fixedAssets.colCategory"), asset.categoryName],
    [
      t("fixedAssets.infoMethod"),
      asset.depreciationMethod === "straight_line"
        ? t("depreciationMethod.straight_line")
        : asset.depreciationMethod,
    ],
    [t("fixedAssets.infoUsefulLife"), t("fixedAssets.infoMonths", { count: asset.usefulLifeMonths })],
    [t("fixedAssets.acquisitionDateField"), formatDateShort(asset.acquisitionDate)],
    [t("fixedAssets.colLocation"), asset.location ?? "—"],
    [
      t("fixedAssets.infoMonthlyDepreciation"),
      <Money key="monthly" value={asset.monthlyDepreciation} currency="IDR" />,
    ],
  ];

  const depreciationRows: DepreciationLine[] = depreciations.map((d) => ({
    id: d.id,
    period: t("common.monthOfYear", { month: months[d.month - 1], year: d.year }),
    amount: num(d.amount),
    accumulatedAfter: num(d.accumulatedAfter),
  }));

  const depreciationColumns: SaiColumns<DepreciationLine> = [
    { key: "period", dataIndex: "period", title: t("fixedAssets.colPeriod"), align: "left" },
    moneyColumn<DepreciationLine>({
      dataIndex: "amount",
      title: t("fixedAssets.colExpense"),
      sorter: false,
    }),
    moneyColumn<DepreciationLine>({
      dataIndex: "accumulatedAfter",
      title: t("fixedAssets.colAccumShort"),
      sorter: false,
    }),
  ];

  const moveRows: MoveLine[] = moves.map((m) => ({
    id: m.id,
    date: formatDateShort(m.date),
    fromLocation: m.fromLocation,
    toLocation: m.toLocation,
  }));

  const moveColumns: SaiColumns<MoveLine> = [
    { key: "date", dataIndex: "date", title: t("common.date"), align: "left" },
    {
      key: "fromLocation",
      dataIndex: "fromLocation",
      title: t("fixedAssets.colFrom"),
      align: "left",
      render: (_v, m) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{m.fromLocation ?? "—"}</span>
      ),
    },
    {
      key: "toLocation",
      dataIndex: "toLocation",
      title: t("fixedAssets.colTo"),
      align: "left",
      render: (_v, m) => m.toLocation ?? "—",
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: asset.assetNo },
        ]}
        title={asset.name}
        badge={
          asset.status === "disposed" ? (
            <Badge variant="default">{t("fixedAssets.statusDisposed")}</Badge>
          ) : asset.isFullyDepreciated ? (
            <Badge variant="warning">{t("fixedAssets.statusFullyDepreciated")}</Badge>
          ) : (
            <Badge variant="success">{t("common.active")}</Badge>
          )
        }
        description={asset.assetNo}
      />

      <div style={{ ...grid(STAT_BASIS), marginBottom: SECTION_GAP }}>
        <Card>
          <div style={{ padding: "var(--ant-padding)" }}>
            <p style={labelStyle}>{t("fixedAssets.cost")}</p>
            <p style={statValueStyle}>
              <Money value={asset.acquisitionCost} currency="IDR" />
            </p>
            {asset.residualValue > 0 && (
              <p style={{ margin: 0, marginTop: "var(--ant-margin-xxs)" }}>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("fixedAssets.residualLine", {
                    amount: formatCurrency(asset.residualValue, "IDR"),
                  })}
                </small>
              </p>
            )}
          </div>
        </Card>
        <Card>
          <div style={{ padding: "var(--ant-padding)" }}>
            <p style={labelStyle}>{t("fixedAssets.accumulated")}</p>
            <p style={statValueStyle}>
              <Money value={asset.accumulatedDepreciation} currency="IDR" />
            </p>
            {/* Bilah kemajuan lewat primitif: ia membawa NAMA-nya sendiri, jadi
                pembaca layar tidak mengumumkan "42 persen" dari entah apa. */}
            <div style={{ marginTop: "var(--ant-margin-xs)" }}>
              <Progress value={pct} label={t("fixedAssets.accumulated")} />
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: "var(--ant-padding)" }}>
            <p style={labelStyle}>{t("fixedAssets.bookValue")}</p>
            <p style={statValueStyle}>
              <Money value={asset.bookValue} currency="IDR" />
            </p>
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: SECTION_GAP }}>
        <dl
          style={{
            ...grid(DEF_BASIS, 12),
            margin: 0,
            padding: "var(--ant-padding-lg)",
          }}
        >
          {info.map(([k, v]) => (
            <div key={k}>
              <dt>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>{k}</small>
              </dt>
              <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {asset.status === "disposed" ? (
        <Card style={{ marginBottom: SECTION_GAP }}>
          <CardHeader>
            <CardTitle level={2}>{t("fixedAssets.disposalTitle")}</CardTitle>
          </CardHeader>
          <dl
            style={{
              ...grid(DEF_BASIS, 12),
              margin: 0,
              padding: "var(--ant-padding-lg)",
            }}
          >
            <div>
              <dt>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("common.date")}
                </small>
              </dt>
              <dd style={{ margin: 0 }}>
                {asset.disposalDate ? formatDateShort(asset.disposalDate) : "—"}
              </dd>
            </div>
            <div>
              <dt>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("fixedAssets.disposalProceeds")}
                </small>
              </dt>
              <dd style={{ margin: 0 }}>
                {/* Hasil pelepasan yang belum diisi tetap KOSONG ("—"), bukan
                    Rp 0: `Money` menerima null apa adanya. */}
                <Money value={asset.disposalProceeds} currency="IDR" />
              </dd>
            </div>
            <div>
              <dt>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("fixedAssets.disposalGainLoss")}
                </small>
              </dt>
              <dd style={{ margin: 0 }}>
                {/* `signed` — laba pelepasan diwarnai hijau DAN bertanda +,
                    rugi merah DAN bertanda −. Warna bukan penanda tunggal. */}
                <Money value={asset.disposalGainLoss} currency="IDR" signed />
              </dd>
            </div>
          </dl>
        </Card>
      ) : (
        <div style={{ marginBottom: SECTION_GAP }}>
          <AssetActions assetId={asset.id} bookValue={asset.bookValue} />
        </div>
      )}

      <div style={grid(PANEL_BASIS, SECTION_GAP)}>
        <Card>
          <CardHeader>
            <CardTitle level={2}>{t("fixedAssets.depreciationHistory")}</CardTitle>
          </CardHeader>
          {/* `sticky` + `maxHeight` berpasangan: jadwal panjang menggulung di
              dalam kartunya sendiri, judul kolomnya tetap terbaca. */}
          <StaticTable<DepreciationLine>
            columns={depreciationColumns}
            rows={depreciationRows}
            rowKey={(d) => d.id}
            size="small"
            sticky
            maxHeight={SCHEDULE_MAX_HEIGHT}
            empty={
              <p
                style={{
                  margin: 0,
                  padding: "var(--ant-padding-lg)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("fixedAssets.noDepreciation")}
              </p>
            }
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle level={2}>{t("fixedAssets.locationHistory")}</CardTitle>
          </CardHeader>
          <StaticTable<MoveLine>
            columns={moveColumns}
            rows={moveRows}
            rowKey={(m) => m.id}
            size="small"
            empty={
              <p
                style={{
                  margin: 0,
                  padding: "var(--ant-padding-lg)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("fixedAssets.noMoves")}
              </p>
            }
          />
        </Card>
      </div>
    </div>
  );
}
