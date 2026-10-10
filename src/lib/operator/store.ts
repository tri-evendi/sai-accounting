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
/* Inti rekonsiliasi tinggal di `src/lib/`, BUKAN di `scripts/`: mengimpor skrip
 * CLI dari sini menyeret impor gaya-skrip ke bundel aplikasi dan mematikan
 * `next build` (ditemukan saat penggelaran #151). */
import { runReconciliation, type ReconciliationReport } from "@/lib/platform-reconciliation";
import {
  mailSettingsView,
  readMailSettings,
  type MailSettingsClient,
  type MailSettingsView,
  type MailTransport,
} from "@/lib/mail-settings";
import { resolveMailConfig, type MailConfigSource } from "@/lib/mailer-core";
import { encryptionKeyAvailable } from "@/lib/settings-crypto";
import { summarizeRevenue, type RevenueSummary } from "@/lib/platform-revenue";

export type { ReconciliationReport };
export type { MailSettingsView };

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
      /** `none` | `manual` | `auto` — siapa yang boleh ditagih penjadwal. */
      billingMode: string;
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
        /* Mode penagihan ikut: halaman rincian memajangnya sebagai fakta DAN
           panel tindakan memakainya sebagai nilai awal pilihan. */
        billingMode: true,
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
            billingMode: subscription.billingMode,
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

/* ────────────────────────── Pengaturan surel (#169) ──────────────────────── */

export interface OperatorMailSettings {
  /** false = `sai_platform` tak terjangkau — layar berkata jujur, tidak 500,
   *  dan pengirim surel sementara memakai environment. */
  available: boolean;
  /** `null` = belum pernah disimpan dari konsol (env yang berlaku). */
  settings: MailSettingsView | null;
  /** Apa yang BENAR-BENAR dipakai pengirim saat ini — sumber, transport, dan
   *  alamat pengirimnya. Tidak pernah memuat kata sandi. */
  effective: {
    source: MailConfigSource;
    transport: MailTransport;
    requestedTransport: MailTransport;
    from: string;
  };
  /** `SETTINGS_ENCRYPTION_KEY` layak? Layar memberitahukannya SEBELUM operator
   *  mengetik kata sandi, bukan sesudah penyimpanannya ditolak. */
  encryptionKeyAvailable: boolean;
}

/**
 * Pengaturan surel untuk konsol operator. KATA SANDI TIDAK PERNAH IKUT: yang
 * keluar dari sini hanya `hasPassword` (layar menampilkan `••••`).
 */
