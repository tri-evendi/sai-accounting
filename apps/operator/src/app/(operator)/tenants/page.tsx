/**
 * Daftar TENANT — konsol operator (issue #154).
 *
 * ⚠ ALAMATNYA `/tenants`, bukan `/`. Sampai konsol punya
 * halaman ringkasan, daftar ini ADALAH pendaratannya — dan itu yang membuat
 * jawaban atas "bagaimana keadaan platform hari ini?" menjadi sebuah tabel
 * tujuh kolom yang harus dibaca baris demi baris. Pendaratan sekarang milik
 * `../page.tsx`; daftar ini butir menunya sendiri, dan formulir saringannya
 * ikut pindah (`action="/tenants"`) supaya URL hasil saringan tetap
 * bisa disalin ke tiket dukungan.
 *
 * Sebelum halaman ini, TIDAK ADA satu pun UI yang membaca daftar tenant:
 * setiap pertanyaan dukungan pelanggan berarti sesi SSH. Datanya murni dari
 * basis data KENDALI (`listTenantsForOperator`), jadi halaman ini tetap hidup
 * saat `sai_platform` mati — rincian penagihan menyusul di halaman detail.
 *
 * Pencarian & saringan status lewat form GET biasa: hasilnya URL yang bisa
 * disalin ke tiket dukungan, tanpa satu pun byte JS tambahan.
 *
 * ══ TAB STATUS DI ATAS `?status=` ═════════════════════════════════════════
 * Semua · Uji coba · Minta aktivasi · Beku · Aktif · Menunggak, masing-masing
 * dengan jumlahnya (`tenantStatusCountsForOperator`, satu `groupBy`). Tabnya
 * MEMAKAI parameter `?status=` yang sudah ada, jadi tautan lama (baris
 * "perlu perhatian", ubin ringkasan: `/tenants?status=past_due`) tetap
 * membuka tab yang benar. "Minta aktivasi" bukan status tenant: nilainya
 * `status=activation`, dan isinya tenant yang punya permintaan TERBUKA —
 * panel permintaannya pindah ke tab ini. Status lain (ditangguhkan, batal,
 * pindah on-premise, menunggu verifikasi) tetap terjangkau lewat pilihan
 * status di formulir saringan.
 *
 * ── Perender tabel & warna setelah AntD (issue #200) ──────────────────────
 * `StaticTable`, bukan `DataTable`, dan alasannya aturan #189: daftar ini sudah
 * disaring & dicari DI SERVER lewat form GET di atasnya, jadi rc-table hanya
 * akan menyalin ulang seluruh baris ke peramban (±80 KB gzip) untuk sortir yang
 * URL-nya justru lebih berguna dipakai.
 *
 * Warnanya variabel token AntD `var(--ant-…)` (#203). Konsol ini memang tidak
 * punya satu pun komponen AntD di atas isinya — kerangkanya sengaja tanpa impor
 * apa pun dari sisi pelanggan — tapi itu tidak lagi menghalangi: sejak #227
 * kelas `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root layout, bukan oleh elemen
 * yang digambar komponen AntD, jadi variabelnya teratasi di seluruh dokumen.
 * Token `:root` aplikasi yang dulu dipakai sudah dicabut `globals.css` oleh
 * #203. Yang mewarnai dirinya sendiri — `Badge`, `Button`, `EmptyState` — tetap
 * memakai token AntD karena masing-masing dirender sebagai daun client.
 */

import Link from "next/link";
import { TeamOutlined } from "@ant-design/icons";
import { Badge } from "@sai/ui/badge";
import { Button, ButtonLink } from "@sai/ui/button";
import { EmptyState } from "@sai/ui/empty-state";
import { Input } from "@sai/ui/input";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_PAGE,
} from "@op/components/operator/console-ui";
import { PageHeader } from "@sai/ui/page-header";
import { Select } from "@sai/ui/select";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import {
  activationRequestsForOperator,
  listTenantsForOperator,
  tenantStatusCountsForOperator,
  tenantStatusVariant,
} from "@op/lib/operator/store";
import { ConsoleTabs } from "@op/components/operator/console-tabs";
import { ActivationRequests } from "@op/components/operator/activation-requests";
import { operatorMarkActivationHandled } from "./actions";
import { TENANT_STATUSES } from "@sai/core/constants";
import { getT } from "@sai/platform/i18n/server";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { formatDateMedium as formatDate } from "@sai/core/utils";

export const dynamic = "force-dynamic";

