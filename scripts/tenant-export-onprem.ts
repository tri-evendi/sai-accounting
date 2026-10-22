/**
 * EKSPOR SATU TENANT SaaS KE BUNDEL SERAH-TERIMA ON-PREMISE.
 * Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md.
 *
 *   bun run tenant:export-onprem -- --tenant <slug> --dry-run   # lihat isinya, tidak menulis apa pun
 *   bun run tenant:export-onprem -- --tenant <slug>             # bekukan + ambil bundel
 *
 * Opsional: `--out <dir>` (bawaan `data/cadangan`), `--reason "<…>"` (bawaan
 * "pindah ke on-premise"). Sandi bundel DIBANGKITKAN dan dicetak SEKALI ke
 * terminal; untuk otomasi, berikan sendiri lewat env `SAI_BUNDLE_PASSPHRASE`.
 *
 * ══ URUTANNYA ═══════════════════════════════════════════════════════════════
 *   1. Baca & periksa SEMUANYA lebih dulu (kepala migration setiap basis data,
 *      rahasia yang bisa dibuka). `--dry-run` berhenti di sini — tanpa
 *      pembekuan, tanpa satu baris pun ditulis.
 *   2. BEKUKAN tenant (`tenants.frozen_at`): penjaga menolak setiap izin tulis,
 *      penerbit dokumen berulang melewatinya. Baca & ekspor tetap jalan.
 *   3. TUNGGU `FREEZE_SETTLE_MS` sejak pembekuan (TTL cache status di proses
 *      aplikasi), lalu tunggu antrean `jobs` milik PT-nya kosong.
 *   4. `pg_dump -Fc` setiap buku + jumlah baris + neraca saldo ringkas,
 *      salin dokumen, tulis baris kendali + rahasia + manifes bersidik jari.
 *   5. `tar | openssl enc` menjadi SATU berkas; direktori kerja dihapus.
 *
 * Pembekuan TIDAK dicabut di akhir: dari titik ini buku SaaS harus tetap diam
 * sampai customer menyatakan on-premise-nya berjalan (`tenant:mark-migrated-out`)
 * atau serah-terima dibatalkan (`tenant:unfreeze`). Tulisan di SaaS sesudah
 * dump adalah tulisan yang tidak pernah sampai ke on-premise.
 *
 * ⚠ JALANKAN DI IMAGE `backup`:
 *   docker compose run --rm job-backup bun run tenant:export-onprem -- --tenant <slug>
 * Ia membawa `pg_dump` 17, `openssl`, URL PostgreSQL LANGSUNG (bukan PgBouncer),
 * volume dokumen (hanya-baca), dan `data/cadangan` yang bisa ditulis.
 *
 * TIDAK membaca `sai_platform`: penagihan tidak ikut pindah. Ringkasan paket
 * dibaca dari salinan kendali (`plan_key`, kuota).
 */
import "dotenv/config";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  instanceServerUrl,
  toCompanyDatabaseTarget,
} from "@sai/db/company-url";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { encryptionKey, openSecret } from "@sai/core/settings-crypto";
import { FREEZE_SETTLE_MS, freezeSettledAt } from "@sai/core/tenant-migration";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";

import { freezeTenant } from "../apps/operator/src/lib/operator/onprem-cutover";
import { DOCUMENTS_ROOT, isStorageKey } from "../src/lib/document-storage";
import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  PASSPHRASE_ENV,
  bundleFileName,
  encodeRows,
  exportRefusals,
  generatePassphrase,
  licenceSuggestion,
  passphraseProblem,
  type BundleCompany,
  type BundleManifest,
} from "../src/lib/onprem-migration";
import { argValue, sealBundle } from "./lib/bundle-io";
import {
  directServerUrl,
  dumpToFile,
  migrationHead,
  pgFor,
  rowCounts,
  sha256File,
  trialBalanceDigest,
} from "./lib/pg-tools";

const USAGE =
  "Pakai: bun run tenant:export-onprem -- --tenant <slug> [--dry-run] [--out <dir>] [--reason \"…\"]";

/**
 * Server tempat buku hidup, LANGSUNG (bukan PgBouncer). Instans bawaan boleh
 * dialihkan ke `DATABASE_URL` image `backup` (server yang sama); instans lain
 * tidak — server lain yang kebetulan bernama sama akan di-dump diam-diam.
 */
function dumpServerFor(instance: Parameters<typeof instanceServerUrl>[0]): URL {
  const url = instanceServerUrl(instance);
  if (instance === null) return directServerUrl(url);
  if (/pgbouncer/i.test(url.hostname)) {
    throw new Error(`instans ${instance.key} menunjuk PgBouncer — pg_dump harus langsung ke PostgreSQL`);
  }
  return url;
}

