/**
 * `/operator/audit` — JEJAK BIDANG OPERATOR, akhirnya terbaca.
 *
 * ══ KENAPA HALAMAN INI BARU ADA SEKARANG ═══════════════════════════════════
 * `lib/operator/audit.ts` sudah menulis jejak sejak #154, dan kepala berkasnya
 * menutup dengan "untuk halaman/audit kelak". Pembaca `readOperatorAuditLogs`
 * karena itu nol: jejaknya ada, lengkap, dan tidak bisa dilihat siapa pun
 * tanpa SSH ke `data/audit/operators/audit.jsonl` — yaitu persis keadaan yang
 * keluhan inti #154 ("tindakan operator tidak meninggalkan jejak") dimaksudkan
 * untuk diakhiri. Jejak yang hanya bisa dibaca lewat SSH menyelesaikan
 * setengah masalahnya.
 *
 * ══ YANG DIPAJANG, DAN YANG TIDAK ══════════════════════════════════════════
 * Rincian (`details`) dipajang sebagai JSON satu baris yang dipotong, bukan
 * diurai menjadi kolom: bentuknya berbeda per jenis tindakan (pengaturan surel
 * membawa host/port, perubahan konten membawa kunci & bahasa), dan kolom yang
 * hanya terisi untuk sebagian baris lebih sulit dibaca daripada satu kolom yang
 * selalu berisi. Yang TIDAK pernah ada di dalamnya adalah rahasia — penulisnya
 * yang menjamin itu (`writeOperatorAuditLog` dipanggil dengan penanda
 * "kata sandi berganti", bukan kata sandinya).
 *
 * Jejak TENANT (tindakan terhadap pelanggan — penangguhan, pindah paket,
 * pembayaran manual) TIDAK di sini: ia milik tenantnya dan tinggal di
 * `tenant_audit_logs` basis data kendali, terbaca di `/operator/audit/tenants`
 * (lintas tenant) dan di halaman rincian tiap tenant. Halaman ini merekam sisi
 * OPERATORnya: masuk, keluar, dan perubahan setelan platform.
 *
 * Sejak migration platform 0002 sumbernya tabel `operator_audit_logs`,
 * dipaginasi di SQL — bukan lagi 200 baris terakhir dari sebuah berkas.
 */

import { HistoryOutlined } from "@ant-design/icons";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ConsolePanel } from "@/components/operator/console-ui";
import { AuditTrailTable } from "@/components/operator/audit-trail-table";
import { readOperatorAuditPage } from "@/lib/operator/audit";
import { requireOperatorPage } from "@/lib/operator/guard";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PER_HALAMAN = 100;

export default async function OperatorAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { entries, total } = await readOperatorAuditPage({
    limit: PER_HALAMAN,
    skip: (page - 1) * PER_HALAMAN,
  });

  return (
    <div>
      <PageHeader
        title={`${t("operator.audit.heading")} (${total})`}
        description={t("operator.audit.description")}
        actions={
          <ButtonLink href="/operator/audit/tenants" variant="outline" size="sm">
            {t("operator.audit.tenantTrailLink")}
          </ButtonLink>
        }
      />

      <ConsolePanel flush>
        <AuditTrailTable
          rows={entries.map((e) => ({
            id: e.id,
            createdAt: e.createdAt,
            actor: e.operator,
            action: e.action,
            ipAddress: e.ipAddress,
            details: e.details,
          }))}
          labels={{
            time: t("operator.audit.colTime"),
            actor: t("operator.audit.colOperator"),
            action: t("operator.audit.colAction"),
            ip: t("operator.audit.colIp"),
            details: t("operator.audit.colDetails"),
          }}
          empty={
            <EmptyState
              icon={<HistoryOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
              title={t("operator.audit.empty")}
              description={t("operator.audit.emptyHint")}
            />
          }
        />
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / PER_HALAMAN)}
          basePath="/operator/audit"
        />
      </ConsolePanel>
    </div>
  );
}
