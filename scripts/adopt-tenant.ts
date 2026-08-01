/**
 * Adopsi TENANT (issue #134, epik #133) — masukkan pemasangan yang sudah
 * berjalan ke dalam SATU tenant di basis data kendali.
 *
 *   npx tsx scripts/adopt-tenant.ts --slug pt-sai --emails emails.json \
 *       [--name "PT Subur Anugerah Indonesia"] [--status active]
 *       [--plan-key internal] [--max-companies 10] [--max-users 50]
 *       [--owners "admin,budi"]
 *
 * ══ URUTAN YANG WAJIB (docs/MULTI-TENANT.md §8) ═════════════════════════════
 *   1. npm run db:migrate:control      — migration 0002 (kolom nullable)
 *   2. skrip INI                       — buat Tenant, tautkan, isi email
 *   3. npx tsx scripts/prove-tenant-adoption.ts   — wajib exit 0
 *   4. npm run db:migrate:control      — migration 0003 (NOT NULL + unik)
 *
 * ══ EMAIL DISIAPKAN MANUSIA, TIDAK PERNAH DITEBAK MESIN ═════════════════════
 * `--emails` menunjuk berkas JSON `{ "<username>": "<email>", … }` yang diisi
 * operator. Setiap pengguna TANPA email di peta itu menggagalkan skrip SEBELUM
 * satu baris pun ditulis — email yang dikarang mesin adalah alamat yang tidak
 * bisa menerima tautan atur-ulang kata sandi, yaitu akun yang terkunci diam-diam.
 *
 * ══ SIAPA MENJADI OWNER TENANT ══════════════════════════════════════════════
 * Bawaan: pengguna yang memegang peran berakses penuh (Direktur Utama /
 * Administrator Sistem) di minimal satu perusahaan — merekalah yang hari ini
 * memegang kunci pemasangan. `--owners` menimpanya secara eksplisit. Semua
 * pengguna lain menjadi `member` (akses mereka tetap murni dari keanggotaan
 * per-PT). Tanpa satu pun owner skrip menolak berjalan — tenant tanpa owner
 * adalah tenant yang tidak bisa dikelola siapa pun.
 *
 * Kuota (`max_companies` / `max_users`) DISALIN ke baris tenant (pola snapshot,
 * lihat komentar skema) dan tidak boleh lebih kecil dari kenyataan yang sedang
 * diadopsi — kuota yang langsung terlampaui hanya melahirkan galat di hari
 * pertama.
 *
 * Idempoten dengan cara MENOLAK, bukan menimpa: slug yang sudah ada, atau
 * perusahaan/pengguna yang sudah bertaut ke tenant lain, menghentikan skrip
 * tanpa menulis apa pun.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  isFullAccessRole,
  TENANT_ROLES,
  TENANT_STATUSES,
  type TenantStatus,
} from "../src/lib/constants";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/adopt-tenant.ts --slug <slug> --emails <peta.json>\n" +
      '         [--name "Nama Tenant"] [--status active] [--plan-key internal]\n' +
      "         [--max-companies 10] [--max-users 50] [--owners user1,user2]\n\n" +
      'peta.json: { "<username>": "<email>", ... } — disiapkan operator.'
  );
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, emails: emailsPath, name, owners } = args;

  if (!slug || !/^[a-z0-9][a-z0-9-]{0,49}$/.test(slug) || !emailsPath) usage();

  const status = (args["status"] ?? "active") as TenantStatus;
  if (!(TENANT_STATUSES as readonly string[]).includes(status)) {
    console.error(`ERROR: --status harus salah satu dari: ${TENANT_STATUSES.join(", ")}`);
    process.exit(1);
  }
  const planKey = args["plan-key"] ?? "internal";
  const maxCompaniesArg = Number(args["max-companies"] ?? 10);
  const maxUsersArg = Number(args["max-users"] ?? 50);
  if (!Number.isInteger(maxCompaniesArg) || !Number.isInteger(maxUsersArg)) {
    console.error("ERROR: --max-companies / --max-users harus bilangan bulat.");
    process.exit(1);
  }

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }

  // ── Peta email: dibaca & divalidasi SEBELUM menyentuh basis data ──────────
  let emailByUsername: Record<string, string>;
  try {
    emailByUsername = JSON.parse(await readFile(emailsPath, "utf8"));
  } catch (error) {
    console.error(`ERROR: gagal membaca peta email "${emailsPath}": ${String(error)}`);
    process.exit(1);
  }

  const url = new URL(controlUrl);
  const control = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });

  const users = await control.user.findMany({
    select: { id: true, username: true, tenantId: true, email: true },
    orderBy: { id: "asc" },
  });
  const companies = await control.company.findMany({
    select: { id: true, slug: true, name: true, tenantId: true },
    orderBy: { id: "asc" },
  });
  const memberships = await control.membership.findMany({
    where: { isActive: true },
    select: { userId: true, role: true },
  });

  if (users.length === 0 || companies.length === 0) {
    console.error(
      "ERROR: basis data kendali belum berisi pengguna/perusahaan. Untuk pemasangan\n" +
        "lama jalankan dulu adopsi #104 (scripts/adopt-existing-company.ts)."
    );
    process.exit(1);
  }

  // ── Penjaga: tidak menimpa tautan tenant yang sudah ada ───────────────────
  const existingTenant = await control.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    console.error(`ERROR: tenant "${slug}" sudah ada (id ${existingTenant.id}). Tidak ada yang diubah.`);
    process.exit(1);
  }
  const alreadyLinked = [
    ...companies.filter((c) => c.tenantId !== null).map((c) => `perusahaan ${c.slug}`),
    ...users.filter((u) => u.tenantId !== null).map((u) => `pengguna ${u.username}`),
  ];
  if (alreadyLinked.length > 0) {
    console.error(
      "ERROR: sudah bertaut ke tenant lain, tidak ditimpa:\n  " + alreadyLinked.join("\n  ")
    );
    process.exit(1);
  }

  // ── Email untuk SETIAP pengguna, valid, tanpa kembar ──────────────────────
  const problems: string[] = [];
  const normalized = new Map<number, string>(); // userId → email (lowercase)
  const seen = new Map<string, string>(); // email → username pertama pemakainya
  for (const user of users) {
    const raw = emailByUsername[user.username] ?? user.email ?? "";
    const email = raw.trim().toLowerCase();
    if (!email) {
      problems.push(`pengguna "${user.username}" tidak punya email di peta ${emailsPath}`);
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      problems.push(`email "${raw}" milik "${user.username}" tidak berbentuk alamat email`);
      continue;
    }
    const firstOwner = seen.get(email);
    if (firstOwner) {
      problems.push(`email "${email}" kembar: dipakai "${firstOwner}" dan "${user.username}"`);
      continue;
    }
    seen.set(email, user.username);
    normalized.set(user.id, email);
  }
  if (problems.length > 0) {
    console.error("ERROR: peta email belum siap — TIDAK ADA yang ditulis:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  // ── Owner tenant: eksplisit lewat --owners, atau peran berakses penuh ─────
  const explicitOwners = owners
    ? new Set(
        owners
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;
  if (explicitOwners) {
    const known = new Set(users.map((u) => u.username));
    for (const username of explicitOwners) {
      if (!known.has(username)) {
        console.error(`ERROR: --owners menyebut "${username}" yang tidak ada di tabel users.`);
        process.exit(1);
      }
    }
  }
  const fullAccessUserIds = new Set(
    memberships.filter((m) => isFullAccessRole(m.role)).map((m) => m.userId)
  );
  const tenantRoleFor = (user: { id: number; username: string }): string =>
    explicitOwners
      ? explicitOwners.has(user.username)
        ? TENANT_ROLES.OWNER
        : TENANT_ROLES.MEMBER
      : fullAccessUserIds.has(user.id)
        ? TENANT_ROLES.OWNER
        : TENANT_ROLES.MEMBER;

  const ownerUsernames = users.filter((u) => tenantRoleFor(u) === TENANT_ROLES.OWNER);
  if (ownerUsernames.length === 0) {
    console.error(
      "ERROR: tidak ada satu pun owner tenant — tenant tanpa owner tidak bisa dikelola\n" +
        "siapa pun. Sebutkan lewat --owners, atau pastikan ada pengguna berperan akses penuh."
    );
    process.exit(1);
  }

  // ── Kuota snapshot tidak boleh lebih kecil dari kenyataan yang diadopsi ───
  const maxCompanies = Math.max(maxCompaniesArg, companies.length);
  const maxUsers = Math.max(maxUsersArg, users.length);

  const tenantName = name || companies[0].name;

  console.log(`Mengadopsi pemasangan ini sebagai tenant "${tenantName}" (${slug})`);
  console.log(`  status=${status} plan=${planKey} max_companies=${maxCompanies} max_users=${maxUsers}`);
  console.log(`  ${companies.length} perusahaan, ${users.length} pengguna, ${ownerUsernames.length} owner:`);
  console.log(`    owner: ${ownerUsernames.map((u) => u.username).join(", ")}`);

  await control.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug, name: tenantName, status, planKey, maxCompanies, maxUsers },
    });

    await tx.company.updateMany({ data: { tenantId: tenant.id } });

    for (const user of users) {
      await tx.user.update({
        where: { id: user.id },
        data: { tenantId: tenant.id, email: normalized.get(user.id) },
      });
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: tenantRoleFor(user) },
      });
    }
  });

  console.log("\nSelesai. Langkah berikutnya:");
  console.log("  npx tsx scripts/prove-tenant-adoption.ts   # wajib exit 0");
  console.log(
    "  # bila 0003 pernah gagal saat deploy (pemasangan lama — itu pagarnya):\n" +
      "  npx prisma migrate resolve --rolled-back 0003_tenants_not_null --config prisma.control.config.ts"
  );
  console.log("  npm run db:migrate:control                 # menerapkan 0003 (NOT NULL + unik)");

  await control.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
