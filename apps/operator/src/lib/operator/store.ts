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

import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@sai/platform/platform-db";
import { makeLatestJournalDateReader } from "@op/lib/operator/writes";
import { COMPANY_DATABASE_TARGET_SELECT, toCompanyDatabaseTarget } from "@sai/db/company-url";
import { attributeConformance, tenantHealthSignals, type HealthSignal } from "@op/lib/operator/tenant-health";
/* Inti rekonsiliasi tinggal di `src/lib/`, BUKAN di `scripts/`: mengimpor skrip
 * CLI dari sini menyeret impor gaya-skrip ke bundel aplikasi dan mematikan
 * `next build` (ditemukan saat penggelaran #151). */
import { runReconciliation, type ReconciliationReport } from "@sai/platform/platform-reconciliation";
import { queueSnapshot } from "@sai/platform/job-queue";
import { readOutboxRelay, type OutboxRelaySnapshot } from "@sai/platform/outbox-relay-store";
import { jobMetrics, type LaneMetrics } from "@sai/platform/job-metrics";
import { runtimeSummary, type RuntimeSummary } from "@sai/platform/runtime-samples";
import type { LaneQueueHealth } from "@sai/core/queue-health";
import {
  mailSettingsView,
  readMailSettings,
  type MailSettingsClient,
  type MailSettingsView,
  type MailTransport,
} from "@sai/platform/mail-settings";
import { resolveMailConfig, type MailConfigSource } from "@sai/platform/mailer-core";
import { encryptionKeyAvailable } from "@sai/core/settings-crypto";
import { summarizeRevenue, type RevenueSummary } from "@sai/billing/platform-revenue";

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
  /** Mitra yang membawa tenant ini (migration kendali 0013) — komisi manual. */
  referredByPartner: string | null;
  /** Tenant demo (migration kendali 0013). */
  isDemo: boolean;
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
      /* Pencarian juga menyapu nama MITRA: "tenant mana saja yang dibawa mitra
         X?" adalah pertanyaan komisi, dan jawabannya harus satu saringan. */
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { slug: { contains: q } },
              { referredByPartner: { contains: q } },
            ],
          }
        : {}),
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
      referredByPartner: true,
      isDemo: true,
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
    referredByPartner: string | null;
    isDemo: boolean;
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
      referredByPartner: true,
      isDemo: true,
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
/** Isi `details` jejak kesesuaian, sesudah diurai & disaring. */
/** Catatan satu buku di dalam satu putaran sapuan. */
export interface ConformanceCompanyRecord {
  slug: string;
  databaseName: string;
  /** ok | findings | error */
  status: string;
  findingCount: number;
  durationMs: number;
}

export interface ConformanceRunDetails {
  /** Baris temuan: `"<slug> · <judul pemeriksaan>: <label>"`. Dipangkas 200 di sumbernya. */
  findings: string[];
  /** Buku yang GAGAL diperiksa, beserta sebabnya. */
  failures: string[];
  /**
   * Satu catatan per BASIS DATA (§6) — kosong pada putaran yang dicatat sebelum
   * sapuannya berjalan serentak.
   *
   * Kosong karena itu BUKAN "tidak ada buku yang disapu": ia putaran lama.
   * Halaman yang menampilkannya wajib membedakan keduanya, sebab "nol buku
   * disapu" adalah insiden sementara "putaran lama" bukan apa-apa.
   */
  perCompany: ConformanceCompanyRecord[];
  /**
   * Siapa yang menyapu — `node` (`svc-worker`) atau `go` (`svc-integrator`),
   * sejak sakelar `runner:` di `contract/kinds.yaml` (23 Okt 2026). `null` =
   * putaran yang dicatat sebelum medan ini ada.
   */
  runner: { runner: "node" | "go"; service: string } | null;
}

