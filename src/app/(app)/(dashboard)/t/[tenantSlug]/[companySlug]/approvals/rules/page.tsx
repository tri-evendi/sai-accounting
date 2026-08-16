/**
 * Aturan Persetujuan — jenis dokumen + ambang nilai + peran penyetuju (#25).
 * bos-only, seperti permukaan kebijakan lain (Tutup Periode, Anggaran, Setup).
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { listApprovalRules } from "@/lib/approval-queue";
import { getActiveRoles } from "@/lib/roles";
import { ApprovalRules } from "./approval-rules-client";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Panjang baris kalimat penjelas — bekas `max-w-3xl`; lihat `../page.tsx`. */
const DESCRIPTION_MAX_WIDTH = 768;

export default async function ApprovalRulesPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("approval_rule.manage", params);
  const t = await getT();
  const [rules, roles] = await Promise.all([
    listApprovalRules({ includeInactive: true }),
    getActiveRoles(),
  ]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.approvals"), href: "/approvals" },
          { label: t("nav.items.approvalRules") },
        ]}
        title={t("nav.items.approvalRules")}
        description={
          <span style={{ display: "block", maxWidth: DESCRIPTION_MAX_WIDTH }}>
            {t("approvals.rulesDescA")} <strong>{t("approvals.rulesDescStrong1")}</strong>{" "}
            {t("approvals.rulesDescB")} <strong>{t("approvals.rulesDescStrong2")}</strong>{" "}
            {t("approvals.rulesDescC")}
          </span>
        }
      />

      <ApprovalRules rules={rules} roles={roles.map((r) => ({ key: r.key, label: r.label }))} />
    </div>
  );
}
