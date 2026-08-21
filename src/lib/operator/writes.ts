/**
 * AKSI TULIS konsol operator (issue #155) — inti BERSAMA yang dipakai server
 * action konsol DAN skrip CLI (jalur pemulihan saat konsolnya sendiri mati).
 * Karena skrip harus bisa memuatnya di luar Next, modul ini SENGAJA TANPA
 * `server-only` dan tidak membuka koneksi apa pun sendiri: klien DISUNTIKKAN
 * pemanggil (pola `payment-webhook.ts`) — konsol memakai `platformDb`/
 * `controlDb`, skrip membangun kliennya sendiri, tes memakai fake in-memory.
 *
 * KODE PENAGIHAN (doktrin #137): boleh disentuh kode penagihan lain, JANGAN
 * PERNAH diimpor penjaga (`guard.ts`) atau proxy.
 *
 * ══ EMPAT ATURAN #155 — ditegakkan DI SINI, bukan diserahkan ke pemanggil ═══
 *   1. Setiap aksi sukses menulis TEPAT SATU baris `writeTenantAuditLog`
 *      dengan OPERATOR sebagai aktor (bukan atas nama pelanggan).
 *   2. `reason` adalah parameter WAJIB — aksi tanpa alasan tidak bisa
 *      ditinjau ulang; validasi panjangnya milik skema, keberadaannya milik
 *      tipe di sini.
 *   3. Urutan tulis #137: `sai_platform` DULU, `sai_control` BELAKANGAN —
 *      persis pola webhook/penjadwal; crash di tengah meninggalkan arah sisa
 *      yang ditemukan & disembuhkan rekonsiliasi.
 *   4. Cache status tenant TIDAK di-drop di sini: `lib/tenant-state.ts` ber-
 *      `server-only` dan tidak bisa dimuat skrip CLI. Menjatuhkannya adalah
 *      kewajiban SERVER ACTION pemanggil (`invalidateTenantState()`) — proses
 *      Next itulah yang memegang cache-nya; skrip CLI berjalan di proses lain
 *      dan cache proses Next di sana mati sendiri setelah TTL. Dijaga tes
 *      sapuan sumber + tes cache sungguhan di `tests/operator-writes.test.ts`.
 *
 * ══ IDEMPOTENSI = CONSTRAINT, BUKAN PERIKSA-LALU-TULIS ══════════════════════
 * Operator dan penjadwal/webhook yang bergerak bersamaan diselesaikan basis
 * data: `payments.gateway_ref` UNIQUE (transfer yang sama tak tercatat dua
 * kali), `subscriptions.initial_for_tenant_id` UNIQUE (langganan pertama tak
 * lahir kembar). Pemeriksaan status di sini hanya penolakan dini yang ramah —
 * garis pertahanan terakhirnya selalu constraint.
 */

import { randomBytes } from "node:crypto";
import { createPool } from "mariadb";

import type { PrismaClient as PlatformClient } from "@/generated/platform/client";
import type { PrismaClient as ControlClient } from "@/generated/control/client";
import { processPaymentNotification } from "@/lib/payment-webhook";
import {
  nextPeriod,
  tenantStatusForSubscription,
  transition,
  type SubscriptionEvent,
} from "@/lib/subscription-lifecycle";
import type { SubscriptionStatus } from "@/lib/platform-constants";
import {
  anonymizedUserFields,
  executionVerdict,
  retentionUntilFrom,
} from "@/lib/tenant-deletion";
import { writeTenantAuditLog } from "@/lib/tenant-audit";

export interface OperatorWriteDeps {
  platform: PlatformClient;
  control: ControlClient;
}

/** Aktor + alasan — wajib pada SETIAP aksi (aturan #155 no. 1 & 2). */
export interface OperatorActor {
  /** Nama akun operator dari sesi konsol, atau `cli:<user>` dari skrip. */
  operator: string;
  /** Alasan yang DIKETIK operator — disimpan apa adanya di jejak. */
  reason: string;
}

