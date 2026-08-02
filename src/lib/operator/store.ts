/**
 * Bacaan KONSOL OPERATOR (issue #154) — KODE PENAGIHAN: bersama
 * `subscription-store.ts`, jenis modul yang boleh mengimpor
 * `lib/platform-db.ts` (doktrin #137). JANGAN PERNAH mengimpornya dari
 * penjaga (`lib/operator/guard.ts`) atau proxy.
 *
 * ══ HANYA-BACA ══════════════════════════════════════════════════════════════
 * Tidak satu pun fungsi di sini menulis apa pun — aksi TULIS konsol (#155)
 * hidup terpisah di `lib/operator/writes.ts` (tanpa `server-only`, klien
 * disuntikkan) supaya skrip CLI pemulihan memakai inti yang sama.
 *
 * ══ TAHAN MATI (pola `billingOverviewForTenant`) ════════════════════════════
 * Bagian KENDALI (daftar tenant, kuota, pemakaian, daftar PT) selalu tampil;
 * bagian PLATFORM (langganan, tagihan, profil pajak, riwayat penjadwal) jatuh
 * ke `null` dengan tenang saat `sai_platform` mati/belum disediakan —
 * halaman menampilkan "penagihan tidak terjangkau", bukan 500.
 *
 * ══ BUKAN PINTU KE BUKU PELANGGAN ═══════════════════════════════════════════
 * Konsol operator melihat METADATA LANGGANAN, bukan pembukuan pelanggan.
 * Tidak ada satu pun fungsi di sini yang membuka basis data perusahaan
 * (`company-clients`), dan itu disengaja: membaca buku pelanggan adalah
 * keputusan terpisah yang menuntut justifikasi, persetujuan, dan jejaknya
 * sendiri — di luar lingkup #154.
 *
 * Klien di-inject lewat parameter `deps` supaya mesinnya teruji tanpa basis
 * data (`tests/operator-store.test.ts`); pemanggil nyata memakai bawaannya.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";
import {
  runReconciliation,
  type ReconciliationReport,
} from "../../../scripts/reconcile-platform";

export type { ReconciliationReport };

type ControlClient = typeof controlDb;
type PlatformClient = typeof platformDb;

/* ─────────────────────────────── Daftar tenant ───────────────────────────── */

export interface OperatorTenantRow {
  id: number;
  name: string;
  slug: string;
  status: string;
  planKey: string;
  createdAt: Date;
  maxCompanies: number;
  maxUsers: number;
  usage: { companies: number; users: number };
}

/**
 * Daftar tenant untuk operator — murni dari basis data KENDALI (tetap hidup
 * saat platform mati). Pemakaian dihitung dari sumber kebenarannya (registry
 * perusahaan & pengguna), bukan dari `usage_counters` turunan.
 */
