/**
 * Langganan, kuota, dan riwayat tagihan — bagian OWNER SAJA dari `/platform`
 * (issue #172; isinya berasal dari halaman /tenant issue #140/#141).
 *
 * ══ KENAPA BERKAS TERSENDIRI ═══════════════════════════════════════════════
 * Sejak /platform menjadi pendaratan pasca-masuk SETIAP anggota tenant, apa
 * yang dilihat seorang `member` dan apa yang dilihat owner berbeda jauh — dan
 * pemisahannya tidak boleh berupa selusin `{canX && …}` yang berserak di satu
 * berkas panjang, tempat satu tanda kurung yang lepas mengubah siapa melihat
 * apa tanpa satu pun tes berbunyi.
 *
 * Karena itu seluruh permukaan berizin `tenant.billing` tinggal di sini, dan
 * halamannya memanggil komponen ini HANYA di dalam cabang izinnya. Datanya pun
 * diambil di dalam cabang yang sama dan dioper sebagai prop: untuk yang tidak
 * berhak, query langganan TIDAK PERNAH BERJALAN — bukan sekadar hasilnya tak
 * dirender.
 *
 * Riwayat tagihan datang dari `sai_platform` dan boleh gagal dengan tenang
 * ("penagihan tidak terjangkau"): penagihan mati tidak boleh mematikan halaman
 * yang menjelaskan keadaan langganan. Paket/kuota datang dari basis data
 * KENDALI (snapshot #140) dan selalu terjawab.
 */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money-format";
import { isReadOnlyTenantStatus } from "@/lib/subscription-lifecycle";
import type { BillingOverview } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

import { BillingProfileForm, PayInvoice } from "./billing-actions";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

export async function SubscriptionSection({
  overview,
}: {
  overview: BillingOverview | null;
}) {
  const t = await getT();

  if (!overview) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("tenantSettings.noSubscription")}
      </p>
    );
  }

  const statusKey = (status: string) => t(`tenantSettings.status.${status}` as DictionaryKey);
  const readOnly = isReadOnlyTenantStatus(overview.tenant.status);

  return (
    <div className="space-y-6">
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

      {/* Riwayat tagihan — dari PLATFORM, dan boleh "mati". */}
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("tenantSettings.invoiceNumber")}</TableHead>
                      <TableHead>{t("tenantSettings.invoiceDue")}</TableHead>
                      <TableHead className="text-right">
                        {t("tenantSettings.invoiceTotal")}
                      </TableHead>
                      <TableHead>{t("tenantSettings.statusLabel")}</TableHead>
                      <TableHead>{t("billing.payColumn")}</TableHead>
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
                            {t(`tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {/* "Bayar" hanya untuk tagihan TERBUKA (issue #141) —
                              VA/QRIS; tagih-lalu-ingatkan, bukan auto-debit. */}
                          {invoice.status === "issued" ? (
                            <PayInvoice invoiceId={invoice.id} pending={invoice.pendingPayment} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
        {/* Profil penagihan — NPWP lawan transaksi untuk Faktur Pajak KAMI
            (issue #141). ⚠ Kewajiban PPN/e-Faktur langganan harus dikonfirmasi
            penasihat pajak; ini mekanisme datanya. */}
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t("billing.profileHeading")}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("billing.profileHint")}
          </p>
          <BillingProfileForm profile={overview.billing?.profile ?? null} />
        </div>
      </section>
    </div>
  );
}
