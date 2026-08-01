/**
 * Isi/awetkan PAKET bawaan di `sai_platform` (issue #140).
 *
 *   npm run db:seed:plans
 *
 * Upsert berkunci `plans.key` — aman dijalankan berulang; harga & kuota paket
 * yang SUDAH ada tidak ditimpa diam-diam (pemasangan boleh mengubahnya lewat
 * basis data, dan seed yang menimpanya adalah kejutan penagihan). Hanya paket
 * yang BELUM ada yang dibuat.
 *
 * Harga IDR `Decimal(15,2)`. Ingat pola snapshot: angka di sini adalah harga
 * PENAWARAN untuk langganan baru — langganan berjalan memegang salinannya
 * sendiri (`subscriptions.price`, `tenants.max_*`) dan tidak berubah karena
 * baris ini berubah.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DEFAULT_PLANS = [
  {
    key: "trial",
    name: "Trial",
    description: "Masa uji coba — satu PT, tiga pengguna.",
    priceMonthly: "0.00",
    maxCompanies: 1,
    maxUsers: 3,
    trialDays: 14,
  },
  {
    key: "starter",
    name: "Starter",
    description: "Satu PT, lima pengguna.",
    priceMonthly: "150000.00",
    priceYearly: "1500000.00",
    maxCompanies: 1,
    maxUsers: 5,
    trialDays: 14,
  },
  {
    key: "business",
    name: "Business",
    description: "Sampai tiga PT, lima belas pengguna.",
    priceMonthly: "450000.00",
    priceYearly: "4500000.00",
    maxCompanies: 3,
    maxUsers: 15,
    trialDays: 14,
  },
] as const;

async function main() {
  const url = process.env.PLATFORM_DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "✗ PLATFORM_DATABASE_URL belum diset — tidak ada basis data platform untuk diisi."
    );
    process.exit(1);
  }

  const parsed = new URL(url);
  const platform = new PlatformClient({
    adapter: new PrismaMariaDb({
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      connectionLimit: 1,
    }),
  });

  for (const plan of DEFAULT_PLANS) {
    const existing = await platform.plan.findUnique({ where: { key: plan.key } });
    if (existing) {
      console.log(`= paket "${plan.key}" sudah ada — tidak disentuh`);
      continue;
    }
    await platform.plan.create({ data: { ...plan } });
    console.log(`+ paket "${plan.key}" dibuat`);
  }

  await platform.$disconnect();
}

main().catch((error) => {
  console.error("Seed paket gagal:", error);
  process.exit(1);
});
