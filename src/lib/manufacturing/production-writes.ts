/**
 * Menulis perintah produksi DI DALAM transaksi pemanggil (#495 butir 3).
 *
 * Sikap yang sama dengan `@/lib/document-writes`: tanpa zod, tanpa HTTP, tanpa
 * audit. Validasi milik pemanggil sebelum transaksinya dibuka; audit ditulis
 * sesudah transaksinya sukses, sebab log tidak ikut di-rollback.
 *
 * ══ TIDAK ADA MESIN PERSEDIAAN KEDUA ═══════════════════════════════════════
 * Bahan keluar dan barang jadi masuk lewat `stock_movements` yang sudah ada,
 * dinilai `averageUnitCostForItem` yang sudah ada, dan dijaga
 * `assertStockAvailable` yang sudah ada. Berkas ini tidak menghitung satu pun
 * saldo sendiri.
 *
 * ══ DUA PERISTIWA, BUKAN SATU ══════════════════════════════════════════════
 *   • TERBITKAN — bahan keluar ke WIP. Sesudah ini stok bahannya sudah berkurang.
 *   • SELESAIKAN — upah & overhead diserap, lalu seluruh isi WIP pindah ke
 *     barang jadi.
 *
 * Dipisah karena di dunia nyata keduanya memang berjarak: bahan turun ke lantai
 * produksi hari Senin, barang jadinya ada hari Kamis. Menggabungkannya berarti
 * stok bahan baru berkurang saat produksinya selesai — dan selama tiga hari itu
 * buku menyatakan barang yang sudah tidak ada di gudang.
 */
import type { Prisma } from "@/generated/prisma/client";
import { postForSource } from "@/lib/posting";
import { averageUnitCostForItem, costOfMovement } from "@/lib/posting/cogs";
import { calculateStockTotals } from "@/lib/inventory";
import { assertStockAvailable } from "@/lib/delivery-orders";
import { akumulasiBiaya, hargaPokokKeluaran, ProductionCostError } from "./production-cost";
import { round2, round3 } from "./bom";

