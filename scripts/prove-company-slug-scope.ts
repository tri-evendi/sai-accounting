/**
 * PEMBUKTIAN lingkup slug perusahaan (issue #153) — read-only, exit != 0 bila
 * ada cacat.
 *
 *   bunx tsx scripts/prove-company-slug-scope.ts
 *
 * Berdiri di antara migration 0008 (indeks komposit `(tenant_id, slug)`
 * berdampingan dengan keunikan global lama) dan 0009 (membuang yang global):
 * migration 0009 TIDAK BOLEH diterapkan sebelum skrip ini lulus. Pola yang
 * sama dengan `prove-tenant-adoption` di #134 — pembuktian yang ditulis oleh
 * kode yang sama dengan yang melakukan pekerjaannya hanya membuktikan bahwa
 * kode itu setuju dengan dirinya sendiri, jadi intinya murni dan terpisah
 * (`src/lib/company-slug-proof.ts`, teruji tanpa basis data).
 *
 * Yang dibuktikan:
 *   1. setiap `companies.tenant_id` terisi
 *   2. tidak ada `(tenant_id, slug)` kembar — yang akan ditegakkan indeks
 *      `companies_tenant_id_slug_key` bagi penyediaan berikutnya
 *   3. tidak ada `database_name` kembar — keunikan ini TETAP global setelah
 *      0009 (ruang nama fisik server)
 *
 * Setiap cacat MENYEBUT baris yang salah. TIDAK MENULIS APA PUN — hanya SELECT.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { proveCompanySlugScope } from "../src/lib/company-slug-proof";

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }

  const url = new URL(controlUrl);
  const control = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });

  const companies = await control.company.findMany({
    select: { id: true, slug: true, databaseName: true, tenantId: true },
    orderBy: { id: "asc" },
  });

  await control.$disconnect();

  const failures = proveCompanySlugScope(companies);

  if (failures.length > 0) {
    console.error(`GAGAL — ${failures.length} cacat ditemukan:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("\nJangan terapkan migration 0009 sebelum semuanya bersih.");
    process.exit(1);
  }

  console.log(
    `LULUS — ${companies.length} perusahaan: semua ber-tenant, tidak ada slug ` +
      "kembar di dalam satu tenant, tidak ada database_name kembar."
  );
  console.log("Aman menerapkan migration 0009: bun run db:migrate:control");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
