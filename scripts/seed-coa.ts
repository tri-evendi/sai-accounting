/**
 * Seed the default Chart of Accounts (trading/export, Indonesia) and the
 * auto-posting account mappings that reference it.
 * Idempotent: existing account codes and mappings are skipped.
 * Run: npx tsx scripts/seed-coa.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { COA_TEMPLATE, normalBalanceFor } from "../src/lib/accounting";
import { seedDefaultMappings } from "../src/lib/posting/mapping";

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
  const prisma = createClient();
  const byCode = new Map<string, number>();
  let created = 0;

  // Parents first (no `parent`), then children — so parentId can be resolved.
  const ordered = [
    ...COA_TEMPLATE.filter((r) => !r.parent),
    ...COA_TEMPLATE.filter((r) => r.parent),
  ];

  for (const row of ordered) {
    const existing = await prisma.account.findUnique({ where: { code: row.code } });
    if (existing) {
      byCode.set(row.code, existing.id);
      continue;
    }
    const parentId = row.parent ? byCode.get(row.parent) ?? null : null;
    const account = await prisma.account.create({
      data: {
        code: row.code,
        name: row.name,
        type: row.type,
        currency: row.currency ?? "IDR",
        parentId,
        normalBalance: normalBalanceFor(row.type),
        isActive: true,
      },
    });
    byCode.set(row.code, account.id);
    created++;
  }

  console.log(`Chart of Accounts seed complete: ${created} created, ${byCode.size - created} already existed.`);

  // Posting rules resolve accounts through account_mappings, so seed them too.
  const mappings = await seedDefaultMappings(prisma);
  console.log(
    `Account mappings seed complete: ${mappings.created} created` +
      (mappings.skipped > 0 ? `, ${mappings.skipped} skipped (account code not found).` : ".")
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