/** Batas menunggu antrean `jobs` milik PT tenant ini kosong. */
const JOB_DRAIN_TIMEOUT_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function appVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
}

/** Berkas dokumen satu PT yang namanya berbentuk kunci penyimpanan sah. */
async function companyDocumentFiles(
  documentsRoot: string,
  companyId: number
): Promise<{ files: string[]; skipped: number }> {
  const dir = path.join(documentsRoot, String(companyId));
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { files: [], skipped: 0 };
  }
  const files: string[] = [];
  let skipped = 0;
  for (const name of names.sort()) {
    const st = await stat(path.join(dir, name));
    if (st.isFile() && isStorageKey(`${companyId}/${name}`)) files.push(name);
    else skipped += 1;
  }
  return { files, skipped };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const documentsRoot = path.resolve(argValue(argv, "--documents-dir") ?? DOCUMENTS_ROOT);
  const slug = argValue(argv, "--tenant");
  const dryRun = argv.includes("--dry-run");
  const outDir = path.resolve(argValue(argv, "--out") ?? path.join("data", "cadangan"));
  const reason = (argValue(argv, "--reason") ?? "pindah ke on-premise").trim();
  if (!slug) {
    console.error(USAGE);
    process.exit(1);
  }
  const controlRaw = process.env.CONTROL_DATABASE_URL;
  if (!controlRaw) {
    console.error("CONTROL_DATABASE_URL belum diset — registry tenant tidak terbaca.");
    process.exit(1);
  }
  const controlUrl = new URL(controlRaw);
  const control = new ControlClient({ adapter: buatAdapter(controlUrl.toString(), { batasKoneksi: 2 }) });
  const actor = { operator: `cli:${process.env.USER ?? "unknown"}`, reason };

  try {
    // ── 1. Baca & periksa ────────────────────────────────────────────────
    const tenant = await control.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.error(`✗ tenant "${slug}" tidak ditemukan.`);
      process.exit(1);
    }
    const companies = await control.company.findMany({
      where: { tenantId: tenant.id },
      include: { dbInstance: COMPANY_DATABASE_TARGET_SELECT.dbInstance },
      orderBy: { id: "asc" },
    });
    const companyIds = companies.map((c) => c.id);
    const memberships = await control.membership.findMany({
      where: { companyId: { in: companyIds } },
      orderBy: { id: "asc" },
    });
    const tenantMemberships = await control.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      orderBy: { id: "asc" },
    });
    const homeUsers = await control.user.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    const userIds = [
      ...new Set([
        ...homeUsers.map((u) => u.id),
        ...memberships.map((m) => m.userId),
        ...tenantMemberships.map((m) => m.userId),
      ]),
    ].sort((a, b) => a - b);
    const users = await control.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" } });
    const guests = users.filter((u) => u.tenantId !== tenant.id).length;
    const mailSetting = await control.tenantMailSetting.findUnique({ where: { tenantId: tenant.id } });
    const auditLogs = await control.tenantAuditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { id: "asc" },
    });

    const leftBehind: Record<string, number> = {
      api_tokens: await control.apiToken.count({ where: { companyId: { in: companyIds } } }),
      invitations: await control.invitation.count({ where: { tenantId: tenant.id } }),
      notifications: await control.notification.count({ where: { userId: { in: userIds } } }),
      password_reset_tokens: await control.passwordResetToken.count({ where: { userId: { in: userIds } } }),
      tenant_deletion_requests: await control.tenantDeletionRequest.count({ where: { tenantId: tenant.id } }),
      tenant_slug_history: await control.tenantSlugHistory.count({ where: { tenantId: tenant.id } }),
      jobs: await control.job.count({
        where: { OR: [{ tenantId: tenant.id }, { companyId: { in: companyIds } }] },
      }),
      memberships_other_tenants: await control.membership.count({
        where: { userId: { in: userIds }, companyId: { notIn: companyIds } },
      }),
      tenant_memberships_other_tenants: await control.tenantMembership.count({
        where: { userId: { in: userIds }, tenantId: { not: tenant.id } },
      }),
    };

    // Buku: jangkauan, kepala migration, rahasia tersegel.
    const targets = companies.map((c) => ({ company: c, target: toCompanyDatabaseTarget(c) }));
    const companyFacts: Array<{ slug: string; databaseName: string; head: string | null; reachable: boolean }> = [];
    const paymentSecrets: Record<string, Array<{ id: number; ciphertext: string; iv: string; tag: string }>> = {};
    for (const { company, target } of targets) {
      const server = dumpServerFor(target.dbInstance);
      try {
        const head = await migrationHead(server, target.databaseName);
        const c = await pgFor(server, target.databaseName);
        try {
          const r = await c.query<{ id: number; c: string; iv: string; tag: string }>(
            `SELECT id, payment_server_key_ciphertext AS c, payment_server_key_iv AS iv,
                    payment_server_key_tag AS tag
               FROM company_settings WHERE payment_server_key_ciphertext IS NOT NULL ORDER BY id`
          );
          if (r.rows.length > 0) {
            paymentSecrets[target.databaseName] = r.rows.map((x) => ({
              id: x.id,
              ciphertext: x.c,
              iv: x.iv,
              tag: x.tag,
            }));
          }
        } finally {
          await c.end().catch(() => {});
        }
        companyFacts.push({ slug: company.slug, databaseName: target.databaseName, head, reachable: true });
      } catch {
        companyFacts.push({ slug: company.slug, databaseName: target.databaseName, head: null, reachable: false });
      }
    }

    // Rahasia: buka SEKARANG, sebelum pembekuan — kunci yang salah ketahuan
    // sebelum ada yang berubah.
    let secretsReadable = true;
    const secrets: { mailPassword: string | null; companyPaymentKeys: Record<string, Array<{ id: number; serverKey: string }>> } = {
      mailPassword: null,
      companyPaymentKeys: {},
    };
    const hasMailSecret = Boolean(mailSetting?.passwordCiphertext && mailSetting.passwordIv && mailSetting.passwordTag);
    if (hasMailSecret || Object.keys(paymentSecrets).length > 0) {
      try {
        const key = encryptionKey();
        if (hasMailSecret) {
          secrets.mailPassword = openSecret(
            { ciphertext: mailSetting!.passwordCiphertext!, iv: mailSetting!.passwordIv!, tag: mailSetting!.passwordTag! },
            key
          );
        }
        for (const [db, rows] of Object.entries(paymentSecrets)) {
          secrets.companyPaymentKeys[db] = rows.map((r) => ({
            id: r.id,
            serverKey: openSecret({ ciphertext: r.ciphertext, iv: r.iv, tag: r.tag }, key),
          }));
        }
      } catch {
        secretsReadable = false;
      }
    }

    const controlHead = await migrationHead(controlUrl, controlUrl.pathname.replace(/^\//, ""));
    const expectedHeads = { control: MIGRATION_TERAKHIR.control, company: MIGRATION_TERAKHIR.company };
    const refusals = exportRefusals({
      tenantFound: true,
      tenantStatus: tenant.status,
      companies: companyFacts,
      controlHead,
      expectedHeads,
      secretsReadable,
    });

    const version = await appVersion();
    const licence = licenceSuggestion({
      customer: tenant.name,
      planKey: tenant.planKey,
      maxCompanies: tenant.maxCompanies,
      maxUsers: tenant.maxUsers,
      companyCount: companies.length,
      userCount: users.length,
      appVersion: version,
    });

    console.log(`Tenant      : ${tenant.name} (${tenant.slug}, #${tenant.id}) — status ${tenant.status}`);
    console.log(`Paket       : ${tenant.planKey} — kuota ${tenant.maxCompanies} PT / ${tenant.maxUsers} pengguna`);
    console.log(`Versi       : SAI ${version} · kendali ${controlHead ?? "—"} · buku ${expectedHeads.company}`);
    console.log(`Perusahaan  : ${companies.length}`);
    for (const c of companies) {
      console.log(`  • ${c.slug} (${c.databaseName})${c.isActive ? "" : " [nonaktif]"}${c.isDemo ? " [contoh]" : ""}`);
    }
    console.log(`Pengguna    : ${users.length} (${guests} tamu dari tenant lain — identitas + keanggotaan di sini saja)`);
    console.log(`Keanggotaan : ${memberships.length} per-PT, ${tenantMemberships.length} tingkat tenant`);
    console.log(`Jejak tenant: ${auditLogs.length} baris`);
    console.log(
      `Rahasia     : SMTP ${hasMailSecret ? "ada" : "tidak ada"}, server key pembayaran di ` +
        `${Object.keys(paymentSecrets).length} buku`
    );
    console.log("Ditinggal   : " + Object.entries(leftBehind).map(([k, v]) => `${k}=${v}`).join(", "));
    if (tenant.frozenAt) console.log(`Pembekuan   : SUDAH beku sejak ${tenant.frozenAt.toISOString()}`);
    console.log(`\nLisensi on-premise yang disarankan (maks(pemakaian, kuota paket)):\n  ${licence.command}`);

    if (refusals.length > 0) {
      console.error(`\n✗ DITOLAK (${refusals.length}):`);
      for (const r of refusals) console.error(`  • ${r.message}`);
      process.exit(1);
    }
    if (dryRun) {
      console.log("\n--dry-run: tidak ada yang dibekukan maupun ditulis.");
      return;
    }

    const supplied = process.env[PASSPHRASE_ENV]?.trim();
    const passphrase = supplied || generatePassphrase();
    const problem = passphraseProblem(passphrase);
    if (problem) {
      console.error(`✗ ${PASSPHRASE_ENV}: ${problem}.`);
      process.exit(1);
    }

    // ── 2. Bekukan ───────────────────────────────────────────────────────
    const frozen = await freezeTenant({ control }, { tenantRef: { id: tenant.id }, actor });
    if (frozen.outcome !== "frozen" && frozen.outcome !== "already_frozen") {
      console.error(`✗ pembekuan gagal: ${frozen.outcome}`);
      process.exit(1);
    }
    console.log(`\n✓ tenant DIBEKUKAN sejak ${frozen.frozenAt.toISOString()} — buku SaaS kini hanya-baca.`);
    console.log(`  Jalan balik bila serah-terima batal: bun run tenant:unfreeze -- --tenant ${slug} --reason "…"`);

    // ── 3. Tunggu tulisan terakhir mengendap ─────────────────────────────
    const settle = freezeSettledAt(frozen.frozenAt).getTime() - Date.now();
    if (settle > 0) {
      console.log(`  menunggu ${Math.ceil(settle / 1000)} detik (TTL cache status di proses aplikasi, ${FREEZE_SETTLE_MS / 1000} detik)…`);
      await sleep(settle);
    }
    const drainUntil = Date.now() + JOB_DRAIN_TIMEOUT_MS;
    for (;;) {
      const pending = await control.job.findMany({
        where: { companyId: { in: companyIds }, status: { in: ["queued", "claimed", "failed"] } },
        select: { id: true, kind: true, status: true },
      });
      if (pending.length === 0) break;
      if (Date.now() > drainUntil) {
        console.error(
          `✗ ${pending.length} pekerjaan antrean milik PT tenant ini belum selesai sesudah ` +
            `${JOB_DRAIN_TIMEOUT_MS / 60_000} menit: ` +
            pending.map((j) => `#${j.id} ${j.kind} (${j.status})`).join(", ") +
            ".\n  Tenant TETAP beku. Selesaikan/batalkan pekerjaannya, lalu jalankan ulang perintah ini."
        );
        process.exit(1);
      }
      console.log(`  menunggu ${pending.length} pekerjaan antrean selesai…`);
      await sleep(5_000);
    }

    // ── 4. Kumpulkan ─────────────────────────────────────────────────────
    await mkdir(outDir, { recursive: true });
    const work = await mkdtemp(path.join(outDir, `.${slug}-onprem-`));
    try {
      await mkdir(path.join(work, "companies"), { mode: 0o700 });
      await mkdir(path.join(work, "documents"), { mode: 0o700 });

      const bundleCompanies: BundleCompany[] = [];
      let documentSkipped = 0;
      for (const { company, target } of targets) {
        const server = dumpServerFor(target.dbInstance);
        const file = path.join(work, "companies", `${target.databaseName}.pgdump`);
        process.stdout.write(`  ${company.slug}: pg_dump… `);
        await dumpToFile(server, target.databaseName, file);
        const counts = await rowCounts(server, target.databaseName);
        const tb = await trialBalanceDigest(server, target.databaseName);
        const docs = await companyDocumentFiles(documentsRoot, company.id);
        documentSkipped += docs.skipped;
        if (docs.files.length > 0) {
          const dir = path.join(work, "documents", String(company.id));
          await mkdir(dir, { mode: 0o700 });
          for (const name of docs.files) {
            await copyFile(path.join(documentsRoot, String(company.id), name), path.join(dir, name));
          }
        }
        const rows = Object.values(counts).reduce((a, b) => a + b, 0);
        console.log(`${Object.keys(counts).length} tabel, ${rows} baris, ${docs.files.length} dokumen`);
        bundleCompanies.push({
          id: company.id,
          slug: company.slug,
          name: company.name,
          databaseName: target.databaseName,
          isActive: company.isActive,
          isDemo: company.isDemo,
          rowCounts: counts,
          trialBalance: tb,
          documentFiles: docs.files.length,
        });
      }
      if (documentSkipped > 0) {
        console.warn(`  ⚠ ${documentSkipped} entri di direktori dokumen bukan kunci penyimpanan sah — DILEWATI.`);
      }

      const controlRows = {
        tenant,
        /* Relasi instans tidak ikut: di tujuan setiap buku di instans bawaan. */
        companies: companies.map((c) => ({ ...c, dbInstance: undefined })),
        users,
        memberships,
        tenantMemberships,
        /* Kolom sandi DIKOSONGKAN di sini — nilainya pindah lewat secrets.json
           dan disegel ulang dengan kunci tujuan. Ciphertext SaaS tidak berguna
           di sana dan tidak boleh ada yang mengira sebaliknya. */
        mailSetting: mailSetting
          ? { ...mailSetting, passwordCiphertext: null, passwordIv: null, passwordTag: null }
          : null,
        tenantAuditLogs: auditLogs,
      };
      await writeFile(path.join(work, "control.json"), encodeRows(controlRows), { mode: 0o600 });
      await writeFile(path.join(work, "secrets.json"), JSON.stringify(secrets), { mode: 0o600 });

      const files: Record<string, string> = {};
      const entries = ["control.json", "secrets.json"];
      for (const c of bundleCompanies) entries.push(`companies/${c.databaseName}.pgdump`);
      for (const c of bundleCompanies) {
        if (c.documentFiles === 0) continue;
        for (const name of (await readdir(path.join(work, "documents", String(c.id)))).sort()) {
          entries.push(`documents/${c.id}/${name}`);
        }
      }
      for (const rel of entries) files[rel] = await sha256File(path.join(work, rel));

      const manifest: BundleManifest = {
        format: BUNDLE_FORMAT,
        formatVersion: BUNDLE_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        appVersion: version,
        migrationHeads: expectedHeads,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          planKey: tenant.planKey,
          status: tenant.status,
          maxCompanies: tenant.maxCompanies,
          maxUsers: tenant.maxUsers,
        },
        companies: bundleCompanies,
        controlCounts: {
          tenants: 1,
          companies: companies.length,
          users: users.length,
          memberships: memberships.length,
          tenant_memberships: tenantMemberships.length,
          tenant_mail_settings: mailSetting ? 1 : 0,
          tenant_audit_logs: auditLogs.length,
        },
        leftBehind,
        files,
        licence,
      };
      await writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });

      // ── 5. Segel ─────────────────────────────────────────────────────
      const bundle = path.join(outDir, bundleFileName(slug, new Date()));
      await sealBundle(work, ["manifest.json", "companies", "documents", ...entries.filter((e) => !e.includes("/"))], bundle, passphrase);
      const digest = await sha256File(bundle);
      const size = (await stat(bundle)).size;

      await writeTenantAuditLog({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        userId: actor.operator,
        username: actor.operator,
        action: "tenant.onprem.export",
        details: {
          reason,
          bundle: path.basename(bundle),
          sha256: digest,
          bytes: size,
          appVersion: version,
          companies: bundleCompanies.map((c) => c.slug),
          users: users.length,
        },
      });

      console.log(`\n✓ BUNDEL: ${bundle}`);
      console.log(`  ukuran ${(size / 1024 / 1024).toFixed(1)} MB · sha256 ${digest}`);
      if (!supplied) {
        console.log(
          "\n┌─ SANDI BUNDEL — DICETAK SEKALI INI SAJA, TIDAK DISIMPAN DI MANA PUN ─────────\n" +
            `│  ${passphrase}\n` +
            "│  Kirim lewat SALURAN LAIN dari bundelnya (mis. bundel lewat transfer berkas,\n" +
            "│  sandi lewat telepon/pesan ke penanggung jawab customer). Bundel + sandi di satu\n" +
            "│  surel = seluruh pembukuan + hash kata sandi seluruh pengguna, tanpa kunci.\n" +
            "└──────────────────────────────────────────────────────────────────────────────"
        );
      }
      console.log(
        "\nBerikutnya (runbook docs/ONPREM-PINDAH-DARI-SAAS.md):\n" +
          `  • customer memasang SAI ${version} (SAI_TAG=${version}) TANPA bootstrap, lalu:\n` +
          "      bun run tenant:import-onprem -- --bundle <berkas>\n" +
          "  • terbitkan lisensinya (perintah di atas) di mesin luring;\n" +
          `  • sesudah customer menyatakan berjalan: bun run tenant:mark-migrated-out -- --tenant ${slug} --apply --reason "…"`
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  } finally {
    await control.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
