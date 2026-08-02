/**
 * EKSEKUSI permintaan penghapusan akun (issue #142) — di tangan OPERATOR,
 * bergerbang bukti seperti adopsi #134: penghancuran menuntut manusia yang
 * membaca apa yang akan terjadi lalu mengetik ulang nama tenantnya.
 *
 *   bunx tsx scripts/execute-tenant-deletion.ts --tenant <slug> --confirm <slug> --reason "<alasan>"
 *   bunx tsx scripts/execute-tenant-deletion.ts --tenant <slug> --confirm <slug> --drop-ledgers
 *
 * ══ DUA GERBANG, DUA WAKTU ══════════════════════════════════════════════════
 * EKSEKUSI (tanpa --drop-ledgers) hanya boleh bila ada permintaan `pending`
 * yang masa tenggangnya SUDAH lewat (`executionVerdict`). Yang terjadi:
 *   • tenant → `cancelled`; seluruh PT dinonaktifkan; keanggotaan dimatikan;
 *   • data PRIBADI dianonimkan (UU PDP): email/nama/username diganti bentuk
 *     `dihapus-<id>`, kata sandi diacak, seluruh sesi dicabut — BARIS pengguna
 *     tetap ada supaya id yang dirujuk jejak audit tidak menunjuk kekosongan;
 *   • sisa jejak pendaftaran/undangan/token milik pengguna itu dihapus;
 *   • `retention_until` dihitung dan DICATAT: 10 tahun sejak entri jurnal
 *     termuda di seluruh bukunya (atau sejak eksekusi, mana yang lebih lambat).
 * BUKU BESAR TIDAK DISENTUH — satu byte pun.
 *
 * Sejak #155 gerbang 1 ini adalah PEMBUNGKUS TIPIS di atas
 * `executeTenantDeletion` (`src/lib/operator/writes.ts`) yang juga menyalakan
 * tombolnya di konsol operator — satu logika, dua permukaan. Skripnya tetap
 * ada sebagai jalur pemulihan saat konsolnya sendiri tak bisa dibuka, dan
 * kewajibannya sama: `--reason` WAJIB, aktornya tercatat sebagai `cli:<user>`.
 *
 * PENGHANCURAN BUKU (--drop-ledgers) adalah gerbang KEDUA yang dalam praktik
 * baru terbuka bertahun-tahun kemudian: ia menolak (`ledgerDropVerdict`)
 * sebelum permintaan berstatus `executed` DAN `retention_until` lewat. Gerbang
 * ini SENGAJA tidak diberi tombol konsol (#155): ia sah hanya sekali dalam
 * sepuluh tahun, dan gesekan command-line-nya justru yang diinginkan.
 */

