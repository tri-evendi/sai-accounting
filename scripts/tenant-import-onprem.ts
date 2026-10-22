/**
 * PASANG BUNDEL SERAH-TERIMA DI PEMASANGAN ON-PREMISE YANG BARU.
 * Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md.
 *
 *   bun run tenant:import-onprem -- --bundle <berkas.saibundle> --dry-run   # periksa saja
 *   bun run tenant:import-onprem -- --bundle <berkas.saibundle>
 *
 * Sandi bundel ditanyakan lewat prompt tersembunyi (atau env
 * `SAI_BUNDLE_PASSPHRASE` untuk otomasi) — tidak pernah lewat argumen.
 *
 * ══ UNTUK PEMASANGAN KOSONG SAJA ════════════════════════════════════════════
 * Jalankan SESUDAH layanan `migrate` dan SEBELUM — sebagai GANTI — `bootstrap`.
 * Id tenant, pengguna, dan perusahaan dibawa APA ADANYA, karena buku besar
 * merujuknya: `created_by` jurnal menunjuk id pengguna global, dan
 * `documents.filepath` berawalan id perusahaan. Menerjemahkan id berarti
 * menulis ulang setiap buku; memakai pemasangan kosong berarti tidak perlu.
 * Karena itu impor MENOLAK bila `tenants`/`users`/`companies`/keanggotaan di
 * basis data kendali tujuan tidak kosong.
 *
 * ══ URUTANNYA — TIDAK ADA YANG DISENTUH SEBELUM SEMUANYA TERBUKTI ═══════════
 *   1. Buka sandi + bongkar ke direktori kerja (sandi salah berhenti di sini).
 *   2. Periksa: format, sidik jari SETIAP berkas, berkas tak diumumkan, kepala
 *      migration bundel = kode image ini = basis data kendali tujuan,
 *      pemasangan kosong, nama basis data & direktori dokumen bebas, kunci
 *      SETTINGS_ENCRYPTION_KEY tersedia bila ada rahasia. `--dry-run` berhenti.
 *   3. Pulihkan setiap buku (`pg_restore --single-transaction`), lalu buktikan:
 *      jumlah baris setiap tabel DAN neraca saldo ringkas = manifes.
 *   4. Segel ulang server key pembayaran dengan kunci TUJUAN.
 *   5. Salin dokumen.
 *   6. Baris kendali dalam SATU transaksi (registry paling akhir — pola
 *      `tenant:move`), lalu setel ulang sequence.
 * Gagal di 3–6 = buku yang sudah dibuat di-DROP dan dokumen yang sudah
 * disalin dihapus: pemasangannya kembali kosong dan impor bisa diulang.
 *
 * ⚠ JALANKAN DI IMAGE `backup` dengan volume dokumen yang BISA DITULIS:
 *   docker compose -f docker-compose.yml -f docker-compose.onprem.yml run --rm \
 *     -v "$PWD/serah-terima:/serah-terima:ro" -v sai-accounting_documents:/app/data/documents \
 *     job-backup bun run tenant:import-onprem -- --bundle /serah-terima/<berkas>
 */
import "dotenv/config";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";
import { bukaServer } from "@sai/db/server";
import { instanceServerUrl } from "@sai/db/company-url";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { encryptionKey, encryptionKeyAvailable, sealSecret } from "@sai/core/settings-crypto";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";

import { DOCUMENTS_ROOT } from "../src/lib/document-storage";
import { countMismatches } from "../src/lib/tenant-move";
import {
  PASSPHRASE_ENV,
  checksumProblems,
  decodeRows,
  importRefusals,
  isSafeBundlePath,
  trialBalanceMismatches,
  type BundleManifest,
} from "../src/lib/onprem-migration";
import { argValue, askHidden, listFiles, openBundle } from "./lib/bundle-io";
import {
  directServerUrl,
  migrationHead,
  pgFor,
  restoreFromFile,
  rowCounts,
  sha256File,
  trialBalanceDigest,
  where,
} from "./lib/pg-tools";

