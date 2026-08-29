import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workCenterSchema } from "@/lib/validations/manufacturing";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { pickerParams, type PickerOption } from "@/lib/picker";

/**
 * Stasiun kerja (issue #495 butir 3).
 *
 * `?active=1` hanya yang aktif — dipakai pemilih di formulir resep, supaya
 * stasiun yang sudah dinonaktifkan tidak bisa dipilih untuk routing BARU
 * sementara resep lama yang menyebutnya tetap terbaca. `?picker=1` menjawab
 * bentuk `{ options }` yang sama dengan seluruh pemilih lain.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("work_center.manage");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";
  const { picker, search, take } = pickerParams(searchParams);

  const where =
    activeOnly || search
      ? {
          ...(activeOnly ? { isActive: true } : {}),
          ...(search ? { name: { contains: search } } : {}),
        }
      : undefined;

  if (picker) {
    const rows = await prisma.workCenter.findMany({
      where,
      orderBy: { name: "asc" },
      take,
      select: { id: true, code: true, name: true },
    });
    return NextResponse.json({
      options: rows.map((w) => ({
        value: String(w.id),
        label: w.name,
        hint: w.code,
      })),
    } satisfies { options: PickerOption[] });
  }

  return NextResponse.json(
    await prisma.workCenter.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take,
    })
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("work_center.manage");
  if (!result.authorized) return result.response;

  const parsed = workCenterSchema.safeParse(await request.json());
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  /*
   * Kode UNIK diperiksa lebih dulu supaya benturan menjadi kalimat, bukan 500
   * dari pelanggaran kunci unik — pola yang sama dengan master lain.
   */
  const bentrok = await prisma.workCenter.findUnique({ where: { code: parsed.data.code } });
  if (bentrok) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("workCenters.codeTaken") }, { status: 400 });
  }

  return NextResponse.json(await prisma.workCenter.create({ data: parsed.data }), { status: 201 });
}
