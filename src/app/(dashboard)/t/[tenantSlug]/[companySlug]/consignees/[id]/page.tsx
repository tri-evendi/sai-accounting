import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Link } from "@/components/ui/app-link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

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

  return (
    <div className="w-full">
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
            <Link href={`/consignees/${consignee.id}/edit`}>
              <Button variant="secondary">{t("common.edit")}</Button>
            </Link>
            <Link href="/consignees">
              <Button variant="ghost">{t("common.back")}</Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>{t("consignees.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.name")}</dt>
              <dd className="text-sm text-foreground">{consignee.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("consignees.colCountry")}</dt>
              <dd className="text-sm text-foreground">{consignee.country || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("consignees.contactPic")}</dt>
              <dd className="text-sm text-foreground">{consignee.contact || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("consignees.relatedContracts")}</dt>
              <dd className="text-sm text-foreground">{consignee._count.contracts}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">{t("common.address")}</dt>
              <dd className="text-sm text-foreground whitespace-pre-line">{consignee.address || "-"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">{t("common.notes")}</dt>
              <dd className="text-sm text-foreground whitespace-pre-line">{consignee.notes || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.createdAt")}</dt>
              <dd className="text-sm text-foreground">{formatDate(consignee.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
