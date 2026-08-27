/**
 * Membatalkan satu dokumen biaya impor (issue #495 butir 1).
 *
 * Sebuah dokumen yang tidak bisa dibatalkan adalah dokumen yang salah ketiknya
 * hidup selamanya di harga pokok. Pembatalannya tetap tunduk pada kunci periode
 * dan tetap membalik jurnalnya alih-alih menghapusnya — lihat
 * `deleteLandedCostInTx` untuk alasan kenapa baris `cost_adjust` diperlakukan
 * berbeda dari jurnal.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { deleteLandedCostInTx } from "@/lib/landed-cost-data";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  /*
   * `landed_cost.write`, bukan izin hapus tersendiri berakses-penuh. Alasannya
   * sama dengan `advance.delete` (#26): ini KOREKSI KERJA HARIAN, bukan
   * penghapusan master data. Yang dihapus hanya hasil hitungan dokumen ini;
   * jurnalnya dibalik, bukan dilenyapkan, dan jejaknya tetap ada di audit.
   */
  const result = await requireApiPermission("landed_cost.write");
  if (!result.authorized) return result.response;

  const { id: idParam } = await context.params;
  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  let removed;
  try {
    removed = await prisma.$transaction((tx) => deleteLandedCostInTx(tx, id));
  } catch (e) {
    return handlePostingError(e);
  }

  if (!removed) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.landedCostNotFound") }, { status: 404 });
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "landed_cost.delete",
    entity: "landed_cost",
    entityId: removed.id,
    details: { number: removed.number, amount: Number(removed.amount) },
    request,
  });

  return NextResponse.json({ ok: true });
}