export interface OperatorConformanceRun {
  id: number;
  startedAt: Date;
  finishedAt: Date;
  /** ok | findings | error */
  status: string;
  companiesChecked: number;
  companiesFailed: number;
  findingCount: number;
  details: ConformanceRunDetails | null;
}

/**
 * `details` kesesuaian — pola `parseRunDetails`, dan alasan yang sama: isi lama
 * tidak bermigrasi saat bentuk barisnya berubah, jadi yang sampai ke layar
 * harus disaring per-elemen, bukan dipercaya karena JSON-nya terurai.
 */
function parseConformanceDetails(raw: string | null): ConformanceRunDetails | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConformanceRunDetails>;
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

    /* Disaring PER ELEMEN, dan bukan dipercaya karena JSON-nya terurai: putaran
       lama ditulis sebelum medan ini ada, dan satu elemen yang bentuknya lain
       tidak boleh menjatuhkan seluruh halaman. */
    const bukuList = (value: unknown): ConformanceCompanyRecord[] =>
      Array.isArray(value)
        ? value.flatMap((item) => {
            if (typeof item !== "object" || item === null) return [];
            const o = item as Record<string, unknown>;
            if (typeof o.slug !== "string" || typeof o.status !== "string") return [];
            return [
              {
                slug: o.slug,
                databaseName: typeof o.databaseName === "string" ? o.databaseName : "",
                status: o.status,
                findingCount: typeof o.findingCount === "number" ? o.findingCount : 0,
                durationMs: typeof o.durationMs === "number" ? o.durationMs : 0,
              },
            ];
          })
        : [];

    const p = parsed as { runner?: unknown; service?: unknown };
    const runner: ConformanceRunDetails["runner"] =
      p.runner === "node" || p.runner === "go"
        ? {
            runner: p.runner,
            service:
              typeof p.service === "string" ? p.service : p.runner === "go" ? "svc-integrator" : "svc-worker",
          }
        : null;
    return {
      findings: list(parsed.findings),
      failures: list(parsed.failures),
      perCompany: bukuList(parsed.perCompany),
      runner,
    };
  } catch {
    return null;
  }
}

/**
 * Sapuan kesesuaian data terakhir — `conformance_runs` (migration platform
 * 0018), ditulis `scripts/check-data-conformance.ts` di akhir setiap putaran.
 *
 * `null` = platform tak terjangkau ATAU migration 0018 belum diterapkan.
 * Keduanya sengaja TIDAK dibedakan, pola yang sama dengan
 * `schedulerRunsForOperator`: halaman mengatakan "belum bisa dibaca", bukan
 * mengarang sebab yang ia tidak tahu.
 */
export async function conformanceRunsForOperator(
  limit = 10,
  deps: { control: ControlClient } = { control: controlDb }
): Promise<OperatorConformanceRun[] | null> {
  try {
    const runs = await deps.control.conformanceRun.findMany({
      orderBy: { id: "desc" },
      take: Math.min(50, Math.max(1, limit)),
    });
    return runs.map((run) => ({
      id: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      companiesChecked: run.companiesChecked,
      companiesFailed: run.companiesFailed,
      findingCount: run.findingCount,
      details: parseConformanceDetails(run.details),
    }));
  } catch (error) {
    console.error("[operator-store] riwayat kesesuaian data tak terbaca:", error);
    return null;
  }
}

/**
 * Potret antrean pekerjaan per jalur — sinyal utama §11 untuk konsol.
 *
 * `null` bila tak terbaca, mengikuti pola `schedulerRunsForOperator`: halaman
 * mengatakan "belum bisa dibaca", bukan mengarang antrean kosong. Bedanya
 * menentukan di sini — tabel `jobs` yang belum dimigrasikan dan antrean yang
 * memang tak punya kerja terlihat sama persis sebagai daftar kosong, dan yang
 * pertama berarti pemasangan ini belum siap.
 */
