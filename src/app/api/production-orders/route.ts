import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productionOrderSchema } from "@/lib/validations/manufacturing";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { kebutuhanKotor, round3 } from "@/lib/manufacturing/bom";
import { nextProductionOrderNo } from "@/lib/manufacturing/production-writes";

/**
 * Perintah produksi (issue #495 butir 3).
 *
 * ══ BAHAN LANGSUNG, BUKAN DITURUNKAN SAMPAI DAUN ═══════════════════════════
 * Perintah ini memakai bahan LANGSUNG resepnya. Rakitan antara — bahan yang
 * ternyata keluaran resep lain — dibuat oleh perintah produksinya SENDIRI, dan
 * masuk gudang sebagai barang. Menurunkannya sampai daun di sini akan melewati
 * persediaan setengah jadi seluruhnya, dan dengan begitu membuat resep bertingkat
 * tidak ada gunanya: setiap batch akan mengonsumsi bahan mentah seolah tak ada
 * tahap di antaranya.
 *
 * Penurunan sampai daun tetap ada, dan tempatnya benar: halaman DETAIL resep,
 * untuk MERENCANAKAN — "berapa bahan mentah yang pada akhirnya dibutuhkan".
 */
export async function GET() {
  const result = await requireApiPermission("production_order.read");
  if (!result.authorized) return result.response;

  return NextResponse.json(
    await prisma.productionOrder.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 100,
      include: { outputItem: true, bom: true },
    })
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("production_order.write");
  if (!result.authorized) return result.response;

  const parsed = productionOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }
  const { bomId, date, plannedQuantity, notes, costCenterId } = parsed.data;
  const { t } = await getRequestI18n();

  const bom = await prisma.billOfMaterial.findUnique({
    where: { id: bomId },
    include: {
      components: { include: { item: { select: { name: true } } } },
      operations: { include: { workCenter: true }, orderBy: { sequence: "asc" } },
    },
  });
  if (!bom) return NextResponse.json({ error: t("productionOrders.bomNotFound") }, { status: 400 });
  if (!bom.isActive) {
    return NextResponse.json({ error: t("productionOrders.bomInactive") }, { status: 400 });
  }

  const outputQty = Number(bom.outputQuantity);
  // Dijaga skema resep (`positive`), tetapi baris warisan tetap diperiksa —
  // pembagi nol di sini akan melahirkan kebutuhan Infinity tanpa satu pun galat.
  if (!(outputQty > 0)) {
    return NextResponse.json({ error: t("productionOrders.bomOutputZero") }, { status: 400 });
  }
  const kali = plannedQuantity / outputQty;

  const orderDate = new Date(date);
  const orderNo = await nextProductionOrderNo(prisma, orderDate);

  /*
   * SNAPSHOT: nama bahan, jam standar, dan TARIF stasiun kerja disalin sekarang.
   * Menaikkan tarif bulan depan karena itu tidak menulis ulang harga pokok yang
   * sudah diposting — doktrin `contract_items.item_name`.
   */
  const created = await prisma.productionOrder.create({
    data: {
      orderNo,
      bomId: bom.id,
      outputItemId: bom.outputItemId,
      date: orderDate,
      plannedQuantity,
      status: "draft",
      notes: notes || null,
      costCenterId: costCenterId ?? null,
      components: {
        create: bom.components.map((c) => ({
          itemId: c.itemId,
          itemName: c.item.name,
          // Susut MEMBAGI, bukan mengalikan — satu fungsi, dipakai ulang.
          plannedQuantity: round3(
            kebutuhanKotor(Number(c.quantity), Number(c.scrapPercent)) * kali
          ),
        })),
      },
      operations: {
        create: bom.operations.map((op) => ({
          sequence: op.sequence,
          name: op.name,
          workCenterId: op.workCenterId,
          standardHours: round3(Number(op.standardHours) * kali),
          laborRate: Number(op.workCenter.laborRate),
          overheadRate: Number(op.workCenter.overheadRate),
        })),
      },
    },
    include: { components: true, operations: true },
  });

  return NextResponse.json(created, { status: 201 });
}
