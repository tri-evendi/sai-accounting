/**
 * Rincian TENANT — konsol operator (issue #154), dan sejak #155 juga
 * PERMUKAAN TINDAKANNYA: panel tulis (`TenantActions`) berdiri di halaman
 * yang sama dengan faktanya, karena tombol yang memindahkan uang harus
 * berdiri persis di sebelah angka yang menjadi alasannya.
 *
 * Dua sumber, dua nasib — dan keduanya jujur di layar:
 *   • Bagian KENDALI (paket ter-snapshot, kuota, pemakaian, daftar PT) selalu
 *     tampil, juga saat `sai_platform` mati.
 *   • Bagian PLATFORM (langganan, tagihan + pembayarannya, profil pajak)
 *     jatuh ke "penagihan tidak terjangkau" — bukan 500. Saat itu terjadi,
 *     tindakan penagihan (lunas/paket/suspensi) ikut MATI di layar: menawarkan
 *     tombol yang pasti gagal adalah kebohongan kecil yang mahal.
 *
 * Halaman ini TIDAK PERNAH membuka basis data perusahaan tenant: operator
 * melihat metadata langganan, bukan pembukuan pelanggan (batas #154 —
 * membaca buku adalah keputusan terpisah dengan persetujuan & jejaknya
 * sendiri).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/ui/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TenantActions } from "@/components/operator/tenant-actions";
import { requireOperatorPage } from "@/lib/operator/guard";
import { listPlansForOperator, tenantDetailForOperator } from "@/lib/operator/store";
import { executionVerdict } from "@/lib/tenant-deletion";
import { formatMoney, type CurrencyCode } from "@/lib/money-format";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

const READ_ONLY_STATUSES = new Set(["suspended", "cancelled"]);

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export default async function OperatorTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();

  const { id } = await params;
  const tenantId = Number.parseInt(id, 10);
  if (!Number.isInteger(tenantId) || tenantId <= 0) notFound();

  const detail = await tenantDetailForOperator(tenantId);
  if (!detail) notFound();

  const statusLabel = (value: string) => t(`tenantSettings.status.${value}` as DictionaryKey);
  const { tenant, usage, companies, billing, deletionRequest } = detail;

  /* Bahan panel tindakan (#155). Paket hanya dibaca bila penagihan hidup —
   * tanpanya panel ganti paket memang tidak boleh muncul. */
  const plans = billing === null ? null : await listPlansForOperator();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/operator">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("operator.tenant.back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{tenant.name}</h1>
          <Badge
            variant={
              READ_ONLY_STATUSES.has(tenant.status)
                ? "danger"
                : tenant.status === "active"
                  ? "success"
                  : "warning"
            }
          >
            {statusLabel(tenant.status)}
          </Badge>
          <span className="text-sm text-muted-foreground">{tenant.slug}</span>
        </div>
      </div>

      {/* ── Kendali: paket ter-snapshot, kuota, pemakaian — selalu tampil ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          {t("operator.tenant.planHeading")}
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Fact label={t("operator.tenant.planLabel")} value={tenant.planKey} />
          <Fact label={t("operator.tenant.signupDate")} value={formatDate(tenant.createdAt)} />
          <Fact
            label={t("operator.tenant.usageCompanies")}
            value={t("operator.tenant.usageOf", {
              used: usage.companies,
              max: tenant.maxCompanies,
            })}
          />
          <Fact
            label={t("operator.tenant.usageUsers")}
            value={t("operator.tenant.usageOf", { used: usage.users, max: tenant.maxUsers })}
          />
        </dl>
        {tenant.trialEndsAt && (
          <p className="text-sm text-muted-foreground">
            {t("operator.tenant.trialEndsAt")}: {formatDate(tenant.trialEndsAt)}
          </p>
        )}
      </section>

      {/* ── Platform: langganan & tagihan — boleh "mati" dengan tenang ───── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          {t("operator.tenant.subscriptionHeading")}
        </h2>
        {billing === null ? (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
            {t("operator.tenant.billingUnavailable")}
          </p>
        ) : (
          <>
            {billing.subscription === null ? (
              <p className="text-sm text-muted-foreground">{t("operator.tenant.noSubscription")}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Fact
                  label={t("operator.tenant.statusLabel")}
                  value={
                    <Badge variant={billing.subscription.status === "active" ? "success" : "warning"}>
                      {statusLabel(billing.subscription.status)}
                    </Badge>
                  }
                />
                <Fact
                  label={t("operator.tenant.priceLabel")}
                  value={`${formatMoney(
                    Number(billing.subscription.price),
                    billing.subscription.currency as CurrencyCode
                  )} / ${
                    billing.subscription.billingCycle === "yearly"
                      ? t("operator.tenant.cycleYearly")
                      : t("operator.tenant.cycleMonthly")
                  }`}
                />
                <Fact
                  label={t("operator.tenant.periodEnd")}
                  value={formatDate(billing.subscription.currentPeriodEnd)}
                />
                <Fact
                  label={
                    billing.subscription.pastDueSince
                      ? t("operator.tenant.pastDueSince")
                      : billing.subscription.cancelledAt
                        ? t("operator.tenant.cancelledAt")
                        : t("operator.tenant.trialEndsAt")
                  }
                  value={
                    billing.subscription.pastDueSince
                      ? formatDate(billing.subscription.pastDueSince)
                      : billing.subscription.cancelledAt
                        ? formatDate(billing.subscription.cancelledAt)
                        : billing.subscription.trialEndsAt
                          ? formatDate(billing.subscription.trialEndsAt)
                          : "—"
                  }
                />
              </dl>
            )}

            <h3 className="pt-2 text-sm font-semibold text-foreground">
              {t("operator.tenant.invoicesHeading")}
            </h3>
            {billing.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("operator.tenant.noInvoices")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("operator.tenant.colInvoiceNumber")}</TableHead>
                    <TableHead>{t("operator.tenant.colIssueDate")}</TableHead>
                    <TableHead>{t("operator.tenant.colDueDate")}</TableHead>
                    <TableHead className="text-right">{t("operator.tenant.colTotal")}</TableHead>
                    <TableHead>{t("operator.tenant.colStatus")}</TableHead>
                    <TableHead>{t("operator.tenant.colPayments")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium text-foreground">{invoice.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invoice.issueDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell className="p-0">
                        <MoneyCell
                          value={Number(invoice.total)}
                          currency={invoice.currency as CurrencyCode}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoice.status === "paid" ? "success" : "default"}>
                          {t(`tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invoice.payments.length === 0 ? (
                          <span>—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {invoice.payments.map((payment) => (
                              <li key={payment.id} className="whitespace-nowrap">
                                {payment.status} · {payment.method ?? payment.gateway ?? "?"} ·{" "}
                                {formatMoney(Number(payment.amount), invoice.currency as CurrencyCode)}
                                {payment.paidAt && (
                                  <>
                                    {" "}
                                    ·{" "}
                                    {t("operator.tenant.paidAt", {
                                      date: formatDate(payment.paidAt),
                                    })}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <h3 className="pt-2 text-sm font-semibold text-foreground">
              {t("operator.tenant.taxHeading")}
            </h3>
            {billing.profile === null ? (
              <p className="text-sm text-muted-foreground">{t("operator.tenant.profileMissing")}</p>
            ) : (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Fact label={t("operator.tenant.npwp")} value={billing.profile.npwp ?? "—"} />
                <Fact label={t("operator.tenant.npwpName")} value={billing.profile.name ?? "—"} />
                <Fact
                  label={t("operator.tenant.npwpAddress")}
                  value={billing.profile.address ?? "—"}
                />
              </dl>
            )}
          </>
        )}
      </section>

      {/* ── Registry PT — kendali; bukunya TIDAK PERNAH dibuka dari sini ─── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          {t("operator.tenant.companiesHeading")}
        </h2>
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("operator.tenant.noCompanies")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("operator.tenant.colCompanyName")}</TableHead>
                <TableHead>{t("operator.tenant.colCompanySlug")}</TableHead>
                <TableHead>{t("operator.tenant.colCompanyActive")}</TableHead>
                <TableHead className="text-right">{t("operator.tenant.colCompanyUsers")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium text-foreground">{company.name}</TableCell>
                  <TableCell className="text-muted-foreground">{company.slug}</TableCell>
                  <TableCell>
                    <Badge variant={company.isActive ? "success" : "default"}>
                      {company.isActive
                        ? t("operator.tenant.companyActive")
                        : t("operator.tenant.companyInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {company.userCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("operator.tenant.booksNote")}
        </p>
      </section>

      {/* ── Tindakan tulis (#155) — SENGAJA paling bawah: fakta dibaca dulu,
          tombolnya belakangan; yang paling merusak paling jauh dari jalur
          baca. Semua nilai sudah diserialkan di sini (tanggal jadi label,
          Decimal jadi string) — komponen client tidak menerima Date/Decimal. */}
      <TenantActions
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        subscriptionStatus={billing?.subscription?.status ?? null}
        usage={usage}
        currentPlanKey={tenant.planKey}
        billingAvailable={billing !== null}
        issuedInvoices={(billing?.invoices ?? [])
          .filter((invoice) => invoice.status === "issued")
          .map((invoice) => ({
            number: invoice.number,
            total: invoice.total,
            currency: invoice.currency,
            dueDateLabel: formatDate(invoice.dueDate),
          }))}
        plans={plans}
        deletionRequest={
          deletionRequest
            ? {
                id: deletionRequest.id,
                graceEndsAtLabel: formatDate(deletionRequest.graceEndsAt),
                /* Vonis yang SAMA dengan yang dipakai inti tulis — layar dan
                 * server tidak boleh berbeda pendapat soal tenggang. */
                pastGrace:
                  executionVerdict({ status: "pending", graceEndsAt: deletionRequest.graceEndsAt }) ===
                  "executable",
                note: deletionRequest.note,
              }
            : null
        }
      />
    </div>
  );
}
