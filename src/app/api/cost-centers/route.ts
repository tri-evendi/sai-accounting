/**
 * Master pusat biaya (issue #91) — daftar & pembuatan.
 *
 * GET dijaga `cost_center.read` yang lebih longgar, dengan alasan yang sama
 * `GET /api/accounts` dijaga `account.read`: pemilih pusat biaya muncul di form
 * dokumen milik Manajer Keuangan, jadi daftarnya harus terbaca oleh peran yang
 * mengisi dokumennya. MENULIS tetap `cost_center.manage` (akses penuh).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { costCenterSchema } from "@/lib/validations/cost-center";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(request: Request) {
  const result = await requireApiPermission("cost_center.read");
  if (!result.authorized) return result.response;

  // `?activeOnly=1` untuk pemilih: yang nonaktif tak boleh bisa DIPILIH lagi,
  // tetapi tetap harus tampil di halaman kelolanya — karena itu penyaringnya
  // eksplisit di sini, bukan bawaan.
  const activeOnly = new URL(request.url).searchParams.get("activeOnly") === "1";

  const costCenters = await prisma.costCenter.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { code: "asc" },
  });
  return NextResponse.json(costCenters);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("cost_center.manage");
  if (!result.authorized) return result.response;

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

  try {
    const costCenter = await prisma.costCenter.create({
      data: { code, name, parentId: parentId ?? null, isActive },
    });
    return NextResponse.json(costCenter, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("costCenters.codeTaken") }, { status: 409 });
    }
    throw e;
  }
}
