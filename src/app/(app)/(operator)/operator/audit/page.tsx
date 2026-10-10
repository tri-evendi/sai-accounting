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
 * `tenant_audit_logs` basis data kendali, terbaca di halaman tenant masing
 * masing. Berkas ini merekam sisi OPERATORnya: masuk, keluar, dan perubahan
 * setelan platform.
 */

import { HistoryOutlined } from "@ant-design/icons";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { readOperatorAuditLogs, type OperatorAuditEntry } from "@/lib/operator/audit";
import { requireOperatorPage } from "@/lib/operator/guard";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Sebanyak yang masih bisa dibaca mata dalam satu halaman tanpa paginasi. */
const BATAS = 200;

/** Tindakan yang berarti SESUATU GAGAL — satu-satunya yang diberi warna. */
const GAGAL = new Set(["operator.login.failed"]);

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(d);
}

/** Rincian → satu baris. Panjangnya dipotong di sini, bukan lewat CSS: baris
 *  tabel yang melebar karena satu JSON panjang menggeser seluruh kolomnya. */
function ringkasDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) return "—";
  const teks = JSON.stringify(details);
  return teks.length > 160 ? `${teks.slice(0, 157)}…` : teks;
}

export default async function OperatorAuditPage() {
  await requireOperatorPage();
  const t = await getT();
  const entries = await readOperatorAuditLogs({ limit: BATAS });

  const columns: SaiColumns<OperatorAuditEntry> = [
    {
      key: "createdAt",
      title: t("operator.audit.colTime"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: "operator",
      title: t("operator.audit.colOperator"),
      align: "left",
      render: (_v, row) => <span style={{ fontWeight: 500 }}>{row.operator}</span>,
    },
    {
      key: "action",
      title: t("operator.audit.colAction"),
      align: "left",
      render: (_v, row) =>
        GAGAL.has(row.action) ? (
          <Badge variant="danger">{row.action}</Badge>
        ) : (
          /* Tanpa `Badge` untuk tindakan biasa: lencana pada SETIAP baris
             berhenti menandai apa pun. Yang ditandai hanya yang gagal. */
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.action}</span>
        ),
    },
    {
      key: "ipAddress",
      title: t("operator.audit.colIp"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {row.ipAddress ?? "—"}
        </span>
      ),
    },
    {
      key: "details",
      title: t("operator.audit.colDetails"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontSize: "var(--ant-font-size-sm)",
            color: "var(--ant-color-text-secondary)",
            wordBreak: "break-all",
          }}
        >
          {ringkasDetails(row.details)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${t("operator.audit.heading")} (${entries.length})`}
        description={t("operator.audit.description")}
      />

      <StaticTable
        columns={columns}
        rows={entries}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={<HistoryOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
            title={t("operator.audit.empty")}
            description={t("operator.audit.emptyHint")}
          />
        }
      />
    </div>
  );
}
