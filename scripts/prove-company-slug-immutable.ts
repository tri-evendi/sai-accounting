/**
 * PEMBUKTIAN slug perusahaan permanen (issue #161) — dijalankan SESUDAH
 * migration kendali 0010 diterapkan.
 *
 *   docker compose run --rm --entrypoint "bunx tsx scripts/prove-company-slug-immutable.ts" migrate
 *
 * Kenapa perlu dibuktikan di lingkungan yang hidup, bukan cukup di tes: yang
 * menegakkan aturan ini bukan kode aplikasi melainkan trigger di basis data,
 * dan trigger adalah objek yang bisa RAIB tanpa suara — satu `mysqldump`
 * tanpa `--triggers`, satu pemulihan dari cadangan yang dibuat begitu, satu
 * migration berikutnya yang me-rebuild `companies`. Tidak satu pun dari itu
 * mengubah kode, jadi tidak satu pun terlihat di CI. Yang bisa melihatnya
 * hanya pertanyaan yang diajukan ke basis data ITU SENDIRI.
 *
 * TIDAK MENINGGALKAN JEJAK. Percobaan penggantian slug dijalankan di dalam
 * transaksi yang SELALU di-rollback — baik ketika ditolak (yang diharapkan)
 * maupun ketika lolos (yang berarti gagal). Tidak ada baris yang berubah, dan
 * tidak ada tabel bantu yang dibuat.
 *
 * Yang dibuktikan:
 *   1. trigger `companies_slug_immutable` ada di skema kendali;
 *   2. mengubah NILAI slug ditolak, dengan pesan yang menyebut alasannya;
 *   3. yang lain tetap boleh — mengubah `name` lolos, dan `SET slug = slug`
 *      (penulisan baris penuh oleh ORM) juga lolos.
 *
 * Poin 3 sama pentingnya dengan poin 2: penjaga yang menolak terlalu banyak
 * akan dibuang orang pertama yang tidak bisa mengganti nama perusahaan.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const TRIGGER = "companies_slug_immutable";
/** Dilempar untuk memaksa rollback — bukan penanda kegagalan. */
const ROLLBACK = Symbol("rollback");

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }

  const url = new URL(controlUrl);
  const schema = url.pathname.slice(1);
  const control = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: schema,
      connectionLimit: 2,
    }),
  });

  const failures: string[] = [];

  // ── 1. Triggernya ada ────────────────────────────────────────────────────
  const triggers = await control.$queryRawUnsafe<{ trigger_name: string }[]>(
    "SELECT trigger_name FROM information_schema.triggers " +
      "WHERE trigger_schema = ? AND trigger_name = ?",
    schema,
    TRIGGER
  );
  if (triggers.length === 0) {
    failures.push(
      `trigger \`${TRIGGER}\` TIDAK ADA di skema \`${schema}\` — ` +
        "terapkan migration kendali 0010 (bun run db:migrate:control)"
    );
  }

  // ── 2 & 3. Perilakunya, di dalam transaksi yang selalu dibatalkan ────────
  const sample = await control.company.findFirst({
    select: { id: true, slug: true, name: true },
    orderBy: { id: "asc" },
  });

  if (!sample) {
    console.log("LEWAT — belum ada satu pun perusahaan untuk diuji perilakunya.");
    console.log(
      triggers.length > 0
        ? `Trigger \`${TRIGGER}\` ada. Jalankan lagi setelah perusahaan pertama dibuat.`
        : "Dan triggernya belum ada — lihat kegagalan di bawah."
    );
  } else {
    let slugChangeRejected = false;
    let rejectionMessage = "";
    let nameChangeAllowed = false;
    let selfAssignAllowed = false;

    try {
      await control.$transaction(async (tx) => {
        // Yang HARUS boleh — kalau ini gagal, penjaganya terlalu lebar.
        try {
          await tx.$executeRawUnsafe(
            "UPDATE companies SET name = CONCAT(name, ' (uji #161)') WHERE id = ?",
            sample.id
          );
          nameChangeAllowed = true;
        } catch (error) {
          failures.push(`mengubah \`name\` ikut DITOLAK: ${(error as Error).message}`);
        }

        // ORM yang menulis seluruh kolom menyertakan slug lamanya. Itu bukan
        // perubahan, dan tidak boleh ditolak.
        try {
          await tx.$executeRawUnsafe("UPDATE companies SET slug = slug WHERE id = ?", sample.id);
          selfAssignAllowed = true;
        } catch (error) {
          failures.push(`\`SET slug = slug\` ikut DITOLAK: ${(error as Error).message}`);
        }

        // Yang HARUS ditolak.
        try {
          await tx.$executeRawUnsafe(
            "UPDATE companies SET slug = CONCAT(slug, '-uji161') WHERE id = ?",
            sample.id
          );
        } catch (error) {
          slugChangeRejected = true;
          rejectionMessage = (error as Error).message;
        }

        // Apa pun hasilnya di atas: batalkan semuanya.
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    if (!slugChangeRejected) {
      failures.push(
        `mengganti slug perusahaan #${sample.id} (\`${sample.slug}\`) TIDAK ditolak — ` +
          "aturan #161 tidak ditegakkan basis data ini"
      );
    } else if (!/#161/.test(rejectionMessage)) {
      failures.push(
        "slug ditolak, TAPI pesannya tidak menyebut #161 — " +
          `pembacanya tidak akan tahu sebabnya: "${rejectionMessage}"`
      );
    }

    // Barisnya harus persis seperti semula: transaksinya dibatalkan.
    const after = await control.company.findUnique({
      where: { id: sample.id },
      select: { slug: true, name: true },
    });
    if (after?.slug !== sample.slug || after?.name !== sample.name) {
      failures.push(
        `PEMBUKTIAN INI MENINGGALKAN JEJAK di perusahaan #${sample.id} — ` +
          `slug/nama berubah dari (${sample.slug}, ${sample.name}) menjadi ` +
          `(${after?.slug}, ${after?.name}). Rollback tidak bekerja; periksa tangan.`
      );
    }

    if (failures.length === 0) {
      console.log(`LULUS — perusahaan #${sample.id} (\`${sample.slug}\`) dipakai sebagai contoh:`);
      console.log(`  ✓ trigger \`${TRIGGER}\` ada di \`${schema}\``);
      console.log(`  ✓ mengganti slug ditolak: ${rejectionMessage}`);
      console.log(`  ✓ mengubah \`name\` tetap boleh (${nameChangeAllowed})`);
      console.log(`  ✓ \`SET slug = slug\` tetap boleh (${selfAssignAllowed})`);
      console.log("  ✓ transaksi dibatalkan — tidak ada baris yang berubah");
    }
  }

  await control.$disconnect();

  if (failures.length > 0) {
    console.error(`GAGAL — ${failures.length} masalah:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
