/**
 * Ganti PAKET sebuah tenant (issue #140) — dijalankan operator, sampai gateway
 * pembayaran (#141) memberi pelanggan tombolnya sendiri.
 *
 *   npm run change-plan -- --tenant <id|slug> --plan <key>
 *
 * ══ URUTAN TULIS (doktrin #137 — tidak boleh ditukar) ═══════════════════════
 *   1. `sai_platform` DULU: langganan dibuat/dipindah paket, dengan SNAPSHOT
 *      harga (`subscriptions.price` disalin dari `plans`, bukan dirujuk).
 *   2. `sai_control` BELAKANGAN: `tenants.plan_key` + kuota `max_companies`/
 *      `max_users` DISALIN dari paket (pola snapshot docs/MULTI-TENANT.md §5 —
 *      menaikkan harga/kuota paket tidak boleh diam-diam mengubah pelanggan
 *      berjalan), dan `tenants.status` disamakan dengan status langganannya.
 *
 * Crash di antara keduanya meninggalkan langganan platform tanpa salinan
 * kendali — persis arah sisa yang ditemukan `npm run reconcile:platform`
 * (pemeriksaan "status-tak-serasi"), lalu disembuhkan dengan menjalankan
 * skrip ini lagi. Urutan sebaliknya (kendali dulu) meninggalkan tenant naik
 * kelas tanpa catatan pembayaran — drift yang tidak akan pernah ketahuan.
 *
 * Tenant yang BELUM punya langganan memulai `trialing` dengan
 * `trial_ends_at = sekarang + plans.trial_days`; `trial_days` 0 → langsung
 * `active`, dan tagihan pertamanya diterbitkan penjadwal pada putaran
 * berikutnya.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { nextPeriod, tenantStatusForSubscription } from "../src/lib/subscription-lifecycle";
import type { SubscriptionStatus } from "../src/lib/platform-constants";

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, rawUrl: string): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const tenantArg = argValue("--tenant");
  const planKey = argValue("--plan");
  if (!tenantArg || !planKey) {
    console.error("Pakai: npm run change-plan -- --tenant <id|slug> --plan <key>");
    process.exit(1);
  }

  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
  if (!platformUrl || !controlUrl) {
    console.error("✗ PLATFORM_DATABASE_URL dan CONTROL_DATABASE_URL wajib diset.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const tenant = /^\d+$/.test(tenantArg)
    ? await control.tenant.findUnique({ where: { id: Number(tenantArg) } })
    : await control.tenant.findUnique({ where: { slug: tenantArg } });
  if (!tenant) {
    console.error(`✗ Tenant "${tenantArg}" tidak ditemukan di basis data kendali.`);
    process.exit(1);
  }

  const plan = await platform.plan.findUnique({ where: { key: planKey } });
  if (!plan || !plan.isActive) {
    console.error(
      `✗ Paket "${planKey}" tidak ada / nonaktif. Jalankan dulu: npm run db:seed:plans`
    );
    process.exit(1);
  }

  const now = new Date();

  /* ── 1. PLATFORM dulu ─────────────────────────────────────────────────── */
  const existing = await platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
  });

  let subscription;
  if (existing && existing.status !== "cancelled") {
    subscription = await platform.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        /* SNAPSHOT harga — harga paket boleh naik besok; langganan ini tidak. */
        price: plan.priceMonthly,
        currency: plan.currency,
      },
    });
    console.log(`~ subscription #${subscription.id} pindah ke paket "${plan.key}"`);
  } else {
    const status = plan.trialDays > 0 ? "trialing" : "active";
    const period = nextPeriod("monthly", now);
    subscription = await platform.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status,
        billingCycle: "monthly",
        price: plan.priceMonthly,
        currency: plan.currency,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        trialEndsAt:
          plan.trialDays > 0
            ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
            : null,
      },
    });
    console.log(
      `+ subscription #${subscription.id} (${status}) dibuat untuk tenant "${tenant.slug}"`
    );
  }

  /* ── 2. KENDALI belakangan: salin kuota + status (snapshot) ───────────── */
  await control.tenant.update({
    where: { id: tenant.id },
    data: {
      planKey: plan.key,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
      trialEndsAt: subscription.trialEndsAt,
      status: tenantStatusForSubscription(subscription.status as SubscriptionStatus),
    },
  });
  console.log(
    `✓ tenant "${tenant.slug}": plan_key=${plan.key}, max_companies=${plan.maxCompanies}, ` +
      `max_users=${plan.maxUsers}, status=${subscription.status} — salinan kendali ditulis TERAKHIR`
  );

  await platform.$disconnect();
  await control.$disconnect();
}

main().catch((error) => {
  console.error("Ganti paket gagal:", error);
  process.exit(1);
});
