/**
 * Jejak audit TINGKAT TENANT (issue #142) — rumah bagi peristiwa yang selama
 * ini tidak punya tempat.
 *
 * `writeAuditLog` (lib/audit.ts) menulis ke `data/audit/<slug-PT>/audit.jsonl`
 * — jejak milik SEBUAH PERUSAHAAN, dan memang harus begitu: "siapa mengubah
 * faktur siapa" tidak boleh menyeberang antar-PT. Tetapi pendaftaran, ganti
 * paket, suspensi, undangan, permintaan penghapusan — peristiwa itu milik
 * TENANT, bukan milik salah satu bukunya; menuliskannya ke buku "yang sedang
 * dibuka" (siasat lama api/companies) salah alamat dan, untuk pelanggan baru
 * tanpa PT, mustahil.
 *
 * Rumahnya karena itu terpisah: `data/audit/tenants/<slug-tenant>/audit.jsonl`.
 * Pemisahan per-tenant mengikuti alasan pemisahan per-PT (#104): pembaca yang
 * lupa menyaring tidak punya apa-apa untuk bocor.
 *
 * SENGAJA TANPA `server-only` (pola `mailer-core.ts`): penulis terbesarnya
 * justru skrip — penjadwal langganan menulis transisi status dari luar Next.
 * Modul ini fs murni, tanpa Prisma/next; slug & id tenant diberikan pemanggil
 * secara eksplisit — tidak ada konteks tersirat yang bisa salah tebak.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Peristiwa tenant yang dicatat. Union eksplisit (pola `AuditAction`):
 * peristiwa baru harus ditambahkan di sini dulu — jejak yang kacau kosakatanya
 * tidak bisa dibaca ulang.
 */
export type TenantAuditAction =
  /** Tenant lahir dari verifikasi email (#138) — beserta versi S&K yang disetujui. */
  | "tenant.register"
  /** Perusahaan (buku) baru disediakan untuk tenant ini. */
  | "tenant.company.create"
  /** Undangan anggota: terbit / diterima / dicabut (#139). */
  | "tenant.invitation.create"
  | "tenant.invitation.accept"
  | "tenant.invitation.revoke"
  /** Ganti paket (skrip operator #140). */
  | "tenant.plan.change"
  /** Langganan yatim diadopsikan penjadwal / adopt-tenant (#152) — tenant
   *  berbayar yang belum punya baris `subscriptions` dilahirkan langganannya. */
  | "tenant.subscription.adopt"
  /** Transisi status langganan (penjadwal #140): trialing→past_due, dst. */
  | "tenant.status.change"
  /** Ekspor data mandiri (#142) — hak akses UU PDP; siapa & kapan tercatat. */
  | "tenant.export"
  /** Siklus permintaan penghapusan (#142). */
  | "tenant.deletion.request"
  | "tenant.deletion.cancel"
  | "tenant.deletion.execute";

export interface TenantAuditEntry {
  id: string;
  tenantId: number;
  tenantSlug: string;
  /** Aktor — id global + nama; skrip/penjadwal memakai "system". */
  userId: string;
  username: string;
  /** Peran TENANT aktor (owner/admin/member) bila relevan. */
  tenantRole?: string;
  action: TenantAuditAction;
  details?: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

/** Bisa dialihkan lewat env — tes menulis ke direktori sementaranya sendiri
 *  (pola MAIL_OUTBOX_DIR). Dievaluasi per panggilan, bukan saat impor. */
function tenantAuditRoot(): string {
  return process.env.TENANT_AUDIT_DIR ?? path.join(process.cwd(), "data", "audit", "tenants");
}

function fileFor(tenantSlug: string): { dir: string; file: string } {
  // Slug tervalidasi saat tenant lahir (huruf kecil/angka/hubung) — tetapi
  // jejak audit tidak boleh bergantung pada itu untuk keamanan jalur berkas.
  const safe = tenantSlug.replace(/[^a-z0-9-]/g, "_");
  const dir = path.join(tenantAuditRoot(), safe);
  return { dir, file: path.join(dir, "audit.jsonl") };
}

/**
 * Tulis satu peristiwa tenant. Gagal menulis TIDAK menggagalkan operasinya
 * (pola `writeAuditLog`): jejak adalah catatan tentang yang terjadi, bukan
 * gerbang yang menghalanginya — tapi kegagalannya tercatat di log server.
 */
export async function writeTenantAuditLog(params: {
  tenantId: number;
  tenantSlug: string;
  userId?: string | number;
  username?: string;
  tenantRole?: string;
  action: TenantAuditAction;
  details?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  const { dir, file } = fileFor(params.tenantSlug);
  const forwarded = params.request?.headers.get("x-forwarded-for");
  const entry: TenantAuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tenantId: params.tenantId,
    tenantSlug: params.tenantSlug,
    userId: params.userId === undefined ? "system" : String(params.userId),
    username: (params.username ?? "system").slice(0, 100),
    tenantRole: params.tenantRole,
    action: params.action,
    details: params.details,
    ipAddress: forwarded
      ? (forwarded.split(",")[0]?.trim() ?? null)
      : (params.request?.headers.get("x-real-ip") ?? null),
    createdAt: new Date().toISOString(),
  };

  try {
    await mkdir(dir, { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[tenant-audit] gagal menulis jejak:", error);
  }
}

/** Baca jejak sebuah tenant, terbaru dulu. Berkas belum ada = daftar kosong. */
export async function readTenantAuditLogs(
  tenantSlug: string,
  options: { limit?: number } = {}
): Promise<TenantAuditEntry[]> {
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  let raw: string;
  try {
    raw = await readFile(fileFor(tenantSlug).file, "utf8");
  } catch {
    return [];
  }

  const entries: TenantAuditEntry[] = [];
  for (const line of raw.trim().split("\n").reverse()) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as TenantAuditEntry);
    } catch {
      // baris korup dilewati — jejak lain tetap terbaca
    }
    if (entries.length >= limit) break;
  }
  return entries;
}
