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

import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { processPaymentNotification } from "@sai/platform/payment-webhook";
import {
  nextPeriod,
  tenantStatusForSubscription,
  transition,
  type SubscriptionEvent,
} from "@sai/billing/subscription-lifecycle";
import type { BillingMode, SubscriptionStatus } from "@sai/billing/platform-constants";
import { billingModeIsAutomatic } from "@sai/billing/platform-constants";
import {
  anonymizedUserFields,
  executionVerdict,
  retentionUntilFrom,
} from "@sai/core/tenant-deletion";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { recordSubscriptionEvent } from "@sai/platform/subscription-events";
import { bukaBasisData } from "@sai/db/server";
import {
  auditActor,
  changeTenantPlan,
  planChangeApplier,
  type BillingActor,
  type BillingWriteDeps,
} from "@sai/platform/billing/change-tenant-plan";

/* Tipe deps/aktor & `auditActor` milik `lib/billing/change-tenant-plan.ts`
 * sejak Fase 0 (docs/arsitektur/14-RENCANA-MONOREPO.md §3): perpindahan paket
 * dipakai rute pelanggan juga, jadi arahnya operator → billing, tidak pernah
 * sebaliknya. Nama lamanya dipertahankan sebagai alias untuk aksi operator. */
export type OperatorWriteDeps = BillingWriteDeps;
export type OperatorActor = BillingActor;

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

/* ═══════════════════════════ 2. Ganti paket ═══════════════════════════════
 * `changeTenantPlan` + `planChangeApplier` pindah ke
 * `lib/billing/change-tenant-plan.ts` (Fase 0, dok 14 §3): dua rute PELANGGAN
 * memakainya, jadi ia logika penagihan, bukan logika operator. Konsol operator
 * mengimpornya dari sana. */

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
  await recordSubscriptionEvent(deps.platform, {
    subscriptionId: subscription.id,
    tenantId: tenant.id,
    kind: "status",
    actor: auditActor(input.actor).username,
    fromStatus: subscription.status,
    toStatus: next,
    details: { event, reason: input.actor.reason },
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
      /** Slug PT yang bukunya tak terbaca: jangkar retensinya jatuh ke hari
       *  ini. Kosong pada keadaan normal. */
      unreadableBooks: string[];
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
 * PEMBACANYA berbeda per lingkungan (`makeLatestJournalDateReader` di
 * skrip/konsol, fake di tes). Pembaca memulangkan `null` untuk buku tanpa
 * jurnal dan MELEMPAR untuk buku yang tak terjangkau.
 *
 * Buku tak terjangkau TIDAK menggagalkan eksekusi — jangkar jatuh ke
 * "sekarang" (arah konservatif: menyimpan lebih lama selalu bisa diperbaiki).
 * Tetapi ia TIDAK LAGI senyap: namanya masuk `unreadableBooks` di hasil DAN di
 * jejak audit. Sampai Okt 2026 pembacanya memakai driver MariaDB terhadap
 * PostgreSQL, sehingga SETIAP buku gagal terbaca, dan satu-satunya bekasnya
 * adalah baris `console.warn` yang tidak dibaca siapa pun (#636).
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
  const unreadableBooks: string[] = [];
  for (const company of companies) {
    let d: Date | null;
    try {
      d = await deps.latestJournalDate(company.databaseName);
    } catch (error) {
      console.warn(
        `[operator-writes] buku ${company.databaseName} tak terbaca (${String(error)}) — jangkar retensi jatuh ke hari ini`
      );
      unreadableBooks.push(company.slug);
      continue;
    }
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
      /* Kosong = jangkar dibaca dari SEMUA buku. Berisi = jangkar buku itu
         jatuh ke hari ini; jejaknya menyatakan itu, bukan menyembunyikannya. */
      unreadableBooks,
    },
  });

  return {
    outcome: "executed",
    requestId: request.id,
    retentionUntil,
    companiesDeactivated: companies.length,
    usersAnonymized: users.length,
    unreadableBooks,
  };
}

