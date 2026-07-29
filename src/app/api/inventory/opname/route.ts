import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals } from "@/lib/inventory";
import { OPNAME_ADJUSTMENT_NOTE } from "@/lib/constants";
import { weightedAverageUnitCost } from "@/lib/posting/cogs";
import { opnameSchema } from "@/lib/validations/inventory";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * Stok opname (issue #57) — penyesuaian hitung-fisik.
 *
 * Untuk tiap barang: selisih = fisik − sistem. Yang berselisih ditulis sebagai
 * gerakan penyesuaian (`in` bila lebih, `out` bila susut) lalu diposting lewat
 * sumber `stock_adjustment` → jurnal ke akun Selisih Persediaan (BUKAN HPP;
 * susut opname bukan barang terjual). Nilai selisih memakai biaya rata-rata
 * tertimbang yang SAMA dengan mesin HPP, jadi nilai neraca konsisten.
 *
 * Semuanya dalam SATU transaksi: bila satu posting gagal (mis. periode tutup,
 * mapping Selisih Persediaan belum diatur), tidak ada penyesuaian yang
 * setengah tertulis.
 */
export async function POST(request: Request) {
  const result = await requireApiPermission("inventory.write"); // semua peran boleh menyesuaikan stok
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = opnameSchema.safeParse(body);
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

  const { date, counts } = parsed.data;
  const when = new Date(date);

  type Adjustment = {
    stockId: number;
    itemId: number;
    itemName: string;
    type: "in" | "out";
    quantity: number;
  };

  let adjustments: Adjustment[] = [];
  try {
    adjustments = await prisma.$transaction(async (tx) => {
      const done: Adjustment[] = [];
      for (const count of counts) {
        const item = await tx.item.findUnique({
          where: { id: count.itemId },
          include: { stockMovements: true },
        });
        if (!item) continue; // barang terhapus di tengah — lewati diam-diam

        const { currentStock } = calculateStockTotals(item.stockMovements);
        const variance = count.physicalQty - currentStock;
        if (variance === 0) continue; // cocok — tak perlu penyesuaian

        const type = variance > 0 ? "in" : "out";
        const quantity = Math.abs(variance);
        // Lebih (in) dinilai pada rata-rata pra-penyesuaian agar rata-rata tak
        // bergeser; susut (out) dinilai oleh engine dari rata-rata baris `in`.
        const avgCost = weightedAverageUnitCost(item.stockMovements);

        const created = await tx.stockMovement.create({
          data: {
            itemId: item.id,
            quantity,
            type,
            date: when,
            unitCost: type === "in" && avgCost > 0 ? avgCost : null,
            // Penanda yang membuat gerakan ini bisa ditemukan lagi sebagai
            // opname (issue #129) — dibaca `getOpnameHistory`.
            note: OPNAME_ADJUSTMENT_NOTE,
          },
          include: { item: { select: { name: true } } },
        });

        await postForSource({ sourceType: "stock_adjustment", sourceId: created.id, tx });

        done.push({
          stockId: created.id,
          itemId: item.id,
          itemName: created.item.name,
          type,
          quantity,
        });
      }
      return done;
    });
  } catch (e) {
    return handlePostingError(e);
  }

  for (const adj of adjustments) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: adj.type === "in" ? "stock.in" : "stock.out",
      entity: "stock",
      entityId: adj.stockId,
      details: {
        itemId: adj.itemId,
        itemName: adj.itemName,
        quantity: adj.quantity,
        type: adj.type,
        opname: true,
      },
      request,
    });
  }

  return NextResponse.json(
    { adjustedCount: adjustments.length, adjustments },
    { status: 201 }
  );
}
