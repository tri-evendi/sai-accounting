/**
 * Buat akun pengelola pertama untuk produksi.
 *
 *   npm run create-admin -- --username admin --password 'SandiAman123' \
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
import { ROLES, ROLE_VALUES } from "../src/lib/constants";
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
    name,
    company: companySlug,
    role = ROLES.MANAGING_DIRECTOR,
  } = parseArgs(process.argv.slice(2));

  if (!username || !password || !companySlug) {
    console.error(
      'Usage: npm run create-admin -- --username <user> --password <pass> --company <slug> [--name "Nama"] [--role ...]'
    );
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

  const company = await controlDb.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    console.error(
      `ERROR: perusahaan dengan slug "${companySlug}" tidak ada. Daftarkan dulu ` +
        "(scripts/adopt-existing-company.ts untuk pemasangan yang sudah berjalan)."
    );
    process.exit(1);
  }

  const existing = await controlDb.user.findUnique({ where: { username } });

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

  const hashed = await bcrypt.hash(password, 12);
  const user = await controlDb.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        password: hashed,
        name: name || username,
        mustChangePassword: false,
      },
      select: { id: true, username: true, name: true },
    });
    await tx.membership.create({
      data: { userId: created.id, companyId: company.id, role },
    });
    return created;
  });

  console.log("Administrator created successfully:");
  console.log(`  Username:   ${user.username}`);
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
