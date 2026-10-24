/**
 * PROFIL USAHA (bentuk usaha, PR B — 24 Okt 2026): identitas legal dan
 * sakelar PPh Final UMKM (PP 55/2022).
 *
 * GET — nilai tersimpan + bentuk usaha (untuk pengingat batas waktu).
 * PUT — `identity` dan/atau `pphFinal`; yang tidak disebut tidak disentuh.
 *
 * Izin `company_setting.manage`. Keduanya diaudit TERPISAH: "sejak kapan
 * perusahaan ini memakai PPh Final" adalah pertanyaan tersendiri.
 * Membutuhkan baris `company_settings` (wisaya sudah dijalankan) — 409 bila
 * belum, pola yang sama dengan PKP.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import { getCompanyLegalForm } from "@/lib/legal-form-server";
import { businessProfileSchema } from "@/lib/validations/legal-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT = {
  id: true,
  nib: true,
  deedNumber: true,
  ministryDecreeNumber: true,
  establishedOn: true,
  pphFinalUmkm: true,
  pphFinalUmkmStartYear: true,
} as const;

type Row = { id: number; establishedOn: Date | null } & Record<string, unknown>;

/** Kolom `@db.Date` dibaca Prisma sebagai tengah malam UTC — komponen UTC-nya
 *  ADALAH tanggalnya (bukan instan bisnis yang perlu zona Jakarta). */
function dateOnly(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function shape(row: Row | null) {
  if (!row) return null;
  const { id: _id, establishedOn, ...rest } = row;
  void _id;
  return { ...rest, establishedOn: establishedOn ? dateOnly(establishedOn) : null };
}

export async function GET() {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;
  const [row, legalForm] = await Promise.all([
    prisma.companySetting.findFirst({ orderBy: { id: "asc" }, select: SELECT }),
    getCompanyLegalForm(),
  ]);
  return NextResponse.json({ legalForm, profile: shape(row) });
}

export async function PUT(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;
  const { dictionary, t } = await getRequestI18n();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }
  const parsed = businessProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("businessProfile.invalid"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const before = await prisma.companySetting.findFirst({ orderBy: { id: "asc" }, select: SELECT });
  if (!before) {
    return NextResponse.json({ error: t("businessProfile.setupFirst") }, { status: 409 });
  }

  const { identity, pphFinal } = parsed.data;
  const actor = {
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    role: result.session.user.role,
  };

  if (identity) {
    const data = {
      ...(identity.nib !== undefined ? { nib: identity.nib } : {}),
      ...(identity.deedNumber !== undefined ? { deedNumber: identity.deedNumber } : {}),
      ...(identity.ministryDecreeNumber !== undefined
        ? { ministryDecreeNumber: identity.ministryDecreeNumber }
        : {}),
      ...(identity.establishedOn !== undefined
        ? { establishedOn: identity.establishedOn ? new Date(`${identity.establishedOn}T00:00:00.000Z`) : null }
        : {}),
    };
    await prisma.companySetting.update({ where: { id: before.id }, data });
    await writeAuditLog({
      ...actor,
      action: "company_setting.identity.update",
      entity: "company_settings",
      entityId: before.id,
      details: { before: shape(before as Row), changes: identity },
      request,
    });
  }

  if (pphFinal) {
    await prisma.companySetting.update({
      where: { id: before.id },
      data: { pphFinalUmkm: pphFinal.enabled, pphFinalUmkmStartYear: pphFinal.startYear },
    });
    await writeAuditLog({
      ...actor,
      action: "company_setting.pph_final.update",
      entity: "company_settings",
      entityId: before.id,
      details: {
        before: { enabled: before.pphFinalUmkm, startYear: before.pphFinalUmkmStartYear },
        after: pphFinal,
      },
      request,
    });
  }

  const after = await prisma.companySetting.findFirst({ orderBy: { id: "asc" }, select: SELECT });
  return NextResponse.json({ legalForm: await getCompanyLegalForm(), profile: shape(after) });
}
