// Konfigurasi Prisma untuk BASIS DATA KENDALI (issue #104).
//
// Berdampingan dengan `prisma.config.ts` (basis data perusahaan). Dua skema,
// dua klien, dua folder migration — dijalankan lewat `--config`:
//
//   bun run db:generate:control    → klien ke src/generated/control
//   bun run db:migrate:control     → migrate deploy ke CONTROL_DATABASE_URL
//
// Basis data PERUSAHAAN tetap memakai `prisma.config.ts`; migration-nya kini
// harus diputar di SETIAP perusahaan — lihat `scripts/migrate-all-companies.ts`.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/control/schema.prisma",
  migrations: {
    path: "prisma/control/migrations",
  },
  datasource: {
    url: process.env["CONTROL_DATABASE_URL"],
  },
});
