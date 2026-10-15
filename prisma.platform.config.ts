// Konfigurasi Prisma untuk BASIS DATA PLATFORM (issue #137).
//
// Berdampingan dengan `prisma.config.ts` (basis data perusahaan) dan
// `prisma.control.config.ts` (basis data kendali). Tiga skema, tiga klien,
// tiga folder migration — dijalankan lewat `--config`:
//
//   bun run db:generate:platform   → klien ke src/generated/platform
//   bun run db:migrate:platform    → migrate deploy ke PLATFORM_DATABASE_URL
//
// `db:migrate:platform` dibungkus `scripts/migrate-platform.ts`: pemasangan
// yang belum menyediakan `sai_platform` (belum ada PLATFORM_DATABASE_URL)
// dilewati dengan peringatan, TIDAK digagalkan — penagihan yang belum berdiri
// tidak boleh menghalangi deploy buku besar. URL yang DISET tapi gagal tetap
// menggagalkan deploy, sebagaimana mestinya.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/platform/schema.prisma",
  migrations: {
    /*
     * == JALUR MIGRATION PINDAH KE PostgreSQL (15 Okt 2026) ==============
     * Riwayat MariaDB TIDAK dihapus — ia tetap di `prisma/<db>/migrations`
     * sebagai ARSIP hanya-baca. Di sana tercatat transformasi data yang
     * pernah diterapkan, dan itu riwayat yang akan dicari orang saat
     * menelusuri kenapa sebuah nilai berbentuk begitu.
     *
     * Yang TIDAK boleh: menjalankannya terhadap PostgreSQL. Ia akan gagal di
     * pernyataan pertama — dan itu justru kabar baik dibanding setengah
     * berhasil. Karena itu JALURNYA yang dipindah, bukan isinya diterjemahkan.
     */
    path: "prisma/postgresql/platform",
  },
  datasource: {
    url: process.env["PLATFORM_DATABASE_URL"],
  },
});
