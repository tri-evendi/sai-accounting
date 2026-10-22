/**
 * PINDAH SaaS → ON-PREMISE — keadaan tenant yang dipakai PENJAGA.
 * Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md.
 *
 * Dua keadaan, dua kolom berbeda, dan bedanya disengaja:
 *
 *   • DIBEKUKAN (`tenants.frozen_at` bukan NULL) — selama serah-terima. Buku
 *     tetap bisa DIBACA dan DIEKSPOR, tidak bisa DITULIS. Kolom sendiri, bukan
 *     nilai `status`: `status` adalah salinan status langganan yang ditulis
 *     ulang mesin penagihan, dan pembekuan yang dicairkan diam-diam oleh satu
 *     putaran penjadwal di tengah dump berarti tulisan yang hilang.
 *   • `migrated_out` (nilai `tenants.status`) — sesudah customer menyatakan
 *     pemasangan on-premise-nya berjalan. Buku di SaaS dinonaktifkan dan
 *     penggunanya tidak bisa masuk lagi; datanya TETAP ada sampai alur
 *     penghapusan yang sudah ada (#142) dijalankan.
 *
 * Bentuk fungsinya sengaja sama dengan `readOnlyRefusal` / `demoWriteRefusal`
 * di `@sai/billing/subscription-lifecycle`, dan dipanggil di DUA penjaga yang
 * sama (`page-auth.ts`, `auth-guard.ts`): menyembunyikan tombol tanpa menutup
 * route-nya hanya memindahkan pintu. Kalimatnya sendiri karena keadaannya
 * sendiri — "langganan ditangguhkan" pada tenant yang sedang pindah rumah
 * mengirim orang mengejar tagihan yang tidak ada.
 *
 * MURNI: tanpa basis data, tanpa `server-only` — dipakai penjaga, skrip
 * (tsx), dan tes.
 */

/** Nilai `tenants.status` sesudah pindah ke on-premise. */
export const TENANT_STATUS_MIGRATED_OUT = "migrated_out" as const;

/**
 * Berapa lama ekspor MENUNGGU sesudah pembekuan sebelum mengambil dump.
 *
 * Status tenant dibaca penjaga lewat cache per-proses ber-TTL 60 detik
 * (`@sai/platform/tenant-state`). Proses aplikasi yang membaca status sesaat
 * sebelum pembekuan masih mengizinkan tulisan sampai TTL-nya habis; 90 detik
 * = TTL + 30 detik untuk permintaan yang sedang berjalan saat itu. Lebih
 * pendek dari TTL berarti dump bisa mendahului tulisan terakhir.
 */
export const FREEZE_SETTLE_MS = 90_000;

export function isMigratedOut(status: string | null | undefined): boolean {
  return status === TENANT_STATUS_MIGRATED_OUT;
}

/** Aksi yang tetap boleh — cerminan `READ_ACTIONS` gerbang langganan. */
const READ_ACTIONS: ReadonlySet<string> = new Set(["read", "view", "export"]);

function isWrite(permission: string): boolean {
  return !READ_ACTIONS.has(permission.slice(permission.lastIndexOf(".") + 1));
}

export interface TenantMigrationState {
  status: string;
  frozenAt: Date | null;
}

/**
 * Keputusan penjaga untuk izin TULIS: `null` = silakan. Status `null`
 * (perusahaan tanpa tenant, sisa adopsi #134) bukan pembekuan.
 */
export function migrationWriteRefusal(
  state: TenantMigrationState | null | undefined,
  permission: string
): { code: "tenant_frozen"; message: string } | null {
  if (!state) return null;
  if (state.frozenAt == null && !isMigratedOut(state.status)) return null;
  if (!isWrite(permission)) return null;
  return {
    code: "tenant_frozen",
    message:
      "Buku ini sedang dipindahkan ke server perusahaan Anda sendiri, jadi untuk sementara " +
      "HANYA-BACA. Membaca dan mengekspor tetap bisa. Data Anda tidak dihapus.",
  };
}

/**
 * Saringan `companies` untuk PENERBIT pekerjaan tulis berjadwal (dokumen
 * berulang): perusahaan milik tenant yang DIBEKUKAN dilewati. Penjaga HTTP
 * tidak melihat jalur antrean — tanpa saringan ini `svc-ledger` menulis ke
 * buku yang sedang di-dump, dan tulisan itu tidak pernah sampai ke on-premise.
 * Perusahaan tanpa tenant (sisa adopsi #134) tidak pernah beku.
 */
export const NOT_FROZEN_COMPANY_WHERE = {
  OR: [{ tenantId: null }, { tenant: { is: { frozenAt: null } } }],
};

/** Apakah ekspor boleh mengambil dump sekarang — pembekuan sudah cukup lama? */
export function freezeSettledAt(frozenAt: Date): Date {
  return new Date(frozenAt.getTime() + FREEZE_SETTLE_MS);
}
