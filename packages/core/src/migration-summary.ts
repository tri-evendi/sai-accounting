/**
 * Ringkasan riwayat migration SATU basis data — HANYA MEMBACA.
 *
 * Satu pembacaan untuk tiga pemakai: gerbang skema per perusahaan
 * (`src/lib/company-schema-gate.ts`), fan-out migration buku
 * (`scripts/migrate-all-companies.ts`, yang melewati buku yang sudah di
 * kepala), dan siapa pun yang kelak bertanya "buku ini di versi berapa".
 * Tiga salinan SQL yang sama akan menyimpang pada definisi "menggantung" —
 * dan definisi itulah yang memutuskan apakah buku ditutup.
 *
 * ⚠ Prisma tetap PEMILIK pembukuan skema (02 §12): berkas ini tidak pernah
 * menulis tabel riwayatnya, dan tidak boleh. Kliennya diterima sebagai
 * parameter berbentuk sempit supaya modul ini tidak membawa klien Prisma
 * mana pun.
 *
 * "Menggantung" = dimulai, tidak selesai, DAN tidak ditandai
 * `migrate resolve --rolled-back`. Baris yang sudah di-resolve bukan lagi
 * pekerjaan yang menggantung — `migrate deploy` berikutnya menerapkannya ulang.
 */
import type { RingkasanMigrasiDb } from "./schema-version";

/** Bentuk klien yang dibutuhkan — dipenuhi setiap `PrismaClient`. */
export interface RawQueryable {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): PromiseLike<T>;
}

const SQL = `
  SELECT COUNT(*)::bigint AS terapan,
         COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS menggantung,
         MAX(migration_name) FILTER (WHERE finished_at IS NOT NULL) AS terakhir
    FROM _prisma_migrations`;

/**
 * Ringkasan, atau `null` bila tak terbaca (koneksi gagal, tabel riwayat belum
 * ada). `null` dibedakan dari "tertinggal" dengan sengaja: basis data yang
 * sedang restart bukan skema yang kedaluwarsa.
 */
export async function readMigrationSummary(client: RawQueryable): Promise<RingkasanMigrasiDb | null> {
  try {
    const rows = await client.$queryRawUnsafe<
      { terapan: bigint | number; menggantung: bigint | number; terakhir: string | null }[]
    >(SQL);
    const r = Array.isArray(rows) ? rows[0] : undefined;
    if (!r) return null;
    return { terapan: Number(r.terapan), menggantung: Number(r.menggantung), terakhir: r.terakhir };
  } catch {
    return null;
  }
}