function auditActor(actor: OperatorActor): { userId: string; username: string } {
  /* Aktornya OPERATOR — bukan "system" dan bukan salah satu pengguna tenant:
   * jejak harus bisa menjawab "siapa" tanpa menebak.
   *
   * Dua bidang, dua awalan: `operator:<nama>` dari konsol, `cli:<user>` dari
   * skrip pemulihan. Nama yang SUDAH membawa awalan bidangnya dibiarkan apa
   * adanya — `operator:cli:vyn` hanya akan menyulitkan pembacanya. */
  const name = actor.operator.includes(":") ? actor.operator : `operator:${actor.operator}`;
  return { userId: name, username: name };
}

/* ═══════════════ 1. Tandai tagihan lunas — transfer manual ═══════════════ */

export type ManualPaymentResult =
  | {
      outcome: "paid";
      invoiceNumber: string;
      subscriptionStatus?: string;
    }
  /** Referensi bank ini SUDAH tercatat / tagihan sudah lunas — transfer yang
   *  sama tidak pernah menjadi dua pembayaran (pola idempotensi webhook). */
  | { outcome: "duplicate" }
  | { outcome: "invoice_not_found" }
  /** Tagihan bukan `issued` (draft/void/paid) — tak ada yang bisa dilunasi. */
  | { outcome: "not_issued"; status: string }
  | { outcome: "tenant_not_found" };

/**
 * Catat pembayaran TRANSFER MANUAL atas tagihan platform `issued` — jalur
 * bawaan `PAYMENT_GATEWAY=manual`, yang sebelum #155 diselesaikan dengan
 * `UPDATE` SQL langsung di produksi: aksi uang, tanpa jejak.
 *
 * Intinya `processPaymentNotification` yang SAMA dengan webhook (satu jalur
 * transisi status, bukan dua implementasi yang menyimpang): notifikasi
 * `settlement` sintetis dengan `transaction_id` = referensi bank —
 * `gateway_ref` UNIQUE menjadikan referensi itu kunci anti-duplikat, juga
 * terhadap kiriman yang benar-benar BERSAMAAN (P2002 → duplikat, bukan
 * pembayaran kedua).
 */
