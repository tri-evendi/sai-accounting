/**
 * Daftar TENANT — konsol operator (issue #154).
 *
 * Sebelum halaman ini, TIDAK ADA satu pun UI yang membaca daftar tenant:
 * setiap pertanyaan dukungan pelanggan berarti sesi SSH. Datanya murni dari
 * basis data KENDALI (`listTenantsForOperator`), jadi halaman ini tetap hidup
 * saat `sai_platform` mati — rincian penagihan menyusul di halaman detail.
 *
 * Pencarian & saringan status lewat form GET biasa: hasilnya URL yang bisa
 * disalin ke tiket dukungan, tanpa satu pun byte JS tambahan.
 *
 * ── Perender tabel & warna setelah AntD (issue #200) ──────────────────────
 * `StaticTable`, bukan `DataTable`, dan alasannya aturan #189: daftar ini sudah
 * disaring & dicari DI SERVER lewat form GET di atasnya, jadi rc-table hanya
 * akan menyalin ulang seluruh baris ke peramban (±80 KB gzip) untuk sortir yang
 * URL-nya justru lebih berguna dipakai.
 *
 * Warnanya token `:root` aplikasi, bukan `--ant-…`: konsol ini tidak punya satu
 * pun komponen AntD di atas isinya (kerangkanya sendiri sengaja tanpa impor
 * apa pun dari sisi pelanggan), jadi variabel AntD tidak akan teratasi di sini
 * (#227). Yang mewarnai dirinya sendiri — `Badge`, `Button`, `EmptyState` —
 * tetap memakai token AntD karena masing-masing dirender sebagai daun client.
 */

import Link from "next/link";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { requireOperatorPage } from "@/lib/operator/guard";
import { listTenantsForOperator } from "@/lib/operator/store";
import { TENANT_STATUSES } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

const READ_ONLY_STATUSES = new Set(["suspended", "cancelled"]);

/** Teks sekunder di dalam sel — token `:root`, lihat catatan kepala berkas. */
const MUTED: React.CSSProperties = { color: "var(--muted-foreground)" };
const MUTED_TABULAR: React.CSSProperties = {
  ...MUTED,
  fontVariantNumeric: "tabular-nums",
};

type TenantRow = Awaited<ReturnType<typeof listTenantsForOperator>>[number];

export default async function OperatorTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const status = (TENANT_STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : "";

  const tenants = await listTenantsForOperator({ q, status });
  const statusLabel = (value: string) => t(`tenantSettings.status.${value}` as DictionaryKey);

  const columns: SaiColumns<TenantRow> = [
    {
      key: "name",
      title: t("operator.tenants.colName"),
      align: "left",
      render: (_v, tenant) => (
        <Link
          href={`/operator/tenants/${tenant.id}`}
          style={{ color: "var(--primary)", fontWeight: 500 }}
        >
          {tenant.name}
        </Link>
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
      ),
    },
    {
      key: "plan",
      title: t("operator.tenants.colPlan"),
      align: "left",
      render: (_v, tenant) => tenant.planKey,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--foreground)",
          }}
        >
          {t("operator.tenants.heading")} ({tenants.length})
        </h1>
        <p style={{ margin: 0, fontSize: 14, ...MUTED }}>
          {t("operator.tenants.description")}
        </p>
      </div>

      <form
        method="get"
        action="/operator"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}
      >
        <div style={{ width: "100%", maxWidth: 320 }}>
          <Input
            name="q"
            label={t("operator.tenants.searchLabel")}
            placeholder={t("operator.tenants.searchPlaceholder")}
            defaultValue={q}
          />
        </div>
        <div style={{ width: "100%", maxWidth: 192 }}>
          <Select
            name="status"
            label={t("operator.tenants.statusLabel")}
            defaultValue={status}
            options={[
              { value: "", label: t("operator.tenants.statusAll") },
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
            icon={<Users size={48} aria-hidden="true" />}
            title={t("operator.tenants.empty")}
          />
        }
      />
    </div>
  );
}
