/**
 * PENCATAT PERISTIWA LANGGANAN (migration platform 0003).
 *
 * Satu fungsi untuk setiap penulis `subscriptions` — penjadwal, webhook,
 * konsol operator, swalayan, skrip CLI, adopsi. Satu fungsi karena bentuk
 * barisnya harus seragam: hitungan churn yang membaca `to_status = 'cancelled'`
 * hanya benar bila SEMUA penulis menulis `to_status`, bukan sebagian menulis
 * `details.next`.
 *
 * ══ GAGAL-LUNAK, DAN KENAPA ════════════════════════════════════════════════
 * Pencatatan dijalankan SESUDAH tulisan langganannya, dan kegagalannya hanya
 * di-log — pola `writeTenantAuditLog`. Peristiwa adalah catatan tentang yang
 * terjadi, bukan gerbang: webhook pembayaran yang gagal karena tabel riwayat
 * penuh akan membuat gerbang mengulang kiriman dan pelanggan yang sudah
 * membayar menunggu. Konsekuensinya dinyatakan: metrik bisa kehilangan baris;
 * uang tidak.
 *
 * Tanpa `server-only`, klien disuntik — penulis terbesarnya skrip.
 */
import type { PrismaClient as PlatformClient } from "@/generated/platform/client";

export const SUBSCRIPTION_EVENT_KINDS = [
  /** Langganan lahir (pendaftaran, adopsi, ganti paket tanpa langganan aktif). */
  "created",
  /** Status berpindah lewat mesin siklus hidup atau operator. */
  "status",
  /** Paket (dan harga snapshot-nya) berpindah. */
  "plan",
  /** Mode penagihan none/manual/auto berubah. */
  "billing_mode",
  /** Periode berjalan digeser (perpanjangan, trial habis → periode berbayar). */
  "period",
  /** Tanggal akhir uji coba dicabut (jeda penagihan). */
  "trial_cleared",
] as const;
export type SubscriptionEventKind = (typeof SUBSCRIPTION_EVENT_KINDS)[number];

export interface SubscriptionEventInput {
  subscriptionId: number;
  tenantId: number;
  kind: SubscriptionEventKind;
  actor: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromPlanId?: number | null;
  toPlanId?: number | null;
  /** Decimal/string/number — disimpan apa adanya ke `Decimal(15,2)`, tidak lewat `Number`. */
  fromPrice?: { toString(): string } | string | number | null;
  toPrice?: { toString(): string } | string | number | null;
  currency?: string | null;
  details?: Record<string, unknown>;
}

const harga = (v: SubscriptionEventInput["fromPrice"]) =>
  v === undefined || v === null ? null : v.toString();

export async function recordSubscriptionEvent(
  platform: Pick<PlatformClient, "subscriptionEvent">,
  event: SubscriptionEventInput,
  now: Date = new Date()
): Promise<void> {
  try {
    await platform.subscriptionEvent.create({
      data: {
        subscriptionId: event.subscriptionId,
        tenantId: event.tenantId,
        kind: event.kind,
        actor: event.actor.slice(0, 100),
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        fromPlanId: event.fromPlanId ?? null,
        toPlanId: event.toPlanId ?? null,
        fromPrice: harga(event.fromPrice),
        toPrice: harga(event.toPrice),
        currency: event.currency ?? null,
        details: event.details === undefined ? null : JSON.stringify(event.details),
        occurredAt: now,
      },
    });
  } catch (error) {
    console.error(
      `[subscription-events] peristiwa ${event.kind} langganan #${event.subscriptionId} tidak tercatat:`,
      error
    );
  }
}
