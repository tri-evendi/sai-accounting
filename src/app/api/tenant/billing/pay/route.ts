/**
 * "Bayar sekarang" (issue #141) — pelanggan meminta instruksi bayar (nomor
 * Virtual Account / QRIS) untuk sebuah tagihan platform yang masih terbuka.
 *
 * Penjaga tenant `tenant.billing` (owner — kontraktual). Tagihan DIBUKTIKAN
 * milik tenant pemanggil sebelum apa pun dibuat. Idempoten dari sisi
 * pelanggan: instruksi PENDING yang masih hidup untuk metode yang sama
 * dikembalikan lagi, bukan digandakan — menekan tombol dua kali tidak
 * membuat dua VA.
 *
 * TIDAK ADA data kartu di jalur ini — VA & QRIS saja; kartu (bila kelak
 * dibuka) berjalan penuh di halaman gerbang, bukan lewat kita.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { platformDb } from "@/lib/platform-db";
import { resolvePaymentGateway } from "@/lib/payment-gateway";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

const paySchema = z.object({
  invoiceId: z.number().int().positive(),
  method: z.enum(["virtual_account", "qris"]),
  bank: z.enum(["bca", "bni", "bri", "permata"]).optional(),
});

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("tenant.billing");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const body = await request.json().catch(() => null);
  const parsed = paySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  /* Tagihan harus MILIK TENANT PEMANGGIL dan masih terbuka. */
  const invoice = await platformDb.platformInvoice.findFirst({
    where: { id: parsed.data.invoiceId, tenantId: result.tenant.tenantId },
    select: { id: true, number: true, status: true, total: true, tenantId: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: t("billing.invoiceNotFound") }, { status: 404 });
  }
  if (invoice.status !== "issued") {
    return NextResponse.json(
      { error: t("billing.invoiceNotPayable"), code: "not_payable" },
      { status: 409 }
    );
  }

  /* Instruksi pending yang masih hidup untuk metode ini → pakai ulang. */
  const now = new Date();
  const existing = await platformDb.payment.findFirst({
    where: {
      platformInvoiceId: invoice.id,
      status: "pending",
      method: parsed.data.method,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { id: "desc" },
    select: { bank: true, vaNumber: true, qrString: true, expiresAt: true, gateway: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, payment: existing, reused: true });
  }

  const gateway = resolvePaymentGateway();
  if (gateway.name === "manual") {
    /* Tanpa gerbang: instruksi transfer manual — tidak ada VA untuk dibuat. */
    const charge = await gateway.createCharge({
      invoiceNumber: invoice.number,
      grossAmount: invoice.total.toString(),
      method: "virtual_account",
    });
    return NextResponse.json({
      ok: true,
      payment: { gateway: "manual", instructions: charge.instructions },
      manual: true,
    });
  }

  const charge = await gateway.createCharge({
    invoiceNumber: invoice.number,
    grossAmount: invoice.total.toString(),
    method: parsed.data.method,
    bank: parsed.data.bank,
  });

  try {
    await platformDb.payment.create({
      data: {
        tenantId: invoice.tenantId,
        platformInvoiceId: invoice.id,
        status: "pending",
        method: charge.method,
        gateway: charge.gateway,
        gatewayRef: charge.gatewayRef,
        amount: invoice.total,
        currency: "IDR",
        bank: charge.bank ?? null,
        vaNumber: charge.vaNumber ?? null,
        qrString: charge.qrString ?? null,
        expiresAt: charge.expiresAt ?? null,
      },
    });
  } catch (e) {
    /* Dua klik beruntun: gateway_ref UNIQUE — instruksi yang sudah tercatat
     * yang dikembalikan, bukan galat dan bukan VA kedua. */
    if ((e as { code?: string }).code !== "P2002") throw e;
  }

  return NextResponse.json({
    ok: true,
    payment: {
      gateway: charge.gateway,
      bank: charge.bank ?? null,
      vaNumber: charge.vaNumber ?? null,
      qrString: charge.qrString ?? null,
      expiresAt: charge.expiresAt ?? null,
    },
  });
}