export async function listTenantsForOperator(
  filter: { q?: string; status?: string } = {},
  deps: { control: ControlClient } = { control: controlDb }
): Promise<OperatorTenantRow[]> {
  const q = filter.q?.trim();
  const status = filter.status?.trim();

  const tenants = await deps.control.tenant.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      planKey: true,
      createdAt: true,
      maxCompanies: true,
      maxUsers: true,
    },
  });

  const [companyCounts, userCounts] = await Promise.all([
    deps.control.company.groupBy({
      by: ["tenantId"],
      where: { isActive: true, tenantId: { not: null } },
      _count: { _all: true },
    }),
    deps.control.user.groupBy({
      by: ["tenantId"],
      where: { tenantId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const companiesByTenant = new Map(
    companyCounts.map((row) => [row.tenantId, row._count._all])
  );
  const usersByTenant = new Map(userCounts.map((row) => [row.tenantId, row._count._all]));

  return tenants.map((tenant) => ({
    ...tenant,
    usage: {
      companies: companiesByTenant.get(tenant.id) ?? 0,
      users: usersByTenant.get(tenant.id) ?? 0,
    },
  }));
}

/* ─────────────────────────────── Rincian tenant ──────────────────────────── */

export interface OperatorTenantDetail {
  tenant: {
    id: number;
    name: string;
    slug: string;
    status: string;
    planKey: string;
    trialEndsAt: Date | null;
    maxCompanies: number;
    maxUsers: number;
    createdAt: Date;
  };
  usage: { companies: number; users: number };
  /** PT milik tenant — hanya REGISTRY kendali; bukunya tidak pernah dibuka. */
  companies: {
    id: number;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: Date;
    userCount: number;
  }[];
  /** Permintaan penghapusan `pending` termuda (basis KENDALI) — bahan panel
   *  eksekusi #155. `null` = tidak ada permintaan; eksekusi memang HANYA
   *  berjalan atas permintaan eksplisit pemilik (UU PDP). */
  deletionRequest: {
    id: number;
    graceEndsAt: Date;
    note: string | null;
    createdAt: Date;
  } | null;
  /** `null` = `sai_platform` tak terjangkau / belum disediakan. */
  billing: {
    subscription: {
      status: string;
      billingCycle: string;
      price: string;
      currency: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      trialEndsAt: Date | null;
      pastDueSince: Date | null;
      cancelledAt: Date | null;
      plan: { key: string; name: string } | null;
    } | null;
    invoices: {
      id: number;
      number: string;
      status: string;
      issueDate: Date;
      dueDate: Date;
      amount: string;
      taxAmount: string;
      total: string;
      currency: string;
      payments: {
        id: number;
        status: string;
        method: string | null;
        gateway: string | null;
        amount: string;
        bank: string | null;
        vaNumber: string | null;
        paidAt: Date | null;
        createdAt: Date;
      }[];
    }[];
    profile: { npwp: string | null; name: string | null; address: string | null } | null;
  } | null;
}

export async function tenantDetailForOperator(
  tenantId: number,
  deps: { control: ControlClient; platform: PlatformClient } = {
    control: controlDb,
    platform: platformDb,
  }
): Promise<OperatorTenantDetail | null> {
  const tenant = await deps.control.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      planKey: true,
      trialEndsAt: true,
      maxCompanies: true,
      maxUsers: true,
      createdAt: true,
    },
  });
  if (!tenant) return null;

  const companies = await deps.control.company.findMany({
    where: { tenantId },
    orderBy: { id: "asc" },
    select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
  });
  const memberCounts = companies.length
    ? await deps.control.membership.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companies.map((c) => c.id) }, isActive: true },
        _count: { _all: true },
      })
    : [];
  const membersByCompany = new Map(memberCounts.map((row) => [row.companyId, row._count._all]));
  const userCount = await deps.control.user.count({ where: { tenantId } });

  const deletionRequest = await deps.control.tenantDeletionRequest.findFirst({
    where: { tenantId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, graceEndsAt: true, note: true, createdAt: true },
  });

  let billing: OperatorTenantDetail["billing"] = null;
  try {
    const subscription = await deps.platform.subscription.findFirst({
      where: { tenantId },
      orderBy: { id: "desc" },
      select: {
        status: true,
        billingCycle: true,
        price: true,
        currency: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        pastDueSince: true,
        cancelledAt: true,
        plan: { select: { key: true, name: true } },
      },
    });
    const invoices = await deps.platform.platformInvoice.findMany({
      where: { tenantId },
      orderBy: { id: "desc" },
      take: 36,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        amount: true,
        taxAmount: true,
        total: true,
        currency: true,
      },
    });
    const payments = invoices.length
      ? await deps.platform.payment.findMany({
          where: { platformInvoiceId: { in: invoices.map((inv) => inv.id) } },
          orderBy: { id: "desc" },
          select: {
            id: true,
            platformInvoiceId: true,
            status: true,
            method: true,
            gateway: true,
            amount: true,
            bank: true,
            vaNumber: true,
            paidAt: true,
            createdAt: true,
          },
        })
      : [];
    const paymentsByInvoice = new Map<number, typeof payments>();
    for (const payment of payments) {
      const list = paymentsByInvoice.get(payment.platformInvoiceId) ?? [];
      list.push(payment);
      paymentsByInvoice.set(payment.platformInvoiceId, list);
    }
    const profile = await deps.platform.tenantBillingProfile.findUnique({
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
            trialEndsAt: subscription.trialEndsAt,
            pastDueSince: subscription.pastDueSince,
            cancelledAt: subscription.cancelledAt,
            plan: subscription.plan ?? null,
          }
        : null,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        amount: invoice.amount.toString(),
        taxAmount: invoice.taxAmount.toString(),
        total: invoice.total.toString(),
        currency: invoice.currency,
        payments: (paymentsByInvoice.get(invoice.id) ?? []).map((payment) => ({
          id: payment.id,
          status: payment.status,
          method: payment.method,
          gateway: payment.gateway,
          amount: payment.amount.toString(),
          bank: payment.bank,
          vaNumber: payment.vaNumber,
          paidAt: payment.paidAt,
          createdAt: payment.createdAt,
        })),
      })),
      profile,
    };
  } catch (error) {
    /* Penagihan mati ≠ halaman mati — bagian kendali tetap tampil. */
    console.error("[operator-store] basis data platform tak terjangkau:", error);
    billing = null;
  }

  return {
    tenant,
    usage: { companies: companies.filter((c) => c.isActive).length, users: userCount },
    companies: companies.map((company) => ({
      ...company,
      userCount: membersByCompany.get(company.id) ?? 0,
    })),
    deletionRequest,
    billing,
  };
}