export async function mailSettingsForOperator(
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<OperatorMailSettings> {
  const client = deps.platform as unknown as MailSettingsClient;

  let available = true;
  let settings: MailSettingsView | null = null;
  try {
    const row = await readMailSettings(client);
    settings = row ? mailSettingsView(row) : null;
  } catch (error) {
    console.error("[operator-store] pengaturan surel tak terbaca:", error);
    available = false;
  }

  const config = await resolveMailConfig(client);

  return {
    available,
    settings,
    effective: {
      source: config.source,
      transport: config.transport,
      requestedTransport: config.requestedTransport,
      from: config.from,
    },
    encryptionKeyAvailable: encryptionKeyAvailable(),
  };
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

/* ───────────────────────────── Ringkasan konsol ──────────────────────────── */

export interface OperatorOverviewControl {
  /** Jumlah tenant per status — kunci = nilai `tenants.status`. */
  byStatus: Record<string, number>;
  total: number;
  /** Tenant yang uji cobanya berakhir dalam 7 hari ke depan (belum berbayar). */
  trialsEndingSoon: number;
  /** Tenant yang uji cobanya SUDAH lewat tapi statusnya masih `trialing`. */
  trialsExpired: number;
  companies: number;
  users: number;
  /** Tenant terbaru — "siapa yang masuk hari ini", bukan daftar lengkap. */
  newest: { id: number; name: string; slug: string; status: string; createdAt: Date }[];
}

export interface OperatorOverviewPlatform {
  /** Langganan per status — kunci = nilai `subscriptions.status`. */
  subscriptionsByStatus: Record<string, number>;
  /** Tagihan `issued` yang sudah lewat jatuh tempo, beserta totalnya (IDR). */
  overdueInvoices: number;
  overdueTotal: number;
  /** Tagihan `issued` yang belum jatuh tempo. */
  openInvoices: number;
  openTotal: number;
  lastRun: { finishedAt: Date; status: string; errorCount: number } | null;
}

export interface OperatorOverview {
  control: OperatorOverviewControl;
  /**
   * Angka PENDAPATAN (`docs/KOMERSIALISASI.md` §8). `null` bersama `platform`
   * di bawah — ia dihitung dari tabel yang sama, jadi ia mati bersamanya.
   */
  revenue: RevenueSummary | null;
  /** `null` = `sai_platform` tak terjangkau. Bagian kendali tetap benar. */
  platform: OperatorOverviewPlatform | null;
}

/** Ambang "uji coba hampir berakhir" — tujuh hari, satu minggu kerja operator. */
const AMBANG_UJI_COBA_HARI = 7;

/**
 * Angka pembuka konsol — SATU bacaan untuk halaman ringkasan.
 *
 * ══ KENAPA BUKAN `listTenantsForOperator().length` ═════════════════════════
 * Karena itu menarik SELURUH baris tenant beserta dua `groupBy` pemakaian ke
 * memori hanya untuk menghitungnya. Halaman ringkasan adalah halaman pertama
 * yang dibuka setiap sesi operator; ia harus menjadi yang paling murah, bukan
 * yang paling mahal. Yang dihitung di sini dihitung oleh basis data.
 *
 * ══ DUA BIDANG, SATU HALAMAN, SATU YANG BOLEH MATI ═════════════════════════
 * Pola `billingOverviewForTenant` persis: bagian KENDALI (jumlah tenant, PT,
 * pengguna, uji coba) SELALU tampil — ia yang menjawab "apakah platformnya
 * hidup"; bagian PLATFORM jatuh ke `null` dengan tenang saat `sai_platform`
 * mati, dan halaman mengatakannya sebagai kalimat, bukan sebagai 500.
 *
 * Kegagalan bagian kendali TIDAK ditangkap: kalau basis data kendali mati,
 * konsol operator memang tidak punya apa pun untuk diperlihatkan — dan
 * menyembunyikannya di balik "0 tenant" adalah angka yang berbohong.
 */
export async function operatorOverview(
  deps: { control: ControlClient; platform: PlatformClient } = {
    control: controlDb,
    platform: platformDb,
  },
  now: Date = new Date()
): Promise<OperatorOverview> {
  const batasUjiCoba = new Date(now.getTime() + AMBANG_UJI_COBA_HARI * 24 * 60 * 60 * 1000);

  const [statusRows, trialsEndingSoon, trialsExpired, companies, users, newest] =
    await Promise.all([
      deps.control.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
      deps.control.tenant.count({
        where: { status: "trialing", trialEndsAt: { gte: now, lte: batasUjiCoba } },
      }),
      deps.control.tenant.count({ where: { status: "trialing", trialEndsAt: { lt: now } } }),
      deps.control.company.count({ where: { isActive: true } }),
      deps.control.user.count(),
      deps.control.tenant.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, slug: true, status: true, createdAt: true },
      }),
    ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const control: OperatorOverviewControl = {
    byStatus,
    total,
    trialsEndingSoon,
    trialsExpired,
    companies,
    users,
    newest,
  };

  let platform: OperatorOverviewPlatform | null = null;
  let revenue: RevenueSummary | null = null;
  try {
    const [subRows, overdue, open, lastRun, subsForMrr, paidPayments, issuedInvoices] =
      await Promise.all([
      deps.platform.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      deps.platform.platformInvoice.aggregate({
        where: { status: "issued", dueDate: { lt: now } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      deps.platform.platformInvoice.aggregate({
        where: { status: "issued", dueDate: { gte: now } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      deps.platform.schedulerRun.findFirst({
        orderBy: { id: "desc" },
        select: { finishedAt: true, status: true, errorCount: true },
      }),
      /* ── Bahan §8. Ketiganya dibaca di putaran yang SAMA: angka pendapatan
         tidak boleh punya batas gagal sendiri — "MRR tak terjangkau sementara
         jumlah tagihan terbaca" adalah dasbor yang separuh benar, dan separuh
         benar pada angka uang lebih buruk daripada kosong. ── */
      deps.platform.subscription.findMany({
        select: {
          tenantId: true,
          status: true,
          billingMode: true,
          billingCycle: true,
          price: true,
        },
      }),
      /* UANG = baris `payments` berstatus `paid`. Comp tidak pernah melahirkan
         baris pembayaran, jadi hadiah terpisah dari penjualan SECARA
         KONSTRUKSI (`lib/platform-revenue.ts`). */
      deps.platform.payment.groupBy({ by: ["tenantId"], where: { status: "paid" } }),
      deps.platform.platformInvoice.findMany({
        where: { status: "issued" },
        select: { tenantId: true, dueDate: true, total: true },
      }),
    ]);

    const subscriptionsByStatus: Record<string, number> = {};
    for (const row of subRows) subscriptionsByStatus[row.status] = row._count._all;

    platform = {
      subscriptionsByStatus,
      overdueInvoices: overdue._count._all,
      /* `Decimal` → `number` DI SINI, sekali — pola `plan-catalog.ts`. Jumlah
         tagihan platform tidak pernah mendekati batas presisi `number`, dan
         angka ini dipajang, tidak dipakai menghitung apa pun. */
      overdueTotal: Number(overdue._sum.total ?? 0),
      openInvoices: open._count._all,
      openTotal: Number(open._sum.total ?? 0),
      lastRun,
    };

    revenue = summarizeRevenue({
      subscriptions: subsForMrr.map((sub) => ({
        tenantId: sub.tenantId,
        status: sub.status,
        billingMode: sub.billingMode,
        billingCycle: sub.billingCycle,
        /* `Decimal` → `number` DI SINI, sekali — pola `plan-catalog.ts`. */
        price: Number(sub.price),
      })),
      payingTenantIds: paidPayments.map((row) => row.tenantId),
      /* Penyebut konversi = SELURUH pendaftar, dari basis data kendali yang
         sudah dibaca di atas. Memakai jumlah langganan akan mengecualikan
         tenant yang belum pernah punya baris langganan — yaitu justru yang
         gagal dikonversi. */
      totalTenants: total,
      outstanding: issuedInvoices.map((inv) => ({
        tenantId: inv.tenantId,
        dueDate: inv.dueDate,
        total: Number(inv.total),
      })),
      now,
    });
  } catch (error) {
    console.error("[operator-store] ringkasan platform tak terbaca:", error);
  }

  return { control, revenue, platform };
}
