/**
 * Tangga harga (#404): angka katalog ditulis DUA KALI dengan sengaja —
 * `scripts/seed-plans.ts` (pemasangan baru) dan migration platform
 * `0009_plans_pricing_ladder` (baris lama di pemasangan berjalan) — dan
 * keduanya harus memuat angka yang sama. Sumber kebenarannya `docs/PRICING.md`;
 * tes ini menjaga ketiganya tidak menyimpang tanpa ada yang menyadari.
 *
 * Seed TIDAK diimpor (ia menjalankan `main()` saat dimuat dan menuntut basis
 * data); yang dibaca adalah teksnya. Pola regex-nya sengaja longgar terhadap
 * spasi dan komentar, tetapi ketat terhadap NILAI.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SEED = readFileSync("scripts/seed-plans.ts", "utf8");
const MIGRATION = readFileSync(
  "prisma/platform/migrations/0009_plans_pricing_ladder/migration.sql",
  "utf8"
);
const DOCS = readFileSync("docs/PRICING.md", "utf8");

/** Katalog yang disepakati di #404 — angka yang dijaga, bukan diturunkan. */
const LADDER = [
  { key: "starter", name: "Starter", monthly: 249000, yearly: 2490000, companies: 1, users: 3 },
  { key: "pro", name: "Pro", monthly: 599000, yearly: 5990000, companies: 3, users: 15 },
  { key: "business", name: "Business", monthly: 1199000, yearly: 11990000, companies: 8, users: 40 },
] as const;

function seedBlock(key: string): string {
  const start = SEED.indexOf(`key: "${key}"`);
  expect(start, `paket "${key}" ada di DEFAULT_PLANS`).toBeGreaterThan(-1);
  const end = SEED.indexOf("\n  },", start);
  return SEED.slice(start, end);
}

function migrationBlock(key: string): string {
  const start = MIGRATION.indexOf(`WHERE \`key\` = '${key}'`);
  expect(start, `migration memuat UPDATE untuk "${key}"`).toBeGreaterThan(-1);
  const from = MIGRATION.lastIndexOf("UPDATE `plans`", start);
  return MIGRATION.slice(from, start);
}

describe("tangga harga #404 — seed, migration, dan docs memuat angka yang sama", () => {
  for (const plan of LADDER) {
    it(`${plan.key}: seed`, () => {
      const blok = seedBlock(plan.key);
      expect(blok).toContain(`name: "${plan.name}"`);
      expect(blok).toContain(`priceMonthly: "${plan.monthly}.00"`);
      expect(blok).toContain(`priceYearly: "${plan.yearly}.00"`);
      expect(blok).toContain(`maxCompanies: ${plan.companies},`);
      expect(blok).toContain(`maxUsers: ${plan.users},`);
      expect(blok).toContain("trialDays: 14");
      expect(blok).toContain("isPublic: true");
    });
  }

  // Pro TIDAK diulang di migration: harganya tidak berubah, dan UPDATE yang
  // menulis ulang angka yang sama hanya menyamarkan mana yang berubah.
  for (const plan of LADDER.filter((p) => p.key !== "pro")) {
    it(`${plan.key}: migration 0009`, () => {
      const blok = migrationBlock(plan.key);
      expect(blok).toContain(`\`name\`           = '${plan.name}'`);
      expect(blok).toContain(`\`price_monthly\`  = ${plan.monthly}.00`);
      expect(blok).toContain(`\`price_yearly\`   = ${plan.yearly}.00`);
      expect(blok).toContain(`\`max_companies\`  = ${plan.companies},`);
      expect(blok).toContain(`\`max_users\`      = ${plan.users},`);
      expect(blok).toContain("`is_public`      = 1");
      expect(blok).toContain("`is_recommended` = 0");
    });
  }

  it("Pro tetap satu-satunya yang disorot, dan Pro tidak disentuh migration", () => {
    expect(seedBlock("pro")).toContain("isRecommended: true");
    expect(seedBlock("starter")).not.toContain("isRecommended: true");
    expect(seedBlock("business")).not.toContain("isRecommended: true");
    expect(MIGRATION).not.toContain("WHERE `key` = 'pro'");
  });

  it("starter & business tidak lagi dipensiunkan; trial masih", () => {
    const retired = SEED.match(/const RETIRED_KEYS = \[([^\]]*)\]/)?.[1] ?? "";
    expect(retired).toContain('"trial"');
    expect(retired).not.toContain('"starter"');
    expect(retired).not.toContain('"business"');
  });

  it("docs/PRICING.md memuat setiap angka katalog dalam format id-ID", () => {
    for (const plan of LADDER) {
      expect(DOCS).toContain(plan.monthly.toLocaleString("id-ID"));
      expect(DOCS).toContain(plan.yearly.toLocaleString("id-ID"));
    }
  });
});
