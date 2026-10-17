/**
 * TABEL JEJAK AUDIT konsol operator — satu bentuk untuk tiga tempat:
 * jejak bidang operator (`/operator/audit`), jejak tenant lintas tenant
 * (`/operator/audit/tenants`), dan jejak satu tenant di halaman rinciannya.
 *
 * Satu komponen, bukan tiga salinan, karena aturan bacanya sama dan aturan
 * itulah yang paling mudah menyimpang:
 *   - jam SAMPAI DETIK (lihat `formatDateTime`);
 *   - rincian sebagai JSON satu baris yang dipotong, bukan kolom per kunci;
 *   - hanya tindakan yang berarti GAGAL atau MERUSAK yang diberi lencana.
 *
 * Server component (tanpa `"use client"`): `StaticTable` dirender server.
 */
import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/app-link";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { CONSOLE_MUTED, CONSOLE_TABULAR } from "@/components/operator/console-ui";

export interface AuditTrailRow {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  ipAddress: string | null;
  details?: Record<string, unknown>;
  /** Hanya jejak tenant: slug + tautan ke rincian tenant bila masih ada. */
  tenantSlug?: string;
  tenantHref?: string | null;
}

export interface AuditTrailLabels {
  time: string;
  actor: string;
  action: string;
  ip: string;
  details: string;
  tenant?: string;
}

/** Tindakan yang diberi lencana: gagal, atau yang tidak bisa dibalik. */
const SOROT_BAHAYA = new Set([
  "operator.login.failed",
  "operator.content.rejected",
  "tenant.deletion.execute",
  "tenant.suspend",
]);

/**
 * Jam SAMPAI DETIK, dan karena itu BUKAN `formatDateTime` bersama.
 *
 * `lib/utils.ts` memformat `timeStyle: "short"` (tanpa detik) — benar untuk
 * tenggat dan tanggal tagihan, salah untuk jejak audit: dua tindakan yang
 * terjadi dalam satu menit akan tampil berjam sama persis, sehingga URUTANNYA
 * hanya bisa dipercaya dari urutan barisnya.
 */
export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(d);
}

/** Rincian → satu baris. Dipotong di sini, bukan lewat CSS: satu JSON panjang
 *  yang melebarkan baris menggeser seluruh kolomnya. */
export function ringkasDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) return "—";
  const teks = JSON.stringify(details);
  return teks.length > 160 ? `${teks.slice(0, 157)}…` : teks;
}

export function AuditTrailTable({
  rows,
  labels,
  empty,
}: {
  rows: AuditTrailRow[];
  labels: AuditTrailLabels;
  empty: React.ReactNode;
}) {
  const columns: SaiColumns<AuditTrailRow> = [
    {
      key: "createdAt",
      title: labels.time,
      align: "left",
      render: (_v, row) => (
        <span style={{ ...CONSOLE_TABULAR, whiteSpace: "nowrap" }}>
          {formatAuditTime(row.createdAt)}
        </span>
      ),
    },
    ...(labels.tenant
      ? ([
          {
            key: "tenant",
            title: labels.tenant,
            align: "left",
            render: (_v, row) =>
              row.tenantHref ? (
                <Link href={row.tenantHref} style={{ color: "var(--ant-color-link)" }}>
                  {row.tenantSlug}
                </Link>
              ) : (
                <span style={CONSOLE_MUTED}>{row.tenantSlug ?? "—"}</span>
              ),
          },
        ] satisfies SaiColumns<AuditTrailRow>)
      : []),
    {
      key: "actor",
      title: labels.actor,
      align: "left",
      render: (_v, row) => <span style={{ fontWeight: 500 }}>{row.actor}</span>,
    },
    {
      key: "action",
      title: labels.action,
      align: "left",
      render: (_v, row) =>
        SOROT_BAHAYA.has(row.action) ? (
          <Badge variant="danger">{row.action}</Badge>
        ) : (
          /* Tanpa lencana untuk tindakan biasa: lencana pada SETIAP baris
             berhenti menandai apa pun. */
          <span style={CONSOLE_TABULAR}>{row.action}</span>
        ),
    },
    {
      key: "ipAddress",
      title: labels.ip,
      align: "left",
      render: (_v, row) => (
        <span style={{ ...CONSOLE_TABULAR, ...CONSOLE_MUTED }}>{row.ipAddress ?? "—"}</span>
      ),
    },
    {
      key: "details",
      title: labels.details,
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            ...CONSOLE_MUTED,
            fontSize: "var(--ant-font-size-sm)",
            wordBreak: "break-all",
          }}
        >
          {ringkasDetails(row.details)}
        </span>
      ),
    },
  ];

  return <StaticTable columns={columns} rows={rows} rowKey={(row) => row.id} empty={empty} />;
}
