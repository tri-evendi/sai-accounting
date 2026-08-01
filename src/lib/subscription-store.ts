/**
 * Sambungan basis data LANGGANAN untuk halaman aplikasi (issue #140) —
 * KODE PENAGIHAN: satu-satunya jenis modul yang boleh mengimpor
 * `lib/platform-db.ts` (doktrin #137 — jangan pernah dari jalur panas).
 *
 * ══ TAHAN MATI ══════════════════════════════════════════════════════════════
 * Halaman pengaturan tenant harus tetap terbuka saat `sai_platform` mati atau
 * belum disediakan: bagian yang datang dari basis data KENDALI (paket
 * ter-snapshot, kuota, pemakaian) selalu tampil; bagian platform (langganan,
 * riwayat tagihan) jatuh ke `billing: null` dengan tenang — pemanggil
 * menampilkan "penagihan tidak terjangkau", bukan halaman 500.
 *
 * Logika keputusan (perpindahan status, pengingat, nomor tagihan) MURNI di
 * `subscription-lifecycle.ts`; penjadwal yang menjalankannya berkala di
 * `scripts/subscription-scheduler.ts`.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";

export interface BillingOverview {
  tenant: {
    id: number;
    name: string;
    status: string;
    planKey: string;
    trialEndsAt: Date | null;
    maxCompanies: number;
    maxUsers: number;
  };
  usage: {
    companies: number;
    users: number;
  };
  /** `null` = basis data platform tak terjangkau / belum disediakan. */
  billing: {
    subscription: {
      status: string;
      billingCycle: string;
      price: string;
      currency: string;
      currentPeriodEnd: Date;
    } | null;
    plan: { key: string; name: string } | null;
    invoices: {
      id: number;
      number: string;
      status: string;
      issueDate: Date;
      dueDate: Date;
      total: string;
      currency: string;
    }[];
  } | null;
}

/** Ringkasan langganan + pemakaian sebuah tenant — untuk halaman /tenant. */
export async function billingOverviewForTenant(tenantId: number): Promise<BillingOverview | null> {
  const tenant = await controlDb.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      planKey: true,
      trialEndsAt: true,
      maxCompanies: true,
      maxUsers: true,
    },
  });
  if (!tenant) return null;

  const [companies, users] = await Promise.all([
    controlDb.company.count({ where: { tenantId, isActive: true } }),
    controlDb.user.count({ where: { tenantId } }),
  ]);

  let billing: BillingOverview["billing"] = null;
  try {
    const subscription = await platformDb.subscription.findFirst({
      where: { tenantId },
      orderBy: { id: "desc" },
      select: {
        status: true,
        billingCycle: true,
        price: true,
        currency: true,
        currentPeriodEnd: true,
        plan: { select: { key: true, name: true } },
      },
    });
    const invoices = await platformDb.platformInvoice.findMany({
      where: { tenantId },
      orderBy: { id: "desc" },
      take: 24,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        total: true,
        currency: true,
      },
    });
    billing = {
      subscription: subscription
        ? {
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            price: subscription.price.toString(),
            currency: subscription.currency,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      plan: subscription?.plan ?? null,
      invoices: invoices.map((inv) => ({ ...inv, total: inv.total.toString() })),
    };
  } catch (error) {
    /* Penagihan mati ≠ halaman mati — biar bagian kendali tetap tampil. */
    console.error("[subscription-store] basis data platform tak terjangkau:", error);
    billing = null;
  }

  return {
    tenant,
    usage: { companies, users },
    billing,
  };
}
