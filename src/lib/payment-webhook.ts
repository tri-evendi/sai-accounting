/**
 * PEMROSES NOTIFIKASI PEMBAYARAN (issue #141) — inti yang dipakai route webhook
 * (`/api/billing/webhook`) dan bisa dilatih di luar Next (gladi kiriman-ganda
 * pada basis data sekali-pakai). Karena itu TANPA `server-only`: kliennya
 * DISUNTIKKAN pemanggil, modul ini tidak membuka koneksi apa pun sendiri.
 *
 * ══ IDEMPOTEN — WEBHOOK TERKIRIM ULANG ADALAH HAL NORMAL ════════════════════
 * Jangkarnya `payments.gateway_ref` UNIQUE: satu transaksi gerbang = maksimal
 * satu baris pembayaran, apa pun berapa kali notifikasinya tiba.
 *   • kiriman kedua dengan status sama → `duplicate_ignored`, nol tulisan;
 *   • dua kiriman BERSAMAAN → satu menang, yang kalah menabrak constraint
 *     (P2002) dan diperlakukan sebagai duplikat — bukan pembayaran kedua;
 *   • `paid` TIDAK PERNAH diturunkan oleh notifikasi susulan (mis. `pending`
 *     yang datang terlambat / tak berurut).
 *
 * ══ URUTAN TULIS (§4A) ══════════════════════════════════════════════════════
 * `sai_platform` DULU (payment → invoice → subscription), `sai_control`
 * TERAKHIR (salinan `tenants.status`). Crash di tengah meninggalkan pembayaran
 * tercatat tanpa tenant naik kelas — arah yang ditemukan & disembuhkan
 * rekonsiliasi/penjadwal — tidak pernah kebalikannya.
 *
 * ══ KEGAGALAN BAYAR ═════════════════════════════════════════════════════════
 * `deny`/`cancel`/`expire` → event `payment_failed` → mesin siklus hidup
 * membawanya ke `past_due` — TIDAK PERNAH langsung `suspended`; suspensi hanya
 * lahir dari masa tenggang yang habis (penjadwal #140).
 */

import type { PrismaClient as PlatformClient } from "@/generated/platform/client";
import type { PrismaClient as ControlClient } from "@/generated/control/client";
import {
  mapTransactionStatus,
  type MidtransNotification,
  type PaymentMethod,
} from "@/lib/payment-gateway";
import {
  tenantStatusForSubscription,
  transition,
  type SubscriptionEvent,
} from "@/lib/subscription-lifecycle";
import type { SubscriptionStatus } from "@/lib/platform-constants";

export interface WebhookDeps {
  platform: PlatformClient;
  control: ControlClient;
}

export type WebhookOutcome =
  | "paid_recorded"
  | "failure_recorded"
  | "pending_recorded"
  | "duplicate_ignored"
  | "ignored_status"
  | "unknown_invoice";

function methodFromPaymentType(paymentType: string | undefined): PaymentMethod | null {
  if (paymentType === "bank_transfer" || paymentType === "echannel") return "virtual_account";
  if (paymentType === "qris" || paymentType === "gopay") return "qris";
  return null;
}

/**
 * Asal pembayaran NON-Midtrans (issue #155) — penyelesaian TRANSFER MANUAL
 * oleh operator memakai INTI YANG SAMA dengan webhook, bukan implementasi
 * kedua yang pelan-pelan menyimpang: idempotensi `gateway_ref` UNIQUE,
 * `paid` yang tak pernah diturunkan, transisi langganan lewat mesin siklus
 * hidup, dan urutan tulis §4A — semuanya satu jalur. Yang berbeda hanya
 * label sumbernya (gateway/method) dan tanggal bayar sesungguhnya (tanggal
 * transfer di rekening koran, bukan saat operator mengetik).
 */
export interface PaymentSourceOverride {
  /** Nilai `payments.gateway` — mis. "manual". */
  gateway: string;
  /** Nilai `payments.method` — mis. "manual_transfer". */
  method: PaymentMethod | null;
  /** Tanggal bayar sesungguhnya; tanpa ini memakai `now`. */
  paidAt?: Date;
}

