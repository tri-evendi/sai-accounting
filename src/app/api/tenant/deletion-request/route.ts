/**
 * Permintaan penghapusan akun (issue #142, UU PDP) — permintaan & pembatalan
 * SAJA. Yang TIDAK ada di sini, dengan sengaja: eksekusi. Penghapusan
 * dijalankan operator lewat skrip bergerbang bukti
 * (`scripts/execute-tenant-deletion.ts`) setelah masa tenggang lewat —
 * penghancuran menuntut manusia, bukan satu DELETE yang kebetulan lolos.
 *
 * Konsekuensi disebut SEBELUM dan SESUDAH: respons GET memuat garis waktunya,
 * dan setiap owner menerima surel saat permintaan dibuat maupun dibatalkan —
 * termasuk kenyataan bahwa buku besar TIDAK ikut terhapus (retensi UU KUP 10
 * tahun, docs/COMPLIANCE.md).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { controlDb } from "@/lib/control-db";
import {
  DELETION_GRACE_DAYS,
  graceEndsAtFrom,
} from "@/lib/tenant-deletion";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { sendMail } from "@/lib/mailer";
import { TENANT_ROLES } from "@/lib/constants";
import { getRequestI18n } from "@/lib/i18n/server";

const requestSchema = z.object({
  note: z.string().max(2000).trim().optional(),
});

async function ownerEmails(tenantId: number): Promise<string[]> {
  const owners = await controlDb.tenantMembership.findMany({
    where: { tenantId, role: TENANT_ROLES.OWNER },
    select: { user: { select: { email: true } } },
  });
  return owners.map((o) => o.user.email).filter((e): e is string => Boolean(e));
}

async function pendingRequest(tenantId: number) {
  return controlDb.tenantDeletionRequest.findFirst({
    where: { tenantId, status: "pending" },
    select: { id: true, graceEndsAt: true, createdAt: true, note: true },
  });
}

/** Keadaan permintaan saat ini — dipakai kartu "Data & Privasi" di /tenant. */
export async function GET() {
  const result = await requireTenantApiPermission("tenant.deletion");
  if (!result.authorized) return result.response;

  const pending = await pendingRequest(result.tenant.tenantId);
  return NextResponse.json({
    pending: pending
      ? { graceEndsAt: pending.graceEndsAt, createdAt: pending.createdAt }
      : null,
    graceDays: DELETION_GRACE_DAYS,
  });
}

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("tenant.deletion");
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const existing = await pendingRequest(result.tenant.tenantId);
  if (existing) {
    return NextResponse.json(
      { error: t("tenantSettings.deletionAlreadyPending"), code: "already_pending" },
      { status: 409 }
    );
  }

  const graceEndsAt = graceEndsAtFrom();
  const created = await controlDb.tenantDeletionRequest.create({
    data: {
      tenantId: result.tenant.tenantId,
      requestedByUserId: Number.parseInt(result.session.user.id, 10),
      graceEndsAt,
      note: parsed.data.note || null,
    },
    select: { id: true, graceEndsAt: true },
  });

  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    tenantRole: result.tenant.role,
    action: "tenant.deletion.request",
    details: { requestId: created.id, graceEndsAt: created.graceEndsAt.toISOString() },
    request,
  });

  /* Pemberitahuan KONSEKUENSI ke SEMUA owner — bukan hanya peminta: akun
   * bersama tidak boleh berakhir karena satu orang menekan tombol diam-diam.
   * Kegagalan kirim tidak membatalkan permintaan (tercatat di log server). */
  void (async () => {
    const graceDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(graceEndsAt);
    for (const email of await ownerEmails(result.tenant.tenantId)) {
      try {
        await sendMail({
          to: email,
          subject: "Permintaan penghapusan akun — SAI Accounting",
          text:
            "Halo,\n\n" +
            `Penghapusan akun tenant "${result.tenant.tenantName}" DIMINTA hari ini.\n\n` +
            "Yang akan terjadi, dan kapan:\n" +
            `  • Masa tenggang ${DELETION_GRACE_DAYS} hari — sampai ${graceDate} permintaan ini\n` +
            "    bisa dibatalkan dari halaman Pengaturan Tenant.\n" +
            "  • Setelah itu operator mengeksekusi: seluruh akses ditutup dan data\n" +
            "    PRIBADI (nama, email) dianonimkan sesuai UU PDP.\n" +
            "  • BUKU PEMBUKUAN TIDAK IKUT TERHAPUS: UU KUP mewajibkan buku dan\n" +
            "    catatan pembukuan disimpan 10 tahun. Ia disimpan (tidak bisa\n" +
            "    diakses siapa pun) dan baru dapat dihancurkan setelah masa itu.\n" +
            "  • Unduh data Anda SEKARANG dari Pengaturan Tenant — setelah\n" +
            "    eksekusi tidak ada lagi yang bisa masuk untuk mengunduhnya.\n\n" +
            "Bukan Anda yang meminta? Batalkan segera dari halaman Pengaturan\n" +
            "Tenant, dan ganti kata sandi Anda.\n\n— SAI Accounting",
        });
      } catch (error) {
        console.error("[deletion-request] gagal mengirim pemberitahuan:", error);
      }
    }
  })();

  return NextResponse.json(
    { ok: true, graceEndsAt: created.graceEndsAt, graceDays: DELETION_GRACE_DAYS },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  const result = await requireTenantApiPermission("tenant.deletion");
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  const pending = await pendingRequest(result.tenant.tenantId);
  if (!pending) {
    return NextResponse.json(
      { error: t("tenantSettings.deletionNonePending"), code: "none_pending" },
      { status: 404 }
    );
  }

  await controlDb.tenantDeletionRequest.update({
    where: { id: pending.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    tenantRole: result.tenant.role,
    action: "tenant.deletion.cancel",
    details: { requestId: pending.id },
    request,
  });

  void (async () => {
    for (const email of await ownerEmails(result.tenant.tenantId)) {
      try {
        await sendMail({
          to: email,
          subject: "Permintaan penghapusan DIBATALKAN — SAI Accounting",
          text:
            "Halo,\n\n" +
            `Permintaan penghapusan akun tenant "${result.tenant.tenantName}" sudah\n` +
            "DIBATALKAN. Tidak ada yang berubah; akun berjalan seperti biasa.\n\n" +
            "— SAI Accounting",
        });
      } catch (error) {
        console.error("[deletion-request] gagal mengirim pembatalan:", error);
      }
    }
  })();

  return NextResponse.json({ ok: true });
}
