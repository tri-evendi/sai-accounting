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
 * Warnanya variabel token AntD `var(--ant-…)` (#203). Konsol operator sengaja
 * tidak menggambar satu pun komponen AntD di atas isinya — kerangkanya tidak
 * mengimpor apa pun dari sisi pelanggan — dan itu dulu berarti variabel AntD
 * tak teratasi di sini. Tidak lagi sejak #227: kelas `ANTD_CSS_VAR_KEY` dipikul
 * `<html>` oleh root layout, bukan oleh elemen yang digambar komponen AntD.
 * Token `:root` aplikasi yang dulu dipakai sudah dicabut `globals.css` oleh
 * #203. Yang mewarnai dirinya sendiri — `Badge`, `Button`, `Money` — memakai
 * token yang sama karena masing-masing dirender sebagai daun client.
 */

import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
} from "@/components/operator/console-ui";
import { PageHeader } from "@/components/ui/page-header";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { TenantActions } from "@/components/operator/tenant-actions";
import { paymentRailConfigured } from "@/lib/payment-gateway";
import { requireOperatorPage } from "@/lib/operator/guard";
import { listPlansForOperator, tenantDetailForOperator } from "@/lib/operator/store";
import { executionVerdict } from "@/lib/tenant-deletion";
import {
  BILLING_MODE_LABEL_KEYS,
  platformInvoiceIsRevenue,
  type BillingMode,
} from "@/lib/platform-constants";
import { formatMoney, type CurrencyCode } from "@/lib/money-format";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

const READ_ONLY_STATUSES = new Set(["suspended", "cancelled"]);

const MUTED = CONSOLE_MUTED;

/** Sub-judul DI DALAM panel (h3): tagihan & pajak di bawah langganan. */
const H3: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

/**
 * Kisi fakta yang membagi lebarnya sendiri — satu kolom di 375px tanpa media
 * query.
 */
const FACT_GRID: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin-sm)",
  margin: 0,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
};

/**
 * Satu fakta — BERISIAN, bukan bertepi, dan itu berubah bersama panelnya.
 *
 * Sampai halaman ini duduk di dalam kartu, tiap fakta menggambar tepinya
 * sendiri; itu benar selama tidak ada bingkai lain di sekelilingnya. Begitu
 * panelnya punya tepi, dua belas kotak bertepi di dalam satu kotak bertepi
 * menghasilkan tiga belas garis pada satu wilayah — "outline saja", persis
 * keluhan yang #266 ukur. Isian `fill-quaternary` memisahkan sel dari kartunya
 * tanpa menambah satu garis pun.
 */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "var(--ant-padding-sm)",
        borderRadius: "var(--ant-border-radius)",
        background: "var(--ant-color-fill-quaternary)",
      }}
    >
      <dt style={{ fontSize: 14, color: "var(--ant-color-text-secondary)" }}>{label}</dt>
      <dd
        style={{
          margin: "4px 0 0",
          fontSize: 14,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ant-color-text)",
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
        <span style={{ fontWeight: 500, color: "var(--ant-color-text)" }}>{invoice.number}</span>
      ),
    },
    {
      key: "issueDate",
      title: t("operator.tenant.colIssueDate"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{formatDate(invoice.issueDate)}</span>
      ),
    },
    {
      key: "dueDate",
      title: t("operator.tenant.colDueDate"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{formatDate(invoice.dueDate)}</span>
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
      /* `success` HANYA untuk uang yang BENAR-BENAR masuk: tagihan kompensasi
         (`comped`) bernilai nol rupiah dan tidak boleh terbaca sebagai
         pendapatan dari warnanya. Satu fungsi yang memutuskannya, dipakai
         setiap permukaan — `platformInvoiceIsRevenue`. */
      render: (_v, invoice) => (
        <Badge variant={platformInvoiceIsRevenue(invoice.status) ? "success" : "default"}>
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
          <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)" }}>—</span>
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
              color: "var(--ant-color-text-secondary)",
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
        <span style={{ fontWeight: 500, color: "var(--ant-color-text)" }}>{company.name}</span>
      ),
    },
    {
      key: "slug",
      title: t("operator.tenant.colCompanySlug"),
      align: "left",
      render: (_v, company) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{company.slug}</span>
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
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ant-color-text)" }}>
          {company.userCount}
        </span>
      ),
    },
  ];

  return (
    <div style={CONSOLE_PAGE}>
      {/* Kepala halaman = `PageHeader`, sama dengan halaman dasbor di bawah
          tingkat-1 — bukan `<h1>` + tombol "kembali" tulisan tangan. Breadcrumb
          yang menyebut daftar tenant ADALAH jalan pulangnya, dan ia menyebut
          lokasinya sekaligus; tombol kembali hanya menyebut arah. */}
      <PageHeader
        breadcrumbs={[
          { label: t("operator.nav.tenants"), href: "/operator/tenants" },
          { label: tenant.name },
        ]}
        title={tenant.name}
        description={tenant.slug}
        badge={
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
        }
      />

      {/* ── Kendali: paket ter-snapshot, kuota, pemakaian — selalu tampil ── */}
      <ConsolePanel title={t("operator.tenant.planHeading")}>
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
      </ConsolePanel>

      {/* ── Platform: langganan & tagihan — boleh "mati" dengan tenang ───── */}
      <ConsolePanel title={t("operator.tenant.subscriptionHeading")}>
        {billing === null ? (
          <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
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
                {/* MODE PENAGIHAN sebagai fakta, bukan hanya nilai awal panel
                    di bawah: ia menjawab "apakah akun ini akan ditagih?" —
                    pertanyaan yang sebelumnya hanya bisa dijawab dengan
                    membuka basis data. */}
                <Fact
                  label={t("operator.actions.billingMode.currentLabel")}
                  value={t(
                    BILLING_MODE_LABEL_KEYS[
                      (billing.subscription.billingMode as BillingMode) ?? "none"
                    ] ?? BILLING_MODE_LABEL_KEYS.none
                  )}
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
      </ConsolePanel>

      {/* ── Registry PT — kendali; bukunya TIDAK PERNAH dibuka dari sini ─── */}
      <ConsolePanel
        title={t("operator.tenant.companiesHeading")}
        footnote={t("operator.tenant.booksNote")}
      >
        {companies.length === 0 ? (
          <p style={MUTED}>{t("operator.tenant.noCompanies")}</p>
        ) : (
          <StaticTable
            columns={companyColumns}
            rows={companies}
            rowKey={(company) => company.id}
          />
        )}
      </ConsolePanel>

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
        billingMode={billing?.subscription?.billingMode ?? null}
        /* Dihitung di SERVER dari environment; yang menyeberang hanya boolean.
           Dipakai panel mode penagihan sebagai peringatan sebelum menyalakan
           penagihan otomatis tanpa satu pun cara membayar. */
        paymentRailReady={paymentRailConfigured()}
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
