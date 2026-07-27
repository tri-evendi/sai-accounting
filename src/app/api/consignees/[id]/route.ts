import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consigneeSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("consignee.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const consignee = await prisma.consignee.findUnique({
    where: { id: parseInt(id) },
  });

  if (!consignee) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.consigneeNotFound") }, { status: 404 });
  }

  return NextResponse.json(consignee);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("consignee.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = consigneeSchema.safeParse(body);

  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const consignee = await prisma.consignee.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json(consignee);
}

/**
 * Master data is never hard-deleted once referenced (docs/DATABASE.md §1). A
 * consignee still linked to any contract is DEACTIVATED (`is_active = false`) so
 * it drops out of the pickers but every contract keeps its link and history.
 * Only an unused consignee is truly removed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("consignee.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const consigneeId = parseInt(id);

  const references = await prisma.contract.count({ where: { consigneeId } });

  if (references > 0) {
    const consignee = await prisma.consignee.update({
      where: { id: consigneeId },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, deactivated: true, consignee });
  }

  await prisma.consignee.delete({ where: { id: consigneeId } });
  return NextResponse.json({ success: true, deactivated: false });
}
