/**
 * Create the first manager (bos) account for production.
 * Usage:
 *   npm run create-admin -- --username admin --password 'YourSecurePass123' --name "Administrator"
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
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
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set in .env");
    process.exit(1);
  }

  const { username, password, name, role = "bos" } = parseArgs(process.argv.slice(2));

  if (!username || !password) {
    console.error("Usage: npm run create-admin -- --username <user> --password <pass> [--name \"Display Name\"] [--role bos|core|ptg]");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ERROR: Password must be at least 8 characters");
    process.exit(1);
  }

  if (!["bos", "core", "ptg"].includes(role)) {
    console.error("ERROR: role must be bos, core, or ptg");
    process.exit(1);
  }

  const url = new URL(process.env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`ERROR: Username "${username}" already exists`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      name: name || username,
      role,
      status: 0,
    },
    select: { id: true, username: true, name: true, role: true },
  });

  console.log("Administrator created successfully:");
  console.log(`  Username: ${user.username}`);
  console.log(`  Name:     ${user.name}`);
  console.log(`  Role:     ${user.role}`);
  console.log("  Status:   Active (no forced password change)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
