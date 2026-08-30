import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  ProductionStateError,
  releaseProductionOrderInTx,
} from "@/lib/manufacturing/production-writes";
import { OverIssueError } from "@/lib/delivery-orders";

/**
 * TERBITKAN perintah produksi: bahan keluar gudang → Barang Dalam Proses.
 *
 * Menulis ke buku besar, jadi seluruhnya dalam SATU transaksi: gerakan stok,
 * nilai yang disimpan di barisnya, perubahan status, dan jurnalnya commit
 * bersama. Membatalkan di tengah tidak boleh meninggalkan bahan yang keluar
 * dari gudang tanpa jurnal yang menyebutnya.
 *
 * Kunci periode ditegakkan `assertPeriodOpen` DI DALAM mesin jurnal — bukan
 * disalin ke sini, sebab dua penjaga periode adalah dua penjaga yang suatu hari
 * berbeda.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("production_order.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const orderId = parseInt(id);

  try {
    const outcome = await prisma.$transaction((tx) => releaseProductionOrderInTx(tx, orderId));

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "production.release",
      entity: "production_order",
      entityId: orderId,
      details: { issuedValue: outcome.issuedValue },
    });

    return NextResponse.json(outcome);
  } catch (e) {
    // Stok tak cukup & keadaan perintah yang salah adalah kalimat, bukan 500.
    if (e instanceof OverIssueError || e instanceof ProductionStateError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }
}
