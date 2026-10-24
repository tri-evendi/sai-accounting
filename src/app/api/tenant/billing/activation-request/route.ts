/**
 * "Minta aktivasi" — alur demo-first (keputusan pemilik 24 Okt 2026).
 *
 * Menggantikan "Bayar" selama uji coba, saat uji coba sudah BEKU
 * (`trial_ended`), dan saat pemasangan ini tidak punya rel pembayaran sama
 * sekali (tanpa gerbang DAN tanpa instruksi transfer) — tombol bayar yang
 * berakhir tanpa nomor rekening adalah jalan buntu (`docs/KOMERSIALISASI.md`
 * §11). Yang dilakukan route ini hanya MENCATAT: satu baris
 * `activation_requests` yang muncul di konsol operator sebagai daftar kerja.
 * Membuka WhatsApp/surel adalah urusan peramban, dari `contactChannels()`.
 *
 * Penjaga tenant `tenant.billing` (owner) — meminta aktivasi adalah langkah
 * menuju kontrak. Status tenant TIDAK diperiksa: justru tenant yang beku
 * hanya-baca yang paling perlu bisa menekannya (penjaga hanya-baca berlaku
 * untuk izin TULIS buku, bukan untuk izin tenant ini).
 *
 * IDEMPOTEN: satu permintaan TERBUKA per tenant (indeks unik parsial,
 * migration platform 0011). Klik kedua dijawab `already: true`, bukan baris
 * kembar — dan bukan galat: dari sisi customer, permintaannya memang sudah
 * tercatat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { platformDb } from "@sai/platform/platform-db";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";

const schema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("tenant.billing");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const userId = Number.parseInt(result.session.user.id, 10);
  const who = [result.session.user.name, result.session.user.email].filter(Boolean).join(" · ");

  try {
    await platformDb.activationRequest.create({
      data: {
        tenantId: result.tenant.tenantId,
        requestedByUserId: Number.isInteger(userId) ? userId : 0,
        requestedByName: who ? who.slice(0, 191) : null,
        tenantStatus: result.tenant.tenantStatus,
        note: parsed.data.note || null,
      },
    });
  } catch (e) {
    /* Sudah ada permintaan terbuka untuk tenant ini — indeks unik parsial. */
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[activation-request] gagal dicatat:", e);
    return NextResponse.json({ error: t("billing.activation.errSave") }, { status: 503 });
  }

  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.email ?? result.session.user.name ?? result.session.user.id,
    tenantRole: result.tenant.role,
    request,
    action: "tenant.activation_request",
    details: { tenantStatus: result.tenant.tenantStatus, note: parsed.data.note || null },
  });

  return NextResponse.json({ ok: true, already: false });
}