export async function recordManualPayment(
  deps: OperatorWriteDeps,
  input: {
    invoiceNumber: string;
    /** Nominal yang DITERIMA di rekening, IDR (string desimal / angka bulat). */
    amount: string;
    /** Referensi/berita transfer dari rekening koran — kunci anti-duplikat. */
    bankRef: string;
    /** Tanggal transfer sesungguhnya (rekening koran), bukan saat mengetik. */
    transferDate: Date;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<ManualPaymentResult> {
  const invoice = await deps.platform.platformInvoice.findUnique({
    where: { number: input.invoiceNumber },
    select: { id: true, tenantId: true, status: true, total: true },
  });
  if (!invoice) return { outcome: "invoice_not_found" };

  /* Penolakan dini yang ramah: tagihan yang SUDAH lunas tidak menerima
   * pembayaran kedua — jawabannya "duplikat", bukan baris payments baru.
   * (Untuk referensi bank yang sama, constraint UNIQUE tetap garis terakhir.) */
  if (invoice.status !== "issued") {
    return invoice.status === "paid"
      ? { outcome: "duplicate" }
      : { outcome: "not_issued", status: invoice.status };
  }

  const tenant = await deps.control.tenant.findUnique({
    where: { id: invoice.tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  /* Satu jalur dengan webhook — `settlement` sintetis; verifikasi tanda
   * tangan tidak relevan (tidak ada gerbang), bukti transfernya manusia. */
  const result = await processPaymentNotification(
    {
      ...deps,
      /* Transfer manual atas tagihan PERPINDAHAN PAKET tetap memindahkan
       * paketnya — jalur `manual` bukan jalur setengah. */
      applyPlanChange: planChangeApplier(deps, input.actor),
    },
    {
      order_id: input.invoiceNumber,
      transaction_status: "settlement",
      transaction_id: input.bankRef,
      gross_amount: input.amount,
      status_code: "200",
      signature_key: "",
    },
    now,
    { gateway: "manual", method: "manual_transfer", paidAt: input.transferDate }
  );

  if (result.outcome === "duplicate_ignored") return { outcome: "duplicate" };
  if (result.outcome !== "paid_recorded") {
    /* `unknown_invoice`/`ignored_status` mustahil di jalur ini (tagihannya
     * baru dibaca, statusnya "settlement" harfiah) — tapi kalau terjadi,
     * jawab jujur, jangan mencatat jejak untuk tulisan yang tidak terjadi. */
    return { outcome: "invoice_not_found" };
  }

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.payment.manual",
    details: {
      reason: input.actor.reason,
      invoiceNumber: input.invoiceNumber,
      invoiceTotal: invoice.total.toString(),
      amount: input.amount,
      bankRef: input.bankRef,
      transferDate: input.transferDate.toISOString(),
      subscriptionStatus: result.subscriptionStatus ?? null,
    },
  });

  return {
    outcome: "paid",
    invoiceNumber: input.invoiceNumber,
    subscriptionStatus: result.subscriptionStatus,
  };
}

/* ═══════════════════════════ 2. Ganti paket ═══════════════════════════════ */

/** Kuota paket baru yang LEBIH KECIL dari pemakaian nyata — peringatan, BUKAN
 *  penghalang: turun paket keputusan yang sah; konsekuensinya dinyatakan dan
 *  ikut tercatat di jejak. */
export interface QuotaWarning {
  companies: { used: number; max: number } | null;
  users: { used: number; max: number } | null;
}

export type ChangePlanResult =
  | {
      outcome: "changed";
      tenantSlug: string;
      fromPlanKey: string;
      toPlanKey: string;
      subscriptionId: number;
      subscriptionStatus: string;
      /** `null` = tidak ada kuota yang terlampaui. */
      quotaWarning: QuotaWarning | null;
    }
  | { outcome: "tenant_not_found" }
  | { outcome: "plan_not_found" }
  /** Kalah balapan dengan putaran adopsi penjadwal (UNIQUE
   *  `initial_for_tenant_id`) — coba lagi; langganannya kini sudah ada. */
  | { outcome: "race_lost" };

/**
 * Pindahkan tenant ke paket lain — logika `scripts/change-tenant-plan.ts`
 * DIANGKAT ke sini (bukan disalin); skrip kini pembungkus tipis.
 *
 * Urutan tulis #137: (1) langganan platform dibuat/dipindah dengan SNAPSHOT
 * harga, (2) salinan kendali (plan_key + kuota + status) ditulis TERAKHIR.
 *
 * Tenant `suspended`: ganti paket TIDAK memulihkan akses — status langganan
 * tidak disentuh; pemulihan adalah keputusan terpisah lewat
 * `setTenantSuspension` (mesin siklus hidup), dengan alasannya sendiri.
 */
export async function changeTenantPlan(
  deps: OperatorWriteDeps,
  input: {
    tenantRef: { id: number } | { slug: string },
    planKey: string;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<ChangePlanResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true, planKey: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const plan = await deps.platform.plan.findUnique({ where: { key: input.planKey } });
  if (!plan || !plan.isActive) return { outcome: "plan_not_found" };

  /* ── 1. PLATFORM dulu ──────────────────────────────────────────────────── */
  const existing = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
  });

  let subscription;
  if (existing && existing.status !== "cancelled") {
    subscription = await deps.platform.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        /* SNAPSHOT harga — harga paket boleh naik besok; langganan ini tidak. */
        price: plan.priceMonthly,
        currency: plan.currency,
      },
    });
  } else {
    const status = plan.trialDays > 0 ? "trialing" : "active";
    const period = nextPeriod("monthly", now);
    try {
      subscription = await deps.platform.subscription.create({
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
          /* Kunci idempotensi KELAHIRAN (#152) — balapan dengan putaran adopsi
           * penjadwal menabrak UNIQUE ini, bukan melahirkan kembar. */
          initialForTenantId: existing ? null : tenant.id,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { outcome: "race_lost" };
      throw error;
    }
  }

  /* ── 2. KENDALI belakangan: salin kuota + status (snapshot §5) ─────────── */
  await deps.control.tenant.update({
    where: { id: tenant.id },
    data: {
      planKey: plan.key,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
      trialEndsAt: subscription.trialEndsAt,
      status: tenantStatusForSubscription(subscription.status as SubscriptionStatus),
    },
  });

  /* Kuota vs pemakaian NYATA (sumber kebenaran, bukan usage_counters). */
  const [companiesUsed, usersUsed] = await Promise.all([
    deps.control.company.count({ where: { tenantId: tenant.id, isActive: true } }),
    deps.control.user.count({ where: { tenantId: tenant.id } }),
  ]);
  const quotaWarning: QuotaWarning | null =
    companiesUsed > plan.maxCompanies || usersUsed > plan.maxUsers
      ? {
          companies:
            companiesUsed > plan.maxCompanies
              ? { used: companiesUsed, max: plan.maxCompanies }
              : null,
          users: usersUsed > plan.maxUsers ? { used: usersUsed, max: plan.maxUsers } : null,
        }
      : null;

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.plan.change",
    details: {
      reason: input.actor.reason,
      from: tenant.planKey,
      to: plan.key,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
      subscriptionStatus: subscription.status,
      /* Konsekuensi turun paket di bawah pemakaian IKUT tercatat (#155). */
      quotaWarning,
    },
  });

  return {
    outcome: "changed",
    tenantSlug: tenant.slug,
    fromPlanKey: tenant.planKey,
    toPlanKey: plan.key,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    quotaWarning,
  };
}