import type {
  Company,
  Membership,
  Tenant,
  TenantAuditLog,
  TenantMailSetting,
  TenantMembership,
  User,
} from "@sai/db/client/control";

const USAGE = "Pakai: bun run tenant:import-onprem -- --bundle <berkas.saibundle> [--dry-run] [--work-dir <dir>] [--documents-dir <dir>]";

interface ControlRows {
  tenant: Tenant;
  companies: Company[];
  users: User[];
  memberships: Membership[];
  tenantMemberships: TenantMembership[];
  mailSetting: TenantMailSetting | null;
  tenantAuditLogs: TenantAuditLog[];
}

interface Secrets {
  mailPassword: string | null;
  companyPaymentKeys: Record<string, Array<{ id: number; serverKey: string }>>;
}

/** Tabel kendali yang id-nya DIBAWA — sequence-nya disetel ulang sesudahnya. */
const ID_PRESERVING_TABLES = ["tenants", "users", "companies", "memberships", "tenant_memberships"] as const;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const bundleArg = argValue(argv, "--bundle");
  const dryRun = argv.includes("--dry-run");
  const documentsRoot = path.resolve(argValue(argv, "--documents-dir") ?? DOCUMENTS_ROOT);
  if (!bundleArg) {
    console.error(USAGE);
    process.exit(1);
  }
  const bundle = path.resolve(bundleArg);
  const controlRaw = process.env.CONTROL_DATABASE_URL;
  if (!controlRaw) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  const passphrase = process.env[PASSPHRASE_ENV]?.trim() || (await askHidden("Sandi bundel: "));
  if (!passphrase) {
    console.error("✗ sandi bundel kosong.");
    process.exit(1);
  }

  const work = await mkdtemp(path.join(argValue(argv, "--work-dir") ?? os.tmpdir(), "sai-onprem-import-"));
  const controlUrl = new URL(controlRaw);
  const control = new ControlClient({ adapter: buatAdapter(controlUrl.toString(), { batasKoneksi: 2 }) });
  const createdDatabases: string[] = [];
  const copiedDocumentDirs: string[] = [];
  let committed = false;
  const server = directServerUrl(instanceServerUrl(null));

  try {
    // ── 1. Buka ───────────────────────────────────────────────────────────
    console.log(`Membuka ${path.basename(bundle)}…`);
    try {
      await openBundle(bundle, work, passphrase);
    } catch (error) {
      console.error(
        `✗ bundel tidak bisa dibuka (${error instanceof Error ? error.message : error}). ` +
          "Sandi salah, atau berkasnya rusak/terpotong saat dikirim — bandingkan sha256-nya " +
          "dengan yang dicetak saat ekspor."
      );
      process.exit(1);
    }

    // ── 2. Periksa ────────────────────────────────────────────────────────
    const present = await listFiles(work);
    const unsafe = present.filter((p) => !isSafeBundlePath(p));
    if (unsafe.length > 0 || !present.includes("manifest.json")) {
      console.error(`✗ isi bundel tidak berbentuk bundel serah-terima: ${unsafe.join(", ") || "manifest.json hilang"}`);
      process.exit(1);
    }
    const manifest = JSON.parse(await readFile(path.join(work, "manifest.json"), "utf8")) as BundleManifest;
    const actual: Record<string, string> = {};
    for (const rel of present) if (rel !== "manifest.json") actual[rel] = await sha256File(path.join(work, rel));

    const expectedHeads = { control: MIGRATION_TERAKHIR.control, company: MIGRATION_TERAKHIR.company };
    const targetControlHead = await migrationHead(controlUrl, controlUrl.pathname.replace(/^\//, ""));
    const [tenants, users, companies, memberships, tenantMemberships] = await Promise.all([
      control.tenant.count(),
      control.user.count(),
      control.company.count(),
      control.membership.count(),
      control.tenantMembership.count(),
    ]);
    const existingDatabases: string[] = [];
    const srv = await bukaServer(server.toString());
    try {
      for (const c of manifest.companies ?? []) {
        if ((await srv.adakah(c.databaseName)) && (await srv.jumlahTabel(c.databaseName)) > 0) {
          existingDatabases.push(c.databaseName);
        }
      }
    } finally {
      await srv.tutup();
    }
    const occupiedDocumentDirs: number[] = [];
    for (const c of manifest.companies ?? []) {
      const entries = await readdir(path.join(documentsRoot, String(c.id))).catch(() => []);
      if (entries.length > 0) occupiedDocumentDirs.push(c.id);
    }
    /* Dibuktikan dengan MENULIS, bukan dengan membaca mode: volume `:ro`
       melaporkan izin tulis yang tampak sah sampai `write` pertama gagal. */
    let documentsWritable = true;
    if ((manifest.companies ?? []).some((c) => c.documentFiles > 0)) {
      const probe = path.join(documentsRoot, `.tulis-uji-${process.pid}`);
      try {
        await mkdir(documentsRoot, { recursive: true });
        await writeFile(probe, "");
        await rm(probe, { force: true });
      } catch {
        documentsWritable = false;
      }
    }
    const secrets = JSON.parse(await readFile(path.join(work, "secrets.json"), "utf8").catch(() => "{}")) as Secrets;
    const secretsPresent =
      Boolean(secrets.mailPassword) || Object.keys(secrets.companyPaymentKeys ?? {}).length > 0;

    const refusals = importRefusals({
      manifest,
      expectedHeads,
      targetControlHead,
      targetCounts: { tenants, users, companies, memberships, tenantMemberships },
      existingDatabases,
      occupiedDocumentDirs,
      documentsWritable,
      checksumProblems: checksumProblems(manifest.files ?? {}, actual),
      secretsPresent,
      encryptionKeyAvailable: encryptionKeyAvailable(),
    });

    console.log(`Bundel      : ${manifest.tenant?.name} (${manifest.tenant?.slug}) — dibuat ${manifest.createdAt} oleh SAI ${manifest.appVersion}`);
    console.log(`Tujuan      : kendali ${controlUrl.pathname.slice(1)} · buku di ${where(server)} · dokumen ${documentsRoot}`);
    for (const c of manifest.companies ?? []) {
      const rows = Object.values(c.rowCounts).reduce((a, b) => a + b, 0);
      console.log(`  • ${c.slug} → ${c.databaseName}: ${rows} baris, ${c.documentFiles} dokumen`);
    }
    console.log(
      "Kendali     : " + Object.entries(manifest.controlCounts ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")
    );

    if (refusals.length > 0) {
      console.error(`\n✗ DITOLAK — tidak ada yang ditulis (${refusals.length}):`);
      for (const r of refusals) console.error(`  • ${r.message}`);
      process.exit(1);
    }
    if (dryRun) {
      console.log("\n--dry-run: semua pemeriksaan LULUS; tidak ada yang ditulis.");
      return;
    }

    const rows = decodeRows<ControlRows>(await readFile(path.join(work, "control.json"), "utf8"));
    const key = secretsPresent ? encryptionKey() : null;

    // ── 3–4. Buku ────────────────────────────────────────────────────────
    for (const c of manifest.companies) {
      process.stdout.write(`  ${c.slug}: pg_restore… `);
      const s = await bukaServer(server.toString());
      try {
        if (!(await s.adakah(c.databaseName))) {
          await s.buat(c.databaseName);
        }
        createdDatabases.push(c.databaseName);
      } finally {
        await s.tutup();
      }
      await restoreFromFile(server, c.databaseName, path.join(work, "companies", `${c.databaseName}.pgdump`));
      const counts = await rowCounts(server, c.databaseName);
      const mismatch = countMismatches(c.rowCounts, counts);
      if (mismatch.length > 0) throw new Error(`jumlah baris ${c.slug} tidak sama:\n   ${mismatch.join("\n   ")}`);
      const tb = trialBalanceMismatches(c.trialBalance, await trialBalanceDigest(server, c.databaseName));
      if (tb.length > 0) throw new Error(`neraca saldo ${c.slug} tidak sama:\n   ${tb.join("\n   ")}`);

      const paymentKeys = secrets.companyPaymentKeys?.[c.databaseName] ?? [];
      if (paymentKeys.length > 0) {
        const pg = await pgFor(server, c.databaseName);
        try {
          for (const p of paymentKeys) {
            const sealed = sealSecret(p.serverKey, key!);
            await pg.query(
              `UPDATE company_settings SET payment_server_key_ciphertext = $1,
                      payment_server_key_iv = $2, payment_server_key_tag = $3 WHERE id = $4`,
              [sealed.ciphertext, sealed.iv, sealed.tag, p.id]
            );
          }
        } finally {
          await pg.end().catch(() => {});
        }
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`✓ ${Object.keys(counts).length} tabel, ${total} baris, neraca saldo sama`);
    }

    // ── 5. Dokumen ───────────────────────────────────────────────────────
    for (const c of manifest.companies) {
      if (c.documentFiles === 0) continue;
      const from = path.join(work, "documents", String(c.id));
      const to = path.join(documentsRoot, String(c.id));
      await mkdir(to, { recursive: true });
      copiedDocumentDirs.push(to);
      for (const name of await readdir(from)) await copyFile(path.join(from, name), path.join(to, name));
    }

    // ── 6. Kendali — satu transaksi ──────────────────────────────────────
    const t = rows.tenant;
    const mail = rows.mailSetting;
    const sealedMail = secrets.mailPassword && key ? sealSecret(secrets.mailPassword, key) : null;
    await control.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id: t.id,
          slug: t.slug,
          slugChangedAt: t.slugChangedAt,
          name: t.name,
          /* Di on-premise tidak ada langganan: status `active`, paket
             `internal` (sama dengan `bootstrap`), kuota = saran lisensi.
             Yang membatasi pemasangan ini LISENSI, bukan baris ini. */
          status: "active",
          planKey: "internal",
          trialEndsAt: null,
          maxCompanies: manifest.licence.companies,
          maxUsers: manifest.licence.users,
          frozenAt: null,
          migratedOutAt: null,
          createdAt: t.createdAt,
        },
      });
      await tx.company.createMany({
        data: rows.companies.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          databaseName: c.databaseName,
          isActive: c.isActive,
          isDemo: c.isDemo,
          tenantId: t.id,
          /* Instans bawaan pemasangan ini — satu server, tanpa `db_instances`. */
          dbInstanceKey: null,
          createdAt: c.createdAt,
        })),
      });
      await tx.user.createMany({
        data: rows.users.map((u) => ({
          id: u.id,
          username: u.username,
          password: u.password,
          name: u.name,
          email: u.email,
          emailVerifiedAt: u.emailVerifiedAt,
          /* Pemasangan satu tenant: tamu dari tenant SaaS lain pun berumah di sini. */
          tenantId: t.id,
          mustChangePassword: u.mustChangePassword,
          passDate: u.passDate,
          sessionVersion: u.sessionVersion,
          createdAt: u.createdAt,
        })),
      });
      await tx.membership.createMany({
        data: rows.memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          companyId: m.companyId,
          role: m.role,
          accountantMode: m.accountantMode,
          isActive: m.isActive,
          createdAt: m.createdAt,
        })),
      });
      await tx.tenantMembership.createMany({
        data: rows.tenantMemberships.map((m) => ({
          id: m.id,
          tenantId: t.id,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt,
        })),
      });
      if (mail) {
        await tx.tenantMailSetting.create({
          data: {
            tenantId: t.id,
            transport: mail.transport,
            host: mail.host,
            port: mail.port,
            username: mail.username,
            fromAddress: mail.fromAddress,
            passwordCiphertext: sealedMail?.ciphertext ?? null,
            passwordIv: sealedMail?.iv ?? null,
            passwordTag: sealedMail?.tag ?? null,
            archiveAddress: mail.archiveAddress,
            /* Uji kirim terakhir terjadi dari server SaaS — tidak membuktikan
               apa pun tentang jaringan customer. Dikosongkan: uji ulang. */
            lastTestAt: null,
            lastTestTo: null,
            lastTestStatus: null,
            lastTestMessage: null,
            updatedBy: mail.updatedBy,
          },
        });
      }
      if (rows.tenantAuditLogs.length > 0) {
        await tx.tenantAuditLog.createMany({
          data: rows.tenantAuditLogs.map((a) => ({
            legacyId: a.legacyId,
            tenantId: t.id,
            tenantSlug: a.tenantSlug,
            userId: a.userId,
            username: a.username,
            tenantRole: a.tenantRole,
            action: a.action,
            details: a.details,
            ipAddress: a.ipAddress,
            createdAt: a.createdAt,
          })),
        });
      }
      for (const table of ID_PRESERVING_TABLES) {
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT MAX(id) FROM "${table}"), 1))`
        );
      }
    });
    committed = true;

    await writeTenantAuditLog({
      tenantId: t.id,
      tenantSlug: t.slug,
      userId: `cli:${process.env.USER ?? "unknown"}`,
      username: `cli:${process.env.USER ?? "unknown"}`,
      action: "tenant.onprem.import",
      details: {
        bundleCreatedAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        companies: manifest.companies.map((c) => c.slug),
        users: rows.users.length,
      },
    });

    console.log(
      `\n✓ SELESAI: ${manifest.companies.length} buku, ${rows.users.length} pengguna, ` +
        `${rows.memberships.length} keanggotaan.\n\n` +
        "Berikutnya:\n" +
        "  • pasang berkas lisensi (./lisensi/licence.sai) — tanpanya modul dibatasi ke inti;\n" +
        "  • `docker compose … up -d`, lalu pengguna masuk dengan surel & kata sandi LAMA mereka;\n" +
        "  • buka satu laporan Neraca Saldo per perusahaan dan cocokkan dengan SaaS;\n" +
        "  • token API TIDAK ikut — buat ulang di Pengaturan bila ada integrasi;\n" +
        "  • undangan yang belum diterima TIDAK ikut — kirim ulang;\n" +
        (mail ? "  • setel ulang & UJI KIRIM SMTP (uji lama dari server SaaS dikosongkan);\n" : "") +
        "  • hapus berkas bundel dari mesin ini sesudah semuanya terbukti — ia memuat hash kata sandi."
    );
  } catch (error) {
    if (!committed) await rollback(server, createdDatabases, copiedDocumentDirs);
    throw error;
  } finally {
    await control.$disconnect();
    await rm(work, { recursive: true, force: true });
  }
}

/** Kembalikan pemasangan ke keadaan kosong — impor bisa diulang. */
async function rollback(server: URL, databases: string[], documentDirs: string[]): Promise<void> {
  if (databases.length === 0 && documentDirs.length === 0) return;
  console.error("\n✗ impor GAGAL — membatalkan yang sudah dibuat…");
  const s = await bukaServer(server.toString());
  try {
    for (const db of databases) {
      try {
        await s.hapus(db);
        console.error(`  basis data ${db} di-DROP`);
      } catch (e) {
        console.error(`  ⚠ ${db} GAGAL di-DROP (${String(e)}) — hapus dengan tangan sebelum mengulang`);
      }
    }
  } finally {
    await s.tutup();
  }
  for (const dir of documentDirs) await rm(dir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
