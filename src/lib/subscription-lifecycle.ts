/**
 * MESIN SIKLUS HIDUP LANGGANAN (issue #140) — modul MURNI, pola `lib/authz.ts`:
 * tanpa React/Prisma/next/server-only, supaya (1) teruji tuntas di
 * `tests/subscription-lifecycle.test.ts` dan (2) bisa diimpor skrip penjadwal
 * (`scripts/subscription-scheduler.ts`), yang tidak bisa memuat modul
 * `server-only`.
 *
 * Diagram yang ditegakkan (docs/MULTI-TENANT.md §7.4 — HARFIAH; perpindahan
 * yang tidak tergambar di sana TIDAK ada di sini):
 *
 *   trialing ──(bayar)──> active ──(gagal bayar)──> past_due
 *       │                    ↑                          │
 *       └──(trial habis)─────┘                          ├──(bayar)──> active
 *                                                       └──(tenggang habis)──> suspended
 *   suspended ──(bayar)──> active
 *   suspended ──(berhenti)──> cancelled    [buku besar TIDAK PERNAH dihapus]
 *
 * "Trial habis → active" bukan hadiah: aktif berarti SIKLUS TAGIH DIMULAI —
 * tagihan pertama terbit pada saat itu juga, dan bila tidak dibayar, jalur
 * gagal-bayar yang biasa (past_due → suspended) yang bekerja.
 *
 * ══ suspended = HANYA-BACA, dan kenapa ══════════════════════════════════════
 * Pelanggan yang berhenti membayar TETAP wajib menyimpan pembukuannya (UU KUP,
 * retensi 10 tahun) dan tetap harus bisa mengunduhnya. Maka `suspended`
 * menolak setiap izin TULIS di lapisan PENJAGA (auth-guard/page-auth — bukan
 * disembunyikan di UI), sementara baca & ekspor tetap jalan. `cancelled`
 * diperlakukan sama: berhenti berlangganan bukan kehilangan akses baca.
 * TIDAK ADA keadaan yang menghapus data — tidak satu pun.
 */

import type { SubscriptionStatus } from "@/lib/platform-constants";
import { SUBSCRIPTION_STATUSES } from "@/lib/platform-constants";
import { computeTax, DEFAULT_TAX_RATE } from "@/lib/tax";

export const SUBSCRIPTION_EVENTS = [
  "payment_received",
  "payment_failed",
  "trial_expired",
  "grace_expired",
  "cancel",
] as const;
export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

/**
 * Tabel perpindahan — SATU-SATUNYA tempat aturannya ditulis. `null` = event
 * itu tidak berlaku pada keadaan itu (bukan galat: penjadwal yang berjalan
 * dua kali akan menyodorkan event yang sudah lewat, dan jawaban yang benar
 * adalah "tidak ada yang berubah", bukan tagihan kedua).
 */
const TRANSITIONS: Record<
  SubscriptionStatus,
  Partial<Record<SubscriptionEvent, SubscriptionStatus>>
> = {
  trialing: {
    payment_received: "active",
    /* Trial habis = siklus tagih dimulai; tagihan pertama terbit bersamanya. */
    trial_expired: "active",
  },
  active: {
    /* Pembayaran perpanjangan — keadaan tidak berubah, tapi SAH (bukan null):
     * pembayaran pada langganan aktif adalah kejadian normal setiap bulan. */
    payment_received: "active",
    payment_failed: "past_due",
  },
  past_due: {
    payment_received: "active",
    grace_expired: "suspended",
  },
  suspended: {
    payment_received: "active",
    /* Berhenti hanya dari suspended — persis diagram. Pelanggan aktif yang
     * ingin berhenti membiarkan tagihannya jatuh tempo; jalur itu sudah ada. */
    cancel: "cancelled",
  },
  /* Keadaan akhir. TIDAK ADA jalan keluar — dan TIDAK ADA penghapusan data. */
  cancelled: {},
};