/** Teks sekunder di dalam sel — token AntD, lihat catatan kepala berkas. */
const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

const MUTED_TABULAR: React.CSSProperties = {
  ...MUTED,
  fontVariantNumeric: "tabular-nums",
};

type TenantRow = Awaited<ReturnType<typeof listTenantsForOperator>>[number];

/** Tab status — `activation` bukan status tenant (lihat kepala berkas). */
const STATUS_TABS = ["all", "trialing", "activation", "trial_ended", "active", "past_due"] as const;
type StatusTab = (typeof STATUS_TABS)[number];
const STATUS_TAB_LABEL = {
  all: "operator.tenants.tabAll",
  trialing: "operator.tenants.tabTrialing",
  activation: "operator.tenants.tabActivation",
  trial_ended: "operator.tenants.tabTrialEnded",
  active: "operator.tenants.tabActive",
  past_due: "operator.tenants.tabPastDue",
} as const satisfies Record<StatusTab, DictionaryKey>;

export default async function OperatorTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const mintaAktivasi = params.status === "activation";
  const status = (TENANT_STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as string)
    : "";
  /* Tab yang menyala: status yang punya tab, "Minta aktivasi", atau "Semua"
     bila tak ada saringan. Status lain yang dipilih lewat formulir → tidak ada
     tab yang menyala (daftarnya tetap tersaring). */
  const activeTab: string = mintaAktivasi
    ? "activation"
    : status === ""
      ? "all"
      : (STATUS_TABS as readonly string[]).includes(status)
        ? status
        : "";

  const [counts, activation] = await Promise.all([
    tenantStatusCountsForOperator({ q }),
    /* Daftar kerja alur demo-first: permintaan aktivasi yang masih TERBUKA.
       `null` = platform tak terjangkau — daftar tenant di bawahnya tetap tampil.
       Selalu dibaca: jumlahnya lencana tab, dan penanda di setiap baris. */
    activationRequestsForOperator({ status: "open" }),
  ]);
  const openRequestTenants = new Set((activation ?? []).map((r) => r.tenantId));
  /* Hanya baris tab AKTIF yang dibaca. */
  const tenants = await listTenantsForOperator(
    mintaAktivasi ? { q, ids: [...openRequestTenants] } : { q, status }
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabCount = (id: StatusTab): number =>
    id === "all" ? total : id === "activation" ? openRequestTenants.size : (counts[id] ?? 0);
  const canBill = operatorCan(operator.role, "tenant.billing");
  const statusLabel = (value: string) => t(`tenantSettings.status.${value}` as DictionaryKey);

  const columns: SaiColumns<TenantRow> = [
    {
      key: "name",
      title: t("operator.tenants.colName"),
      align: "left",
      render: (_v, tenant) => (
        <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Link
            href={`/tenants/${tenant.id}`}
            style={{ color: "var(--ant-color-link)", fontWeight: 500 }}
          >
            {tenant.name}
          </Link>
          {tenant.isDemo && <Badge variant="outline">{t("operator.trial.demoBadge")}</Badge>}
          {openRequestTenants.has(tenant.id) && (
            <Badge variant="warning">{t("operator.activation.badge")}</Badge>
          )}
        </span>
      ),
    },
    {
      key: "slug",
      title: t("operator.tenants.colSlug"),
      align: "left",
      render: (_v, tenant) => <span style={MUTED}>{tenant.slug}</span>,
    },
    {
      key: "status",
      title: t("operator.tenants.colStatus"),
      align: "left",
      render: (_v, tenant) => (
        <Badge
          variant={tenantStatusVariant(tenant.status)}
        >
          {statusLabel(tenant.status)}
        </Badge>
      ),
    },
    {
      key: "plan",
      title: t("operator.tenants.colPlan"),
      align: "left",
      render: (_v, tenant) => tenant.planKey,
    },
    /* Atribusi mitra (migration kendali 0013) — dasar komisi yang dihitung
       manual; pencarian di atas ikut menyapu kolom ini. */
    {
      key: "partner",
      title: t("operator.partner.column"),
      align: "left",
      render: (_v, tenant) => <span style={MUTED}>{tenant.referredByPartner ?? "—"}</span>,
    },
    {
      key: "created",
      title: t("operator.tenants.colCreated"),
      align: "left",
      render: (_v, tenant) => <span style={MUTED}>{formatDate(tenant.createdAt)}</span>,
    },
    {
      key: "usage",
      title: t("operator.tenants.colUsage"),
      align: "left",
      render: (_v, tenant) => (
        <span style={MUTED_TABULAR}>
          {t("operator.tenants.usageValue", {
            companies: tenant.usage.companies,
            maxCompanies: tenant.maxCompanies,
            users: tenant.usage.users,
            maxUsers: tenant.maxUsers,
          })}
        </span>
      ),
    },
  ];

  return (
    /* Kepala di luar kolom berjarak: `PageHeader` membawa jarak bawahnya
       sendiri (`marginLG`), jadi menaruhnya DI DALAM kolom ber-`gap` akan
       menjumlahkan keduanya — pola yang sama dengan halaman dasbor. */
    <div>
      {/* Kepala halaman = `PageHeader`, satu pola dengan dasbor: halaman
          tingkat-1, jadi tanpa breadcrumb dan judulnya PERSIS label menunya
          (boleh membawa jumlah) — aturan MASTER.md §Kepala Halaman. Sebelum
          kulit panel ada, setiap halaman konsol menggambar `<h1>`-nya sendiri
          dari konstanta `H1` yang disalin berkas demi berkas. */}
      <PageHeader
        title={`${t("operator.tenants.heading")} (${tenants.length})`}
        description={t("operator.tenants.description")}
        actions={
          canBill ? (
            <ButtonLink href="/tenants/new" variant="primary">
              {t("operator.trial.open")}
            </ButtonLink>
          ) : undefined
        }
      />

      <div style={CONSOLE_PAGE}>
      <ConsoleTabs
        label={t("operator.tenants.tabsAria")}
        basePath="/tenants"
        param="status"
        active={activeTab}
        defaultId="all"
        keep={{ q }}
        tabs={STATUS_TABS.map((id) => ({
          id,
          label: t(STATUS_TAB_LABEL[id]),
          count: tabCount(id),
          attention: id === "activation" || id === "past_due",
        }))}
      />
      {mintaAktivasi && activation === null && (
        <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
      )}
      {mintaAktivasi && activation !== null && activation.length > 0 && (
        <ConsolePanel
          title={`${t("operator.activation.heading")} (${activation.length})`}
          description={t("operator.activation.description")}
        >
          <ActivationRequests
            showTenant
            canAct={canBill}
            markHandled={operatorMarkActivationHandled}
            rows={activation.map((r) => ({
              id: r.id,
              tenantId: r.tenantId,
              tenantName: r.tenantName,
              referredByPartner: r.referredByPartner,
              requestedByName: r.requestedByName,
              tenantStatus: r.tenantStatus,
              note: r.note,
              createdLabel: formatDate(r.createdAt),
              status: r.status,
              handledLabel: r.handledAt ? formatDate(r.handledAt) : null,
            }))}
          />
        </ConsolePanel>
      )}
      {/* Saringan dan tabelnya SATU panel, bukan dua wilayah yang kebetulan
          bertetangga: saringan tanpa hasilnya di bawah tidak berarti apa-apa,
          dan memberinya kartu sendiri menghasilkan dua tepi yang memisahkan
          sebab dari akibatnya. `flush` — `StaticTable` sudah membawa tepi dan
          nada kepalanya sendiri (#266). */}
      <ConsolePanel flush>
      <form
        method="get"
        action="/tenants"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "var(--ant-margin-sm)",
          padding: "var(--ant-padding-lg)",
          paddingBottom: "var(--ant-padding)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 320 }}>
          <Input
            name="q"
            label={t("operator.tenants.searchLabel")}
            placeholder={t("operator.tenants.searchPlaceholder")}
            aria-label={t("operator.tenants.searchPlaceholder")}
            defaultValue={q}
          />
        </div>
        <div style={{ width: "100%", maxWidth: 192 }}>
          <Select
            name="status"
            label={t("operator.tenants.statusLabel")}
            defaultValue={mintaAktivasi ? "activation" : status}
            options={[
              { value: "", label: t("operator.tenants.statusAll") },
              { value: "activation", label: t("operator.tenants.tabActivation") },
              ...TENANT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
            ]}
          />
        </div>
        <Button type="submit" variant="outline">
          {t("operator.tenants.filter")}
        </Button>
      </form>

      <StaticTable
        columns={columns}
        rows={tenants}
        rowKey={(tenant) => tenant.id}
        empty={
          <EmptyState
            icon={<TeamOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
            title={t("operator.tenants.empty")}
          />
        }
      />
      </ConsolePanel>
      </div>
    </div>
  );
}