/**
 * Pemasang paket untuk tagihan PERPINDAHAN PAKET yang baru lunas — dioper ke
 * `processPaymentNotification` (lihat `WebhookDeps.applyPlanChange`).
 *
 * Ada di sini, bukan di `payment-webhook.ts`, justru karena berkas ini sudah
 * mengimpor berkas itu: pemasangnya mengalir turun bersama `deps`, dan arah
 * ketergantungannya tetap satu arah. Yang dipakai tetap `changeTenantPlan`
 * yang sama dengan konsol operator — satu mesin, satu jejak audit, bukan
 * implementasi kedua yang pelan-pelan menyimpang.
 *
 * MELEMPAR bila perpindahannya gagal: pelanggan sudah membayar, jadi
 * "gagal diam-diam" berarti uang masuk tanpa paket naik. Webhook yang melempar
 * membuat gerbang mengulang kirimannya, dan pengulangan itu aman — pembayaran
 * sudah ter-idempoten oleh `gateway_ref` UNIQUE.
 */
export function planChangeApplier(deps: OperatorWriteDeps, actor: OperatorActor) {
  return async (input: {
    tenantId: number;
    planKey: string;
    invoiceNumber: string;
  }): Promise<void> => {
    const result = await changeTenantPlan(deps, {
      tenantRef: { id: input.tenantId },
      planKey: input.planKey,
      actor: {
        operator: actor.operator,
        reason: `${actor.reason} (tagihan ${input.invoiceNumber})`,
      },
    });
    if (result.outcome !== "changed") {
      throw new Error(
        `Perpindahan paket gagal untuk tagihan ${input.invoiceNumber} ` +
          `(→ ${input.planKey}): ${result.outcome}`
      );
    }
  };
}

/* ══════════════════ 3. Suspensi & pemulihan manual ════════════════════════ */

