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
      /** Instruksi bayar PENDING termuda (issue #141) — VA/QRIS untuk
       *  ditampilkan ulang sampai lunas/kedaluwarsa. */
      pendingPayment: {
        bank: string | null;
        vaNumber: string | null;
        qrString: string | null;
        expiresAt: Date | null;
        gateway: string | null;
      } | null;
    }[];
    /** Profil penagihan (NPWP lawan transaksi) — issue #141. */
    profile: { npwp: string | null; name: string | null; address: string | null } | null;
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
    const pendingPayments = await platformDb.payment.findMany({
      where: {
        platformInvoiceId: { in: invoices.map((inv) => inv.id) },
        status: "pending",
      },
      orderBy: { id: "desc" },
      select: {
        platformInvoiceId: true,
        bank: true,
        vaNumber: true,
        qrString: true,
        expiresAt: true,
        gateway: true,
      },
    });
    const paymentByInvoice = new Map<number, (typeof pendingPayments)[number]>();
    for (const p of pendingPayments) {
      if (!paymentByInvoice.has(p.platformInvoiceId)) paymentByInvoice.set(p.platformInvoiceId, p);
    }
    const profile = await platformDb.tenantBillingProfile.findUnique({
      where: { tenantId },
      select: { npwp: true, name: true, address: true },
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
      invoices: invoices.map((inv) => {
        const pending = paymentByInvoice.get(inv.id) ?? null;
        return {
          ...inv,
          total: inv.total.toString(),
          pendingPayment: pending
            ? {
                bank: pending.bank,
                vaNumber: pending.vaNumber,
                qrString: pending.qrString,
                expiresAt: pending.expiresAt,
                gateway: pending.gateway,
              }
            : null,
        };
      }),
      profile,
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