/**
 * Pembaca `MAX(journals.date)` sebuah buku — jangkar retensi UU KUP, dipakai
 * `executeTenantDeletion` lewat injeksi (kredensialnya dari
 * `CONTROL_DATABASE_URL`, pola skrip #142).
 *
 * Mesinnya diputuskan URL lewat `@sai/db/server`, bukan dipaku di sini. Versi
 * sebelumnya memaku `createPool` milik `mariadb`; sesudah penukaran ke
 * PostgreSQL (15 Okt 2026) setiap pembacaan gagal tersambung dan jangkarnya
 * diam-diam jatuh ke hari ini (#636).
 *
 * Buku tanpa jurnal → `null`. Buku tak terjangkau → MELEMPAR; pemanggil yang
 * memutuskan jatuh ke mana dan mencatatnya.
 */
export function makeLatestJournalDateReader(
  controlUrl: string
): (databaseName: string) => Promise<Date | null> {
  return async (databaseName) => {
    const db = await bukaBasisData(controlUrl, databaseName);
    try {
      return await db.jurnalTermuda();
    } finally {
      await db.tutup();
    }
  };
}

/* ═══════ 6. Mode penagihan — satu-satunya pintu menuju tagih OTOMATIS ══════ */

export type SetBillingModeResult =
  | { outcome: "changed"; from: BillingMode; to: BillingMode }
  /** Sudah bermode itu — idempoten, bukan galat. */
  | { outcome: "not_applicable"; mode: BillingMode }
  | { outcome: "tenant_not_found" }
  | { outcome: "no_subscription" }
  /**
   * `auto` DITOLAK karena harga langganannya NOL.
   *
   * Lihat ⚠ di kepala fungsi: ini satu-satunya penolakan berbasis data di sini,
   * dan ia menutup jalur yang pasti berakhir buruk.
   */
  | { outcome: "price_zero" }
  /** `auto` ditolak: langganannya sudah `cancelled` — tidak ada yang ditagih. */
  | { outcome: "cancelled" };

/**
 * Setel MODE PENAGIHAN sebuah tenant: `none` → `manual` → `auto`.
 *
 * ══ KENAPA INI AKSI OPERATOR, BUKAN EFEK SAMPING ═══════════════════════════
 * `billing_mode` bawaannya `none` (migration 0014), dan itu disengaja: akun
 * baru TIDAK boleh bisa ditagih oleh berakhirnya waktu. Yang memindahkannya ke
 * `auto` karena itu harus TINDAKAN MANUSIA, dengan alasan yang tercatat — dan
 * sebelum fungsi ini ada, satu-satunya jalan adalah `bun run billing:pause`
 * (yang justru hanya bisa menyetel `none`) atau SQL langsung.
 *
 * ⚠ `auto` DITOLAK bila harganya NOL, dan penolakan itu bukan kehati-hatian
 * berlebihan — ia menutup jalur yang pasti berakhir buruk: langganan berharga
 * nol yang bermode `auto` akan, saat masa uji cobanya habis, menerbitkan
 * tagihan Rp 0 + PPN Rp 0, lalu tagihan itu lewat jatuh tempo (tak ada yang
 * bisa dibayar), lalu dunning mendorongnya `past_due`, lalu masa tenggang
 * habis dan BUKU PELANGGAN TERKUNCI — karena tidak membayar nol rupiah.
 * Pakai `changeTenantPlan` dulu bila memang akan ditagih.
 *
 * ══ YANG `auto` BENAR-BENAR LAKUKAN HARI INI ═══════════════════════════════
 * Dan ini harus dinyatakan, sebab namanya menyiratkan lebih: penjadwal hanya
 * punya TIGA tindakan — menerbitkan tagihan PERTAMA saat masa uji coba habis,
 * mendorong `past_due` atas tagihan yang lewat jatuh tempo, dan menangguhkan
 * setelah masa tenggang. **TIDAK ADA penagihan PERPANJANGAN sama sekali**
 * (`platformInvoice.create` hanya ada di tiga tempat, dan tak satu pun
 * dipicu oleh `current_period_end`). Jadi menandai `auto` sebuah akun yang
 * sudah `active` tanpa tanggal uji coba TIDAK akan menagih apa pun — ia hanya
 * membuka pintu dunning untuk tagihan yang dibuat jalur lain.
 * Lihat `docs/KOMERSIALISASI.md` §11.
 *
 * Urutan tulis: PLATFORM saja. Tidak ada salinan mode ini di basis data
 * kendali — status tenant tidak berubah karena mode penagihannya berubah, dan
 * menambah salinan berarti dua kebenaran yang bisa menyimpang.
 */
