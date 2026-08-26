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
 * ══ RUMAHNYA: TABEL DI BASIS DATA KENDALI (issue #484) ═════════════════════
 * Sampai #484 ia `appendFile` ke `data/audit/tenants/<slug>/audit.jsonl` —
 * dibaca UTUH setiap kali, tidak ter-paginasi, tidak ikut cadangan, dan tidak
 * ikut ke mana pun. Masalah yang sama persis dengan #370, yang memindahkan
 * jejak per-PT ke tabel dan mengecualikan jejak ini secara eksplisit.
 *
 * ══ TANPA FOREIGN KEY, DAN ITU INTI ISUNYA ═════════════════════════════════
 * Jejak inilah yang mencatat PENGHAPUSAN sebuah tenant. Menaruhnya di tempat
 * yang ikut mati bersama yang dicatatnya membuat catatan itu tidak ada
 * artinya. Karena itu `tenant_audit_logs.tenant_id` hanyalah angka dan
 * `tenant_slug` DISALIN — sesudah tenant-nya tiada, slug itu satu-satunya yang
 * membuat barisnya masih bisa dibaca manusia.
 *
 * Perhatikan bahwa ini KEBALIKAN dari #370, di mana "mati bersama bukunya"
 * justru salah satu kriteria selesainya. Jejak PT adalah bagian dari buku PT
 * itu; jejak tenant adalah catatan TENTANG tenant, termasuk tentang akhirnya.
 *
 * SENGAJA TANPA `server-only` (pola `mailer-core.ts`): penulis terbesarnya
 * justru skrip — penjadwal langganan menulis transisi status dari luar Next.
 * Slug & id tenant diberikan pemanggil secara eksplisit; tidak ada konteks
 * tersirat yang bisa salah tebak.
 */

import { controlDb } from "@/lib/control-db";
import { clientIpFrom } from "@/lib/client-ip";

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
  /** Ganti NAMA TAMPILAN akun (#458). Slug-nya TIDAK ikut berubah — alamat
   *  yang sudah dibagikan tetap sampai; ganti slug adalah pekerjaan tersendiri
   *  dengan pengalihan & pemesanan slug lama (lingkup 3 issue itu). */
  | "tenant.profile.rename"
  /** Ganti ALAMAT akun (#458 lingkup 3). Slug lama dipesan selamanya dan
   *  alamat lamanya dipantulkan permanen — tetapi ia tetap peristiwa yang
   *  paling perlu bisa ditelusuri: setiap tautan yang pernah dibagikan berdiri
   *  di atas slug itu. */
  | "tenant.slug.change"
  /** Ganti paket (skrip operator #140; konsol operator #155). */
  | "tenant.plan.change"
  /** Pembayaran transfer manual dicatat operator (#155) — jalur
   *  PAYMENT_GATEWAY=manual; aktornya operator, alasannya wajib. */
  | "tenant.payment.manual"
  /** Perpanjangan KOMPENSASI oleh operator — periode berbayar diberikan tanpa
   *  melewati gerbang pembayaran, beserta tagihan Rp 0 bertanda `-K`. Aksi
   *  UANG: aktornya operator dan alasannya wajib, sama seperti tetangganya. */
  | "tenant.extend"
  /** Suspensi/pemulihan MANUAL oleh operator (#155) — di luar siklus dunning. */
  | "tenant.suspend"
  | "tenant.restore"
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
  try {
    await controlDb.tenantAuditLog.create({
      data: {
        tenantId: params.tenantId,
        tenantSlug: params.tenantSlug,
        userId: params.userId === undefined ? "system" : String(params.userId),
        username: (params.username ?? "system").slice(0, 100),
        tenantRole: params.tenantRole ?? null,
        action: params.action,
        /* Rincian sebagai TEKS: skema kendali belum punya satu pun kolom
           `Json`, dan di MariaDB `JSON` toh alias `LONGTEXT`. */
        details: params.details === undefined ? null : JSON.stringify(params.details),
        /* Entri ke-N dari KANAN (issue #372). Jejak yang mencatat alamat
           pilihan penyerang menyesatkan penyelidikan yang membacanya — dan
           jejak tenant adalah tempat pendaftaran, penghapusan akun, dan
           tindakan operator tercatat. */
        ipAddress: params.request ? clientIpFrom(params.request.headers) : null,
      },
    });
  } catch (error) {
    console.error("[tenant-audit] gagal menulis jejak:", error);
  }
}

/**
 * Baca jejak sebuah tenant, terbaru dulu — DIPAGINASI DI SQL (issue #484).
 *
 * Bentuk lamanya membaca SELURUH berkas ke memori lalu memotongnya di
 * JavaScript; jejak tenant yang aktif bertahun-tahun akan membuat pembacaan
 * pertama menjadi pembacaan terakhir. Sekarang `skip`/`take` dikerjakan basis
 * data, dan `total` dipulangkan supaya pemanggilnya bisa menampilkan paginasi
 * tanpa menebak.
 *
 * `tenantSlug`, bukan `tenantId`: jejak sebuah tenant yang SUDAH DIHAPUS tetap
 * harus terbaca, dan sesudah barisnya tiada slug itulah satu-satunya pegangan
 * yang tersisa. Index `[tenantSlug, createdAt]` memang dibuat untuk bentuk ini.
 */
export async function readTenantAuditLogs(
  tenantSlug: string,
  options: { limit?: number; skip?: number } = {}
): Promise<TenantAuditEntry[]> {
  return (await readTenantAuditPage(tenantSlug, options)).entries;
}

/** Sehalaman jejak + totalnya. */
export async function readTenantAuditPage(
  tenantSlug: string,
  options: { limit?: number; skip?: number } = {}
): Promise<{ entries: TenantAuditEntry[]; total: number }> {
  const take = Math.min(500, Math.max(1, options.limit ?? 100));
  const skip = Math.max(0, options.skip ?? 0);

  const where = { tenantSlug };
  const [rows, total] = await Promise.all([
    controlDb.tenantAuditLog.findMany({
      where,
      /* `id` sebagai pemutus seri: beberapa peristiwa bisa berbagi milidetik
         `createdAt` yang sama, dan tanpa urutan total sebuah baris bisa
         berpindah halaman antar-permintaan. */
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    controlDb.tenantAuditLog.count({ where }),
  ]);

  return { entries: rows.map(toEntry), total };
}

/** Baris tabel menjadi bentuk yang sudah dikenal pemanggil. */
function toEntry(row: {
  id: number;
  tenantId: number;
  tenantSlug: string;
  userId: string;
  username: string;
  tenantRole: string | null;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
}): TenantAuditEntry {
  return {
    id: String(row.id),
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    userId: row.userId,
    username: row.username,
    tenantRole: row.tenantRole ?? undefined,
    action: row.action as TenantAuditAction,
    /* Rincian yang tidak bisa diurai TIDAK menggagalkan pembacaan: satu baris
       rusak tidak boleh menyembunyikan seluruh jejak di sekitarnya — aturan
       yang sama dengan pembaca JSONL yang digantikannya. */
    details: parseDetails(row.details),
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseDetails(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
