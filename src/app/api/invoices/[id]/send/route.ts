/**
 * Kirim faktur ke pelanggan (issue #465).
 *
 * `POST { channel: "email" | "whatsapp" }`
 *
 * ══ KENAPA `invoice.write`, BUKAN `invoice.read` ════════════════════════════
 * Rute ini adalah satu-satunya di seluruh buku yang berbicara KE LUAR atas nama
 * perusahaan. Izin baca dipegang jauh lebih banyak orang daripada yang pantas
 * mengirim surel bernama perusahaan ke pelanggannya, dan surel yang terlanjur
 * keluar tidak bisa ditarik kembali. Jadi gerbangnya izin TULIS — bukan karena
 * buku besarnya berubah (tidak), melainkan karena akibatnya keluar dari sini.
 *
 * ══ TIDAK ADA KIRIM OTOMATIS ════════════════════════════════════════════════
 * Setiap panggilan berawal dari seseorang yang menekan tombol. Pengingat
 * berjadwal adalah #467 dan sengaja tidak lewat sini.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import {
  InvoiceSendProblem,
  invoiceSendSchema,
  recordWhatsAppSend,
  sendInvoiceByEmail,
} from "@/lib/invoice-send";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const { t, dictionary } = await getRequestI18n();

  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const parsed = invoiceSendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const userId = parseInt(result.session.user.id, 10);

  try {
    if (parsed.data.channel === "email") {
      const send = await sendInvoiceByEmail(invoiceId, userId);
      await writeAuditLog({
        userId: result.session.user.id,
        username: result.session.user.email,
        role: result.session.user.role,
        action: "invoice.send.email",
        entity: "invoice",
        entityId: invoiceId,
        /* KE MANA ikut dicatat — "faktur dikirim" tanpa alamatnya tidak
           menjawab satu pun pertanyaan yang membuat orang membuka jejak. */
        details: { recipient: send.recipient },
        request,
      });
      return NextResponse.json({ ok: true, sentAt: send.sentAt, recipient: send.recipient });
    }

    const send = await recordWhatsAppSend(invoiceId, userId);
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      role: result.session.user.role,
      action: "invoice.send.whatsapp",
      entity: "invoice",
      entityId: invoiceId,
      details: { recipient: send.recipient },
      request,
    });
    /* Tautannya sudah ada di `href` tombolnya sejak halaman dirender — rute ini
       hanya MENCATAT bahwa pesannya disiapkan (lihat kepala
       `lib/invoice-send.ts`). Server tidak pernah bisa mengirim WhatsApp. */
    return NextResponse.json({ ok: true, sentAt: send.sentAt });
  } catch (error) {
    if (error instanceof InvoiceSendProblem) {
      return NextResponse.json(
        { error: error.message },
        { status: error.reason === "not_found" ? 404 : 409 }
      );
    }
    throw error;
  }
}
