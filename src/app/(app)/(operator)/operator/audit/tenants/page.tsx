/**
 * `/operator/audit/tenants` — JEJAK TENANT LINTAS TENANT.
 *
 * ══ KENAPA HALAMAN INI ADA ════════════════════════════════════════════════
 * `tenant_audit_logs` sudah DITULIS sejak #142 (dan pindah ke tabel di #484):
 * suspensi, ganti paket, pelunasan manual, mode penagihan, eksekusi hapus —
 * semuanya dengan aktor dan alasan wajib. Pembacanya (`readTenantAuditPage`)
 * hanya dipanggil TES. Jejak yang ditulis dengan teliti lalu tidak terbaca
 * siapa pun tanpa `psql` adalah setengah jejak: alasan yang diwajibkan konsol
 * tidak pernah kembali ke orang yang perlu membacanya.
 *
 * Saringan lewat form GET biasa (pola `/operator/tenants`): hasilnya alamat
 * yang bisa dibagikan, dan halaman rincian tenant menautkan ke sini dengan
 * `?tenant=<slug>` terisi.
 */

import { HistoryOutlined } from "@ant-design/icons";

import { Button, ButtonLink } from "@sai/ui/button";
import { EmptyState } from "@sai/ui/empty-state";
import { Input } from "@sai/ui/input";
import { PageHeader } from "@sai/ui/page-header";
import { Pagination } from "@sai/ui/pagination";
import { Select } from "@sai/ui/select";
import { ConsolePanel } from "@/components/operator/console-ui";
import { AuditTrailTable } from "@/components/operator/audit-trail-table";
import { requireOperatorPage } from "@/lib/operator/guard";
import { tenantIdForAnySlug, tenantIdsBySlug } from "@/lib/operator/store";
import { readTenantAuditFeed } from "@sai/platform/tenant-audit";
import { TENANT_AUDIT_GROUPS } from "@/lib/operator/audit-groups";
import { getT } from "@sai/platform/i18n/server";

export const dynamic = "force-dynamic";

const PER_HALAMAN = 100;

export default async function OperatorTenantAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; group?: string; page?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const tenant = params.tenant?.trim().toLowerCase().slice(0, 63) ?? "";
  /* Hanya kelompok dari daftar tetap yang diteruskan ke kueri — nilai lain
     dari URL dibuang, bukan dipakai sebagai awalan bebas. */
  const group = TENANT_AUDIT_GROUPS.includes(params.group as (typeof TENANT_AUDIT_GROUPS)[number])
    ? (params.group as string)
    : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  /* Slug apa pun yang pernah dipakai tenant itu → id-nya, supaya riwayat
     sebelum slug berganti ikut terbaca. Tidak dikenal → saring per slug yang
     disalin di jejak (tenant yang sudah dihapus). */
  const tenantId = tenant ? await tenantIdForAnySlug(tenant) : null;
  const { entries, total } = await readTenantAuditFeed(
    {
      ...(tenantId !== null ? { tenantId } : { tenantSlug: tenant || undefined }),
      actionPrefix: group || undefined,
    },
    { limit: PER_HALAMAN, skip: (page - 1) * PER_HALAMAN }
  );
  const ids = await tenantIdsBySlug(entries.map((e) => e.tenantSlug));

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("operator.nav.audit"), href: "/operator/audit" },
          { label: t("operator.tenantAudit.heading") },
        ]}
        title={`${t("operator.tenantAudit.heading")} (${total})`}
        description={t("operator.tenantAudit.description")}
        actions={
          <ButtonLink href="/operator/audit" variant="outline" size="sm">
            {t("operator.tenantAudit.operatorTrailLink")}
          </ButtonLink>
        }
      />

      <ConsolePanel flush>
        <form
          method="get"
          action="/operator/audit/tenants"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "var(--ant-margin-sm)",
            padding: "var(--ant-padding-lg)",
            paddingBottom: "var(--ant-padding)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 240 }}>
            <Input
              name="tenant"
              label={t("operator.tenantAudit.tenantLabel")}
              placeholder={t("operator.tenantAudit.tenantPlaceholder")}
              aria-label={t("operator.tenantAudit.tenantLabel")}
              defaultValue={tenant}
            />
          </div>
          <div style={{ width: "100%", maxWidth: 240 }}>
            <Select
              name="group"
              label={t("operator.tenantAudit.groupLabel")}
              defaultValue={group}
              options={[
                { value: "", label: t("operator.tenantAudit.groupAll") },
                ...TENANT_AUDIT_GROUPS.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <Button type="submit" variant="outline">
            {t("operator.tenants.filter")}
          </Button>
        </form>

        <AuditTrailTable
          rows={entries.map((e) => ({
            id: e.id,
            createdAt: e.createdAt,
            actor: e.username,
            action: e.action,
            ipAddress: e.ipAddress,
            details: e.details,
            tenantSlug: e.tenantSlug,
            tenantHref: ids.has(e.tenantSlug) ? `/operator/tenants/${ids.get(e.tenantSlug)}` : null,
          }))}
          labels={{
            time: t("operator.audit.colTime"),
            tenant: t("operator.tenantAudit.colTenant"),
            actor: t("operator.tenantAudit.colActor"),
            action: t("operator.audit.colAction"),
            ip: t("operator.audit.colIp"),
            details: t("operator.audit.colDetails"),
          }}
          empty={
            <EmptyState
              icon={<HistoryOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
              title={t("operator.tenantAudit.empty")}
            />
          }
        />
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / PER_HALAMAN)}
          basePath="/operator/audit/tenants"
          searchParams={{ tenant: tenant || undefined, group: group || undefined }}
        />
      </ConsolePanel>
    </div>
  );
}
