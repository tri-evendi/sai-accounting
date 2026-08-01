/**
 * PEMBUKTIAN adopsi tenant (issue #134) — read-only, exit != 0 bila ada cacat.
 *
 *   npx tsx scripts/prove-tenant-adoption.ts
 *
 * Berdiri di antara skrip adopsi dan migration 0003 (NOT NULL + unik):
 * migration itu TIDAK BOLEH diterapkan sebelum skrip ini lulus. Ia sengaja
 * terpisah dari skrip adopsi — pembuktian yang ditulis oleh kode yang sama
 * dengan yang melakukan pekerjaannya hanya membuktikan bahwa kode itu setuju
 * dengan dirinya sendiri.
 *
 * Yang dibuktikan:
 *   1. setiap `companies.tenant_id` terisi
 *   2. setiap `users.tenant_id` terisi
 *   3. setiap `users.email` terisi, berbentuk email, dan TIDAK ADA yang kembar
 *      (dibandingkan dalam huruf kecil — keunikan MySQL utf8mb4_unicode_ci
 *      juga case-insensitive, jadi inilah perbandingan yang akan ditegakkan
 *      indeks unik 0003)
 *   4. setiap pengguna punya TEPAT SATU keanggotaan tenant, di tenant yang
 *      sama dengan `users.tenant_id`, dengan peran yang dikenal
 *   5. setiap tenant punya minimal SATU owner (anti-lockout)
 *
 * TIDAK MENULIS APA PUN — hanya SELECT.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { TENANT_ROLES, TENANT_ROLE_VALUES } from "../src/lib/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
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

  const failures: string[] = [];

  const companies = await control.company.findMany({
    select: { id: true, slug: true, tenantId: true },
  });
  const users = await control.user.findMany({
    select: { id: true, username: true, email: true, tenantId: true },
  });
  const tenants = await control.tenant.findMany({ select: { id: true, slug: true } });
  const tenantMemberships = await control.tenantMembership.findMany({
    select: { tenantId: true, userId: true, role: true },
  });

  if (tenants.length === 0) failures.push("tidak ada satu pun tenant — adopsi belum dijalankan");
  if (users.length === 0) failures.push("tidak ada satu pun pengguna di basis data kendali");

  // 1. Perusahaan tanpa tenant
  for (const c of companies) {
    if (c.tenantId === null) failures.push(`companies.tenant_id kosong: ${c.slug}`);
  }

  // 2 & 3. Pengguna tanpa tenant / tanpa email / email cacat / email kembar
  const seenEmail = new Map<string, string>();
  for (const u of users) {
    if (u.tenantId === null) failures.push(`users.tenant_id kosong: ${u.username}`);
    const email = (u.email ?? "").trim();
    if (!email) {
      failures.push(`users.email kosong: ${u.username}`);
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      failures.push(`users.email cacat ("${email}"): ${u.username}`);
      continue;
    }
    const lower = email.toLowerCase();
    const first = seenEmail.get(lower);
    if (first) failures.push(`email kembar "${lower}": ${first} dan ${u.username}`);
    else seenEmail.set(lower, u.username);
  }

  // 4. Keanggotaan tenant per pengguna: ada, tunggal, konsisten, perannya sah
  const byUser = new Map<number, { tenantId: number; role: string }[]>();
  for (const tm of tenantMemberships) {
    const list = byUser.get(tm.userId) ?? [];
    list.push(tm);
    byUser.set(tm.userId, list);
  }
  for (const u of users) {
    const list = byUser.get(u.id) ?? [];
    if (list.length === 0) failures.push(`tanpa keanggotaan tenant: ${u.username}`);
    if (list.length > 1)
      failures.push(`keanggotaan tenant ganda (${list.length}): ${u.username}`);
    for (const tm of list) {
      if (u.tenantId !== null && tm.tenantId !== u.tenantId)
        failures.push(
          `keanggotaan tenant "${u.username}" menunjuk tenant ${tm.tenantId}, ` +
            `padahal users.tenant_id = ${u.tenantId}`
        );
      if (!(TENANT_ROLE_VALUES as readonly string[]).includes(tm.role))
        failures.push(`peran tenant tak dikenal "${tm.role}": ${u.username}`);
    }
  }

  // 5. Anti-lockout: setiap tenant minimal satu owner
  for (const tenant of tenants) {
    const owners = tenantMemberships.filter(
      (tm) => tm.tenantId === tenant.id && tm.role === TENANT_ROLES.OWNER
    );
    if (owners.length === 0) failures.push(`tenant "${tenant.slug}" tidak punya owner`);
  }

  await control.$disconnect();

  if (failures.length > 0) {
    console.error(`GAGAL — ${failures.length} cacat ditemukan:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("\nJangan terapkan migration 0003 sebelum semuanya bersih.");
    process.exit(1);
  }

  console.log(
    `LULUS — ${tenants.length} tenant, ${companies.length} perusahaan, ` +
      `${users.length} pengguna: semua bertaut, semua ber-email, tidak ada kembar.`
  );
  console.log("Aman menerapkan migration 0003: npm run db:migrate:control");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
