/**
 * Pengaturan tenant — paket, pemakaian, riwayat tagihan (issue #140).
 *
 * Grup `(tenant)` dengan sengaja: ini halaman TINGKAT TENANT (penjaga
 * `tenant.settings`, owner saja), bisa dibuka tanpa perusahaan aktif — pemilik
 * tenant yang seluruh PT-nya sedang hanya-baca justru pemakai terpentingnya.
 *
 * Bagian paket/kuota/pemakaian datang dari basis data KENDALI (snapshot #140)
 * dan SELALU tampil; bagian riwayat tagihan datang dari `sai_platform` dan
 * boleh gagal dengan tenang ("penagihan tidak terjangkau") — penagihan mati
 * tidak boleh mematikan halaman yang menjelaskan keadaan langganan.
 * Riwayat tagihan hanya untuk pemegang `tenant.billing` (owner — kontraktual).
 */
import Link from "next/link";
import { CreditCard } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { tenantCan } from "@/lib/tenant-authz";
import { PrivacySection } from "./privacy-section";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { isReadOnlyTenantStatus } from "@/lib/subscription-lifecycle";
import { formatMoney } from "@/lib/money-format";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

export default async function TenantSettingsPage() {
  const { tenant } = await requireTenantPagePermission("tenant.settings");
  const t = await getT();

  const overview = await billingOverviewForTenant(tenant.tenantId);
  const canSeeBilling = tenantCan(tenant, "tenant.billing");
  /* Kartu Data & Privasi (issue #142): ekspor untuk pemegang `tenant.export`,
   * permintaan penghapusan untuk pemegang `tenant.deletion` — dan kartunya
   * SELALU dirender saat berhak, termasuk (terutama) ketika suspended. */
  const canExport = tenantCan(tenant, "tenant.export");
  const canDelete = tenantCan(tenant, "tenant.deletion");

  const statusKey = (status: string) => t(`tenantSettings.status.${status}` as DictionaryKey);
  const readOnly = isReadOnlyTenantStatus(overview?.tenant.status);

  return (
    <AuthShell
      heading={t("tenantSettings.title")}
      description={t("tenantSettings.description")}
      icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
      footer={
        <Button asChild variant="outline" className="w-full">
          <Link href="/select-company">{t("common.back")}</Link>
        </Button>
      }
    >
      {!overview ? (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("tenantSettings.noSubscription")}
          </p>
          {canExport && <PrivacySection canDelete={canDelete} />}
        </div>
      ) : (
        <div className="space-y-6">
          {readOnly && (
            <div role="status" className="rounded-lg border border-border bg-warning-soft p-4">
              <p className="text-sm leading-relaxed text-warning-strong">
                {t("tenantSettings.readOnlyNote")}
              </p>
            </div>
          )}

          {/* Paket & status — dari KENDALI (snapshot), selalu tampil. */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("tenantSettings.planHeading")}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="default">{overview.tenant.planKey}</Badge>
              <span className="text-muted-foreground">{t("tenantSettings.statusLabel")}:</span>
              <Badge variant={readOnly ? "warning" : "success"}>
                {statusKey(overview.tenant.status)}
              </Badge>
            </div>
            {overview.tenant.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                {t("tenantSettings.trialEndsAt")}: {formatDate(overview.tenant.trialEndsAt)}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("tenantSettings.planChangeNote")}
            </p>
          </section>

          {/* Pemakaian vs kuota ter-snapshot. */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("tenantSettings.usageHeading")}
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <dt className="text-muted-foreground">{t("tenantSettings.usageCompanies")}</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {t("tenantSettings.usageOf", {
                    used: overview.usage.companies,
                    max: overview.tenant.maxCompanies,
                  })}
                </dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-muted-foreground">{t("tenantSettings.usageUsers")}</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {t("tenantSettings.usageOf", {
                    used: overview.usage.users,
                    max: overview.tenant.maxUsers,
                  })}
                </dd>
              </div>
            </dl>
          </section>

          {/* Riwayat tagihan — dari PLATFORM; owner saja, dan boleh "mati". */}
          {canSeeBilling && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tenantSettings.billingHeading")}
              </h2>
              {overview.billing === null ? (
                <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                  {t("tenantSettings.billingUnavailable")}
                </p>
              ) : (
                <>
                  {overview.billing.subscription ? (
                    <p className="text-sm text-muted-foreground">
                      {t("tenantSettings.price", {
                        amount: formatMoney(
                          Number(overview.billing.subscription.price),
                          overview.billing.subscription.currency
                        ),
                        cycle:
                          overview.billing.subscription.billingCycle === "yearly"
                            ? t("tenantSettings.cycleYearly")
                            : t("tenantSettings.cycleMonthly"),
                      })}{" "}
                      ·{" "}
                      {t("tenantSettings.period", {
                        date: formatDate(overview.billing.subscription.currentPeriodEnd),
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("tenantSettings.noSubscription")}
                    </p>
                  )}
                  {overview.billing.invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("tenantSettings.noInvoices")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t("tenantSettings.invoiceNumber")}</TableHead>
                          <TableHead>{t("tenantSettings.invoiceDue")}</TableHead>
                          <TableHead className="text-right">
                            {t("tenantSettings.invoiceTotal")}
                          </TableHead>
                          <TableHead>{t("tenantSettings.statusLabel")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.billing.invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium text-foreground">
                              {invoice.number}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(invoice.dueDate)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-foreground">
                              {formatMoney(Number(invoice.total), invoice.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={invoice.status === "paid" ? "success" : "default"}>
                                {t(
                                  `tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey
                                )}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </section>
          )}

          {canExport && <PrivacySection canDelete={canDelete} />}
        </div>
      )}
    </AuthShell>
  );
}
