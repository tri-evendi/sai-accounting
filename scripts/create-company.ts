/**
 * Buat PERUSAHAAN BARU: basis datanya, skemanya, lalu daftarkan (issue #104).
 *
 *   bunx tsx scripts/create-company.ts --slug pt-b --name "PT Bumi Baru" \
 *        [--database sai_pt_b] [--admin budi]
 *
 * Setelah ini, buka aplikasi dan jalankan WIZARD PENYIAPAN untuk perusahaan itu
 * (identitas, bagan akun, saldo awal, pemilihan modul). Wizard sengaja tidak
 * dijalankan dari skrip: isinya keputusan akuntansi — tahun buku, saldo awal,
 * kategori usaha — yang harus dibuat orang yang bertanggung jawab atas bukunya,
 * bukan ditebak dari argumen baris perintah.
 *
 * ══ URUTAN: BUAT → MIGRASI → DAFTARKAN ═════════════════════════════════════
 * Registry ditulis PALING AKHIR, dan itu disengaja. Kalau perusahaan didaftarkan
 * lebih dulu lalu migrationnya gagal, aplikasi punya baris `companies` yang
 * menunjuk basis data setengah jadi: pengguna bisa memilihnya, membukanya, dan
 * bertemu galat yang tidak menjelaskan apa pun. Dengan urutan ini, kegagalan di
 * tengah meninggalkan basis data yatim yang tidak terlihat siapa pun — jauh
 * lebih aman, dan tinggal dihapus lalu diulang.
 *
 * ══ HAK AKSES ══════════════════════════════════════════════════════════════
 * Pengguna basis data di `CONTROL_DATABASE_URL` harus boleh `CREATE DATABASE`.
 * Kalau tidak boleh (dan di banyak hosting memang tidak), buat basis datanya
 * manual lalu jalankan skrip ini dengan `--database <nama>`: ia akan melewati
 * pembuatan dan langsung memigrasi + mendaftarkan.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { firstConflict, resolveDatabaseName } from "../src/lib/company-provisioning-shared";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--") && argv[i + 1]) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,49}$/;
const DB_NAME = /^[A-Za-z0-9_]{1,64}$/;

function controlClient(raw: string) {
  const url = new URL(raw);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });
}

function companyUrl(databaseName: string): string {
  const raw =
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!;
  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, name, database, admin, tenant } = args;
  const controlUrl = process.env.CONTROL_DATABASE_URL;

  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }
  if (!slug || !SLUG.test(slug) || !name) {
    console.error(
      'Usage: bunx tsx scripts/create-company.ts --slug <slug> --name "Nama PT" [--database <db>] [--admin <username>] [--tenant <slug-tenant>]\n' +
        "  slug: huruf kecil, angka, tanda hubung (mis. pt-b)"
    );
    process.exit(1);
  }

  const control = controlClient(controlUrl);

  /*
   * ── Tenant pemilik (issue #135) ──────────────────────────────────────────
   * Sejak migration 0003 setiap perusahaan WAJIB milik sebuah tenant, dan
   * skrip ini tidak menebak: bila tenant hanya SATU, dialah pemiliknya (tidak
   * ambigu); bila lebih dari satu — atau belum ada — `--tenant` wajib disebut
   * / adopsi dijalankan dulu. Pola yang sama dengan larangan jatuh-ke-bawaan
   * #104: yang ambigu harus ditanyakan, bukan dipilihkan.
   */
  const tenants = await control.tenant.findMany({ select: { id: true, slug: true } });
  let tenantId: number;
  if (tenant) {
    const found = tenants.find((t) => t.slug === tenant);
    if (!found) {
      console.error(`ERROR: tenant "${tenant}" tidak ada. Yang terdaftar: ${tenants.map((t) => t.slug).join(", ") || "(kosong)"}`);
      process.exit(1);
    }
    tenantId = found.id;
  } else if (tenants.length === 1) {
    tenantId = tenants[0].id;
    console.log(`     tenant pemilik: ${tenants[0].slug} (satu-satunya yang terdaftar)`);
  } else if (tenants.length === 0) {
    console.error(
      "ERROR: belum ada tenant di basis data kendali. Jalankan adopsi dulu:\n" +
        "  bun run adopt-tenant -- --slug <tenant> --emails <peta.json>"
    );
    process.exit(1);
  } else {
    console.error(
      `ERROR: ada ${tenants.length} tenant (${tenants.map((t) => t.slug).join(", ")}) — sebutkan pemiliknya lewat --tenant <slug>.`
    );
    process.exit(1);
  }

  /*
   * Nama basis data diturunkan SETELAH tenant diketahui: sejak issue #153
   * bentuk turunannya `sai_t{tenantId}_{slug}` — id tenant di awalan membuat
   * tabrakan lintas tenant mustahil secara struktur. `--database` eksplisit
   * (jalur pemasangan yang basis datanya dibuat manual) tetap dipakai apa
   * adanya.
   */
  const databaseName = resolveDatabaseName(tenantId, slug, database);
  if (!DB_NAME.test(databaseName)) {
    console.error(`ERROR: nama basis data tidak sah: ${databaseName}`);
    process.exit(1);
  }

  /*
   * Lingkup pemeriksaannya mengikuti aturan #153 (`firstConflict`, sama dengan
   * penyedia web): slug hanya berbenturan DI DALAM tenant pemiliknya — tenant
   * lain boleh punya slug yang sama; nama basis data berbenturan GLOBAL (ruang
   * nama fisik server).
   */
  const existing = await control.company.findMany({
    where: { OR: [{ slug }, { databaseName }] },
    select: { tenantId: true, slug: true, databaseName: true },
  });
  const conflict = firstConflict(existing, { tenantId, slug, databaseName });
  if (conflict) {
    console.error(
      conflict === "slug"
        ? `ERROR: slug "${slug}" sudah dipakai perusahaan lain di tenant ini.`
        : `ERROR: basis data "${databaseName}" sudah terdaftar untuk perusahaan lain.`
    );
    process.exit(1);
  }

  // ── 1. Basis data ────────────────────────────────────────────────────────
  if (database) {
    console.log(`1/3  memakai basis data yang sudah ada: ${databaseName}`);
  } else {
    console.log(`1/3  membuat basis data ${databaseName}`);
    try {
      await control.$executeRawUnsafe(
        `CREATE DATABASE \`${databaseName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } catch (error) {
      console.error(
        `GAGAL membuat basis data: ${(error as Error).message}\n` +
          "Kalau pengguna basis datanya memang tidak boleh CREATE DATABASE, buat\n" +
          "manual lalu ulangi dengan --database " +
          databaseName
      );
      process.exit(1);
    }
  }

  // ── 2. Skema ─────────────────────────────────────────────────────────────
  console.log(`2/3  menerapkan migration ke ${databaseName}`);
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: companyUrl(databaseName) },
  });
  if (migrate.status !== 0) {
    console.error(
      "GAGAL menerapkan migration. Perusahaan TIDAK didaftarkan — basis datanya\n" +
        `masih ada dan bisa dihapus (DROP DATABASE \`${databaseName}\`) sebelum mencoba lagi.`
    );
    process.exit(1);
  }

  // ── 3. Registry (paling akhir — lihat komentar kepala berkas) ────────────
  const company = await control.company.create({
    data: { slug, name, databaseName, tenantId },
  });
  console.log(`3/3  terdaftar sebagai perusahaan #${company.id}`);

  if (admin) {
    // Username tidak lagi unik global (#136) — dicari di tenant pemilik PT ini.
    const user = await control.user.findFirst({ where: { username: admin, tenantId } });
    if (!user) {
      console.warn(
        `\nCatatan: pengguna "${admin}" belum ada, jadi keanggotaan tidak dibuat.\n` +
          "Buat akunnya sekaligus dengan:\n" +
          `  bun run create-admin -- --username ${admin} --password '…' --email <email> --company ${slug}`
      );
    } else {
      await control.membership.create({
        data: { userId: user.id, companyId: company.id, role: "managing_director" },
      });
      console.log(`     "${admin}" ditambahkan sebagai Direktur Utama di ${name}`);
    }
  }

  console.log("\nSelesai. Langkah berikutnya:");
  console.log(`  1. Masuk ke aplikasi, pilih "${name}" di pemilih perusahaan.`);
  console.log("  2. Jalankan wizard penyiapan: identitas, bagan akun, saldo awal, modul.");

  await control.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