import "dotenv/config";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { ledgerDropVerdict } from "../src/lib/tenant-deletion";
import { writeTenantAuditLog } from "../src/lib/tenant-audit";
import {
  executeTenantDeletion,
  makeLatestJournalDateReader,
} from "../src/lib/operator/writes";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, raw: string): T {
  const url = new URL(raw);
  return new Ctor({
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

const USAGE =
  "Pakai: bunx tsx scripts/execute-tenant-deletion.ts --tenant <slug> --confirm <slug> " +
  '--reason "<alasan>" [--drop-ledgers]';

async function main() {
  const slug = argValue("--tenant");
  const confirm = argValue("--confirm");
  const reason = argValue("--reason")?.trim() ?? "";
  const dropLedgers = process.argv.includes("--drop-ledgers");

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }
  if (!slug) {
    console.error(USAGE);
    process.exit(1);
  }

  const control = clientFor(ControlClient, controlUrl);
  const tenant = await control.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  });
  if (!tenant) {
    console.error(`ERROR: tenant "${slug}" tidak ada.`);
    process.exit(1);
  }

  const companies = await control.company.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, slug: true, databaseName: true, isActive: true },
  });
  const users = await control.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, username: true, email: true },
  });

  /* ── Gerbang 2: penghancuran buku — jalur TERPISAH, dicek lebih dulu ───── */
  if (dropLedgers) {
    const executed = await control.tenantDeletionRequest.findFirst({
      where: { tenantId: tenant.id, status: "executed" },
      orderBy: { executedAt: "desc" },
      select: { id: true, status: true, executedAt: true, retentionUntil: true },
    });
    const verdict = ledgerDropVerdict(
      executed ?? { status: "none", executedAt: null, retentionUntil: null }
    );
    if (verdict !== "droppable") {
      console.error(
        verdict === "not_executed"
          ? "DITOLAK: belum ada eksekusi penghapusan yang tercatat — jalankan tanpa --drop-ledgers dulu."
          : `DITOLAK: masa retensi UU KUP belum lewat (retention_until = ${executed!.retentionUntil!.toISOString()}).\n` +
              "Buku dan catatan pembukuan wajib disimpan 10 tahun — tidak ada jalan pintas."
      );
      process.exit(1);
    }
    if (confirm !== slug) {
      console.error(`DITOLAK: penghancuran PERMANEN. Ketik ulang: --confirm ${slug}`);
      process.exit(1);
    }
    for (const company of companies) {
      if (!/^[A-Za-z0-9_]+$/.test(company.databaseName) || !company.databaseName.startsWith("sai_")) {
        console.error(`DITOLAK: nama basis data mencurigakan: ${company.databaseName}`);
        process.exit(1);
      }
      console.log(`  menghancurkan buku ${company.slug} (${company.databaseName})…`);
      await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${company.databaseName}\``);
      await control.company.delete({ where: { id: company.id } });
    }
    await writeTenantAuditLog({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      userId: `cli:${process.env.USER ?? "unknown"}`,
      username: `cli:${process.env.USER ?? "unknown"}`,
      action: "tenant.deletion.execute",
      details: { phase: "drop_ledgers", requestId: executed!.id, companies: companies.map((c) => c.slug) },
    });
    console.log(`✓ ${companies.length} buku dihancurkan setelah masa retensi. Selesai.`);
    await control.$disconnect();
    return;
  }

  /* ── Gerbang 1: eksekusi (nonaktif + anonimisasi) — lewat inti bersama ── */
  if (reason.length < 5) {
    console.error(
      "DITOLAK: --reason WAJIB (minimal 5 karakter) — alasannya ikut tercatat di jejak audit.\n" +
        USAGE
    );
    process.exit(1);
  }

  console.log(`Eksekusi penghapusan tenant "${tenant.name}" (${tenant.slug}):`);
  console.log(`  ${companies.length} PT dinonaktifkan (bukunya TIDAK disentuh)`);
  console.log(`  ${users.length} akun dianonimkan (UU PDP)`);

  const result = await executeTenantDeletion(
    { control, latestJournalDate: makeLatestJournalDateReader(controlUrl) },
    {
      tenantSlug: slug,
      confirmSlug: confirm ?? "",
      actor: { operator: `cli:${process.env.USER ?? "unknown"}`, reason },
    }
  );

  await control.$disconnect();

  switch (result.outcome) {
    case "executed":
      console.log("\n✓ Selesai. Yang terjadi:");
      console.log("  tenant → cancelled; PT nonaktif; akses & sesi seluruh akun dicabut;");
      console.log("  data pribadi dianonimkan; buku besar TETAP tersimpan.");
      console.log(`  retention_until = ${result.retentionUntil.toISOString()}`);
      console.log(
        "  Penghancuran buku baru bisa SETELAH tanggal itu:\n" +
          `    bunx tsx scripts/execute-tenant-deletion.ts --tenant ${slug} --confirm ${slug} --drop-ledgers`
      );
      return;
    case "grace_active":
      console.error(
        `DITOLAK: masa tenggang belum lewat (sampai ${result.graceEndsAt.toISOString()}).\n` +
          "Pemilik masih boleh berubah pikiran; kembalilah setelah tanggal itu."
      );
      process.exit(1);
      return;
    case "no_pending_request":
      console.error(
        "DITOLAK: tidak ada permintaan penghapusan berstatus pending untuk tenant ini.\n" +
          "Penghapusan HANYA berjalan atas permintaan eksplisit pemiliknya (UU PDP) —\n" +
          "tidak ada jalur lain, dan memang tidak boleh ada."
      );
      process.exit(1);
      return;
    case "confirm_mismatch":
      console.error(`\nDITOLAK: baca daftar di atas, lalu ketik ulang: --confirm ${slug}`);
      process.exit(1);
      return;
    case "tenant_not_found":
      console.error(`ERROR: tenant "${slug}" tidak ada.`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
