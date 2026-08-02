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
    path: "prisma/platform/migrations",
  },
  datasource: {
    url: process.env["PLATFORM_DATABASE_URL"],
  },
});
