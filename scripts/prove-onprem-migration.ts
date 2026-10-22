/**
 * BUKTI UJUNG-KE-UJUNG pindah SaaS → on-premise, atas DUA server PostgreSQL
 * SEKALI-PAKAI. Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md §Bukti.
 *
 *   bun run tenant:prove-onprem -- \
 *     --source postgres://u:p@127.0.0.1:55431/postgres \
 *     --target postgres://u:p@127.0.0.1:55432/postgres
 *
 * Yang dijalankan adalah SKRIP SUNGGUHAN (`tenant:export-onprem`,
 * `tenant:import-onprem`, `tenant:mark-migrated-out`, `tenant:unfreeze`)
 * sebagai proses anak — bukan salinan logikanya:
 *   1. sumber: kendali + platform + dua buku dimigrasi, diisi fixture: dua
 *      tenant, pengguna rumah, TAMU dari tenant lain, orang luar, rahasia SMTP
 *      & server key pembayaran tersegel kunci SUMBER, dokumen, token API,
 *      undangan, langganan aktif + tagihan terbuka;
 *   2. ekspor (dry-run, lalu sungguhan — termasuk pembekuan & tunggu 90 detik);
 *   3. tujuan: kendali dimigrasi; impor dengan sandi SALAH (harus ditolak),
 *      dry-run, sungguhan, lalu impor KEDUA (harus ditolak: tidak kosong);
 *   4. bandingkan: jumlah baris setiap tabel setiap buku, neraca saldo
 *      ringkas, id & hash kata sandi pengguna, orang luar TIDAK ikut,
 *      keanggotaan lintas-tenant TIDAK ikut, rahasia terbuka dengan kunci
 *      TUJUAN dan TIDAK dengan kunci sumber, dokumen sama sidik jarinya,
 *      sequence melanjutkan id;
 *   5. sumber: mark-migrated-out (pratinjau, sungguhan), unfreeze ditolak,
 *      tenant tak-beku ditolak.
 *
 * ⚠ PAGARNYA: kedua server WAJIB loopback dan WAJIB kosong (hanya `postgres`
 * + template) saat mulai. Skrip ini MEMBUAT dan MENULIS basis data — ia tidak
 * boleh punya satu jalan pun ke server yang berisi data. Semua env basis data
 * proses anak disetel EKSPLISIT, supaya `.env` di direktori kerja tidak bisa
 * menyelipkan URL lain lewat `dotenv`.
 *
 * Butuh `pg_dump`/`pg_restore` 17 di PATH (image `backup`, atau pembungkus
 * yang menjalankannya di container server uji).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import bcrypt from "bcrypt";
import { Client as PgClient } from "pg";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { buatAdapter } from "@sai/db/adapter";
import { openSecret, sealSecret } from "@sai/core/settings-crypto";
import { recordSubscriptionEvent } from "@sai/platform/subscription-events";

import { countMismatches } from "../src/lib/tenant-move";
import { trialBalanceMismatches } from "../src/lib/onprem-migration";
import { argValue } from "./lib/bundle-io";
import { rowCounts, sha256File, trialBalanceDigest } from "./lib/pg-tools";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PASS = `uji-${randomBytes(12).toString("hex")}`;
const SRC_KEY = randomBytes(32).toString("hex");
const DST_KEY = randomBytes(32).toString("hex");
const CONTROL_DB = "prove_control";
const PLATFORM_DB = "prove_platform";
const BOOKS = ["sai_prove_alpha", "sai_prove_beta"] as const;

const failures: string[] = [];
function check(ok: boolean, label: string): void {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}`);
  if (!ok) failures.push(label);
}

/**
 * URL satu basis data di server UJI. Sengaja tidak memakai penyelesai
 * `@sai/db/company-url`: yang disusun di sini URL kendali/platform/buku server
 * sekali-pakai, bukan URL buku PT pemasangan mana pun.
 */
function urlFor(server: URL, db: string): string {
  const auth = `${server.username}:${server.password}@`;
  return `${server.protocol}//${auth}${server.host}/${encodeURIComponent(db)}`;
}

