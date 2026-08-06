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
 *
 * ── Setelah AntD (issue #200) ────────────────────────────────────────────
 * Kedua tabel pindah ke `StaticTable` (aturan #189 — halaman rincian, nol
 * kendali interaktif), dan kolom nominal tagihan pindah dari `MoneyCell` ke
 * `moneyColumn`, jadi aturan uang MASTER.md ditegakkan pembantunya alih-alih
 * diketik ulang per sel.
 *
 * Warnanya token `:root` aplikasi: konsol operator sengaja tidak menggambar
 * satu pun komponen AntD di atas isinya (kerangkanya tidak mengimpor apa pun
 * dari sisi pelanggan), jadi variabel `--ant-…` tidak akan teratasi di sini
 * (#227). Yang mewarnai dirinya sendiri — `Badge`, `Button`, `Money` — tetap
 * memakai token AntD karena masing-masing dirender sebagai daun client.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
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

const MUTED: React.CSSProperties = { margin: 0, fontSize: 14, color: "var(--muted-foreground)" };

const H2: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--foreground)",
};

const H3: React.CSSProperties = {
  margin: 0,
  paddingTop: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--foreground)",
};

const SECTION: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

/**
 * Kisi fakta yang membagi lebarnya sendiri — pengganti
 * `grid-cols-2 lg:grid-cols-4`. Satu kolom di 375px tanpa media query.
 */
const FACT_GRID: React.CSSProperties = {
  display: "grid",
  gap: 12,
  margin: 0,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
};

const NOTICE: React.CSSProperties = {
  ...MUTED,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--muted)",
  lineHeight: 1.625,
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
      <dt style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{label}</dt>
      <dd
        style={{
          margin: "4px 0 0",
          fontSize: 14,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: "var(--foreground)",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

type TenantDetail = NonNullable<Awaited<ReturnType<typeof tenantDetailForOperator>>>;
type Invoice = NonNullable<TenantDetail["billing"]>["invoices"][number];
type Company = TenantDetail["companies"][number];

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

  const invoiceColumns: SaiColumns<Invoice> = [
    {
      key: "number",
      title: t("operator.tenant.colInvoiceNumber"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ fontWeight: 500, color: "var(--foreground)" }}>{invoice.number}</span>
      ),
    },
    {
      key: "issueDate",
      title: t("operator.tenant.colIssueDate"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ color: "var(--muted-foreground)" }}>{formatDate(invoice.issueDate)}</span>
      ),
    },
    {
      key: "dueDate",
      title: t("operator.tenant.colDueDate"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ color: "var(--muted-foreground)" }}>{formatDate(invoice.dueDate)}</span>
      ),
    },
    /* Nominal lewat `moneyColumn`, dan mata uangnya DIBACA PER BARIS: tagihan
       tenant tidak selalu IDR, dan angka tanpa mata uangnya adalah angka yang
       salah. Sortirnya diabaikan `StaticTable`. */
    moneyColumn<Invoice>({
      dataIndex: "total",
      title: t("operator.tenant.colTotal"),
      currency: (invoice) => invoice.currency as CurrencyCode,
    }),
    {
      key: "status",
      title: t("operator.tenant.colStatus"),
      align: "left",
      render: (_v, invoice) => (
        <Badge variant={invoice.status === "paid" ? "success" : "default"}>
          {t(`tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey)}
        </Badge>
      ),
    },
    {
      key: "payments",
      title: t("operator.tenant.colPayments"),
      align: "left",
      render: (_v, invoice) =>
        invoice.payments.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
        ) : (
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              margin: 0,
              padding: 0,
              fontSize: 12,
              color: "var(--muted-foreground)",
            }}
          >
            {invoice.payments.map((payment) => (
              <li key={payment.id} style={{ whiteSpace: "nowrap" }}>
                {payment.status} · {payment.method ?? payment.gateway ?? "?"} ·{" "}
                {formatMoney(Number(payment.amount), invoice.currency as CurrencyCode)}
                {payment.paidAt && (
                  <>
                    {" "}
                    ·{" "}
                    {t("operator.tenant.paidAt", { date: formatDate(payment.paidAt) })}
                  </>
                )}
              </li>
            ))}
          </ul>
        ),
    },
  ];

  const companyColumns: SaiColumns<Company> = [
    {
      key: "name",
      title: t("operator.tenant.colCompanyName"),
      align: "left",
      render: (_v, company) => (
        <span style={{ fontWeight: 500, color: "var(--foreground)" }}>{company.name}</span>
      ),
    },
    {
      key: "slug",
      title: t("operator.tenant.colCompanySlug"),
      align: "left",
      render: (_v, company) => (
        <span style={{ color: "var(--muted-foreground)" }}>{company.slug}</span>
      ),
    },
    {
      key: "active",
      title: t("operator.tenant.colCompanyActive"),
      align: "left",
      render: (_v, company) => (
        <Badge variant={company.isActive ? "success" : "default"}>
          {company.isActive
            ? t("operator.tenant.companyActive")
            : t("operator.tenant.companyInactive")}
        </Badge>
      ),
    },
    {
      key: "users",
      title: t("operator.tenant.colCompanyUsers"),
      align: "right",
      render: (_v, company) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--foreground)" }}>
          {company.userCount}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={SECTION}>
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/operator">
              <ArrowLeftOutlined aria-hidden="true" />
              {t("operator.tenant.back")}
            </Link>
          </Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "var(--foreground)",
            }}
          >
            {tenant.name}
          </h1>
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
          <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{tenant.slug}</span>
        </div>
      </div>

      {/* ── Kendali: paket ter-snapshot, kuota, pemakaian — selalu tampil ── */}
      <section style={SECTION}>
        <h2 style={H2}>{t("operator.tenant.planHeading")}</h2>
        <dl style={FACT_GRID}>
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
          <p style={MUTED}>
            {t("operator.tenant.trialEndsAt")}: {formatDate(tenant.trialEndsAt)}
          </p>
        )}
      </section>

      {/* ── Platform: langganan & tagihan — boleh "mati" dengan tenang ───── */}
      <section style={SECTION}>
        <h2 style={H2}>{t("operator.tenant.subscriptionHeading")}</h2>
        {billing === null ? (
          <p style={NOTICE}>{t("operator.tenant.billingUnavailable")}</p>
        ) : (
          <>
            {billing.subscription === null ? (
              <p style={MUTED}>{t("operator.tenant.noSubscription")}</p>
            ) : (
              <dl style={FACT_GRID}>
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

            <h3 style={H3}>{t("operator.tenant.invoicesHeading")}</h3>
            {billing.invoices.length === 0 ? (
              <p style={MUTED}>{t("operator.tenant.noInvoices")}</p>
            ) : (
              <StaticTable
                columns={invoiceColumns}
                rows={billing.invoices}
                rowKey={(invoice) => invoice.id}
              />
            )}

            <h3 style={H3}>{t("operator.tenant.taxHeading")}</h3>
            {billing.profile === null ? (
              <p style={MUTED}>{t("operator.tenant.profileMissing")}</p>
            ) : (
              <dl style={FACT_GRID}>
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
      <section style={SECTION}>
        <h2 style={H2}>{t("operator.tenant.companiesHeading")}</h2>
        {companies.length === 0 ? (
          <p style={MUTED}>{t("operator.tenant.noCompanies")}</p>
        ) : (
          <StaticTable
            columns={companyColumns}
            rows={companies}
            rowKey={(company) => company.id}
          />
        )}
        <p style={{ ...MUTED, fontSize: 12, lineHeight: 1.625 }}>
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
