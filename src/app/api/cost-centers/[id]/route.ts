/**
 * Satu pusat biaya (issue #91) — baca, ubah, nonaktifkan.
 *
 * TIDAK ADA `DELETE`, dan itu keputusan: sebuah pusat biaya yang pernah
 * disebut baris jurnal harus tetap bisa diterjemahkan menjadi nama selamanya,
 * kalau tidak laporan lama berhenti bisa menyebut cabang asal angkanya. FK-nya
 * RESTRICT, jadi DB akan menolak penghapusan itu juga — di sini jalurnya tidak
 * dibuka sama sekali supaya tak ada tombol yang menjanjikan sesuatu yang akan
 * gagal. Cara menyingkirkannya adalah `isActive: false`, lewat PUT yang sama.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { costCenterSchema } from "@/lib/validations/cost-center";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("cost_center.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const costCenter = await prisma.costCenter.findUnique({ where: { id: parseInt(id) } });
  if (!costCenter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(costCenter);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("cost_center.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const costCenterId = parseInt(id);
  const body = await request.json();
  const parsed = costCenterSchema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const { code, name, parentId, isActive } = parsed.data;

  // Induk = dirinya sendiri membuat hierarki tak terhingga; ditolak di sini
  // (pola yang sama dengan /api/accounts/[id]).
  if (parentId === costCenterId) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("costCenters.parentSelf") }, { status: 400 });
  }

  try {
    const costCenter = await prisma.costCenter.update({
      where: { id: costCenterId },
      data: { code, name, parentId: parentId ?? null, isActive },
    });
    return NextResponse.json(costCenter);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("costCenters.codeTaken") }, { status: 409 });
    }
    throw e;
  }
}