export async function queueSnapshotForOperator(
  deps: { snapshot: () => Promise<LaneQueueHealth[]> } = { snapshot: queueSnapshot }
): Promise<LaneQueueHealth[] | null> {
  try {
    return await deps.snapshot();
  } catch (error) {
    console.error("[operator-store] potret antrean tak terbaca:", error);
    return null;
  }
}

/**
 * Jejak relay outbox per buku (09 §4) — `null` bila tak terbaca (migration
 * kendali 0012 belum diterapkan), pola yang sama dengan potret antrean:
 * "belum bisa dibaca" bukan "tidak ada yang tertahan".
 */
export async function outboxRelayForOperator(
  deps: { read: () => Promise<OutboxRelaySnapshot> } = { read: () => readOutboxRelay(controlDb) }
): Promise<OutboxRelaySnapshot | null> {
  try {
    return await deps.read();
  } catch (error) {
    console.error("[operator-store] jejak relay outbox tak terbaca:", error);
    return null;
  }
}

/**
 * Metrik antrean (§11) — `null` bila tak terbaca, pola yang sama dengan potret.
 *
 * Bedanya menentukan di sini sama seperti di sana: tabel `jobs` yang belum
 * dimigrasikan dan antrean yang memang tak punya kerja terlihat identik sebagai
 * angka nol, dan yang pertama berarti pemasangan ini belum siap.
 *
 * ⚠ Kolom `started_at` baru ada sejak migration `0007`. Pada pemasangan yang
 * belum menerapkannya, kuerinya GAGAL dan halaman mengatakan "belum bisa
 * dibaca" — dan itu jawaban yang benar. Melaporkan persentil kosong akan
 * terbaca sebagai "tidak ada pekerjaan yang lambat".
 */
export async function jobMetricsForOperator(
  deps: { metrics: () => Promise<LaneMetrics[]> } = { metrics: jobMetrics }
): Promise<LaneMetrics[] | null> {
  try {
    return await deps.metrics();
  } catch (error) {
    console.error("[operator-store] metrik antrean tak terbaca:", error);
    return null;
  }
}

/**
 * Ringkasan pemicu tahap 1d — `null` bila tak terbaca, pola yang sama.
 *
 * Tabel `runtime_samples` baru ada sejak migration `0008`. Pemasangan yang
 * belum menerapkannya mendapat "belum bisa dibaca", BUKAN vonis "belum
 * terpicu": yang kedua adalah pernyataan tentang beban kerja, dan tanpa tabel
 * tidak ada yang diketahui tentang beban kerja.
 */
export async function runtimeSummaryForOperator(
  deps: { summary: () => Promise<RuntimeSummary> } = { summary: runtimeSummary }
): Promise<RuntimeSummary | null> {
  try {
    return await deps.summary();
  } catch (error) {
    console.error("[operator-store] potret runtime tak terbaca:", error);
    return null;
  }
}