/** Perpindahan keadaan, atau `null` bila event tidak berlaku (idempoten). */
export function transition(
  status: SubscriptionStatus,
  event: SubscriptionEvent
): SubscriptionStatus | null {
  return TRANSITIONS[status][event] ?? null;
}

/**
 * Status TENANT (basis data kendali) yang mencerminkan status langganan —
 * disalin ke `tenants.status` SETELAH platform ditulis (urutan tulis #137).
 * Identitas satu-satu; `pending_verification` milik tenant yang BELUM punya
 * langganan, jadi tidak pernah muncul di sini.
 */
export function tenantStatusForSubscription(status: SubscriptionStatus): string {
  return status;
}

/* ── suspended = hanya-baca: klasifikasi izin ──────────────────────────────── */

/**
 * Aksi yang TETAP BOLEH saat tenant hanya-baca. `export` masuk dengan sengaja:
 * pelanggan yang menunggak justru sedang paling butuh mengunduh bukunya.
 * Aksi yang TIDAK dikenal dianggap TULIS — arah gagal yang aman: izin baru
 * yang lupa didaftarkan tertutup saat suspended, bukan terbuka.
 */
const READ_ACTIONS: ReadonlySet<string> = new Set(["read", "view", "export"]);

/** Status tenant yang membuat bukunya HANYA-BACA. */
export const READ_ONLY_TENANT_STATUSES: readonly string[] = ["suspended", "cancelled"];

export function isReadOnlyTenantStatus(status: string | null | undefined): boolean {
  return status != null && READ_ONLY_TENANT_STATUSES.includes(status);
}

/** Apakah izin ini MENULIS? (write/delete/manage/decide/…) — dari akhiran
 *  `resource.action`, dan aksi tak dikenal dihitung menulis. */
export function isWritePermission(permission: string): boolean {
  const action = permission.slice(permission.lastIndexOf(".") + 1);
  return !READ_ACTIONS.has(action);
}

/**
 * Keputusan penjaga: `null` = silakan; selainnya alasan penolakan. Status
 * `null`/`undefined` (pemasangan di tengah adopsi #134 — perusahaan belum
 * bertaut tenant) BUKAN hanya-baca: gerbang ini tentang suspensi, bukan
 * tentang adopsi.
 */
export function readOnlyRefusal(
  tenantStatus: string | null | undefined,
  permission: string
): { code: "tenant_suspended"; message: string } | null {
  if (!isReadOnlyTenantStatus(tenantStatus)) return null;
  if (!isWritePermission(permission)) return null;
  return {
    code: "tenant_suspended",
    message:
      "Langganan sedang ditangguhkan — buku besar berstatus HANYA-BACA. " +
      "Membaca dan mengekspor tetap bisa; menulis kembali terbuka setelah " +
      "tagihan diselesaikan. Data Anda tidak dihapus.",
  };
}

/* ── Penjadwal: perencana MURNI (idempoten teruji) ─────────────────────────── */

/** Masa tenggang past_due → suspended. */
export const GRACE_PERIOD_DAYS = 14;

export const REMINDER_OFFSETS_DAYS = [7, 3, 1] as const;
export type ReminderKind = "trial_ending" | "invoice_due";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pengingat H-7/H-3/H-1 menuju `target`. Mengembalikan SATU pengingat untuk
 * dikirim (yang paling mendesak yang belum tercatat) + SEMUA kunci yang jatuh
 * tempo untuk dicatat — supaya penjadwal yang sempat mati beberapa hari tidak
 * menghambur tiga surel sekaligus, dan yang berjalan dua kali tidak mengirim
 * dua kali (kuncinya unik di `reminder_logs`).
 */
