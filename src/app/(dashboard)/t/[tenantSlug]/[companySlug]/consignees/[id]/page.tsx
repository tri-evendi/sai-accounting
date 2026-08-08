/**
 * Rincian Penerima Barang — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**. `sm:grid-cols-2` diganti daftar istilah–nilai
 * yang membungkus sendiri; alamat & catatan mengambil baris penuh karena
 * keduanya berbaris banyak (`whiteSpace: pre-line` dipertahankan).
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Lebar dasar satu pasang istilah–nilai. */
const INFO_BASIS = 240;
/** Jarak antar pasangan pada daftar info. */
const INFO_GAP = 16;

export default async function ConsigneeDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("consignee.read", params);
  const t = await getT();
  const { id } = await params;

  const consignee = await prisma.consignee.findUnique({
    where: { id: parseInt(id) },
    include: { _count: { select: { contracts: true } } },
  });

  if (!consignee) notFound();

  /** Satu pasang istilah–nilai; `wide` untuk isi berbaris banyak. */
  const infoItem = (label: React.ReactNode, value: React.ReactNode, wide = false) => (
    <div style={{ flex: wide ? "1 1 100%" : `1 1 ${INFO_BASIS}px`, minWidth: 0 }}>
      <dt
        style={{
          color: "var(--ant-color-text-secondary)",
          fontWeight: "var(--ant-font-weight-strong)",
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, whiteSpace: wide ? "pre-line" : undefined }}>{value}</dd>
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("consignees.breadcrumb"), href: "/consignees" }, { label: consignee.name }]}
        title={consignee.name}
        badge={
          consignee.isActive ? (
            <Badge variant="success">{t("common.active")}</Badge>
          ) : (
            <Badge variant="default">{t("common.inactive")}</Badge>
          )
        }
        actions={
          <>
            <ButtonLink href={`/consignees/${consignee.id}/edit`} variant="secondary">
              {t("common.edit")}
            </ButtonLink>
            <ButtonLink href="/consignees" variant="ghost">
              {t("common.back")}
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>{t("consignees.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: INFO_GAP }}>
            {infoItem(t("common.name"), consignee.name)}
            {infoItem(t("consignees.colCountry"), consignee.country || "-")}
            {infoItem(t("consignees.contactPic"), consignee.contact || "-")}
            {infoItem(
              t("consignees.relatedContracts"),
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {consignee._count.contracts}
              </span>
            )}
            {infoItem(t("common.address"), consignee.address || "-", true)}
            {infoItem(t("common.notes"), consignee.notes || "-", true)}
            {infoItem(t("common.createdAt"), formatDate(consignee.createdAt))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