export async function setBillingMode(
  deps: OperatorWriteDeps,
  input: {
    tenantRef: { id: number } | { slug: string };
    mode: BillingMode;
    actor: OperatorActor;
  }
): Promise<SetBillingModeResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const subscription = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
    select: { id: true, status: true, billingMode: true, price: true },
  });
  if (!subscription) return { outcome: "no_subscription" };

  const from = subscription.billingMode as BillingMode;
  if (from === input.mode) return { outcome: "not_applicable", mode: from };

  if (billingModeIsAutomatic(input.mode)) {
    if (subscription.status === "cancelled") return { outcome: "cancelled" };
    /* Lihat ⚠ di kepala fungsi — nol rupiah yang ditagih otomatis mengunci
       buku pelanggan karena tidak membayar nol. */
    if (Number(subscription.price) <= 0) return { outcome: "price_zero" };
  }

  await deps.platform.subscription.update({
    where: { id: subscription.id },
    data: { billingMode: input.mode },
  });
  await recordSubscriptionEvent(deps.platform, {
    subscriptionId: subscription.id,
    tenantId: tenant.id,
    kind: "billing_mode",
    actor: auditActor(input.actor).username,
    details: { from, to: input.mode, reason: input.actor.reason },
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.billing_mode",
    details: {
      reason: input.actor.reason,
      from,
      to: input.mode,
      /* Harga ikut dicatat: ia yang menentukan boleh-tidaknya `auto`, jadi
         peninjau jejak tidak perlu menebak keadaan saat keputusan diambil. */
      price: subscription.price.toString(),
      subscriptionStatus: subscription.status,
    },
  });

  return { outcome: "changed", from, to: input.mode };
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
  | { outcome: "cancelled" }
  /**
   * Siklus yang diminta TIDAK PUNYA HARGA di katalog paket ini (mis. tahunan
   * pada paket rundingan, yang `price_yearly`-nya NULL).
   *
   * Ditolak, bukan ditambal: lihat ⚠ "HARGA DIPOTRET ULANG" di
   * `extendSubscription`. Memperpanjang tanpa memotret harga meninggalkan
   * langganan tahunan berharga bulanan — kurang tagih 10× yang baru bersuara
   * setahun kemudian.
   */
  | { outcome: "cycle_unpriced"; cycle: "monthly" | "yearly" };

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
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      currency: true,
      /* Ketiganya dibaca untuk SATU hal: memotret ulang harga saat siklusnya
         berubah — lihat ⚠ di kepala fungsi. */
      billingCycle: true,
      price: true,
      planId: true,
    },
  });
  if (!subscription) return { outcome: "no_subscription" };
  if (subscription.status === "cancelled") return { outcome: "cancelled" };

  /*
   * ══ HARGA DIPOTRET ULANG SAAT SIKLUSNYA BERUBAH ══════════════════════════
   *
   * Sampai perbaikan ini, fungsi ini mengubah `billing_cycle` menjadi siklus
   * yang diminta dan **membiarkan `price` apa adanya**. Akibatnya terukur di
   * produksi: satu langganan kini bersiklus `yearly` dengan `price` 599.000 —
   * harga BULANAN paket Pro. Saat periode kompensasinya habis (9 Sep 2027),
   * siklus tagih berikutnya menagih Rp 599.000 untuk SETAHUN, bukan
   * Rp 5.990.000. Kurang tagih sepuluh kali lipat, dan ia tidak bersuara:
   * tidak ada galat, tidak ada peringatan, hanya satu angka yang salah
   * setahun kemudian (`docs/KOMERSIALISASI.md` §11).
   *
   * Sumber harganya KATALOG (`plans`), bukan hitungan di sini: `price_yearly`
   * adalah kolom tersendiri — tahunan = 10 bulan, bukan 12 (`PRICING.md` §1) —
   * jadi mengalikan harga bulanan dengan 12 maupun dengan 10 akan menjadi
   * aturan harga KEDUA yang bisa menyimpang dari katalognya.
   *
   * Siklus yang tidak punya harga di katalog DITOLAK, tidak ditambal: paket
   * rundingan menyimpan `price_yearly = NULL` dengan sengaja, dan menebak
   * angkanya adalah cara paling halus untuk menagih sesuatu yang tidak pernah
   * disepakati siapa pun.
   */
  let hargaBaru: string | null = null;
  if (subscription.billingCycle !== input.cycle) {
    const plan = await deps.platform.plan.findUnique({
      where: { id: subscription.planId },
      select: { priceMonthly: true, priceYearly: true },
    });
    const katalog = input.cycle === "yearly" ? plan?.priceYearly ?? null : plan?.priceMonthly ?? null;
    if (katalog === null) return { outcome: "cycle_unpriced", cycle: input.cycle };
    hargaBaru = katalog.toString();
  }

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
        /*
         * `comped`, BUKAN `paid`. Tidak ada yang terutang, jadi tidak ada yang
         * bisa dilunasi — dan baris pembayaran pun tidak dibuat, sebab
         * pembayaran nol adalah dokumen yang menyatakan sesuatu yang tidak
         * pernah terjadi.
         *
         * Dulu baris ini `paid`, dan akibatnya terukur: lima dari lima tagihan
         * "lunas" di produksi bernilai Rp 0, sehingga pendapatan tidak bisa
         * dibaca dari tabel mana pun tanpa tahu lebih dulu bahwa sebagian
         * "lunas" bukan uang. Alasan penuh di `platform-constants.ts`
         * (`PLATFORM_INVOICE_STATUSES`).
         */
        status: "comped",
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
      /* Hanya ditulis bila siklusnya BERUBAH — perpanjangan pada siklus yang
         sama tidak boleh diam-diam memindahkan pelanggan ke harga katalog
         terbaru (snapshot, `PRICING.md` §3: "perubahan katalog TIDAK menyentuh
         langganan berjalan"). */
      ...(hargaBaru !== null ? { price: hargaBaru } : {}),
      currentPeriodStart: from,
      currentPeriodEnd: to,
      /* Trial selesai — ia sudah digantikan periode berbayar. Membiarkannya
         terisi membuat penjadwal menagih "trial habis" atas periode yang baru
         saja dibayar. */
      trialEndsAt: null,
      pastDueSince: null,
    },
  });
  /* SATU peristiwa `period` yang juga membawa perpindahan status & harga —
     bukan tiga baris: ketiganya satu keputusan operator, dan hitungan
     "berapa perpanjangan bulan ini" harus menghitungnya sekali. */
  await recordSubscriptionEvent(
    deps.platform,
    {
      subscriptionId: subscription.id,
      tenantId: tenant.id,
      kind: "period",
      actor: auditActor(input.actor).username,
      fromStatus: subscription.status,
      toStatus: "active",
      fromPrice: subscription.price,
      toPrice: hargaBaru ?? subscription.price,
      currency: subscription.currency,
      details: {
        reason: input.actor.reason,
        compensation: true,
        cycleFrom: subscription.billingCycle,
        cycleTo: input.cycle,
        periods: input.periods,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    },
    now
  );

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
      /* Harga yang berubah adalah perubahan UANG — ia harus terbaca di jejak,
         bukan hanya di baris basis datanya. */
      ...(hargaBaru !== null
        ? { priceFrom: subscription.price.toString(), priceTo: hargaBaru }
        : {}),
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

/* ═══════ 7. Penawaran disetujui → hak pakai (KOMERSIALISASI §7 langkah 7) ══ */

export type QuoteActivationStep =
  | { step: "plan"; outcome: string }
  | { step: "extend"; outcome: string; to?: Date }
  | { step: "billing_mode"; outcome: string };

export interface QuoteActivationResult {
  /** `true` hanya bila SEMUA langkah yang perlu berhasil. */
  ok: boolean;
  steps: QuoteActivationStep[];
}

/**
 * Terjemahkan penawaran yang DISETUJUI (dan dibayar di buku PT penyedia,
 * §7 langkah 5–6) menjadi hak pakai: paket + periode + mode `manual`.
 *
 * Hanya MERANGKAI tiga fungsi yang sudah dipanggil manusia satu per satu —
 * `changeTenantPlan`, `extendSubscription`, `setBillingMode` — dengan satu
 * nomor penawaran yang ikut masuk alasan setiap jejaknya. Bukan mesin baru:
 * setiap aturan (snapshot harga, idempotensi `-K`, `price_zero`) tetap milik
 * fungsi aslinya.
 *
 * BERHENTI pada langkah pertama yang gagal dan melaporkan setiap langkah —
 * keadaan setengah jadi DINYATAKAN, tidak disembunyikan, dan operator bisa
 * melanjutkan langkah yang tersisa dengan tombolnya masing-masing.
 *
 * ⚠ Perpanjangan menerbitkan tagihan Rp 0 bertanda `-K` (§6.4) — sama dengan
 * menekan "perpanjang" dengan tangan. Faktur yang sebenarnya hidup di buku PT
 * penyedia; menghilangkan tagihan Rp 0 itu adalah keputusan tersendiri.
 */
export async function activateQuoteEntitlement(
  deps: OperatorWriteDeps,
  input: {
    tenantId: number;
    planKey: string;
    cycle: "monthly" | "yearly";
    periods: number;
    quoteRef: string;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<QuoteActivationResult> {
  const actor: OperatorActor = {
    operator: input.actor.operator,
    reason: `Penawaran ${input.quoteRef}: ${input.actor.reason}`,
  };
  const steps: QuoteActivationStep[] = [];

  const tenant = await deps.control.tenant.findUnique({
    where: { id: input.tenantId },
    select: { planKey: true },
  });
  if (!tenant) return { ok: false, steps: [{ step: "plan", outcome: "tenant_not_found" }] };

  if (tenant.planKey !== input.planKey) {
    const plan = await changeTenantPlan(deps, { tenantRef: { id: input.tenantId }, planKey: input.planKey, actor }, now);
    steps.push({ step: "plan", outcome: plan.outcome });
    if (plan.outcome !== "changed") return { ok: false, steps };
  } else {
    steps.push({ step: "plan", outcome: "unchanged" });
  }

  const ext = await extendSubscription(
    deps,
    { tenantRef: { id: input.tenantId }, cycle: input.cycle, periods: input.periods, actor },
    now
  );
  steps.push({ step: "extend", outcome: ext.outcome, ...(ext.outcome === "extended" ? { to: ext.to } : {}) });
  if (ext.outcome !== "extended") return { ok: false, steps };

  const mode = await setBillingMode(deps, { tenantRef: { id: input.tenantId }, mode: "manual", actor });
  steps.push({ step: "billing_mode", outcome: mode.outcome });
  return { ok: mode.outcome === "changed" || mode.outcome === "not_applicable", steps };
}