export type SuspensionResult =
  | { outcome: "done"; from: string; to: string }
  /** Tenant belum punya langganan — tidak ada keadaan yang bisa dipindah. */
  | { outcome: "no_subscription" }
  /** Mesin siklus hidup berkata TIDAK (mis. menangguhkan yang sudah
   *  ditangguhkan, memulihkan yang tidak ditangguhkan, atau `cancelled`). */
  | { outcome: "not_applicable"; status: string }
  | { outcome: "tenant_not_found" };

/**
 * Suspensi / pemulihan MANUAL di luar siklus dunning (permintaan pelanggan,
 * penyalahgunaan) — lewat MESIN siklus hidup (`operator_suspend`/
 * `operator_restore`), bukan `UPDATE` status langsung.
 *
 * `suspended` = HANYA-BACA, bukan terkunci dan bukan terhapus (§7.4): buku
 * tetap terbaca & terekspor — hak hukum pelanggan (UU KUP), bukan kemurahan
 * hati. Kalimat itu wajib berdiri di layar konsol, bukan hanya di sini.
 */
export async function setTenantSuspension(
  deps: OperatorWriteDeps,
  input: {
    tenantRef: { id: number } | { slug: string };
    mode: "suspend" | "restore";
    actor: OperatorActor;
  }
): Promise<SuspensionResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const subscription = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
    select: { id: true, status: true },
  });
  if (!subscription) return { outcome: "no_subscription" };

  const event: SubscriptionEvent =
    input.mode === "suspend" ? "operator_suspend" : "operator_restore";
  const next = transition(subscription.status as SubscriptionStatus, event);
  if (next === null || next === subscription.status) {
    return { outcome: "not_applicable", status: subscription.status };
  }

  /* ── 1. PLATFORM dulu ──────────────────────────────────────────────────── */
  await deps.platform.subscription.update({
    where: { id: subscription.id },
    data: {
      status: next,
      /* Pemulihan mendarat di `active` — tunggakan lama bukan lagi jangkar
       * tenggang (paritas dengan jalur `payment_received` webhook). */
      ...(input.mode === "restore" ? { pastDueSince: null } : {}),
    },
  });

  /* ── 2. KENDALI belakangan: salinan status untuk penjaga hanya-baca ────── */
  await deps.control.tenant.update({
    where: { id: tenant.id },
    data: { status: tenantStatusForSubscription(next) },
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: input.mode === "suspend" ? "tenant.suspend" : "tenant.restore",
    details: { reason: input.actor.reason, from: subscription.status, to: next },
  });

  return { outcome: "done", from: subscription.status, to: next };
}

/* ═══════════ 4. Eksekusi penghapusan (lewat masa tenggang) ════════════════ */

export type DeletionExecutionResult =
  | {
      outcome: "executed";
      requestId: number;
      retentionUntil: Date;
      companiesDeactivated: number;
      usersAnonymized: number;
    }
  | { outcome: "tenant_not_found" }
  /** Tidak ada permintaan `pending` — penghapusan HANYA atas permintaan
   *  eksplisit pemilik (UU PDP); operator tidak mengarangnya. */
  | { outcome: "no_pending_request" }
  | { outcome: "grace_active"; graceEndsAt: Date }
  /** Nama yang diketik ulang tidak cocok — gerbang bukti #142 tetap berdiri
   *  di layar mana pun tombolnya berada. */
  | { outcome: "confirm_mismatch" };