export async function schedulerRunsForOperator(
  limit = 10,
  deps: { control: ControlClient } = { control: controlDb }
): Promise<OperatorSchedulerRun[] | null> {
  try {
    const runs = await deps.control.schedulerRun.findMany({
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
  /**
   * Putaran penjadwal terakhir. Rumahnya di sini, BUKAN di `platform` di bawah
   * — dan itu koreksi, bukan kerapian: jejak putaran pindah ke basis data
   * kendali (migration kendali 0005), jadi menyarangkannya di bawah `platform`
   * berarti penagihan yang mati menyembunyikan "penjadwal tidak jalan" — tepat
   * pertanyaan yang paling dibutuhkan ketika tagihan berhenti terbit.
   */
  lastRun: { finishedAt: Date; status: string; errorCount: number } | null;
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
  /** Permintaan aktivasi yang masih TERBUKA (alur demo-first). Opsional:
   *  tabelnya baru ada sejak migration platform 0011, dan pemasangan yang
   *  belum memigrasikannya tidak boleh kehilangan ringkasan karenanya. */
  openActivationRequests?: number;
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

  const [statusRows, trialsEndingSoon, trialsExpired, companies, users, newest, lastRun] =
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
      /* Jejak penjadwal dibaca BERSAMA angka kendali, bukan bersama angka
         penagihan — lihat `OperatorOverviewControl.lastRun`. */
      deps.control.schedulerRun.findFirst({
        orderBy: { id: "desc" },
        select: { finishedAt: true, status: true, errorCount: true },
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
    lastRun,
  };

  let platform: OperatorOverviewPlatform | null = null;
  let revenue: RevenueSummary | null = null;
  try {
    const [subRows, overdue, open, subsForMrr, paidPayments, issuedInvoices] =
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

  /* Permintaan aktivasi dibaca TERPISAH, dengan batas gagalnya sendiri: tabel
     yang belum ada (migration platform 0011 belum diterapkan) hanya berarti
     tidak ada baris "perlu ditangani" untuknya — bukan ringkasan yang mati. */
  if (platform !== null) {
    try {
      platform.openActivationRequests = await deps.platform.activationRequest.count({
        where: { status: "open" },
      });
    } catch (error) {
      console.error("[operator-store] permintaan aktivasi tak terhitung:", error);
    }
  }

  return { control, revenue, platform };
}

/**
 * Warna lencana untuk STATUS TENANT — satu peta, tiga layar.
 *
 * Sampai ini ada, tiga halaman konsol masing-masing menulis
 * `READ_ONLY_STATUSES` + ternari tiga cabang yang sama persis: ringkasan,
 * daftar tenant, dan rincian tenant. Ketiganya memajang status tenant yang
 * SAMA, sering untuk tenant yang sama dalam satu sesi — dan tiga salinan
 * berarti hari ketika seseorang menambahkan status keempat, satu dari tiga
 * layar akan memberinya warna "warning" tanpa ada yang gagal.
 *
 * ⚠ Bukan `StatusBadge` (`components/shared/status-badge.tsx`): peta di sana
 * hanya mengenal status KONTRAK (`signed`/`pending`/`canceled`) dan memulangkan
 * `default` untuk apa pun di luarnya — jadi memakainya di sini akan membuat
 * setiap tenant berlencana abu-abu. Dua domain, dua peta; yang salah adalah
 * membiarkan salah satunya tidak punya rumah.
 */
export const TENANT_READ_ONLY_STATUSES: ReadonlySet<string> = new Set([
  "suspended",
  "cancelled",
  /* Uji coba habis → beku hanya-baca (alur demo-first). */
  "trial_ended",
  /* Pindah ke on-premise: bukunya di SaaS nonaktif — keadaan akhir. */
  "migrated_out",
]);

export function tenantStatusVariant(status: string): "success" | "warning" | "danger" {
  /* Buku terkunci bagi pelanggannya = `danger`, bukan `warning`: ia keadaan
     yang menghentikan pekerjaan orang, bukan yang memperingatkannya. */
  if (TENANT_READ_ONLY_STATUSES.has(status)) return "danger";
  if (status === "active") return "success";
  return "warning";
}

/**
 * Slug → id tenant untuk tautan di jejak tenant. Jejak menyimpan slug yang
 * DISALIN (ia harus terbaca sesudah tenantnya tiada), jadi baris untuk tenant
 * yang sudah dihapus memang tidak punya tujuan tautan — dan peta ini yang
 * menyatakannya, bukan tautan yang berakhir 404.
 */
export async function tenantIdsBySlug(slugs: string[]): Promise<Map<string, number>> {
  const unik = [...new Set(slugs)];
  if (unik.length === 0) return new Map();
  const rows = await controlDb.tenant.findMany({
    where: { slug: { in: unik } },
    select: { id: true, slug: true },
  });
  return new Map(rows.map((r) => [r.slug, r.id]));
}

/* ───────────────────────── Perpanjangan mendatang ──────────────────────── */

/** Jendela pengingat perpanjangan — H-60 (`docs/KOMERSIALISASI.md` §6.3, §7 langkah 9). */
export const RENEWAL_WINDOW_DAYS = 60;

export interface UpcomingRenewal {
  subscriptionId: number;
  tenantId: number;
  tenantName: string | null;
  tenantSlug: string | null;
  planName: string;
  status: string;
  billingCycle: string;
  billingMode: string;
  price: string;
  currency: string;
  currentPeriodEnd: Date;
  daysLeft: number;
}

/**
 * Langganan BERBAYAR yang periodenya berakhir dalam `days` hari ke depan —
 * daftar kerja pengingat perpanjangan H-60, yang di Fase B dikerjakan MANUSIA
 * (`KOMERSIALISASI.md` §7 langkah 9).
 *
 * Ada karena penagihan PERPANJANGAN belum ada di kode mana pun (§11): tidak ada
 * yang menerbitkan tagihan periode berikutnya, mode `auto` pun tidak. Tanpa
 * daftar ini, akhir periode sebuah langganan berlalu tanpa satu pun tanda —
 * pelanggan memakai produk gratis dan tidak ada yang tahu sejak kapan.
 *
 * Hanya `active` dan `past_due`: `trialing` punya jalurnya sendiri (tagihan
 * pertama saat uji coba habis), `suspended`/`cancelled` tidak diperpanjang.
 * Yang SUDAH lewat ikut tampil (daysLeft negatif): itu justru yang paling
 * terlambat.
 *
 * `null` = platform tak terjangkau.
 */
export async function upcomingRenewalsForOperator(
  days = RENEWAL_WINDOW_DAYS,
  now: Date = new Date(),
  deps: { control: ControlClient; platform: PlatformClient } = {
    control: controlDb,
    platform: platformDb,
  }
): Promise<UpcomingRenewal[] | null> {
  const batas = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  let subs;
  try {
    subs = await deps.platform.subscription.findMany({
      where: { status: { in: ["active", "past_due"] }, currentPeriodEnd: { lte: batas } },
      orderBy: { currentPeriodEnd: "asc" },
      take: 100,
      select: {
        id: true,
        tenantId: true,
        status: true,
        billingCycle: true,
        billingMode: true,
        price: true,
        currency: true,
        currentPeriodEnd: true,
        plan: { select: { name: true } },
      },
    });
  } catch (error) {
    console.error("[operator-store] perpanjangan mendatang tak terbaca:", error);
    return null;
  }

  const tenants = await deps.control.tenant.findMany({
    where: { id: { in: [...new Set(subs.map((s) => s.tenantId))] } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));

  return subs.map((s) => ({
    subscriptionId: s.id,
    tenantId: s.tenantId,
    tenantName: byId.get(s.tenantId)?.name ?? null,
    tenantSlug: byId.get(s.tenantId)?.slug ?? null,
    planName: s.plan.name,
    status: s.status,
    billingCycle: s.billingCycle,
    billingMode: s.billingMode,
    price: s.price.toString(),
    currency: s.currency,
    currentPeriodEnd: s.currentPeriodEnd,
    daysLeft: Math.floor((s.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  }));
}

/**
 * Slug yang diketik di saringan jejak → id tenant, termasuk slug LAMA dari
 * `tenant_slug_history`. `null` = tidak dikenal (mungkin tenant yang sudah
 * dihapus — saringan jatuh ke slug yang disalin di jejaknya).
 */
export async function tenantIdForAnySlug(slug: string): Promise<number | null> {
  const now = await controlDb.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (now) return now.id;
  const old = await controlDb.tenantSlugHistory.findUnique({ where: { slug }, select: { tenantId: true } });
  return old?.tenantId ?? null;
}

/* ─────────────────────── Permintaan hapus lintas tenant ─────────────────── */

export interface OperatorDeletionRequest {
  id: number;
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  status: string;
  graceEndsAt: Date;
  executedAt: Date | null;
  cancelledAt: Date | null;
  retentionUntil: Date | null;
  note: string | null;
  createdAt: Date;
}

/**
 * Semua permintaan penghapusan akun, terbaru dulu — sampai halaman ini satu-
 * satunya cara melihatnya adalah membuka tenant satu per satu, sehingga
 * permintaan yang masa tenggangnya SUDAH lewat bisa terlupakan berminggu-minggu
 * (UU PDP: permintaan pemilik bukan sesuatu yang boleh menunggu kebetulan).
 */
export async function deletionRequestsForOperator(limit = 200): Promise<OperatorDeletionRequest[]> {
  const rows = await controlDb.tenantDeletionRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(500, Math.max(1, limit)),
    select: {
      id: true,
      tenantId: true,
      status: true,
      graceEndsAt: true,
      executedAt: true,
      cancelledAt: true,
      retentionUntil: true,
      note: true,
      createdAt: true,
      tenant: { select: { name: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    tenantSlug: r.tenant.slug,
    status: r.status,
    graceEndsAt: r.graceEndsAt,
    executedAt: r.executedAt,
    cancelledAt: r.cancelledAt,
    retentionUntil: r.retentionUntil,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

/* ───────────────────────────── Katalog paket ───────────────────────────── */

export interface OperatorCatalogPlan {
  id: number;
  key: string;
  name: string;
  priceMonthly: string;
  priceYearly: string | null;
  currency: string;
  maxCompanies: number;
  maxUsers: number;
  trialDays: number;
  isActive: boolean;
  isPublic: boolean;
  contactOnly: boolean;
  isRecommended: boolean;
  /** Langganan yang TIDAK `cancelled` pada paket ini. */
  subscribers: number;
}

/**
 * Katalog paket HANYA-BACA. Menyuntingnya dari layar sengaja belum ada:
 * tangga harga dijaga `docs/PRICING.md` + `tests/pricing-ladder.test.ts`
 * dan ditulis `bun run db:seed:plans`; editor layar akan membuat basis data
 * dan dokumen yang dijaga tes itu menyimpang tanpa satu pun tes merah.
 *
 * `null` = platform tak terjangkau.
 */
export async function plansForOperatorCatalog(): Promise<OperatorCatalogPlan[] | null> {
  try {
    const [plans, counts] = await Promise.all([
      platformDb.plan.findMany({ orderBy: [{ isActive: "desc" }, { priceMonthly: "asc" }] }),
      platformDb.subscription.groupBy({
        by: ["planId"],
        where: { status: { not: "cancelled" } },
        _count: { _all: true },
      }),
    ]);
    const byPlan = new Map(counts.map((c) => [c.planId, c._count._all]));
    return plans.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      priceMonthly: p.priceMonthly.toString(),
      priceYearly: p.priceYearly?.toString() ?? null,
      currency: p.currency,
      maxCompanies: p.maxCompanies,
      maxUsers: p.maxUsers,
      trialDays: p.trialDays,
      isActive: p.isActive,
      isPublic: p.isPublic,
      contactOnly: p.contactOnly,
      isRecommended: p.isRecommended,
      subscribers: byPlan.get(p.id) ?? 0,
    }));
  } catch (error) {
    console.error("[operator-store] katalog paket tak terbaca:", error);
    return null;
  }
}

/* ─────────────────────────── Kesehatan satu tenant ─────────────────────── */

/**
 * Kumpulkan masukan `tenantHealthSignals` untuk SATU tenant (halaman rincian).
 *
 * Tanggal jurnal termuda tiap PT aktif dibaca dengan pembaca yang SAMA dengan
 * jangkar retensi hapus-tenant (`makeLatestJournalDateReader`, koneksi pendek
 * per buku — bukan klien Prisma buku yang akan mengusir klien milik pelanggan
 * dari kolam LRU). Hanya TANGGAL; tidak ada isi buku yang dibaca.
 */
export async function tenantHealthForOperator(tenant: {
  id: number;
  maxCompanies: number;
  maxUsers: number;
  usage: { companies: number; users: number };
}): Promise<HealthSignal[]> {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  const companies = await controlDb.company.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { slug: true, ...COMPANY_DATABASE_TARGET_SELECT },
  });

  const reader = controlUrl ? makeLatestJournalDateReader(controlUrl) : null;
  const books = await Promise.all(
    companies.map(async (c) => {
      if (!reader) return { slug: c.slug, latestJournal: "unreadable" as const };
      try {
        return { slug: c.slug, latestJournal: await reader(toCompanyDatabaseTarget(c)) };
      } catch (error) {
        console.warn(`[operator-health] buku ${c.databaseName} tak terbaca: ${String(error)}`);
        return { slug: c.slug, latestJournal: "unreadable" as const };
      }
    })
  );

  let conformance: { findings: number; ambiguousSlugs: string[] } | null = null;
  try {
    const last = await controlDb.conformanceRun.findFirst({ orderBy: { id: "desc" }, select: { details: true } });
    const details = parseConformanceDetails(last?.details ?? null);
    if (details) {
      const slugs = companies.map((c) => c.slug);
      const shared = await controlDb.company.findMany({
        where: { slug: { in: slugs }, NOT: { tenantId: tenant.id } },
        select: { slug: true },
      });
      conformance = attributeConformance(details.findings, slugs, new Set(shared.map((s) => s.slug)));
    }
  } catch (error) {
    console.error("[operator-health] sapuan kesesuaian tak terbaca:", error);
  }

  return tenantHealthSignals({
    usage: tenant.usage,
    quota: { maxCompanies: tenant.maxCompanies, maxUsers: tenant.maxUsers },
    books,
    conformance,
  });
}

/* ─────────────────── Permintaan aktivasi (alur demo-first) ───────────────── */

export interface OperatorActivationRequest {
  id: number;
  tenantId: number;
  /** `null` = tenantnya sudah tidak ada di kendali (dihapus). */
  tenantName: string | null;
  tenantSlug: string | null;
  referredByPartner: string | null;
  requestedByName: string | null;
  tenantStatus: string;
  note: string | null;
  status: string;
  handledBy: string | null;
  handledAt: Date | null;
  createdAt: Date;
}

/**
 * Permintaan aktivasi dari customer (`activation_requests`, migration platform
 * 0011) — daftar kerja "siapa yang menunggu dihubungi". `null` = platform tak
 * terjangkau (tahan-mati: daftar tenant di atasnya tetap tampil).
 */
export async function activationRequestsForOperator(
  filter: { status?: "open" | "handled"; tenantId?: number; limit?: number } = {},
  deps: { control: ControlClient; platform: PlatformClient } = {
    control: controlDb,
    platform: platformDb,
  }
): Promise<OperatorActivationRequest[] | null> {
  let rows;
  try {
    rows = await deps.platform.activationRequest.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
    });
  } catch (error) {
    console.error("[operator-store] permintaan aktivasi tak terbaca:", error);
    return null;
  }
  const tenants = rows.length
    ? await deps.control.tenant.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } },
        select: { id: true, name: true, slug: true, referredByPartner: true },
      })
    : [];
  const byId = new Map(tenants.map((t) => [t.id, t]));
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    tenantName: byId.get(r.tenantId)?.name ?? null,
    tenantSlug: byId.get(r.tenantId)?.slug ?? null,
    referredByPartner: byId.get(r.tenantId)?.referredByPartner ?? null,
    requestedByName: r.requestedByName,
    tenantStatus: r.tenantStatus,
    note: r.note,
    status: r.status,
    handledBy: r.handledBy,
    handledAt: r.handledAt,
    createdAt: r.createdAt,
  }));
}