export function pendingReminder(
  target: Date,
  now: Date,
  sentKeys: ReadonlySet<string>
): { sendKey: string; markKeys: string[] } | null {
  if (now.getTime() >= target.getTime()) return null; // sudah lewat — bukan urusan pengingat

  const dueKeys = REMINDER_OFFSETS_DAYS.filter(
    (offset) => now.getTime() >= target.getTime() - offset * DAY_MS
  ).map((offset) => `H-${offset}:${dateKey(target)}`);

  const unsent = dueKeys.filter((key) => !sentKeys.has(key));
  if (unsent.length === 0) return null;

  /* Yang paling mendesak = offset terkecil = elemen terakhir (urutan 7,3,1). */
  return { sendKey: unsent[unsent.length - 1], markKeys: unsent };
}

/**
 * Nominal tagihan platform: DPP / PPN / total (issue #141). Tarifnya dari
 * `lib/tax.ts` — TIDAK PERNAH diketik ulang di sini; kalau tarif hukum
 * berubah, satu konstanta itu yang berubah dan tagihan platform ikut.
 *
 * ⚠ `taxable` datang dari konfigurasi (`PLATFORM_PPN_DISABLED` — bawaan PPN
 * AKTIF). Ini MEKANISME, bukan pernyataan kebijakan pajak: apakah langganan
 * SaaS kita benar kena PPN 11% dan wajib e-Faktur harus dikonfirmasi ke
 * penasihat pajak (docs/MULTI-TENANT.md §10) — sakelarnya ada supaya jawaban
 * apa pun tinggal dipasang, bukan supaya kami yang menjawabnya.
 */
export function platformInvoiceAmounts(
  price: string | number,
  taxable: boolean
): { amount: string; taxAmount: string; total: string; taxRate: number } {
  const breakdown = computeTax(Number(price), taxable ? DEFAULT_TAX_RATE : 0);
  return {
    amount: breakdown.dpp.toFixed(2),
    taxAmount: breakdown.taxAmount.toFixed(2),
    total: breakdown.total.toFixed(2),
    taxRate: breakdown.taxRate,
  };
}

/** Nomor tagihan DETERMINISTIK — kunci idempotensi penagihan: nomor unik di
 *  `platform_invoices`, jadi penjadwal yang berjalan dua kali menabrak
 *  constraint, bukan menagih dua kali. */
export function invoiceNumberFor(subscriptionId: number, periodStart: Date): string {
  return `PINV-S${subscriptionId}-${dateKey(periodStart).replace(/-/g, "")}`;
}

/** Periode tagih berikutnya dari sebuah titik mulai. */
export function nextPeriod(
  cycle: "monthly" | "yearly",
  from: Date
): { start: Date; end: Date } {
  const end = new Date(from);
  if (cycle === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: from, end };
}

/* ── Kelahiran langganan (issue #152): fungsi MURNI-nya ────────────────────── */

/**
 * Bentuk langganan PERTAMA sebuah tenant dari sebuah paket — logika yang sama
 * dengan cabang "belum punya langganan" di `scripts/change-tenant-plan.ts`,
 * kini di satu tempat: `trial_days > 0` → `trialing` dengan `trial_ends_at`
 * dihitung dari paket; `trial_days = 0` → langsung `active`, dan tagihan
 * pertamanya diterbitkan penjadwal pada putaran berikutnya. Harga TIDAK ikut
 * di sini — pemanggil menyalinnya sendiri dari `plans.price_monthly`
 * (snapshot §5), karena Decimal bukan urusan modul murni ini.
 */
export function initialSubscriptionFromPlan(
  plan: { trialDays: number },
  now: Date
): {
  status: Extract<SubscriptionStatus, "trialing" | "active">;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  const period = nextPeriod("monthly", now);
  return {
    status: plan.trialDays > 0 ? "trialing" : "active",
    trialEndsAt:
      plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
  };
}

/**
 * Status tenant yang BERHAK diadopsikan langganan oleh penjadwal (#152):
 * status berbayar yang masih hidup. `pending_verification` TIDAK — itu keadaan
 * PRA-langganan yang sah (tenant buatan operator yang pemiliknya belum
 * memverifikasi). `suspended`/`cancelled` juga tidak: melahirkan langganan
 * langsung dalam keadaan mati adalah keputusan uang yang harus diambil orang —
 * rekonsiliasi tetap melaporkannya, penjadwal tidak mengarangnya.
 */
