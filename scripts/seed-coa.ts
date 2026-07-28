/**
 * Seed the default Chart of Accounts (trading/export, Indonesia) and the
 * auto-posting account mappings that reference it.
 * Idempotent: existing account codes and mappings are skipped.
 * Run: npx tsx scripts/seed-coa.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { seedCoaForModules } from "../src/lib/coa-seeding";
import { BUSINESS_MODULES, type BusinessModule } from "../src/lib/business-modules";

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 3,
  });
  return new PrismaClient({ adapter });
}

async function main() {
  /*
   * Skrip ini kini memakai penyemai yang SAMA dengan wizard penyiapan dan
   * penyalaan modul (`lib/coa-seeding.ts`) — bukan salinan logikanya sendiri.
   * Sebelumnya ia menyemai SELURUH template tanpa peduli modul apa yang
   * dipakai perusahaan; salinan kedua seperti itu adalah cara paling mudah
   * membuat dua jalur menyemai bagan akun yang berbeda.
   *
   * Tanpa argumen: seluruh modul (perilaku lama, dipakai pemasangan yang
   * memang memakai semuanya). Dengan `--modules a,b`: hanya modul itu.
   */
  const prisma = createClient();
  const arg = process.argv.indexOf("--modules");
  const modules =
    arg >= 0 && process.argv[arg + 1]
      ? (process.argv[arg + 1].split(",").map((m) => m.trim()) as BusinessModule[])
      : [...BUSINESS_MODULES];

  const result = await seedCoaForModules(prisma, modules);

  console.log(
    `Chart of Accounts seed complete: ${result.created} created, ` +
      `${result.existing} already existed (modul: ${modules.join(", ")}).`
  );
  console.log(`Account mappings: ${result.mappingsCreated} created.`);
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
  });
