/**
 * EKSPOR DATA MANDIRI SEBAGAI PEKERJAAN (#142 → jalur `bulk`, 23 Okt 2026).
 *
 * Satu-satunya tempat `tenant.data_export` diterbitkan, dan satu-satunya
 * tempat keadaan pekerjaannya diterjemahkan untuk layar.
 *
 * ══ SAKELARNYA DI KONTRAK, BUKAN DI SINI ═══════════════════════════════════
 * `runner:` kind ini di `contract/kinds.yaml` memutuskan siapa yang membuat
 * arsipnya (`KIND_RUNNERS`, dibaca KEDUA bahasa dari commit yang sama):
 *
 *   • `node` — `GET /api/tenant/export` men-stream ZIP sinkron dari
 *     `src/lib/tenant-export.ts` seperti sejak #142; tidak ada baris `jobs`.
 *   • `go`   — `POST /api/tenant/export` menerbitkan pekerjaan, jalur `bulk`
 *     `svc-integrator` (`internal/tenantexport`) menulis ZIP-nya ke volume
 *     `hasil`, dan layar menunggu lalu mengunduh lewat
 *     `/api/tenant/export/jobs/<id>/result`. `GET` sinkron dijawab 409.
 *
 * Tepat satu pelaksana pada satu waktu — dua pintu yang sama-sama terbuka
 * adalah dua implementasi yang hidup tanpa pembanding.
 *
 * ══ JEJAK AUDIT DITULIS DI SINI, BUKAN OLEH GO ═════════════════════════════
 * `tenant_audit_logs` hidup di basis data kendali, dan pohon Go hanya menulis
 * `jobs` dan `backup_runs` (`tests/services-go.test.ts`). Penerbit — rute
 * Node — yang mencatat "siapa meminta ekspor, kapan"; rute hasil mencatat
 * "siapa mengunduhnya". Jumlah tabel & baris tidak diketahui saat menerbitkan;
 * angka itu ada di log pelari Go.
 */
import "server-only";

import { KIND_RUNNERS, type JobStatus } from "@sai/core/generated/job-kinds";
import { latestTenantJob, publishJob } from "@sai/platform/job-queue";

export const TENANT_EXPORT_KIND = "tenant.data_export" as const;

/** Pelaksana ekspor hari ini — `node` (sinkron, TS) atau `go` (pekerjaan). */
export function tenantExportRunner(): "node" | "go" {
  return KIND_RUNNERS[TENANT_EXPORT_KIND];
}

/**
 * Keadaan yang dilihat layar. SENGAJA lebih sempit daripada status antrean:
 * `failed` di antrean berarti "menunggu percobaan berikutnya" — bagi pengguna
 * itu masih berjalan, bukan gagal.
 */
export type TenantExportState = "queued" | "running" | "ready" | "failed";

export interface TenantExportJobView {
  id: number;
  state: TenantExportState;
  /** 0–100, hanya untuk ditampilkan. */
  progress: number;
  createdAt: string;
  finishedAt: string | null;
}

/** Terjemahkan baris antrean → keadaan layar. MURNI. */
export function tenantExportState(status: JobStatus, hasResult: boolean): TenantExportState {
  switch (status) {
    case "queued":
      return "queued";
    case "claimed":
    case "failed":
      return "running";
    case "done":
      /* `done` tanpa `result_ref` tidak pernah ditulis pelari Go — tapi bila
         terjadi, tidak ada yang bisa diunduh, dan "siap" akan berbohong. */
      return hasResult ? "ready" : "failed";
    case "dead":
      return "failed";
  }
}

/** Pekerjaan ekspor terbaru tenant ini, dalam bentuk layar — atau `null`. */
export async function latestTenantExport(tenantId: number): Promise<TenantExportJobView | null> {
  const row = await latestTenantJob(tenantId, TENANT_EXPORT_KIND);
  if (!row) return null;
  return {
    id: row.id,
    state: tenantExportState(row.status, row.hasResult),
    progress: Math.max(0, Math.min(100, row.progress)),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/**
 * Terbitkan satu ekspor — atau pakai ulang yang masih berjalan.
 *
 * Bukan `dedupeKey`: kunci unik itu berlaku untuk baris yang SUDAH selesai
 * juga, jadi ekspor kedua hari berikutnya akan ditolak. Yang dicegah di sini
 * hanya dua ekspor BERSAMAAN atas satu tenant — tombol yang diklik dua kali
 * tidak boleh menggandakan ZIP bergiga di jalur yang berpagar memori.
 */
export async function requestTenantExport(
  tenantId: number
): Promise<{ jobId: number; reused: boolean } | null> {
  const latest = await latestTenantJob(tenantId, TENANT_EXPORT_KIND);
  if (
    latest &&
    (latest.status === "queued" || latest.status === "claimed" || latest.status === "failed")
  ) {
    return { jobId: latest.id, reused: true };
  }
  const row = await publishJob({
    kind: "tenant.data_export",
    tenantId,
    companyId: null,
    /* Kosong dengan sengaja: tenant-nya `tenant_id`, dan PT-nya dibaca pelari
       dari registry saat berjalan — PT yang dibuat di antaranya ikut. */
    payload: {},
  });
  return row ? { jobId: row.id, reused: false } : null;
}