export const ORPHAN_ADOPTABLE_TENANT_STATUSES = ["trialing", "active", "past_due"] as const;

export interface OrphanSubscriptionSpec {
  tenantId: number;
  planKey: string;
  status: (typeof ORPHAN_ADOPTABLE_TENANT_STATUSES)[number];
  /** Dari `tenants.trial_ends_at` KENDALI apa adanya — adopsi TIDAK PERNAH
   *  memperpanjang trial diam-diam. Tenant `trialing` tanpa tanggal (data
   *  cacat) dianggap trialnya berakhir SEKARANG: putaran berikutnya memulai
   *  siklus tagih, bukan trial abadi yang bisu — persis bug yang disembuhkan
   *  #152. */
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
}

/**
 * Tenant di kendali yang statusnya berbayar tetapi TANPA satu pun langganan di
 * platform → langganan yang harus dilahirkan (issue #152). Murni dan idempoten:
 * putaran kedua melihat langganan hasil putaran pertama dan mengembalikan
 * kosong; balapan antar-putaran ditahan constraint
 * `subscriptions.initial_for_tenant_id` UNIQUE, bukan oleh fungsi ini.
 */
export function planOrphanSubscriptionAdoptions(
  tenants: readonly { id: number; status: string; planKey: string; trialEndsAt: Date | null }[],
  subscriptions: readonly { tenantId: number }[],
  now: Date
): OrphanSubscriptionSpec[] {
  const covered = new Set(subscriptions.map((s) => s.tenantId));
  return tenants
    .filter(
      (t) =>
        (ORPHAN_ADOPTABLE_TENANT_STATUSES as readonly string[]).includes(t.status) &&
        !covered.has(t.id)
    )
    .map((t) => {
      const status = t.status as OrphanSubscriptionSpec["status"];
      return {
        tenantId: t.id,
        planKey: t.planKey,
        status,
        trialEndsAt: status === "trialing" ? (t.trialEndsAt ?? now) : null,
        /* Menunggak sejak kapan tidak tercatat di kendali — tenggang dihitung
         * dari SEKARANG (arah murah hati; yang penting jalurnya jalan). */
        pastDueSince: status === "past_due" ? now : null,
      };
    });
}

export interface PlannableSubscription {
  id: number;
  status: string;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
}

/** Langganan trialing yang trial-nya sudah habis → mulai siklus tagih. */
export function planTrialExpiries(
  subscriptions: readonly PlannableSubscription[],
  now: Date
): number[] {
  return subscriptions
    .filter(
      (s) => s.status === "trialing" && s.trialEndsAt !== null && s.trialEndsAt.getTime() <= now.getTime()
    )
    .map((s) => s.id);
}

/** Langganan past_due yang masa tenggangnya habis → suspended (hanya-baca). */
export function planGraceExpiries(
  subscriptions: readonly PlannableSubscription[],
  now: Date,
  graceDays: number = GRACE_PERIOD_DAYS
): number[] {
  return subscriptions
    .filter(
      (s) =>
        s.status === "past_due" &&
        s.pastDueSince !== null &&
        now.getTime() >= s.pastDueSince.getTime() + graceDays * DAY_MS
    )
    .map((s) => s.id);
}

/** Tagihan terbit yang lewat jatuh tempo pada langganan aktif → gagal bayar. */
export function planDunning(
  invoices: readonly { id: number; subscriptionId: number; status: string; dueDate: Date }[],
  subscriptionStatusById: ReadonlyMap<number, string>,
  now: Date
): number[] {
  return invoices
    .filter(
      (inv) =>
        inv.status === "issued" &&
        inv.dueDate.getTime() < now.getTime() &&
        subscriptionStatusById.get(inv.subscriptionId) === "active"
    )
    .map((inv) => inv.subscriptionId);
}

/* Dipakai tes untuk menyapu matriksnya secara menyeluruh. */
export const ALL_SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUSES;