/**
 * GERBANG 1 penghapusan akun (#142) di tangan operator — logika
 * `scripts/execute-tenant-deletion.ts` DIANGKAT ke sini; skrip kini
 * pembungkus tipis. Yang terjadi: tenant → `cancelled`, PT dinonaktifkan,
 * keanggotaan dimatikan, data PRIBADI dianonimkan (UU PDP), seluruh sesi
 * dicabut, `retention_until` dihitung & DICATAT.
 *
 * BUKU BESAR TIDAK DISENTUH — satu byte pun: pembukuan wajib disimpan 10
 * tahun (UU KUP). Penghancuran buku (gerbang 2, `--drop-ledgers`) SENGAJA
 * tidak diberi tombol konsol: ia baru sah bertahun-tahun kemudian, dan jalur
 * CLI bergerbang bukti adalah gesekan yang memang diinginkan.
 *
 * `latestJournalDate` disuntikkan: jangkar retensi dibaca dari buku, dan
 * PEMBACANYA berbeda per lingkungan (pool mariadb di skrip/konsol, fake di
 * tes). Buku tak terjangkau TIDAK menggagalkan eksekusi — jangkar jatuh ke
 * "sekarang" (arah konservatif: menyimpan lebih lama selalu bisa diperbaiki).
 */
export async function executeTenantDeletion(
  /* Sengaja HANYA kendali (+ pembaca buku): eksekusi ini tidak menyentuh
   * `sai_platform` satu kali pun, jadi menuntut kliennya berarti membuat
   * penghapusan mustahil saat penagihan mati — padahal keduanya tidak
   * berhubungan. Dependensi yang sempit adalah dokumentasi yang tidak bisa
   * basi. */
  deps: {
    control: ControlClient;
    latestJournalDate: (databaseName: string) => Promise<Date | null>;
  },
  input: {
    tenantSlug: string;
    /** Ketik ulang slug tenant — konfirmasi bukti, bukan "Ya". */
    confirmSlug: string;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<DeletionExecutionResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const request = await deps.control.tenantDeletionRequest.findFirst({
    where: { tenantId: tenant.id, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, graceEndsAt: true },
  });
  if (!request) return { outcome: "no_pending_request" };

  const verdict = executionVerdict(request, now);
  if (verdict === "grace_active") {
    return { outcome: "grace_active", graceEndsAt: request.graceEndsAt };
  }
  if (verdict !== "executable") return { outcome: "no_pending_request" };

  if (input.confirmSlug.trim() !== tenant.slug) return { outcome: "confirm_mismatch" };

  const companies = await deps.control.company.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, slug: true, databaseName: true },
  });
  const users = await deps.control.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, email: true },
  });

  /* Jangkar retensi UU KUP: entri jurnal TERMUDA di seluruh bukunya. */
  let latest: Date | null = null;
  for (const company of companies) {
    const d = await deps.latestJournalDate(company.databaseName);
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  const retentionUntil = retentionUntilFrom(latest, now);

  await deps.control.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { status: "cancelled" } });
    await tx.company.updateMany({ where: { tenantId: tenant.id }, data: { isActive: false } });
    await tx.membership.updateMany({
      where: { userId: { in: users.map((u) => u.id) } },
      data: { isActive: false },
    });
    for (const user of users) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ...anonymizedUserFields(user.id),
          // bukan hash bcrypt yang sah → tidak ada kata sandi yang cocok
          password: randomBytes(32).toString("hex"),
          mustChangePassword: true,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    }
    await tx.registration.deleteMany({
      where: { email: { in: users.map((u) => u.email).filter((e): e is string => Boolean(e)) } },
    });
    await tx.tenantDeletionRequest.update({
      where: { id: request.id },
      data: { status: "executed", executedAt: now, retentionUntil },
    });
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.deletion.execute",
    details: {
      reason: input.actor.reason,
      phase: "deactivate_anonymize",
      requestId: request.id,
      companies: companies.map((c) => c.slug),
      users: users.length,
      retentionUntil: retentionUntil.toISOString(),
    },
  });

  return {
    outcome: "executed",
    requestId: request.id,
    retentionUntil,
    companiesDeactivated: companies.length,
    usersAnonymized: users.length,
  };
}

/**
 * Pembaca `MAX(journals.date)` sebuah buku — jangkar retensi UU KUP, dipakai
 * `executeTenantDeletion` lewat injeksi (kredensialnya dari
 * `CONTROL_DATABASE_URL`, pola skrip #142). Buku tak terjangkau → `null` +
 * peringatan log: retensi jatuh ke jangkar paling konservatif (sekarang),
 * TIDAK menggagalkan eksekusi.
 */
