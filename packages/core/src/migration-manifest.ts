/**
 * Migration TERAKHIR yang diharapkan per jenis basis data — untuk
 * `/backup` konsol operator, yang menandai basis data yang TERTINGGAL.
 *
 * Kenapa konstanta, bukan membaca `prisma/postgresql/*` saat berjalan: image
 * `runner` (Next standalone) tidak memuat direktori `prisma/`. Membacanya akan
 * berhasil di mesin pengembang lalu memulangkan "tidak ada" di produksi —
 * dan "tidak diharapkan apa pun" terbaca sebagai "semua mutakhir".
 *
 * `tests/migration-manifest.test.ts` menolak berkas ini bila tidak sama
 * dengan direktori terakhir di `prisma/postgresql/<jenis>/`: migration baru
 * yang lupa diumumkan di sini membuat tes merah, bukan konsol yang diam.
 */
export const MIGRATION_TERAKHIR = {
  control: "0007_jobs_started_at",
  platform: "0005_brand_assets",
  company: "0002_company_logos",
} as const;

export type JenisBasisData = keyof typeof MIGRATION_TERAKHIR;
