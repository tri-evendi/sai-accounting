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
import {
  initialSubscriptionFromPlan,
  tenantStatusForSubscription,
} from "@/lib/subscription-lifecycle";

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
      currentPeriodStart: Date;
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

/* Paket yang dipakai langganan kelahiran (#152) — DIIMPOR, bukan diketik
 * ulang: kuncinya harus persis sama dengan `tenants.plan_key` yang ditulis
 * `registration-store.ts`. Dua literal yang harus sepakat akan berhenti
 * sepakat pada hari salah satunya diubah, dan akibatnya senyap: tenant lahir
 * menunjuk satu paket sementara langganannya lahir di paket lain. */
import { SIGNUP_PLAN_KEY } from "@/lib/registration";

const TRIAL_PLAN_KEY = SIGNUP_PLAN_KEY;

export type InitialSubscriptionOutcome =
  | { created: true; subscriptionId: number; status: string }
  | {
      created: false;
      reason: "platform_unreachable" | "plan_missing" | "already_exists";
    };

/**
 * Lahirkan LANGGANAN PERTAMA sebuah tenant dari paket `trial` (issue #152) —
 * dipanggil alur verifikasi email SETELAH transaksi kendalinya sukses.
 *
 * ══ KENAPA DI SINI KENDALI DULU, PLATFORM BELAKANGAN ════════════════════════
 * Doktrin #137 menuntut "platform DULU, kendali belakangan" — tetapi kelahiran
 * tenant WAJIB atomik (§4A: Tenant + User(owner) + TenantMembership lahir
 * dalam SATU transaksi kendali; kegagalan di tengah tidak boleh menyisakan
 * akun tanpa tenant), dan transaksi tidak bisa menyeberang ke `sai_platform`.
 * Kedua tuntutan itu tidak bisa dipenuhi sekaligus, dan yang menang adalah
 * atomisitas kelahiran: untuk alur INI "platform dulu" berarti langganan
 * ditulis SEGERA SETELAH transaksi kendali, lalu salinan kendali
 * (`tenants.status` + snapshot paket) diperbarui paling akhir sebagai penanda.
 * Arah kegagalannya tetap yang bisa disembuhkan: crash di antara keduanya
 * meninggalkan tenant TANPA langganan — keadaan yang ditemukan rekonsiliasi
 * ("tenant-tanpa-langganan") dan disembuhkan otomatis putaran adopsi yatim
 * penjadwal (#152), bukan langganan yang menagih tenant yang tidak ada.
 *
 * ══ TIDAK PERNAH MELEMPAR ═══════════════════════════════════════════════════
 * Penagihan mati ≠ pendaftaran mati (doktrin `lib/platform-db.ts`):
 * `sai_platform` yang belum disediakan, mati, atau belum di-seed paketnya
 * TIDAK BOLEH menggagalkan verifikasi email. Semua kegagalan dicatat ke log
 * server dan dijawab lewat `InitialSubscriptionOutcome` — pemanggil tetap
 * menjawab 200, tenant tetap lahir, putaran adopsi penjadwal menyembuhkan.
 *
 * Idempoten & tahan balapan lewat CONSTRAINT, bukan periksa-lalu-tulis:
 * `subscriptions.initial_for_tenant_id` UNIQUE — pemanggil kedua menabrak
 * P2002 dan mundur dengan tenang.
 */
export async function createInitialSubscription(
  tenantId: number,
  now: Date = new Date()
): Promise<InitialSubscriptionOutcome> {
  let plan;
  try {
    plan = await platformDb.plan.findUnique({ where: { key: TRIAL_PLAN_KEY } });
  } catch (error) {
    console.error(
      `[subscription-store] basis data platform tak terjangkau saat melahirkan ` +
        `langganan tenant #${tenantId} — tenant tetap lahir; putaran adopsi ` +
        `penjadwal (#152) yang menyembuhkan:`,
      error
    );
    return { created: false, reason: "platform_unreachable" };
  }
  if (!plan || !plan.isActive) {
    /* Tabel `plans` kosong / paket trial nonaktif = pemasangan yang belum
     * `bun run db:seed:plans` — diperlakukan seperti platform mati. */
    console.error(
      `[subscription-store] paket "${TRIAL_PLAN_KEY}" tidak ada/nonaktif ` +
        `(bun run db:seed:plans belum dijalankan?) — tenant #${tenantId} lahir ` +
        `tanpa langganan; putaran adopsi penjadwal (#152) yang menyembuhkan.`
    );
    return { created: false, reason: "plan_missing" };
  }

  const spec = initialSubscriptionFromPlan(plan, now);
  let subscription;
  try {
    subscription = await platformDb.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: spec.status,
        billingCycle: "monthly",
        /* SNAPSHOT harga (§5) — harga paket boleh naik besok; langganan ini
         * tidak ikut berubah. */
        price: plan.priceMonthly,
        currency: plan.currency,
        currentPeriodStart: spec.currentPeriodStart,
        currentPeriodEnd: spec.currentPeriodEnd,
        trialEndsAt: spec.trialEndsAt,
        /* Kunci idempotensi kelahiran — lihat komentar skema (#152). */
        initialForTenantId: tenantId,
      },
      select: { id: true, trialEndsAt: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      /* Balapan (verifikasi ganda / putaran adopsi berbarengan): langganan
       * pertamanya SUDAH lahir di tangan lain — bukan galat. */
      return { created: false, reason: "already_exists" };
    }
    console.error(
      `[subscription-store] gagal melahirkan langganan tenant #${tenantId} — ` +
        `putaran adopsi penjadwal (#152) yang menyembuhkan:`,
      error
    );
    return { created: false, reason: "platform_unreachable" };
  }

  /* Salinan KENDALI paling akhir (urutan tulis #137): status + snapshot paket
   * (kuota & trial_ends_at) disamakan dengan langganan yang baru lahir.
   * Kegagalan di sini bukan bencana — selisihnya ditemukan rekonsiliasi
   * ("status-tak-serasi") dan disembuhkan penyalinan ulang. */
  try {
    await controlDb.tenant.update({
      where: { id: tenantId },
      data: {
        planKey: plan.key,
        maxCompanies: plan.maxCompanies,
        maxUsers: plan.maxUsers,
        trialEndsAt: subscription.trialEndsAt,
        status: tenantStatusForSubscription(spec.status),
      },
    });
  } catch (error) {
    console.error(
      `[subscription-store] langganan #${subscription.id} lahir, tetapi salinan ` +
        `kendali tenant #${tenantId} gagal ditulis — rekonsiliasi yang menemukan:`,
      error
    );
  }

  return { created: true, subscriptionId: subscription.id, status: spec.status };
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
        currentPeriodStart: true,
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
            currentPeriodStart: subscription.currentPeriodStart,
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