export function makeLatestJournalDateReader(
  controlUrl: string
): (databaseName: string) => Promise<Date | null> {
  const url = new URL(controlUrl);
  return async (databaseName) => {
    const pool = createPool({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: databaseName,
      connectionLimit: 1,
    });
    try {
      const rows = (await pool.query("SELECT MAX(`date`) AS latest FROM journals")) as {
        latest: Date | null;
      }[];
      return rows[0]?.latest ?? null;
    } catch (error) {
      console.warn(
        `[operator-writes] buku ${databaseName} tak terbaca (${String(error)}) — jangkar retensi jatuh ke hari ini`
      );
      return null;
    } finally {
      await pool.end();
    }
  };
}

/* ═════════ 5. Perpanjang langganan — KOMPENSASI, tanpa gerbang bayar ═══════ */

export type ExtendSubscriptionResult =
  | {
      outcome: "extended";
      from: Date;
      to: Date;
      invoiceNumber: string;
      status: string;
    }
  /** Nomor tagihan kompensasi untuk periode ini sudah ada — perpanjangan yang
   *  sama tidak pernah dijalankan dua kali (pola idempotensi penagihan). */
  | { outcome: "duplicate"; invoiceNumber: string }
  | { outcome: "tenant_not_found" }
  | { outcome: "no_subscription" }
  /** Langganan yang sudah dibatalkan tidak diperpanjang — ia dibangkitkan lewat
   *  perpindahan paket, keputusan yang berbeda dan harus diambil sadar. */
  | { outcome: "cancelled" };

/**
 * Beri sebuah tenant periode berbayar TANPA melewati gerbang pembayaran.
 *
 * ══ KENAPA ADA ══════════════════════════════════════════════════════════════
 * Jalur transfer manual (#1 di berkas ini) menuntut tagihan berstatus `issued`,
 * dan tagihan baru terbit SAAT TRIAL HABIS. Jadi tidak ada satu pun cara
 * memberi pelanggan satu tahun hari ini — entah sebagai kompensasi atas gangguan
 * kami sendiri, entah karena ia membayar di luar sistem. Sebelum ini jawabannya
 * `UPDATE` SQL langsung di produksi: aksi uang, tanpa jejak, persis yang #155
 * hapus dari alur lain.
 *
 * ══ KOMPENSASI: TAGIHAN Rp 0 YANG BERTANDA ═════════════════════════════════
 * Periode yang diperpanjang SELALU menerbitkan tagihannya sendiri — bernilai
 * nol, berstatus `paid`, bernomor berakhiran `-K`. Bukan kerapian: tanpa
 * dokumen apa pun, laporan pendapatan tidak bisa menjelaskan kenapa sebuah
 * tenant aktif, dan "aktif tanpa sebab" adalah bentuk selisih yang paling sulit
 * ditelusuri berbulan-bulan kemudian. Dengan nomor bertanda, laporan bisa
 * MEMBEDAKAN pelanggan berbayar dari yang digratiskan — sesuatu yang tidak bisa
 * dilakukan kalau perpanjangannya tak meninggalkan apa-apa.
 *
 * ══ MEMPERPANJANG, BUKAN MENGGANTIKAN ══════════════════════════════════════
 * Titik mulainya adalah yang TERJAUH antara sekarang dan akhir periode berjalan.
 * Tenant yang masih punya sisa trial dua minggu tidak kehilangan dua minggu itu;
 * ia mendapat setahun DI ATASNYA. "Perpanjang" yang memotong sisa yang sudah
 * dijanjikan bukan perpanjangan.
 *
 * ══ DUA SISI, URUTAN #137 ══════════════════════════════════════════════════
 * Platform dulu, kendali belakangan. Status di kedua sisi harus berpindah
 * bersama: `platform-reconciliation` memeriksa persis keserasian itu, dan
 * langganan `active` di platform sementara tenant masih `trialing` di kendali
 * akan berbunyi di sana setiap putaran.
 */
