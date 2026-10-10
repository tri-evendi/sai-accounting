/**
 * Daftar TENANT — konsol operator (issue #154).
 *
 * ⚠ ALAMATNYA `/operator/tenants`, bukan `/operator`. Sampai konsol punya
 * halaman ringkasan, daftar ini ADALAH pendaratannya — dan itu yang membuat
 * jawaban atas "bagaimana keadaan platform hari ini?" menjadi sebuah tabel
 * tujuh kolom yang harus dibaca baris demi baris. Pendaratan sekarang milik
 * `../page.tsx`; daftar ini butir menunya sendiri, dan formulir saringannya
 * ikut pindah (`action="/operator/tenants"`) supaya URL hasil saringan tetap
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  ConsolePanel,
  CONSOLE_PAGE,
} from "@/components/operator/console-ui";
import { PageHeader } from "@/components/ui/page-header";
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

/** Teks sekunder di dalam sel — token AntD, lihat catatan kepala berkas. */
const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

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
          style={{ color: "var(--ant-color-link)", fontWeight: 500 }}
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
      />

      <div style={CONSOLE_PAGE}>
      {/* Saringan dan tabelnya SATU panel, bukan dua wilayah yang kebetulan
          bertetangga: saringan tanpa hasilnya di bawah tidak berarti apa-apa,
          dan memberinya kartu sendiri menghasilkan dua tepi yang memisahkan
          sebab dari akibatnya. `flush` — `StaticTable` sudah membawa tepi dan
          nada kepalanya sendiri (#266). */}
      <ConsolePanel flush>
      <form
        method="get"
        action="/operator/tenants"
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
