/**
 * EKSEKUSI permintaan penghapusan akun (issue #142) — di tangan OPERATOR,
 * bergerbang bukti seperti adopsi #134: penghancuran menuntut manusia yang
 * membaca apa yang akan terjadi lalu mengetik ulang nama tenantnya.
 *
 *   bunx tsx scripts/execute-tenant-deletion.ts --tenant <slug> --confirm <slug>
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
 * PENGHANCURAN BUKU (--drop-ledgers) adalah gerbang KEDUA yang dalam praktik
 * baru terbuka bertahun-tahun kemudian: ia menolak (`ledgerDropVerdict`)
 * sebelum permintaan berstatus `executed` DAN `retention_until` lewat. Inilah
 * kebijakan retensi yang "ditegakkan di kode": tidak ada jalur lain yang
 * menghapus basis data perusahaan.
 */

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";

import {
  anonymizedUserFields,
  executionVerdict,
  ledgerDropVerdict,
  retentionUntilFrom,
} from "../src/lib/tenant-deletion";
import { writeTenantAuditLog } from "../src/lib/tenant-audit";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function controlClient(raw: string): ControlClient {
  const url = new URL(raw);
  return new ControlClient({
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

/** Tanggal jurnal termuda sebuah buku — jangkar retensi UU KUP. Buku yang tak
 *  terjangkau TIDAK menggagalkan eksekusi: retensi jatuh ke jangkar paling
 *  konservatif (sekarang) dan itu tercetak. */
async function latestJournalDate(controlUrl: string, databaseName: string): Promise<Date | null> {
  const url = new URL(controlUrl);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    connectionLimit: 1,
  });
  try {
    const rows = (await pool.query("SELECT MAX(`date`) AS latest FROM journals")) as {
      latest: Date | null;
    }[];
    return rows[0]?.latest ?? null;
  } catch (error) {
    console.warn(`  ⚠ ${databaseName}: tak terbaca (${String(error)}) — jangkar retensi jatuh ke hari ini`);
    return null;
  } finally {
    await pool.end();
  }
}

async function main() {
  const slug = argValue("--tenant");
  const confirm = argValue("--confirm");
  const dropLedgers = process.argv.includes("--drop-ledgers");

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }
  if (!slug) {
    console.error(
      "Pakai: bunx tsx scripts/execute-tenant-deletion.ts --tenant <slug> --confirm <slug> [--drop-ledgers]"
    );
    process.exit(1);
  }

  const control = controlClient(controlUrl);
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
      username: `operator (${process.env.USER ?? "cli"})`,
      action: "tenant.deletion.execute",
      details: { phase: "drop_ledgers", requestId: executed!.id, companies: companies.map((c) => c.slug) },
    });
    console.log(`✓ ${companies.length} buku dihancurkan setelah masa retensi. Selesai.`);
    await control.$disconnect();
    return;
  }

  /* ── Gerbang 1: eksekusi (nonaktif + anonimisasi) ──────────────────────── */
  const request = await control.tenantDeletionRequest.findFirst({
    where: { tenantId: tenant.id, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, graceEndsAt: true, requestedByUserId: true },
  });
  if (!request) {
    console.error(
      "DITOLAK: tidak ada permintaan penghapusan berstatus pending untuk tenant ini.\n" +
        "Penghapusan HANYA berjalan atas permintaan eksplisit pemiliknya (UU PDP) —\n" +
        "tidak ada jalur lain, dan memang tidak boleh ada."
    );
    process.exit(1);
  }
  const verdict = executionVerdict(request);
  if (verdict === "grace_active") {
    console.error(
      `DITOLAK: masa tenggang belum lewat (sampai ${request.graceEndsAt.toISOString()}).\n` +
        "Pemilik masih boleh berubah pikiran; kembalilah setelah tanggal itu."
    );
    process.exit(1);
  }

  console.log(`Eksekusi penghapusan tenant "${tenant.name}" (${tenant.slug}):`);
  console.log(`  ${companies.length} PT dinonaktifkan (bukunya TIDAK disentuh)`);
  console.log(`  ${users.length} akun dianonimkan (UU PDP)`);
  if (confirm !== slug) {
    console.error(`\nDITOLAK: baca daftar di atas, lalu ketik ulang: --confirm ${slug}`);
    process.exit(1);
  }

  // Jangkar retensi: entri jurnal termuda di seluruh buku.
  let latest: Date | null = null;
  for (const company of companies) {
    const d = await latestJournalDate(controlUrl, company.databaseName);
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  const retentionUntil = retentionUntilFrom(latest);

  await control.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { status: "cancelled" } });
    await tx.company.updateMany({ where: { tenantId: tenant.id }, data: { isActive: false } });
    await tx.membership.updateMany({
      where: { userId: { in: users.map((u) => u.id) } },
      data: { isActive: false },
    });
    for (const user of users) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ...anonymizedUserFields(user.id),
          password: randomBytes(32).toString("hex"), // bukan hash bcrypt yang sah → tak ada kata sandi yang cocok
          mustChangePassword: true,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    }
    await tx.registration.deleteMany({
      where: { email: { in: users.map((u) => u.email).filter((e): e is string => Boolean(e)) } },
    });
    await tx.tenantDeletionRequest.update({
      where: { id: request.id },
      data: { status: "executed", executedAt: new Date(), retentionUntil },
    });
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    username: `operator (${process.env.USER ?? "cli"})`,
    action: "tenant.deletion.execute",
    details: {
      phase: "deactivate_anonymize",
      requestId: request.id,
      companies: companies.map((c) => c.slug),
      users: users.length,
      retentionUntil: retentionUntil.toISOString(),
    },
  });

  console.log("\n✓ Selesai. Yang terjadi:");
  console.log("  tenant → cancelled; PT nonaktif; akses & sesi seluruh akun dicabut;");
  console.log("  data pribadi dianonimkan; buku besar TETAP tersimpan.");
  console.log(`  retention_until = ${retentionUntil.toISOString()}`);
  console.log(
    "  Penghancuran buku baru bisa SETELAH tanggal itu:\n" +
      `    bunx tsx scripts/execute-tenant-deletion.ts --tenant ${slug} --confirm ${slug} --drop-ledgers`
  );

  await control.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
