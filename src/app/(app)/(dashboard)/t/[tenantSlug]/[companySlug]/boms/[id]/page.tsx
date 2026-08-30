/**
 * Detail Resep Produksi (issue #495 butir 3).
 *
 * Di sinilah penurunan bertingkat & biaya standar akhirnya TERLIHAT — dan
 * karena itu di sinilah kesalahan resep paling murah ditemukan: sebelum satu
 * batch pun dijalankan.
 *
 * Aritmetikanya seluruhnya dari `@/lib/manufacturing/bom` yang murni; halaman
 * ini hanya menjemput barisnya dan menggambar. Tidak ada perhitungan kedua.
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/utils";
import { averageUnitCostForItem } from "@/lib/posting/cogs";
import { biayaStandar, explodeBom, type BomInput } from "@/lib/manufacturing/bom";
import { TermTooltip } from "@/components/ui/term-tooltip";

export const dynamic = "force-dynamic";

/** Jarak antar-kartu (= `marginLG` AntD). Server component: tak boleh useToken. */
const SECTION_GAP = 24;

export default async function BomDetailPage({
  params,
}: {
  params: Promise<TenantScopedParams & { id: string }>;
}) {
  await requirePagePermission("bill_of_material.read", params);
  const t = await getT();
  const { id } = await params;

  const bom = await prisma.billOfMaterial.findUnique({
    where: { id: parseInt(id) },
    include: {
      outputItem: true,
      components: { include: { item: true } },
      operations: { include: { workCenter: true }, orderBy: { sequence: "asc" } },
    },
  });
  if (!bom) notFound();

  /*
   * Resep AKTIF lain, dikunci menurut barang keluarannya — inilah yang membuat
   * penurunannya BERTINGKAT: sebuah bahan yang ternyata keluaran resep lain
   * diturunkan lagi, alih-alih dianggap diambil dari gudang.
   */
  const lainnya = await prisma.billOfMaterial.findMany({
    where: { isActive: true, id: { not: bom.id } },
    include: { components: { include: { item: { select: { name: true } } } } },
  });
  const resepPerBarang = new Map<number, BomInput>(
    lainnya.map((b) => [
      b.outputItemId,
      {
        id: b.id,
        code: b.code,
        outputItemId: b.outputItemId,
        outputQuantity: Number(b.outputQuantity),
        components: b.components.map((c) => ({
          itemId: c.itemId,
          itemName: c.item.name,
          quantity: Number(c.quantity),
          scrapPercent: Number(c.scrapPercent),
        })),
      },
    ])
  );

  const input: BomInput = {
    id: bom.id,
    code: bom.code,
    outputItemId: bom.outputItemId,
    outputQuantity: Number(bom.outputQuantity),
    components: bom.components.map((c) => ({
      itemId: c.itemId,
      itemName: c.item.name,
      quantity: Number(c.quantity),
      scrapPercent: Number(c.scrapPercent),
    })),
    operations: bom.operations.map((op) => ({
      sequence: op.sequence,
      name: op.name,
      workCenterId: op.workCenterId,
      standardHours: Number(op.standardHours),
      laborRate: Number(op.workCenter.laborRate),
      overheadRate: Number(op.workCenter.overheadRate),
    })),
  };

  const outputQty = Number(bom.outputQuantity);
  const { daun, antara } = explodeBom(input, outputQty, resepPerBarang);

  // Harga pokok tiap bahan DAUN, pada rata-rata tertimbang hari ini.
  const hargaPokok = new Map<number, number>();
  for (const d of daun) {
    const cost = await averageUnitCostForItem(d.itemId, new Date(), prisma);
    if (cost > 0) hargaPokok.set(d.itemId, cost);
  }
  const biaya = biayaStandar(input, outputQty, hargaPokok, resepPerBarang);

  const unit = bom.outputItem.unit || "kg";
  const qty = (n: number) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(n)}</span>
  );

  interface BahanRow {
    itemId: number;
    itemName: string;
    level: number;
    quantity: number;
  }
  const bahanColumns: SaiColumns<BahanRow> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.name"), align: "left" },
    {
      key: "level",
      dataIndex: "level",
      title: t("boms.colLevel"),
      align: "right",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.level}</span>
      ),
    },
    {
      key: "quantity",
      dataIndex: "quantity",
      title: t("boms.colQuantity"),
      align: "right",
      render: (_v, row) => qty(row.quantity),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("boms.breadcrumb"), href: "/boms" }, { label: bom.code }]}
        title={<TermTooltip term="resep_produksi">{bom.code}</TermTooltip>}
        description={`${bom.outputItem.name} · ${formatNumber(outputQty)} ${unit}`}
        actions={
          bom.isActive ? (
            <Badge variant="success">{t("common.active")}</Badge>
          ) : (
            <Badge variant="default">{t("common.inactive")}</Badge>
          )
        }
      />

      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("boms.explosionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ margin: 0, marginBottom: 8, color: "var(--ant-color-text-secondary)" }}>
            {t("boms.leafTitle")}
          </p>
        </CardContent>
        <StaticTable columns={bahanColumns} rows={daun} rowKey={(r) => `d-${r.itemId}`} />
        {antara.length > 0 && (
          <>
            <CardContent>
              <p style={{ margin: 0, marginBottom: 8, color: "var(--ant-color-text-secondary)" }}>
                <TermTooltip term="barang_dalam_proses">{t("boms.intermediateTitle")}</TermTooltip>
              </p>
            </CardContent>
            <StaticTable columns={bahanColumns} rows={antara} rowKey={(r) => `a-${r.itemId}`} />
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={2}>{t("boms.standardCostTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [t("boms.componentsSection"), biaya.bahan],
                [t("workCenters.colLabor"), biaya.tenagaKerja],
                [t("workCenters.colOverhead"), biaya.overhead],
                [t("common.total"), biaya.total],
                [t("boms.perUnit"), biaya.perUnit],
              ] as const
            ).map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: "var(--ant-color-text-secondary)" }}>{label}</dt>
                <dd style={{ margin: 0 }}>
                  <Money value={value} currency="IDR" />
                </dd>
              </div>
            ))}
          </dl>
          {biaya.bahanTanpaHarga.length > 0 && (
            /* Bahan tanpa harga pokok DISEBUT, tidak dianggap nol: biaya standar
               yang melewatkannya diam-diam akan menyatakan margin yang tak
               pernah ada. Kalimatnya sendiri yang membawa makna, bukan warnanya. */
            <p style={{ marginTop: 12, color: "var(--ant-color-money-negative)" }}>
              {t("boms.noStandardCost")}{" "}
              {biaya.bahanTanpaHarga.map((b) => b.itemName).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