type Tx = Prisma.TransactionClient;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Nomor perintah produksi: `PO.YYYY.MM.NNNNN` — pola `nextDeliveryOrderNo`. */
export async function nextProductionOrderNo(tx: Tx, date: Date): Promise<string> {
  const prefix = `PO.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const count = await tx.productionOrder.count({ where: { orderNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/** Perintah produksi yang tidak boleh dijalankan pada keadaannya sekarang. */
export class ProductionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionStateError";
  }
}

/**
 * TERBITKAN: keluarkan bahan ke Barang Dalam Proses.
 *
 * Urutannya sengaja — penjaga stok lebih dulu, lalu gerakan, lalu jurnal:
 * perintah yang membuat stok negatif tidak boleh pernah sempat menulis satu
 * baris pun. Sikap yang sama dengan `assertWithinContract` di faktur.
 */
export async function releaseProductionOrderInTx(
  tx: Tx,
  productionOrderId: number
): Promise<{ issuedValue: number }> {
  const order = await tx.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { components: true },
  });
  if (!order) throw new ProductionStateError("Perintah produksi tidak ditemukan.");
  if (order.status !== "draft") {
    throw new ProductionStateError(
      `Perintah ${order.orderNo} berstatus "${order.status}" — hanya draf yang bisa diterbitkan.`
    );
  }
  if (order.components.length === 0) {
    throw new ProductionStateError(
      `Perintah ${order.orderNo} tidak punya satu pun bahan. Perintah tanpa bahan tidak menghasilkan apa pun untuk dinilai.`
    );
  }

  // ── Penjaga stok, SEBELUM apa pun ditulis ──
  const itemIds = [...new Set(order.components.map((c) => c.itemId))];
  const movements = await tx.stockMovement.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, quantity: true, type: true, date: true },
  });
  const tersedia = new Map<number, number>();
  for (const id of itemIds) {
    tersedia.set(
      id,
      calculateStockTotals(movements.filter((m) => m.itemId === id)).currentStock
    );
  }
  assertStockAvailable(
    order.components.map((c) => ({
      itemId: c.itemId,
      itemName: c.itemName,
      kg: num(c.plannedQuantity),
    })),
    tersedia
  );

  // ── Gerakan keluar + nilainya, disimpan di barisnya ──
  let issuedValue = 0;
  for (const komponen of order.components) {
    const qty = round3(num(komponen.plannedQuantity));
    if (qty <= 0) continue;
    const unitCost = await averageUnitCostForItem(komponen.itemId, order.date, tx);
    const cost = round2(costOfMovement(qty, unitCost));

    await tx.stockMovement.create({
      data: {
        itemId: komponen.itemId,
        quantity: qty,
        type: "out",
        date: order.date,
        /* Menandai gerakan ini milik perintah produksi. `buildStockMovement-
           Entry` MENOLAK mempostingnya sebagai HPP karena kolom ini terisi —
           jurnalnya terbit sekali dari perintahnya, bukan sekali per gerakan. */
        productionOrderId: order.id,
        costCenterId: order.costCenterId,
        note: `Bahan produksi ${order.orderNo} — ${komponen.itemName}`.slice(0, 500),
      },
    });

    await tx.productionOrderComponent.update({
      where: { id: komponen.id },
      /* Nilai DISIMPAN, bukan dihitung ulang saat dibaca: rata-rata tertimbang
         bergerak, dan jurnal yang sudah terbit tidak boleh ikut bergerak. */
      data: { issuedQuantity: qty, issuedCost: cost },
    });
    issuedValue = round2(issuedValue + cost);
  }

  await tx.productionOrder.update({
    where: { id: order.id },
    data: { status: "released" },
  });

  // Jurnal SESUDAH barisnya tersimpan — aturannya membaca `issued_cost`.
  await postForSource({ sourceType: "production_issue", sourceId: order.id, tx });
  return { issuedValue };
}

/**
 * SELESAIKAN: serap upah & overhead, lalu pindahkan seluruh isi WIP ke barang jadi.
 *
 * `producedQuantity` adalah keluaran SUNGGUHAN, dan ia boleh berbeda dari
 * rencana — selisihnya varians hasil, bukan kesalahan yang harus ditolak.
 */
export async function finishProductionOrderInTx(
  tx: Tx,
  productionOrderId: number,
  producedQuantity: number
): Promise<{ unitCost: number; totalCost: number }> {
  const order = await tx.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { components: true, operations: true, outputItem: true },
  });
  if (!order) throw new ProductionStateError("Perintah produksi tidak ditemukan.");
  if (order.status !== "released") {
    throw new ProductionStateError(
      `Perintah ${order.orderNo} berstatus "${order.status}" — hanya yang sudah diterbitkan bisa diselesaikan.`
    );
  }

  const biaya = akumulasiBiaya(
    order.components.map((c) => ({
      itemId: c.itemId,
      itemName: c.itemName,
      issuedQuantity: num(c.issuedQuantity),
      issuedCost: num(c.issuedCost),
    })),
    order.operations.map((op) => ({
      sequence: op.sequence,
      name: op.name,
      standardHours: num(op.standardHours),
      actualHours: op.actualHours == null ? null : num(op.actualHours),
      laborRate: num(op.laborRate),
      overheadRate: num(op.overheadRate),
    }))
  );

  // Melempar bila keluarannya nol — bahan yang habis tanpa hasil adalah susut
  // proses (#490), bukan produksi. Lihat `hargaPokokKeluaran`.
  const unitCost = hargaPokokKeluaran(biaya.total, producedQuantity);

  await tx.productionOrder.update({
    where: { id: order.id },
    data: { status: "finished", producedQuantity: round3(producedQuantity) },
  });

  /* Penyerapan LEBIH DULU: ia menambah isi WIP, dan penerimaan di bawah
     memindahkan SELURUH isinya. Dibalik urutannya, upah & overhead akan
     tertinggal di WIP sebagai saldo yang tak pernah terjelaskan. */
  await postForSource({ sourceType: "production_absorption", sourceId: order.id, tx });

  await tx.stockMovement.create({
    data: {
      itemId: order.outputItemId,
      quantity: round3(producedQuantity),
      type: "in",
      date: order.date,
      unitCost,
      productionOrderId: order.id,
      costCenterId: order.costCenterId,
      note: `Barang jadi ${order.orderNo} — ${order.outputItem.name}`.slice(0, 500),
    },
  });

  await postForSource({ sourceType: "production_receipt", sourceId: order.id, tx });
  return { unitCost, totalCost: biaya.total };
}

export { ProductionCostError };
