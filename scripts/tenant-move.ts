/**
 * PINDAHKAN BUKU SATU PT KE INSTANS `db-postgres` LAIN (tahap 4, rancangan 09 §9).
 *
 *   bun run tenant:move -- --database <nama_basis_data> --to <kunci|default>
 *   bun run tenant:move -- --database <nama_basis_data> --to <kunci|default> \
 *        --apply --reason "<kenapa>"
 *
 * Tanpa `--apply` hanya PRATINJAU: fakta, alasan menolak, dan langkah yang akan
 * dijalankan. Runbook lengkapnya: docs/MULTI-COMPANY.md §6.
 *
 * ══ URUTAN, DAN KENAPA REGISTRY DIBALIK PALING AKHIR ═══════════════════════
 *   1. Tolak bila PT masih AKTIF. Penjaga aplikasi menolak buku nonaktif, jadi
 *      selama pemindahan tidak ada yang menulis ke salinan asal — dump yang
 *      diambil adalah isi buku, bukan potret yang tertinggal satu transaksi.
 *   2. `CREATE DATABASE` di tujuan (bila belum ada & kosong), lalu
 *      `pg_dump -Fc | pg_restore --single-transaction --exit-on-error`.
 *   3. Bandingkan jumlah baris SETIAP tabel asal vs tujuan. Selisih satu baris
 *      pun = berhenti; registry tidak disentuh, tujuan dibiarkan untuk diperiksa.
 *   4. Balik `companies.db_instance_key` — dengan syarat nilai lamanya MASIH
 *      sama dan PT masih nonaktif, supaya dua pemindahan bersamaan tidak saling
 *      menimpa.
 *   5. Ganti nama salinan asal menjadi `<nama>_moved_<yyyymmdd>`: proses yang
 *      masih memegang registry lama gagal tersambung dengan nama yang jelas,
 *      bukan menulis ke salinan yang ditinggalkan. Salinan itu jalan balik;
 *      menghapusnya keputusan manusia, sesudah buku di tujuan terbukti.
 *   6. Jejak tenant `tenant.company.move`.
 *
 * Satu-satunya pembuka buku di sini adalah `@sai/db/company-url` — skrip ini
 * tidak menyusun URL sendiri.
 *
 * ⚠ JALANKAN DI IMAGE `backup` (`docker compose run --rm job-backup …`): ia
 * yang membawa `pg_dump`/`pg_restore` 17, dan env-nya menunjuk PostgreSQL
 * LANGSUNG. Lewat PgBouncer `pg_dump` bisa memulangkan dump sebagian.
 */
import "dotenv/config";
import { spawn } from "node:child_process";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";
import { appRoleGrantSql, bukaBasisData, bukaServer } from "@sai/db/server";
import {
  appRoleForNewBook,
  COMPANY_DATABASE_TARGET_SELECT,
  DEFAULT_DB_INSTANCE_LABEL,
  assertDbInstanceRef,
  instanceServerUrl,
  toCompanyDatabaseTarget,
  type DbInstanceRef,
} from "@sai/db/company-url";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";

import { libpqEnv, pgFor, rowCounts, where } from "./lib/pg-tools";

import {
  countMismatches,
  moveRefusals,
  parseMoveArgs,
  retiredDatabaseName,
  type MoveFacts,
} from "../src/lib/tenant-move";

const label = (key: string | null) => key ?? DEFAULT_DB_INSTANCE_LABEL;