export async function extendSubscription(
  deps: OperatorWriteDeps,
  input: {
    tenantRef: { id: number } | { slug: string };
    cycle: "monthly" | "yearly";
    /** Berapa periode. 1 tahunan = satu tahun; 3 bulanan = tiga bulan. */
    periods: number;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<ExtendSubscriptionResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const subscription = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
    select: { id: true, status: true, currentPeriodEnd: true, currency: true },
  });
  if (!subscription) return { outcome: "no_subscription" };
  if (subscription.status === "cancelled") return { outcome: "cancelled" };

  const from = extensionStart(subscription.currentPeriodEnd, now);
  const to = extendPeriod(from, input.cycle, input.periods);
  const invoiceNumber = compedInvoiceNumber(subscription.id, from);

  /* ── 1. PLATFORM dulu ──────────────────────────────────────────────────── */
  try {
    await deps.platform.platformInvoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        number: invoiceNumber,
        /* Langsung `paid`: tidak ada yang terutang, jadi tidak ada yang bisa
           dilunasi. Baris pembayaran pun tidak dibuat — pembayaran nol adalah
           dokumen yang menyatakan sesuatu yang tidak pernah terjadi. */
        status: "paid",
        issueDate: now,
        dueDate: now,
        amount: "0",
        taxAmount: "0",
        total: "0",
        currency: subscription.currency,
      },
    });
  } catch (error) {
    /* Nomor bertanda itu UNIK — perpanjangan yang sama, dijalankan dua kali,
       menabrak constraint alih-alih memberi periode kedua. */
    if ((error as { code?: string }).code === "P2002") {
      return { outcome: "duplicate", invoiceNumber };
    }
    throw error;
  }

  await deps.platform.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "active",
      billingCycle: input.cycle,
      currentPeriodStart: from,
      currentPeriodEnd: to,
      /* Trial selesai — ia sudah digantikan periode berbayar. Membiarkannya
         terisi membuat penjadwal menagih "trial habis" atas periode yang baru
         saja dibayar. */
      trialEndsAt: null,
      pastDueSince: null,
    },
  });

  /* ── 2. KENDALI belakangan ─────────────────────────────────────────────── */
  await deps.control.tenant.update({
    where: { id: tenant.id },
    data: { status: tenantStatusForSubscription("active") },
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.extend",
    details: {
      reason: input.actor.reason,
      cycle: input.cycle,
      periods: input.periods,
      from: from.toISOString(),
      to: to.toISOString(),
      invoiceNumber,
      fromStatus: subscription.status,
    },
  });

  return { outcome: "extended", from, to, invoiceNumber, status: "active" };
}

/**
 * Titik mulai perpanjangan: yang TERJAUH antara sekarang dan akhir periode
 * berjalan. Murni, supaya aturannya bisa diuji tanpa basis data.
 */
export function extensionStart(currentPeriodEnd: Date, now: Date): Date {
  return currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
}

/** Majukan `from` sebanyak `periods` siklus. */
export function extendPeriod(
  from: Date,
  cycle: "monthly" | "yearly",
  periods: number
): Date {
  let end = from;
  for (let i = 0; i < Math.max(1, Math.trunc(periods)); i++) {
    end = nextPeriod(cycle, end).end;
  }
  return end;
}

/**
 * Nomor tagihan KOMPENSASI — akhiran `-K` yang membedakannya dari nomor
 * deterministik penjadwal untuk periode yang sama, sekaligus menjadikannya
 * kunci idempotensi perpanjangan.
 */
export function compedInvoiceNumber(subscriptionId: number, periodStart: Date): string {
  return `PINV-S${subscriptionId}-${periodStart.toISOString().slice(0, 10).replace(/-/g, "")}-K`;
}