/* ─────────────────────────────── Daftar paket ────────────────────────────── */

export interface OperatorPlanRow {
  key: string;
  name: string;
  priceMonthly: string;
  currency: string;
  maxCompanies: number;
  maxUsers: number;
  trialDays: number;
}

/**
 * Paket aktif untuk panel ganti paket (#155). `null` = platform tak
 * terjangkau — panelnya berkata "penagihan tidak terjangkau" dan tombolnya
 * mati, bukan 500 (pola tahan-mati modul ini).
 */
export async function listPlansForOperator(
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<OperatorPlanRow[] | null> {
  try {
    const plans = await deps.platform.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: {
        key: true,
        name: true,
        priceMonthly: true,
        currency: true,
        maxCompanies: true,
        maxUsers: true,
        trialDays: true,
      },
    });
    return plans.map((plan) => ({ ...plan, priceMonthly: plan.priceMonthly.toString() }));
  } catch (error) {
    console.error("[operator-store] daftar paket tak terbaca:", error);
    return null;
  }
}

/* ─────────────────────────────── Rekonsiliasi ────────────────────────────── */

/**
 * Laporan `runReconciliation` (scripts/reconcile-platform.ts) sebagai data
 * halaman, bukan stdout. `null` = platform tak terjangkau — pemeriksaannya
 * memang membaca kedua sisi, tanpa platform tidak ada yang dibandingkan.
 */
export async function reconciliationForOperator(
  deps: { control: ControlClient; platform: PlatformClient } = {
    control: controlDb,
    platform: platformDb,
  }
): Promise<ReconciliationReport | null> {
  try {
    return await runReconciliation(deps.platform, deps.control);
  } catch (error) {
    console.error("[operator-store] rekonsiliasi gagal berjalan:", error);
    return null;
  }
}

/* ─────────────────────────── Riwayat putaran penjadwal ───────────────────── */

export interface SchedulerRunDetails {
  issued: string[];
  reminders: string[];
  transitions: string[];
  adoptions: string[];
  errors: string[];
}

export interface OperatorSchedulerRun {
  id: number;
  startedAt: Date;
  finishedAt: Date;
  /** ok | error */
  status: string;
  invoicesIssued: number;
  remindersSent: number;
  statusChanges: number;
  adoptions: number;
  errorCount: number;
  details: SchedulerRunDetails | null;
}

function parseRunDetails(raw: string | null): SchedulerRunDetails | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SchedulerRunDetails>;
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return {
      issued: list(parsed.issued),
      reminders: list(parsed.reminders),
      transitions: list(parsed.transitions),
      adoptions: list(parsed.adoptions),
      errors: list(parsed.errors),
    };
  } catch {
    return null;
  }
}

/**
 * Putaran penjadwal terakhir (tabel `scheduler_runs`, ditulis
 * `scripts/subscription-scheduler.ts` sejak #154). `null` = platform tak
 * terjangkau ATAU tabelnya belum dimigrasikan — keduanya keadaan "belum ada
 * yang bisa dilaporkan", bukan 500.
 */
export async function schedulerRunsForOperator(
  limit = 10,
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<OperatorSchedulerRun[] | null> {
  try {
    const runs = await deps.platform.schedulerRun.findMany({
      orderBy: { id: "desc" },
      take: Math.min(50, Math.max(1, limit)),
    });
    return runs.map((run) => ({
      id: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      invoicesIssued: run.invoicesIssued,
      remindersSent: run.remindersSent,
      statusChanges: run.statusChanges,
      adoptions: run.adoptions,
      errorCount: run.errorCount,
      details: parseRunDetails(run.details),
    }));
  } catch (error) {
    console.error("[operator-store] riwayat penjadwal tak terbaca:", error);
    return null;
  }
}
