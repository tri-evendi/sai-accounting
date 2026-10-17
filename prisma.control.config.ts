// Konfigurasi Prisma untuk BASIS DATA KENDALI (issue #104).
//
// Berdampingan dengan `prisma.config.ts` (basis data perusahaan). Dua skema,
// dua klien, dua folder migration — dijalankan lewat `--config`:
//
//   bun run db:generate:control    → klien ke packages/db/generated/control
//   bun run db:migrate:control     → migrate deploy ke CONTROL_DATABASE_URL
//
// Basis data PERUSAHAAN tetap memakai `prisma.config.ts`; migration-nya kini
// harus diputar di SETIAP perusahaan — lihat `scripts/migrate-all-companies.ts`.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "packages/db/prisma/control/schema.prisma",
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
    path: "prisma/postgresql/control",
  },
  datasource: {
    url: process.env["CONTROL_DATABASE_URL"],
  },
});