async function admin(server: URL, sql: string): Promise<void> {
  const c = new PgClient({ connectionString: urlFor(server, "postgres") });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function query<T extends Record<string, unknown>>(server: URL, db: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new PgClient({ connectionString: urlFor(server, db) });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

/** Server kosong = hanya `postgres` + template. Selain itu: BUKAN server uji. */
async function assertDisposable(server: URL, label: string): Promise<void> {
  if (!LOOPBACK.has(server.hostname)) {
    throw new Error(`--${label} harus loopback (127.0.0.1/localhost), bukan ${server.hostname}`);
  }
  const rows = await query<{ datname: string }>(
    server,
    "postgres",
    "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')"
  );
  /* Basis data KOSONG (mis. yang dibuat image resmi atas nama POSTGRES_USER)
     ditoleransi; satu tabel pun di mana pun = bukan server uji. */
  const occupied: string[] = [];
  for (const { datname } of rows) {
    const [t] = await query<{ n: string }>(
      server,
      datname,
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"
    );
    if (t?.n !== "0" || [CONTROL_DB, PLATFORM_DB, ...BOOKS].includes(datname)) occupied.push(datname);
  }
  if (occupied.length > 0) {
    throw new Error(
      `--${label} tidak kosong (${occupied.join(", ")}) — bukti ini hanya ` +
        "berjalan di server SEKALI-PAKAI. Buat container baru."
    );
  }
}

function envFor(server: URL, key: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CONTROL_DATABASE_URL: urlFor(server, CONTROL_DB),
    PROVISION_DATABASE_URL: urlFor(server, CONTROL_DB),
    DATABASE_URL: urlFor(server, "postgres"),
    PLATFORM_DATABASE_URL: urlFor(server, PLATFORM_DB),
    SETTINGS_ENCRYPTION_KEY: key,
    USER: "prove",
    ...extra,
  };
}

function sh(cmd: string, args: string[], env: NodeJS.ProcessEnv, input?: string): number {
  const r = spawnSync(cmd, args, { env, stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"], input });
  return r.status ?? 1;
}

const tsx = (script: string, args: string[], env: NodeJS.ProcessEnv) =>
  sh("bunx", ["tsx", script, ...args], env);

function migrate(config: string | null, env: NodeJS.ProcessEnv): void {
  const code = sh("bunx", ["prisma", "migrate", "deploy", ...(config ? ["--config", config] : [])], env);
  if (code !== 0) throw new Error(`prisma migrate deploy ${config ?? "(perusahaan)"} gagal`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sourceArg = argValue(argv, "--source");
  const targetArg = argValue(argv, "--target");
  if (!sourceArg || !targetArg) {
    console.error("Pakai: bun run tenant:prove-onprem -- --source <url-server-uji> --target <url-server-uji>");
    process.exit(1);
  }
  const source = new URL(sourceArg);
  const target = new URL(targetArg);
  await assertDisposable(source, "source");
  await assertDisposable(target, "target");

  const srcEnv = envFor(source, SRC_KEY);
  const dstEnv = envFor(target, DST_KEY);
  const work = await mkdtemp(path.join(os.tmpdir(), "sai-prove-onprem-"));
  const srcDocs = path.join(work, "src-documents");
  const dstDocs = path.join(work, "dst-documents");
  const out = path.join(work, "out");

  // ── 1. Sumber ───────────────────────────────────────────────────────────
  console.log("1. sumber: skema + fixture");
  for (const db of [CONTROL_DB, PLATFORM_DB, ...BOOKS]) await admin(source, `CREATE DATABASE "${db}"`);
  migrate("prisma.control.config.ts", srcEnv);
  migrate("prisma.platform.config.ts", srcEnv);
  for (const db of BOOKS) migrate(null, { ...srcEnv, DATABASE_URL: urlFor(source, db) });

  const control = new ControlClient({ adapter: buatAdapter(urlFor(source, CONTROL_DB), { batasKoneksi: 1 }) });
  const platform = new PlatformClient({ adapter: buatAdapter(urlFor(source, PLATFORM_DB), { batasKoneksi: 1 }) });
  const hash = await bcrypt.hash("KataSandiLama#2026", 10);
  const smtpPassword = `smtp-${randomBytes(6).toString("hex")}`;
  const serverKey = `SB-Mid-server-${randomBytes(8).toString("hex")}`;
  const srcKeyBuf = Buffer.from(SRC_KEY, "hex");

  const other = await control.tenant.create({ data: { slug: "prove-other", name: "Tenant Lain", status: "active" } });
  const alpha = await control.tenant.create({
    data: { slug: "prove-alpha", name: "PT Alfa Uji", status: "active", planKey: "pro", maxCompanies: 3, maxUsers: 10 },
  });
  const coA = await control.company.create({ data: { slug: "alfa", name: "PT Alfa", databaseName: BOOKS[0], tenantId: alpha.id } });
  const coB = await control.company.create({ data: { slug: "beta", name: "PT Beta", databaseName: BOOKS[1], tenantId: alpha.id } });
  const coX = await control.company.create({ data: { slug: "lain", name: "PT Lain", databaseName: "sai_prove_other", tenantId: other.id } });
  const mk = (username: string, tenantId: number) =>
    control.user.create({
      data: { username, password: hash, name: username, email: `${username}@uji.test`, tenantId, mustChangePassword: false },
    });
  const outsider = await mk("orangluar", other.id);
  const owner = await mk("pemilik", alpha.id);
  const staff = await mk("staf", alpha.id);
  const guest = await mk("tamu", other.id);
  await control.membership.createMany({
    data: [
      { userId: owner.id, companyId: coA.id, role: "managing_director" },
      { userId: owner.id, companyId: coB.id, role: "managing_director" },
      { userId: staff.id, companyId: coA.id, role: "finance_manager" },
      { userId: guest.id, companyId: coB.id, role: "finance_manager" },
      { userId: guest.id, companyId: coX.id, role: "managing_director" },
      { userId: outsider.id, companyId: coX.id, role: "finance_manager" },
    ],
  });
  await control.tenantMembership.createMany({
    data: [
      { tenantId: alpha.id, userId: owner.id, role: "owner" },
      { tenantId: alpha.id, userId: staff.id, role: "member" },
      { tenantId: other.id, userId: guest.id, role: "owner" },
    ],
  });
  const sealedSmtp = sealSecret(smtpPassword, srcKeyBuf);
  await control.tenantMailSetting.create({
    data: {
      tenantId: alpha.id,
      transport: "smtp",
      host: "smtp.uji.test",
      port: 587,
      username: "akun",
      fromAddress: "buku@uji.test",
      passwordCiphertext: sealedSmtp.ciphertext,
      passwordIv: sealedSmtp.iv,
      passwordTag: sealedSmtp.tag,
      lastTestAt: new Date(),
      lastTestStatus: "ok",
      updatedBy: "pemilik",
    },
  });
  await control.tenantAuditLog.createMany({
    data: [
      { tenantId: alpha.id, tenantSlug: "prove-alpha", userId: String(owner.id), username: "pemilik", action: "tenant.register" },
      { tenantId: alpha.id, tenantSlug: "prove-alpha", userId: String(owner.id), username: "pemilik", action: "tenant.company.create" },
      { tenantId: other.id, tenantSlug: "prove-other", userId: String(guest.id), username: "tamu", action: "tenant.register" },
    ],
  });
  await control.apiToken.create({
    data: { companyId: coA.id, name: "integrasi", tokenHash: "a".repeat(64), role: "finance_manager", createdByUserId: owner.id },
  });
  await control.invitation.create({
    data: {
      tenantId: alpha.id,
      companyId: coA.id,
      email: "calon@uji.test",
      companyRole: "finance_manager",
      invitedByUserId: owner.id,
      tokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  // Buku: akun, jurnal seimbang, rahasia pembayaran (alfa saja).
  for (const [i, db] of BOOKS.entries()) {
    await query(source, db, `INSERT INTO accounts (code, name, type, normal_balance, updated_at) VALUES
      ('110101','Kas','asset','debit',now()), ('410101','Pendapatan','revenue','credit',now()),
      ('610101','Beban','expense','debit',now())`);
    for (let j = 1; j <= 5; j++) {
      const amount = (1000 * (i + 1) * j + 0.45).toFixed(2);
      const [jr] = await query<{ id: number }>(
        source,
        db,
        `INSERT INTO journals (number, date, updated_at) VALUES ($1, now(), now()) RETURNING id`,
        [`JU-${i}-${j}`]
      );
      await query(source, db, `INSERT INTO journal_lines (journal_id, account_id, debit, credit, base_debit, base_credit, updated_at)
        VALUES ($1, 1, $2, 0, $2, 0, now()), ($1, ${j % 2 ? 2 : 3}, 0, $2, 0, $2, now())`, [jr.id, amount]);
    }
  }
  const sealedPay = sealSecret(serverKey, srcKeyBuf);
  await query(
    source,
    BOOKS[0],
    `INSERT INTO company_settings (name, fiscal_year_start, updated_at, payment_gateway,
       payment_server_key_ciphertext, payment_server_key_iv, payment_server_key_tag)
     VALUES ('PT Alfa', now(), now(), 'midtrans', $1, $2, $3)`,
    [sealedPay.ciphertext, sealedPay.iv, sealedPay.tag]
  );

  // Dokumen PT alfa.
  const docName = `${"0".repeat(8)}-1111-2222-3333-${"4".repeat(12)}.pdf`;
  await mkdir(path.join(srcDocs, String(coA.id)), { recursive: true });
  await writeFile(path.join(srcDocs, String(coA.id), docName), randomBytes(4096));

  // Platform: paket, langganan aktif, satu tagihan terbuka.
  if (tsx("scripts/seed-plans.ts", [], srcEnv) !== 0) throw new Error("seed-plans gagal");
  const plan = await platform.plan.findFirstOrThrow({ orderBy: { id: "asc" } });
  const sub = await platform.subscription.create({
    data: {
      tenantId: alpha.id,
      planId: plan.id,
      status: "active",
      billingMode: "manual",
      price: 599000,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  await recordSubscriptionEvent(platform, {
    subscriptionId: sub.id,
    tenantId: alpha.id,
    kind: "created",
    actor: "cli:prove",
    toStatus: "active",
    details: { fixture: "tenant:prove-onprem" },
  });
  await platform.platformInvoice.create({
    data: {
      tenantId: alpha.id,
      subscriptionId: sub.id,
      number: "PINV-UJI-1",
      status: "issued",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 86_400_000),
      amount: 599000,
      total: 664890,
    },
  });

  // ── 2. Ekspor ───────────────────────────────────────────────────────────
  console.log("\n2. ekspor");
  const exportArgs = ["--tenant", "prove-alpha", "--out", out, "--documents-dir", srcDocs];
  check(tsx("scripts/tenant-export-onprem.ts", [...exportArgs, "--dry-run"], srcEnv) === 0, "ekspor --dry-run lulus");
  check((await control.tenant.findUniqueOrThrow({ where: { id: alpha.id } })).frozenAt === null, "--dry-run TIDAK membekukan");
  check(
    tsx("scripts/tenant-export-onprem.ts", exportArgs, { ...srcEnv, SAI_BUNDLE_PASSPHRASE: PASS }) === 0,
    "ekspor sungguhan lulus (beku → tunggu → dump → segel)"
  );
  check((await control.tenant.findUniqueOrThrow({ where: { id: alpha.id } })).frozenAt !== null, "tenant DIBEKUKAN sesudah ekspor");
  const bundles = (await readdir(out)).filter((f) => f.endsWith(".saibundle"));
  check(bundles.length === 1, "tepat satu berkas .saibundle, tanpa direktori kerja tersisa");
  check((await readdir(out)).length === 1, "tidak ada berkas lain di direktori keluaran");
  const bundle = path.join(out, bundles[0]!);
  const raw = await readFile(bundle);
  check(raw.subarray(0, 8).toString("latin1") === "Salted__", "bundel bersandi (kepala openssl `Salted__`)");
  check(!raw.includes(Buffer.from(smtpPassword)) && !raw.includes(Buffer.from(hash)), "rahasia & hash tidak terbaca telanjang di bundel");

  // ── 3. Impor ────────────────────────────────────────────────────────────
  console.log("\n3. impor");
  await admin(target, `CREATE DATABASE "${CONTROL_DB}"`);
  migrate("prisma.control.config.ts", dstEnv);
  const importArgs = ["--bundle", bundle, "--documents-dir", dstDocs, "--work-dir", work];
  check(
    tsx("scripts/tenant-import-onprem.ts", importArgs, { ...dstEnv, SAI_BUNDLE_PASSPHRASE: "sandi-yang-salah-sekali" }) !== 0,
    "sandi SALAH ditolak"
  );
  check(
    tsx("scripts/tenant-import-onprem.ts", importArgs, { ...dstEnv, SETTINGS_ENCRYPTION_KEY: "", SAI_BUNDLE_PASSPHRASE: PASS }) !== 0,
    "tujuan tanpa SETTINGS_ENCRYPTION_KEY ditolak (bundel membawa rahasia)"
  );
  check(
    tsx("scripts/tenant-import-onprem.ts", [...importArgs, "--dry-run"], { ...dstEnv, SAI_BUNDLE_PASSPHRASE: PASS }) === 0,
    "impor --dry-run lulus"
  );
  const afterDry = await query<{ n: string }>(target, CONTROL_DB, "SELECT count(*)::text AS n FROM tenants");
  check(afterDry[0]?.n === "0", "--dry-run TIDAK menulis");
  check(
    tsx("scripts/tenant-import-onprem.ts", importArgs, { ...dstEnv, SAI_BUNDLE_PASSPHRASE: PASS }) === 0,
    "impor sungguhan lulus"
  );
  check(
    tsx("scripts/tenant-import-onprem.ts", importArgs, { ...dstEnv, SAI_BUNDLE_PASSPHRASE: PASS }) !== 0,
    "impor KEDUA ditolak (pemasangan tidak kosong)"
  );

  // ── 4. Bandingkan ───────────────────────────────────────────────────────
  console.log("\n4. bandingkan");
  for (const db of BOOKS) {
    const mismatch = countMismatches(await rowCounts(source, db), await rowCounts(target, db));
    check(mismatch.length === 0, `${db}: jumlah baris setiap tabel sama${mismatch.length ? ` (${mismatch.join("; ")})` : ""}`);
    const tb = trialBalanceMismatches(await trialBalanceDigest(source, db), await trialBalanceDigest(target, db));
    check(tb.length === 0, `${db}: neraca saldo ringkas sama`);
  }
  const dst = new ControlClient({ adapter: buatAdapter(urlFor(target, CONTROL_DB), { batasKoneksi: 1 }) });
  const dstUsers = await dst.user.findMany({ orderBy: { id: "asc" } });
  check(
    JSON.stringify(dstUsers.map((u) => u.id)) === JSON.stringify([owner.id, staff.id, guest.id].sort((a, b) => a - b)),
    "pengguna = pemilik + staf + tamu, id DIPERTAHANKAN; orang luar tidak ikut"
  );
  check(dstUsers.every((u) => u.password === hash && u.tenantId === alpha.id), "hash bcrypt sama persis; semua berumah di tenant on-premise");
  check(await bcrypt.compare("KataSandiLama#2026", dstUsers[0]!.password), "kata sandi LAMA tetap cocok");
  const dstMemberships = await dst.membership.findMany();
  check(dstMemberships.length === 4 && dstMemberships.every((m) => m.companyId !== coX.id), "keanggotaan = 4, tanpa PT tenant lain");
  check((await dst.tenantMembership.count()) === 2, "keanggotaan tenant = 2 (milik tenant lain tidak ikut)");
  const dstCompanies = await dst.company.findMany({ orderBy: { id: "asc" } });
  check(
    JSON.stringify(dstCompanies.map((c) => [c.id, c.databaseName, c.dbInstanceKey])) ===
      JSON.stringify([[coA.id, BOOKS[0], null], [coB.id, BOOKS[1], null]]),
    "perusahaan: id & nama basis data dipertahankan, instans bawaan"
  );
  const dstTenant = await dst.tenant.findUniqueOrThrow({ where: { id: alpha.id } });
  check(dstTenant.status === "active" && dstTenant.frozenAt === null && dstTenant.slug === "prove-alpha", "tenant on-premise aktif, tidak beku, slug sama");
  check((await dst.apiToken.count()) === 0 && (await dst.invitation.count()) === 0, "token API & undangan TIDAK ikut");
  check((await dst.tenantAuditLog.count({ where: { tenantId: alpha.id, action: { not: "tenant.onprem.import" } } })) === 2, "jejak tenant ikut (2), milik tenant lain tidak");
  const mail = await dst.tenantMailSetting.findUniqueOrThrow({ where: { tenantId: alpha.id } });
  const sealedDst = { ciphertext: mail.passwordCiphertext!, iv: mail.passwordIv!, tag: mail.passwordTag! };
  check(openSecret(sealedDst, Buffer.from(DST_KEY, "hex")) === smtpPassword, "sandi SMTP terbuka dengan kunci TUJUAN");
  let srcKeyOpens = true;
  try {
    openSecret(sealedDst, srcKeyBuf);
  } catch {
    srcKeyOpens = false;
  }
  check(!srcKeyOpens, "sandi SMTP TIDAK terbuka dengan kunci SaaS");
  check(mail.lastTestAt === null, "hasil uji kirim SaaS dikosongkan");
  const [pay] = await query<{ c: string; iv: string; tag: string }>(
    target,
    BOOKS[0],
    "SELECT payment_server_key_ciphertext AS c, payment_server_key_iv AS iv, payment_server_key_tag AS tag FROM company_settings"
  );
  check(
    openSecret({ ciphertext: pay!.c, iv: pay!.iv, tag: pay!.tag }, Buffer.from(DST_KEY, "hex")) === serverKey,
    "server key pembayaran disegel ulang dengan kunci TUJUAN"
  );
  check(
    (await sha256File(path.join(srcDocs, String(coA.id), docName))) ===
      (await sha256File(path.join(dstDocs, String(coA.id), docName))),
    "dokumen tiba utuh di direktori id PT yang sama"
  );
  const next = await dst.user.create({
    data: { username: "baru", password: hash, email: "baru@uji.test", tenantId: alpha.id },
  });
  check(next.id > Math.max(owner.id, staff.id, guest.id), "sequence `users` melanjutkan sesudah id yang dibawa");
  await dst.$disconnect();

  // ── 5. Sisi SaaS sesudah customer menyatakan berjalan ───────────────────
  console.log("\n5. mark-migrated-out / unfreeze");
  check(tsx("scripts/tenant-onprem-cutover.ts", ["mark-migrated-out", "--tenant", "prove-other", "--apply", "--reason", "uji penolakan"], srcEnv) !== 0, "tenant yang tidak pernah dibekukan DITOLAK");
  check(tsx("scripts/tenant-onprem-cutover.ts", ["mark-migrated-out", "--tenant", "prove-alpha"], srcEnv) === 0, "pratinjau lulus");
  check((await control.tenant.findUniqueOrThrow({ where: { id: alpha.id } })).status === "active", "pratinjau TIDAK menulis");
  check(
    tsx("scripts/tenant-onprem-cutover.ts", ["mark-migrated-out", "--tenant", "prove-alpha", "--apply", "--reason", "uji ujung ke ujung"], srcEnv) === 0,
    "mark-migrated-out --apply lulus"
  );
  const t = await control.tenant.findUniqueOrThrow({ where: { id: alpha.id } });
  check(t.status === "migrated_out" && t.migratedOutAt !== null, "tenants.status = migrated_out");
  check((await control.company.count({ where: { tenantId: alpha.id, isActive: true } })) === 0, "PT tenant dinonaktifkan");
  check((await control.company.count({ where: { id: coX.id, isActive: true } })) === 1, "PT tenant lain tidak tersentuh");
  const s = await platform.subscription.findUniqueOrThrow({ where: { id: sub.id } });
  check(s.status === "cancelled" && s.billingMode === "none", "langganan cancelled, mode penagihan none");
  check((await platform.platformInvoice.findFirstOrThrow({ where: { number: "PINV-UJI-1" } })).status === "issued", "tagihan terbuka TIDAK disentuh (dilaporkan)");
  check(((await control.user.findUniqueOrThrow({ where: { id: owner.id } })).sessionVersion ?? 0) > 1, "sesi pengguna rumah dicabut");
  check((await control.user.findUniqueOrThrow({ where: { id: guest.id } })).sessionVersion === 1, "sesi tamu (tenant lain) tidak disentuh");
  check(tsx("scripts/tenant-onprem-cutover.ts", ["unfreeze", "--tenant", "prove-alpha", "--reason", "uji penolakan"], srcEnv) !== 0, "unfreeze sesudah migrated_out DITOLAK");

  await control.$disconnect();
  await platform.$disconnect();

  console.log(
    failures.length === 0
      ? "\n✓ BUKTI LULUS — semua pemeriksaan hijau."
      : `\n✗ BUKTI GAGAL — ${failures.length} pemeriksaan merah:\n  ${failures.join("\n  ")}`
  );
  console.log(`(direktori kerja: ${work}; server uji dibiarkan untuk diperiksa — buang container-nya)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
