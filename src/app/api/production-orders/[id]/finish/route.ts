import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { productionFinishSchema } from "@/lib/validations/manufacturing";
import {
  ProductionCostError,
  ProductionStateError,
  finishProductionOrderInTx,
} from "@/lib/manufacturing/production-writes";

/**
 * SELESAIKAN perintah produksi: serap upah & overhead, lalu seluruh isi Barang
 * Dalam Proses pindah ke barang jadi.
 *
 * Jam sungguhan ditulis LEBIH DULU di transaksi yang sama, sebab penyerapannya
 * dihitung dari baris itu. Menulisnya sesudah memposting akan menyerap nol dan
 * membuat jam yang dilaporkan tidak pernah berarti apa pun.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("production_order.write");
  if (!result.authorized) return result.response;

  const parsed = productionFinishSchema.safeParse(await request.json());
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }
  const { producedQuantity, operations } = parsed.data;
  const { id } = await params;
  const orderId = parseInt(id);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        await tx.productionOrderOperation.update({
          where: { id: op.id },
          data: { actualHours: op.actualHours },
        });
      }
      return finishProductionOrderInTx(tx, orderId, producedQuantity);
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "production.finish",
      entity: "production_order",
      entityId: orderId,
      details: { producedQuantity, unitCost: outcome.unitCost, totalCost: outcome.totalCost },
    });

    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof ProductionStateError || e instanceof ProductionCostError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }
}
