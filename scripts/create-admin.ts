/**
 * Buat akun pengelola pertama untuk produksi.
 *
 *   bun run create-admin -- --username admin --password 'SandiAman123' \
 *                           --name "Administrator" --company pt-a
 *
 * Sejak issue #104 akun hidup di BASIS DATA KENDALI, dan sebuah akun tanpa
 * keanggotaan adalah akun yang bisa masuk lalu ditolak setiap halaman. Karena
 * itu `--company` (slug perusahaan) WAJIB: yang dibuat selalu sepasang, akun
 * beserta perannya di satu perusahaan.
 *
 * Menambahkan orang yang SUDAH ada ke perusahaan lain juga lewat sini —
 * jalankan lagi dengan username yang sama dan `--company` yang berbeda; kata
 * sandinya tidak diubah, hanya keanggotaannya yang bertambah.
 */
import "dotenv/config";
import { isFullAccessRole, ROLES, ROLE_VALUES, TENANT_ROLES } from "../src/lib/constants";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcrypt";

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

async function main() {
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error(
      "ERROR: CONTROL_DATABASE_URL belum diset di .env — akun hidup di basis data kendali (issue #104)."
    );
    process.exit(1);
  }

  const {
    username,
    password,
    email,
    name,
    company: companySlug,
    tenant: tenantSlug,
    role = ROLES.MANAGING_DIRECTOR,
  } = parseArgs(process.argv.slice(2));

  if (!username || !password || !companySlug || !email) {
    console.error(
      'Usage: bun run create-admin -- --username <user> --password <pass> --email <email> --company <slug> [--tenant <slug-tenant>] [--name "Nama"] [--role ...]\n' +
        "  --email wajib sejak issue #136: email adalah pengenal login dan jalan\n" +
        "  satu-satunya mengatur ulang kata sandi secara mandiri.\n" +
        "  --tenant wajib hanya bila slug perusahaan ada di lebih dari satu tenant (#153)."
    );
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    console.error(`ERROR: "${email}" tidak berbentuk alamat email.`);
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ERROR: Password must be at least 8 characters");
    process.exit(1);
  }

  if (!(ROLE_VALUES as readonly string[]).includes(role)) {
    console.error(`ERROR: role must be one of: ${ROLE_VALUES.join(", ")}`);
    process.exit(1);
  }

  const url = new URL(process.env.CONTROL_DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  const controlDb = new PrismaClient({ adapter });

  /*
   * Slug perusahaan unik PER TENANT sejak issue #153, jadi satu slug bisa
   * menunjuk perusahaan di dua tenant yang berbeda. Yang ambigu harus
   * ditanyakan, bukan dipilihkan (pola #104): bila kembar, `--tenant
   * <slug-tenant>` wajib disebut.
   */
  const candidates = await controlDb.company.findMany({
    where: { slug: companySlug },
    include: { tenant: { select: { slug: true } } },
  });
  const matches = tenantSlug
    ? candidates.filter((c) => c.tenant?.slug === tenantSlug)
    : candidates;
  if (matches.length === 0) {
    console.error(
      tenantSlug
        ? `ERROR: perusahaan "${companySlug}" tidak ada di tenant "${tenantSlug}".`
        : `ERROR: perusahaan dengan slug "${companySlug}" tidak ada. Daftarkan dulu ` +
            "(scripts/adopt-existing-company.ts untuk pemasangan yang sudah berjalan)."
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `ERROR: slug "${companySlug}" ada di ${matches.length} tenant ` +
        `(${matches.map((c) => c.tenant?.slug ?? `#${c.tenantId}`).join(", ")}) — ` +
        "sebutkan pemiliknya lewat --tenant <slug-tenant>."
    );
    process.exit(1);
  }
  const company = matches[0];

  /*
   * Tenant pemilik akun = tenant perusahaan tujuan (issue #134/#136): sejak
   * migration 0003 akun tanpa tenant ditolak basis data.
   */
  if (!company.tenantId) {
    console.error(
      `ERROR: perusahaan "${companySlug}" belum bertaut ke tenant. Jalankan dulu:\n` +
        "  bun run adopt-tenant -- --slug <tenant> --emails <peta.json>"
    );
    process.exit(1);
  }
  const tenantId = company.tenantId;

  // Username tidak lagi unik global (#136) — pencariannya per tenant ini.
  const existing = await controlDb.user.findFirst({ where: { username, tenantId } });

  if (existing) {
    // Akun yang sudah ada TIDAK dibuat ulang: satu orang = satu akun dengan
    // satu kata sandi, berapa pun PT yang dipegangnya. Yang ditambahkan hanya
    // keanggotaannya di perusahaan ini.
    await controlDb.membership.upsert({
      where: { userId_companyId: { userId: existing.id, companyId: company.id } },
      create: { userId: existing.id, companyId: company.id, role },
      update: { role, isActive: true },
    });
    console.log(`Akun "${username}" sudah ada — ditambahkan sebagai anggota ${company.name}:`);
    console.log(`  Peran:      ${role}`);
    console.log("  Kata sandi: TIDAK diubah");
    await controlDb.$disconnect();
    return;
  }

  const emailOwner = await controlDb.user.findUnique({ where: { email: normalizedEmail } });
  if (emailOwner) {
    console.error(`ERROR: email "${normalizedEmail}" sudah dipakai akun "${emailOwner.username}".`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await controlDb.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        email: normalizedEmail,
        password: hashed,
        name: name || username,
        tenantId,
        mustChangePassword: false,
      },
      select: { id: true, username: true, name: true },
    });
    await tx.membership.create({
      data: { userId: created.id, companyId: company.id, role },
    });
    /*
     * Keanggotaan tenant ikut lahir (issue #135). Peran berakses penuh dibuat
     * `owner` — skrip ini dipakai membuat pengelola pertama, dan tenant tanpa
     * owner tidak bisa dikelola siapa pun; selainnya `member`.
     */
    await tx.tenantMembership.create({
      data: {
        tenantId,
        userId: created.id,
        role: isFullAccessRole(role) ? TENANT_ROLES.OWNER : TENANT_ROLES.MEMBER,
      },
    });
    return created;
  });

  console.log("Administrator created successfully:");
  console.log(`  Username:   ${user.username}`);
  console.log(`  Email:      ${normalizedEmail}`);
  console.log(`  Name:       ${user.name}`);
  console.log(`  Perusahaan: ${company.name} (${company.slug})`);
  console.log(`  Peran:      ${role}`);
  console.log("  Status:     Aktif (tidak dipaksa ganti kata sandi)");

  await controlDb.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