/** `pg_dump -Fc` asal → `pg_restore` tujuan, lewat pipa; tanpa berkas antara. */
function dumpRestore(source: URL, target: URL, database: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dump = spawn("pg_dump", ["-Fc", "--no-owner", "--no-acl"], {
      env: libpqEnv(source, database),
      stdio: ["ignore", "pipe", "inherit"],
    });
    const restore = spawn(
      "pg_restore",
      ["--no-owner", "--no-acl", "--single-transaction", "--exit-on-error", "-d", database],
      { env: libpqEnv(target, database), stdio: ["pipe", "inherit", "inherit"] }
    );
    dump.stdout.pipe(restore.stdin);
    let dumpCode: number | null = null;
    dump.on("error", reject);
    restore.on("error", reject);
    dump.on("close", (code) => {
      dumpCode = code;
    });
    restore.on("close", (code) => {
      if (dumpCode !== 0 && dumpCode !== null) reject(new Error(`pg_dump keluar dengan kode ${dumpCode}`));
      else if (code !== 0) reject(new Error(`pg_restore keluar dengan kode ${code}`));
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  const args = parseMoveArgs(process.argv.slice(2));
  if (!args.databaseName || args.to === undefined) {
    console.error(
      "Pakai: bun run tenant:move -- --database <nama_basis_data> --to <kunci|default> " +
        '[--apply --reason "<kenapa>"]'
    );
    process.exit(1);
  }
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("CONTROL_DATABASE_URL belum diset — registry perusahaan tidak terbaca.");
    process.exit(1);
  }
  const control = new ControlClient({ adapter: buatAdapter(controlUrl, { batasKoneksi: 2 }) });

  try {
    const company = await control.company.findUnique({
      where: { databaseName: args.databaseName },
      select: {
        id: true,
        slug: true,
        isActive: true,
        ...COMPANY_DATABASE_TARGET_SELECT,
        tenant: { select: { id: true, slug: true } },
      },
    });
    if (!company) {
      console.error(`Basis data ${args.databaseName} tidak terdaftar di companies.`);
      process.exit(1);
    }
    /* Asal yang tak terselesaikan MELEMPAR di sini — tidak ada tebakan. */
    const source = toCompanyDatabaseTarget(company);
    const sourceServer = instanceServerUrl(source.dbInstance);

    const instances = await control.dbInstance.findMany({
      select: { key: true, urlEnvVar: true, isActive: true },
    });
    const targetRow = args.to === null ? null : instances.find((i) => i.key === args.to) ?? null;
    let targetRef: DbInstanceRef | null = null;
    let targetServer: URL | null = null;
    if (args.to === null) {
      targetServer = instanceServerUrl(null);
    } else if (targetRow) {
      targetRef = { key: targetRow.key, urlEnvVar: targetRow.urlEnvVar };
      assertDbInstanceRef(targetRef);
      try {
        targetServer = instanceServerUrl(targetRef);
      } catch {
        targetServer = null;
      }
    }

    const asal = await bukaServer(sourceServer.toString());
    let sourceExists: boolean;
    try {
      sourceExists = await asal.adakah(source.databaseName);
    } finally {
      await asal.tutup();
    }
    let targetExists = false;
    let targetTables = 0;
    if (targetServer) {
      const tujuan = await bukaServer(targetServer.toString());
      try {
        targetExists = await tujuan.adakah(source.databaseName);
        if (targetExists) targetTables = await tujuan.jumlahTabel(source.databaseName);
      } finally {
        await tujuan.tutup();
      }
    }

    const facts: MoveFacts = {
      company: {
        slug: company.slug,
        databaseName: source.databaseName,
        isActive: company.isActive,
        dbInstanceKey: company.dbInstanceKey,
      },
      targetKey: args.to,
      targetKnown: args.to === null || targetRow !== null,
      targetActive: args.to === null || targetRow?.isActive === true,
      targetUrlSet: targetServer !== null,
      sourceDatabaseExists: sourceExists,
      targetDatabaseExists: targetExists,
      targetDatabaseTables: targetTables,
    };
    const refusals = moveRefusals(facts);
    const retired = retiredDatabaseName(source.databaseName, new Date());

    console.log(`PT        : ${company.slug} (${source.databaseName})`);
    console.log(`Asal      : instans ${label(company.dbInstanceKey)} @ ${where(sourceServer)}`);
    console.log(
      `Tujuan    : instans ${label(args.to)}` + (targetServer ? ` @ ${where(targetServer)}` : " @ ?")
    );
    console.log(`Langkah   :`);
    console.log(`  1. ${targetExists ? "pakai" : "buat"} basis data ${source.databaseName} di tujuan`);
    console.log(`  2. pg_dump -Fc asal | pg_restore --single-transaction tujuan`);
    console.log(`  3. bandingkan jumlah baris setiap tabel`);
    console.log(`  4. companies.db_instance_key: ${label(company.dbInstanceKey)} → ${label(args.to)}`);
    console.log(`  5. salinan asal diganti nama → ${retired} (TIDAK dihapus)`);

    if (refusals.length > 0) {
      console.error(`\nDITOLAK (${refusals.length}):`);
      for (const r of refusals) console.error(`  ✗ ${r.message}`);
      process.exit(1);
    }
    if (!args.apply) {
      console.log("\nPRATINJAU — tidak ada yang ditulis. Tambahkan --apply --reason \"…\" untuk menjalankan.");
      return;
    }
    if (!args.reason?.trim()) {
      console.error("--apply menuntut --reason \"…\": pemindahan tercatat di jejak tenant beserta alasannya.");
      process.exit(1);
    }
    /* `targetServer` pasti ada: `target_url_missing` sudah menolak sebaliknya. */
    const tujuanUrl = targetServer!;

    // ── 1. Basis data tujuan ─────────────────────────────────────────
    if (!targetExists) {
      const s = await bukaServer(tujuanUrl.toString());
      try {
        await s.buat(source.databaseName);
      } finally {
        await s.tutup();
      }
      console.log(`✓ basis data ${source.databaseName} dibuat di ${label(args.to)}`);
    }

    // ── 2. Salin ─────────────────────────────────────────────────────
    await dumpRestore(sourceServer, tujuanUrl, source.databaseName);
    console.log("✓ pg_dump | pg_restore selesai");

    /* `pg_restore --no-owner --no-acl`: objeknya milik peran yang memulihkan,
       tanpa satu hibah pun. Di instans bawaan peran aplikasi bukan peran itu
       (hak minimum, Okt 2026) — tanpa langkah ini buku yang baru pindah gagal
       42501 di halaman pertamanya. */
    const appRole = appRoleForNewBook(targetRef);
    if (appRole) {
      const db = await bukaBasisData(tujuanUrl.toString(), source.databaseName);
      try {
        await db.jalankan(appRoleGrantSql(source.databaseName, appRole));
      } finally {
        await db.tutup();
      }
      console.log(`✓ hak ${appRole} dihibahkan`);
    }

    // ── 3. Bukti isi ─────────────────────────────────────────────────
    const [hitungAsal, hitungTujuan] = await Promise.all([
      rowCounts(sourceServer, source.databaseName),
      rowCounts(tujuanUrl, source.databaseName),
    ]);
    const selisih = countMismatches(hitungAsal, hitungTujuan);
    if (selisih.length > 0) {
      console.error("\n✗ Isi tujuan TIDAK sama dengan asal — registry tidak disentuh:");
      for (const s of selisih) console.error(`   ${s}`);
      console.error(
        `Basis data tujuan dibiarkan untuk diperiksa; ia tidak terdaftar, jadi tidak dibuka siapa pun.`
      );
      process.exit(1);
    }
    const tabel = Object.keys(hitungAsal).length;
    const baris = Object.values(hitungAsal).reduce((a, b) => a + b, 0);
    console.log(`✓ ${tabel} tabel, ${baris} baris — sama persis`);

    // ── 4. Balik registry ────────────────────────────────────────────
    const flipped = await control.company.updateMany({
      where: { id: company.id, dbInstanceKey: company.dbInstanceKey, isActive: false },
      data: { dbInstanceKey: args.to },
    });
    if (flipped.count !== 1) {
      console.error(
        "✗ Registry TIDAK dibalik: baris perusahaan berubah selama pemindahan (instans lain, " +
          "atau diaktifkan lagi). Salinan tujuan sudah lengkap tetapi tidak terdaftar — periksa dulu."
      );
      process.exit(1);
    }
    console.log(`✓ registry: ${label(company.dbInstanceKey)} → ${label(args.to)}`);

    // ── 5. Pensiunkan salinan asal ───────────────────────────────────
    let renamed = true;
    const c = await pgFor(sourceServer, "postgres");
    try {
      await c.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [source.databaseName]
      );
      await c.query(`ALTER DATABASE "${source.databaseName}" RENAME TO "${retired}"`);
      console.log(`✓ salinan asal → ${retired}`);
    } catch (error) {
      renamed = false;
      console.error(
        `⚠ Salinan asal GAGAL diganti nama (${String(error)}). Registry SUDAH menunjuk tujuan; ` +
          `ganti nama ${source.databaseName} di ${where(sourceServer)} dengan tangan sebelum ` +
          "mengaktifkan PT ini lagi."
      );
    } finally {
      await c.end().catch(() => {});
    }

    // ── 6. Jejak ─────────────────────────────────────────────────────
    if (company.tenant) {
      const actor = `cli:${process.env.USER ?? "unknown"}`;
      await writeTenantAuditLog({
        tenantId: company.tenant.id,
        tenantSlug: company.tenant.slug,
        userId: actor,
        username: actor,
        action: "tenant.company.move",
        details: {
          companySlug: company.slug,
          databaseName: source.databaseName,
          from: label(company.dbInstanceKey),
          to: label(args.to),
          retiredAs: renamed ? retired : null,
          tables: tabel,
          rows: baris,
          reason: args.reason,
        },
      });
    }

    console.log(
      "\nSelesai. Berikutnya:\n" +
        "  • tunggu ≥ 60 detik (TTL cache registry), lalu aktifkan lagi PT ini;\n" +
        "  • buka bukunya dan periksa satu laporan;\n" +
        `  • ${retired} di instans ${label(company.dbInstanceKey)} adalah jalan balik — ` +
        "hapus dengan sadar sesudah buku di tujuan terbukti (docs/MULTI-COMPANY.md)."
    );
    if (!renamed) process.exit(2);
  } finally {
    await control.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
