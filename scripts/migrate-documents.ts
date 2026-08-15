/**
 * PEMINDAHAN BERKAS DOKUMEN (issue #367) — dari `public/uploads/` bersama ke
 * `data/documents/<companyId>/` yang tersekat per perusahaan.
 *
 *   bun run migrate:documents            # laporan saja, tidak memindahkan apa pun
 *   bun run migrate:documents --apply    # benar-benar memindahkan
 *
 * ══ KENAPA SKRIP, BUKAN MIGRATION SQL ══════════════════════════════════════
 * Yang berpindah adalah BERKAS, dan `prisma migrate` tidak tahu apa-apa tentang
 * berkas. Barisnya memang ikut ditulis ulang (`documents.filepath` dari
 * `/uploads/<nama>` menjadi `<companyId>/<uuid>.<ext>`), tetapi penulisan itu
 * hanya sah bila berkasnya sudah benar-benar pindah — jadi keduanya harus
 * terjadi dalam satu langkah yang sama, per baris.
 *
 * ══ URUTAN: SALIN → TULIS BARIS → HAPUS ASAL ═══════════════════════════════
 * Bukan "pindahkan lalu tulis". Kegagalan di tengah urutan ini paling buruk
 * meninggalkan SALINAN yang tak dirujuk siapa pun (sampah yang aman), sementara
 * urutan sebaliknya bisa meninggalkan baris yang menunjuk berkas yang sudah
 * tidak ada di dua tempat sekaligus.
 *
 * ══ IDEMPOTEN ══════════════════════════════════════════════════════════════
 * Baris yang `filepath`-nya sudah berbentuk kunci penyimpanan dilewati. Aman
 * dijalankan berulang, dan aman dijalankan lagi setelah kegagalan separuh
 * jalan.
 *
 * ══ YANG TIDAK DILAKUKAN ═══════════════════════════════════════════════════
 * Berkas di `public/uploads` yang tidak dirujuk satu pun basis data perusahaan
 * adalah YATIM: ia dilaporkan, TIDAK dihapus. Menghapus sesuatu yang tidak
 * dikenali adalah cara paling cepat kehilangan berkas yang ternyata masih
 * dibutuhkan — dan keputusan itu milik manusia, bukan skrip.
 */

import "dotenv/config";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient as CompanyClient } from "../src/generated/prisma/client.js";
import {
  DOCUMENTS_ROOT,
  LEGACY_UPLOAD_DIR,
  isStorageKey,
  legacyPublicName,
  newStorageKey,
} from "../src/lib/document-storage";

const APPLY = process.argv.includes("--apply");

/** Adapter untuk satu basis data; kredensialnya selalu dari URL kendali. */
function adapterFor(rawUrl: string, database?: string): PrismaMariaDb {
  const url = new URL(rawUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? url.pathname.replace(/^\//, ""),
    connectionLimit: 2,
  });
}

const controlClient = (url: string) => new ControlClient({ adapter: adapterFor(url) });
const companyClient = (url: string, database: string) =>
  new CompanyClient({ adapter: adapterFor(url, database) });

interface Tally {
  moved: number;
  already: number;
  missing: number;
  unknown: number;
}

async function migrateCompany(
  controlUrl: string,
  company: { id: number; slug: string; databaseName: string },
  claimed: Set<string>
): Promise<Tally> {
  const db = companyClient(controlUrl, company.databaseName);
  const tally: Tally = { moved: 0, already: 0, missing: 0, unknown: 0 };

  try {
    const documents = await db.document.findMany({
      select: { id: true, filename: true, filepath: true },
      orderBy: { id: "asc" },
    });

    for (const doc of documents) {
      if (isStorageKey(doc.filepath)) {
        tally.already++;
        continue;
      }

      const legacyName = legacyPublicName(doc.filepath);
      if (!legacyName) {
        console.warn(`    ? #${doc.id} filepath tidak dikenali: ${JSON.stringify(doc.filepath)}`);
        tally.unknown++;
        continue;
      }
      claimed.add(legacyName);

      const source = path.join(LEGACY_UPLOAD_DIR, legacyName);
      try {
        if (!(await stat(source)).isFile()) throw new Error("bukan berkas");
      } catch {
        console.warn(`    ! #${doc.id} berkasnya tidak ada di disk: ${legacyName}`);
        tally.missing++;
        continue;
      }

      const ext = path.extname(legacyName).toLowerCase();
      const key = newStorageKey(company.id, ext);
      const target = path.join(DOCUMENTS_ROOT, key);

      if (APPLY) {
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
        await db.document.update({ where: { id: doc.id }, data: { filepath: key } });
        await rm(source, { force: true });
      }
      tally.moved++;
    }
  } finally {
    await db.$disconnect();
  }

  return tally;
}

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }

  const control = controlClient(controlUrl);
  const companies = await control.company.findMany({
    select: { id: true, slug: true, databaseName: true },
    orderBy: { id: "asc" },
  });

  console.log(
    APPLY
      ? `Memindahkan dokumen ${companies.length} perusahaan ke ${DOCUMENTS_ROOT}`
      : `PRATINJAU (tanpa --apply — tidak ada yang dipindahkan). ${companies.length} perusahaan.`
  );

  /** Nama berkas lama yang DIAKUI sebuah baris — sisanya yatim. */
  const claimed = new Set<string>();
  const total: Tally = { moved: 0, already: 0, missing: 0, unknown: 0 };

  for (const company of companies) {
    const tally = await migrateCompany(controlUrl, company, claimed);
    total.moved += tally.moved;
    total.already += tally.already;
    total.missing += tally.missing;
    total.unknown += tally.unknown;
    console.log(
      `  ${company.slug}: ${tally.moved} dipindahkan, ${tally.already} sudah, ` +
        `${tally.missing} hilang, ${tally.unknown} tak dikenali`
    );
  }

  /* Yatim: dilaporkan, tidak disentuh. */
  let orphans: string[] = [];
  try {
    const entries = await readdir(LEGACY_UPLOAD_DIR, { withFileTypes: true });
    orphans = entries.filter((e) => e.isFile() && !claimed.has(e.name)).map((e) => e.name);
  } catch {
    // Direktori lama sudah tidak ada — pemasangan baru, atau sudah bersih.
  }

  console.log(
    `\nTotal: ${total.moved} dipindahkan · ${total.already} sudah berbentuk baru · ` +
      `${total.missing} baris tanpa berkas · ${total.unknown} filepath tak dikenali`
  );

  if (orphans.length > 0) {
    console.log(
      `\n${orphans.length} berkas YATIM di ${LEGACY_UPLOAD_DIR} — tidak dirujuk satu pun\n` +
        "basis data perusahaan. TIDAK dihapus; periksa lalu buang sendiri bila memang sampah:"
    );
    for (const name of orphans.slice(0, 50)) console.log(`  ${name}`);
    if (orphans.length > 50) console.log(`  … dan ${orphans.length - 50} lagi`);
  }

  if (!APPLY && total.moved > 0) {
    console.log("\nJalankan ulang dengan --apply untuk benar-benar memindahkannya.");
  }

  await control.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
