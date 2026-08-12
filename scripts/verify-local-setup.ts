/**
 * Verifikasi pemasangan LOKAL multi-PT (issue #104): kendali → registry → buku.
 *
 * Read-only. Dijalankan setelah adopsi + migration untuk membuktikan tiga hal
 * yang tidak terlihat dari "migration berhasil": registry terisi, buku
 * perusahaan benar-benar bisa dibuka lewat konteks, dan query TANPA konteks
 * melempar alih-alih diam-diam memakai basis data bawaan.
 *
 *   bunx tsx scripts/verify-local-setup.ts
 */
import "dotenv/config";
import { controlDb } from "../src/lib/control-db";
import { runWithCompany } from "../src/lib/company-context";
import { prisma } from "../src/lib/prisma";

async function main() {
  const companies = await controlDb.company.findMany({
    include: { memberships: { include: { user: true } } },
    orderBy: { id: "asc" },
  });
  console.log(`KENDALI: ${companies.length} perusahaan terdaftar`);
  for (const c of companies) {
    console.log(`  ${c.slug} → ${c.databaseName} (aktif=${c.isActive})`);
    for (const m of c.memberships) {
      console.log(`    ${m.user.username.padEnd(8)} ${m.role}`);
    }
  }
  if (companies.length === 0) throw new Error("registry kosong");

  for (const c of companies) {
    await runWithCompany(
      { companyId: c.id, slug: c.slug, databaseName: c.databaseName },
      async () => {
        const [invoices, accounts, movements, cashMovements, settings] = await Promise.all([
          prisma.invoice.count(),
          prisma.account.count(),
          prisma.stockMovement.count(),
          prisma.cashMovement.count(),
          prisma.companySetting.findFirst(),
        ]);
        console.log(
          `BUKU ${c.slug}: invoices=${invoices} accounts=${accounts} ` +
            `stockMovements=${movements} cashMovements=${cashMovements}`
        );
        console.log(`  identitas: ${settings?.name ?? "(kosong — jalankan wizard penyiapan)"}`);
        console.log(`  modul aktif: ${settings?.enabledModules ?? "(belum dipilih)"}`);
      }
    );
  }

  try {
    await prisma.invoice.count();
    throw new Error("query TANPA konteks perusahaan tidak melempar — aturan #104 bocor");
  } catch (e) {
    if (e instanceof Error && e.message.includes("aturan #104 bocor")) throw e;
    console.log("OK: query tanpa konteks perusahaan melempar (aturan #104)");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("GAGAL:", e);
    process.exit(1);
  }
);
