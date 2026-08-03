/**
 * WEBHOOK gerbang pembayaran (issue #141) — PUBLIK: pengirimnya server
 * Midtrans, bukan pengguna ber-sesi. Dilepas `proxy.ts` sebagai JALUR PERSIS
 * (bukan prefix) dan terdaftar sebagai pengecualian beralasan di
 * tests/authz-coverage.test.ts.
 *
 * Kredensialnya TANDA TANGAN: SHA-512(order_id + status_code + gross_amount +
 * server key) — diverifikasi SEBELUM satu query pun. Tanpa kunci terpasang di
 * produksi, route menjawab 503 (fail-closed): webhook tanpa verifikasi adalah
 * pintu yang menandai tagihan lunas gratis.
 *
 * Idempoten & urutan tulis platform-dulu: lihat `lib/payment-webhook.ts`
 * (jangkar `payments.gateway_ref` UNIQUE — kiriman ganda dilatih di gladi).
 * Jawaban 200 untuk notifikasi yang diproses MAUPUN diabaikan (duplikat,
 * status yang tidak kita tindak, tagihan tak dikenal) — gerbang mengulang
 * kiriman pada non-200, dan mengulang duplikat selamanya tidak menolong siapa
 * pun; kebenarannya tercatat di log server.
 */
import { NextResponse } from "next/server";

import { platformDb } from "@/lib/platform-db";
import { controlDb } from "@/lib/control-db";
import {
  verifyMidtransSignature,
  webhookServerKey,
  type MidtransNotification,
} from "@/lib/payment-gateway";
import { planChangeApplier } from "@/lib/operator/writes";
import { processPaymentNotification } from "@/lib/payment-webhook";
import { invalidateTenantState } from "@/lib/tenant-state";

export async function POST(request: Request) {
  const serverKey = webhookServerKey();
  if (!serverKey) {
    /* Produksi tanpa MIDTRANS_SERVER_KEY: menolak SEMUA — bukan menerima
     * tanpa verifikasi. 503, bukan 401: yang salah konfigurasi kita. */
    return NextResponse.json({ error: "Gateway webhook is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as MidtransNotification | null;
  if (
    !body ||
    typeof body.order_id !== "string" ||
    typeof body.status_code !== "string" ||
    typeof body.gross_amount !== "string" ||
    typeof body.signature_key !== "string" ||
    typeof body.transaction_status !== "string" ||
    typeof body.transaction_id !== "string"
  ) {
    return NextResponse.json({ error: "Malformed notification." }, { status: 400 });
  }

  if (!verifyMidtransSignature(body, serverKey)) {
    console.warn(`[billing-webhook] tanda tangan salah untuk order ${body.order_id} — ditolak.`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const result = await processPaymentNotification(
    {
      platform: platformDb,
      control: controlDb,
      /* Tagihan PERPINDAHAN PAKET yang lunas memindahkan paketnya di sini —
       * aktornya BUKAN operator: pelanggan yang memilih dan membayarnya
       * sendiri, dan jejak audit harus bisa mengatakan itu tanpa menebak. */
      applyPlanChange: planChangeApplier(
        { platform: platformDb, control: controlDb },
        {
          operator: "self-service:plan-change",
          reason: "Perpindahan paket swalayan, dibayar pelanggan",
        }
      ),
    },
    body
  );

  /* Status tenant bisa baru saja berubah (lunas → active, gagal → past_due):
   * buang cache penjaga supaya prosesnya sendiri langsung melihat kebenaran. */
  if (result.outcome === "paid_recorded" || result.outcome === "failure_recorded") {
    invalidateTenantState();
  }

  console.log(
    `[billing-webhook] order ${body.order_id} tx ${body.transaction_id}: ` +
      `${body.transaction_status} → ${result.outcome}` +
      (result.subscriptionStatus ? ` (langganan: ${result.subscriptionStatus})` : "")
  );
  return NextResponse.json({ ok: true, outcome: result.outcome });
}
