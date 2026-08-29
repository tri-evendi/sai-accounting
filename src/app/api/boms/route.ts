import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bomSchema } from "@/lib/validations/manufacturing";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { pickerParams, type PickerOption } from "@/lib/picker";

/**
 * Resep produksi (issue #495 butir 3).
 *
 * `?active=1&picker=1` dipakai formulir Perintah Produksi. Resep NONAKTIF tidak
 * ditawarkan untuk perintah BARU, sementara perintah lama yang menyebutnya tetap
 * terbaca lewat salinannya sendiri — perintah produksi menyimpan snapshot
 * barisnya, jadi ia tidak pernah bergantung pada resep yang masih hidup.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("bill_of_material.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";
  const { picker, search, take } = pickerParams(searchParams);

  const where =
    activeOnly || search
      ? {
          ...(activeOnly ? { isActive: true } : {}),
          ...(search
            ? { OR: [{ code: { contains: search } }, { outputItem: { name: { contains: search } } }] }
            : {}),
        }
      : undefined;

  if (picker) {
    const rows = await prisma.billOfMaterial.findMany({
      where,
      orderBy: { code: "asc" },
      take,
      select: {
        id: true,
        code: true,
        outputQuantity: true,
        outputItem: { select: { name: true, unit: true } },
      },
    });
    return NextResponse.json({
      options: rows.map((b) => ({
        value: String(b.id),
        label: b.code,
        hint: `${b.outputItem.name} · ${Number(b.outputQuantity)} ${b.outputItem.unit || "kg"}`,
      })),
    } satisfies { options: PickerOption[] });
  }

  return NextResponse.json(
    await prisma.billOfMaterial.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      take,
      include: { outputItem: true, components: true, operations: true },
    })
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("bill_of_material.write");
  if (!result.authorized) return result.response;

  const parsed = bomSchema.safeParse(await request.json());
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }
  const { components, operations, ...bom } = parsed.data;
  const { t } = await getRequestI18n();

  if (await prisma.billOfMaterial.findUnique({ where: { code: bom.code } })) {
    return NextResponse.json({ error: t("boms.codeTaken") }, { status: 400 });
  }

  /*
   * Resep yang memakai KELUARANNYA SENDIRI sebagai bahan ditolak di sini.
   * `explodeBom` memang mendeteksi lingkaran dan melemparnya beserta jalur,
   * tetapi lingkaran sependek ini tidak perlu menunggu sampai seseorang
   * menurunkannya: ia tidak pernah punya arti, dan menolaknya saat disimpan
   * memberi kalimat pada isian yang salah alih-alih galat saat menghitung.
   */
  if (components.some((c) => c.itemId === bom.outputItemId)) {
    return NextResponse.json({ error: t("boms.outputAsComponent") }, { status: 400 });
  }

  /* Nomor urut langkah harus unik — `@@unique([bomId, sequence])` menegakkannya
     di basis data, dan di sini ia menjadi kalimat alih-alih 500. */
  const urut = operations.map((o) => o.sequence);
  if (new Set(urut).size !== urut.length) {
    return NextResponse.json({ error: t("boms.duplicateSequence") }, { status: 400 });
  }

  const created = await prisma.billOfMaterial.create({
    data: {
      ...bom,
      components: { create: components },
      operations: { create: operations },
    },
    include: { components: true, operations: true },
  });
  return NextResponse.json(created, { status: 201 });
}
