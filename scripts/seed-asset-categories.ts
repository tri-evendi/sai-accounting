/**
 * Kategori aset tetap bawaan untuk buku yang SUDAH terlanjur berjalan (#416).
 *
 *   bun run seed-asset-categories            # semua perusahaan terdaftar
 *   bun run seed-asset-categories -- --dry   # lihat saja, tanpa menulis
 *
 * ══ KENAPA SKRIP TERSENDIRI, BUKAN BAGIAN MIGRATION ═════════════════════════
 * Sejak #416 kategori bawaan lahir bersama modul Aset Tetap — tapi hanya lewat
 * `seedCoaForModules`, yang jalannya di wisaya penyiapan dan saat sebuah modul
 * dinyalakan. Perusahaan yang penyiapannya SUDAH selesai sebelum perbaikan itu
 * tidak pernah melewati keduanya lagi, jadi tabel kategorinya tetap kosong dan
 * impor aset tetap di sana tetap menolak "Kendaraan" — contoh yang dipakai
 * templatnya sendiri.
 *
 * Bukan migration, sebab kategori menunjuk AKUN lewat foreign key, dan nomor
 * akun sebuah perusahaan adalah data — bukan skema. Migration yang menebak
 * "120101 pasti ada" akan gagal di buku yang bagan akunnya disesuaikan, dan
 * kegagalan migration menahan seluruh rilis untuk semua orang. Skrip ini
 * melewati buku seperti itu dengan tenang dan melaporkannya.
 *
 * IDEMPOTEN: nama yang sudah ada tidak disentuh (pencocokan tanpa peduli huruf
 * besar/kecil), jadi menjalankannya dua kali sama dengan menjalankannya sekali.
 */
import "dotenv/config";

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { seedDefaultAssetCategories } from "../src/lib/asset-categories";

function adapterFor(raw: string, database?: string) {
  const url = new URL(raw);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? url.pathname.slice(1),
    connectionLimit: 2,
  });
}

function controlClient(): ControlClient {
  const raw = process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  return new ControlClient({ adapter: adapterFor(raw) });
}

/** Kredensial dari template, nama basis data dari registry (pola #104). */
function companyTemplate(): string {
  return (
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry");

  const control = controlClient();
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { slug: true, databaseName: true, isActive: true },
  });
  await control.$disconnect();

  if (companies.length === 0) {
    console.error("Belum ada perusahaan terdaftar — tidak ada yang bisa disemai.");
    process.exit(1);
  }

  const failures: { slug: string; detail: string }[] = [];
  let totalCreated = 0;
  let skipped = 0;

  for (const company of companies) {
    const label = `${company.slug} (${company.databaseName})${company.isActive ? "" : " [nonaktif]"}`;
    const prisma = new PrismaClient({
      adapter: adapterFor(companyTemplate(), company.databaseName),
    });

    try {
      if (dryRun) {
        /* Yang dilaporkan mode kering adalah KEADAAN, bukan ramalan: berapa
           kategori yang ada sekarang, dan apakah akun yang dibutuhkan ada. */
        const [categories, accounts] = await Promise.all([
          prisma.fixedAssetCategory.count(),
          prisma.account.count({ where: { code: { in: ["120101", "120102", "610103"] } } }),
        ]);
        console.log(
          `  ${label}: ${categories} kategori, akun aset tetap ${accounts}/3` +
            (accounts < 3 ? " → dilewati (modul Aset Tetap tidak dipakai)" : "")
        );
      } else {
        const created = await seedDefaultAssetCategories(prisma);
        totalCreated += created;
        if (created === 0) skipped++;
        console.log(`  ${label}: +${created} kategori`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push({ slug: company.slug, detail });
      console.error(`  ${label}: GAGAL — ${detail}`);
    } finally {
      await prisma.$disconnect();
    }
  }

  if (!dryRun) {
    console.log(
      `\nSelesai: ${totalCreated} kategori dibuat, ${skipped} perusahaan tidak berubah.`
    );
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} perusahaan gagal disemai.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