/**
 * Proses satu notifikasi YANG SUDAH LOLOS verifikasi tanda tangan (verifikasi
 * milik route — ia yang memegang kunci; inti ini tidak menyentuh env).
 * `source` (opsional, #155): label asal pembayaran non-Midtrans — lihat
 * `PaymentSourceOverride`.
 */
export async function processPaymentNotification(
  deps: WebhookDeps,
  notification: MidtransNotification,
  now: Date = new Date(),
  source?: PaymentSourceOverride
): Promise<{ outcome: WebhookOutcome; subscriptionStatus?: string }> {
  const { platform, control } = deps;

  const newStatus = mapTransactionStatus(notification.transaction_status);
  if (newStatus === null) return { outcome: "ignored_status" };

  const invoice = await platform.platformInvoice.findUnique({
    where: { number: notification.order_id },
    select: { id: true, tenantId: true, subscriptionId: true, status: true, total: true },
  });
  if (!invoice) return { outcome: "unknown_invoice" };

  /* ── Jangkar idempotensi: satu gateway_ref = satu baris pembayaran ──────── */
  const existing = await platform.payment.findUnique({
    where: { gatewayRef: notification.transaction_id },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === newStatus) return { outcome: "duplicate_ignored" };
    if (existing.status === "paid") {
      /* `paid` final terhadap notifikasi susulan — `pending`/`expire` yang
       * datang terlambat tidak menurunkan pembayaran yang sudah lunas. */
      return { outcome: "duplicate_ignored" };
    }
  }

  /* ── 1. PLATFORM dulu: payment (+invoice bila lunas) ────────────────────── */
  try {
    const paidAt = source?.paidAt ?? now;
    if (existing) {
      await platform.payment.update({
        where: { id: existing.id },
        data: { status: newStatus, ...(newStatus === "paid" ? { paidAt } : {}) },
      });
    } else {
      await platform.payment.create({
        data: {
          tenantId: invoice.tenantId,
          platformInvoiceId: invoice.id,
          status: newStatus,
          method: source ? source.method : methodFromPaymentType(notification.payment_type),
          gateway: source?.gateway ?? "midtrans",
          gatewayRef: notification.transaction_id,
          amount: notification.gross_amount,
          currency: "IDR",
          ...(newStatus === "paid" ? { paidAt } : {}),
        },
      });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      /* Kiriman kembar yang benar-benar BERSAMAAN: yang ini kalah lomba pada
       * UNIQUE gateway_ref — pembayaran sudah dicatat lawannya. */
      return { outcome: "duplicate_ignored" };
    }
    throw e;
  }

  if (newStatus === "pending") return { outcome: "pending_recorded" };

  let event: SubscriptionEvent | null = null;
  if (newStatus === "paid") {
    await platform.platformInvoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    event = "payment_received";
  } else if (invoice.status === "issued") {
    /* failed/expired atas tagihan yang masih terbuka → gagal bayar. */
    event = "payment_failed";
  }

  let subscriptionStatus: string | undefined;
  if (event) {
    const subscription = await platform.subscription.findUnique({
      where: { id: invoice.subscriptionId },
      select: { id: true, tenantId: true, status: true },
    });
    if (subscription) {
      const next = transition(subscription.status as SubscriptionStatus, event);
      if (next !== null && next !== subscription.status) {
        await platform.subscription.update({
          where: { id: subscription.id },
          data: {
            status: next,
            ...(next === "past_due" ? { pastDueSince: now } : {}),
            ...(event === "payment_received" ? { pastDueSince: null } : {}),
          },
        });
        /* ── 2. KENDALI terakhir: salinan status untuk penjaga hanya-baca ── */
        await control.tenant.update({
          where: { id: subscription.tenantId },
          data: { status: tenantStatusForSubscription(next) },
        });
        subscriptionStatus = next;
      } else {
        subscriptionStatus = subscription.status;
      }
    }
  }

  return {
    outcome: newStatus === "paid" ? "paid_recorded" : "failure_recorded",
    subscriptionStatus,
  };
}
