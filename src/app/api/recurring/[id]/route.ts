/**
 * Satu templat berulang: ubah atau nonaktifkan (issue #469, tahap 3).
 *
 * TIDAK ADA DELETE, dan itu disengaja — sepola pusat biaya dan data master
 * lain: templat yang pernah menerbitkan dokumen harus tetap bisa disebut
 * namanya di riwayat kejadiannya. Cara menyingkirkannya adalah
 * `isActive: false`, yang membuat penjadwal berhenti membacanya tanpa
 * menyentuh satu pun dokumen yang terlanjur lahir darinya.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { recurringTemplateSchema } from "@/lib/validations/recurring";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Inti untuk menyunting templat; jenis `invoice` diperiksa lagi di bawah —
  // alasannya sama dengan route pembuatan.
  const result = await requireApiPermission("journal.write");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const parsed = recurringTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  /* Menyunting templat faktur adalah menyentuh faktur yang akan lahir darinya. */
  if (parsed.data.kind === "invoice") {
    const boleh = await requireApiPermission("invoice.write");
    if (!boleh.authorized) return boleh.response;
  }

  const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: t("recurring.notFound") }, { status: 404 });
  }

  const updated = await prisma.recurringTemplate.update({
    where: { id },
    data: {
      name: parsed.data.name,
      frequency: parsed.data.frequency,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      maxOccurrences: parsed.data.maxOccurrences ?? null,
      isActive: parsed.data.isActive,
      /* `kind` dan `sourceId` TIDAK bisa diubah: mengganti dokumen sumber
         sebuah templat yang sudah berjalan berarti riwayat kejadiannya
         menunjuk dua dokumen berbeda dengan satu nama. Buat templat baru. */
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "recurring.template.update",
    entity: "recurring_template",
    entityId: id,
    details: { name: updated.name, isActive: updated.isActive },
    request,
  });

  return NextResponse.json(updated);
}
