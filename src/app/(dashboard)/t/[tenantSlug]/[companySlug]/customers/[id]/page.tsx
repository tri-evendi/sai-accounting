/**
 * Rincian Pelanggan — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 * `sm:grid-cols-2` diganti daftar istilah–nilai yang MEMBUNGKUS sendiri: satu
 * kolom di 375px, dua atau lebih begitu ruangnya ada — pola yang sama dengan
 * `invoices/[id]/page.tsx` (#195).
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Lebar dasar satu pasang istilah–nilai. */
const INFO_BASIS = 240;
/** `marginLG` 24 − `marginXS` 8 — jarak antar pasangan pada daftar info. */
const INFO_GAP = 16;

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  // Sejajar dengan halaman daftarnya — tanpa ini, ptg bisa membaca detail
  // pelanggan lewat URL langsung (temuan audit RBAC fase 0).
  await requirePagePermission("customer.read", params);
  const t = await getT();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(id) },
  });

  if (!customer) notFound();

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
        breadcrumbs={[{ label: t("customers.breadcrumb"), href: "/customers" }, { label: customer.name }]}
        title={customer.name}
        actions={
          <>
            <ButtonLink href={`/customers/${customer.id}/edit`} variant="secondary">
              {t("common.edit")}
            </ButtonLink>
            <ButtonLink href="/customers" variant="ghost">
              {t("common.back")}
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>{t("customers.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: INFO_GAP }}>
            {infoItem(t("common.name"), customer.name)}
            {infoItem(t("customers.pic"), customer.pic || "-")}
            {infoItem(t("common.address"), customer.address || "-")}
            {infoItem(t("common.phone"), customer.phone || "-")}
            {infoItem(t("common.email"), customer.email || "-")}
            {infoItem(
              t("common.vat"),
              customer.taxExempt ? t("customers.taxExemptLabel") : t("customers.taxable")
            )}
            {infoItem(t("common.createdAt"), formatDate(customer.createdAt))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
