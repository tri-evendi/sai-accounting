/**
 * Laporan varians produksi — pembaca basis datanya (#495 butir 3, tahap 3).
 *
 * Aritmetikanya hidup di `./variance` dan MURNI; berkas ini hanya menjemput
 * barisnya. Pemisahan yang sama dengan `document-chain` ↔
 * `contractOutstandingForInvoice`.
 *
 * ══ DUA VARIANS, DUA SUMBER YANG BERBEDA ═══════════════════════════════════
 *
 *   1. **Varians per perintah** — rencana lawan kenyataan pada satu batch.
 *      Sumbernya `production_orders` beserta barisnya. Ia INFORMASI: buku ini
 *      memakai biaya sesungguhnya, jadi tidak ada selisih yang tertinggal di
 *      WIP untuk dijurnal.
 *
 *   2. **Varians PENYERAPAN** — satu-satunya yang benar-benar ADA di buku
 *      besar. Membayar upah/overhead mendebet 5103/5104; produksi yang
 *      menyerapnya mengkredit akun yang sama. Sisa saldonya karena itu persis
 *      selisih penyerapan, dan ia dibaca dari jurnal — bukan dihitung ulang.
 *
 * Yang kedua tidak bisa dipalsukan tanpa ketahuan: ia berdamai dengan Laba Rugi
 * menurut konstruksi, sebab ia MEMANG baris Laba Rugi itu.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import { akumulasiBiaya, hargaPokokKeluaran } from "./production-cost";
import { ringkasanVarians, type RingkasanVarians } from "./variance";
import { round2 } from "./bom";

type Client = Prisma.TransactionClient | PrismaClient;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export interface LaporanVariansPerintah {
  orderNo: string;
  outputItemName: string;
  status: string;
  /** Harga pokok sesungguhnya per unit; 0 bila perintah belum selesai. */
  hargaPokokPerUnit: number;
  varians: RingkasanVarians;
}

/**
 * Varians satu perintah produksi.
 *
 * Harga pokok per unit hanya bisa dihitung ketika keluarannya sudah diketahui;
 * selama belum, ia 0 dan varians HASIL memang null. Memaksakan angka di situ
 * berarti menilai barang yang belum ada.
 */
export async function variansPerintahProduksi(
  client: Client,
  productionOrderId: number
): Promise<LaporanVariansPerintah | null> {
  const order = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { components: true, operations: true, outputItem: true },
  });
  if (!order) return null;

  const komponen = order.components.map((c) => ({
    itemId: c.itemId,
    itemName: c.itemName,
    plannedQuantity: num(c.plannedQuantity),
    issuedQuantity: c.issuedQuantity == null ? null : num(c.issuedQuantity),
    issuedCost: c.issuedCost == null ? null : num(c.issuedCost),
  }));
  const operasi = order.operations.map((op) => ({
    sequence: op.sequence,
    name: op.name,
    standardHours: num(op.standardHours),
    actualHours: op.actualHours == null ? null : num(op.actualHours),
    laborRate: num(op.laborRate),
    overheadRate: num(op.overheadRate),
  }));

  const produced = order.producedQuantity == null ? null : num(order.producedQuantity);
  const biaya = akumulasiBiaya(
    komponen.map((k) => ({
      itemId: k.itemId,
      itemName: k.itemName,
      issuedQuantity: k.issuedQuantity ?? 0,
      issuedCost: k.issuedCost ?? 0,
    })),
    operasi
  );
  const hargaPokokPerUnit =
    produced != null && produced > 0 ? hargaPokokKeluaran(biaya.total, produced) : 0;

  return {
    orderNo: order.orderNo,
    outputItemName: order.outputItem.name,
    status: order.status,
    hargaPokokPerUnit,
    varians: ringkasanVarians(
      komponen,
      operasi,
      num(order.plannedQuantity),
      produced,
      hargaPokokPerUnit
    ),
  };
}

export interface VariansPenyerapan {
  /** Yang benar-benar dikeluarkan perusahaan (debit ke akun bebannya). */
  dibebankan: number;
  /** Yang diserap produksi ke dalam WIP (kredit ke akun yang sama). */
  diserap: number;
  /**
   * dibebankan − diserap.
   *
   * Positif = KURANG diserap: biaya nyata melebihi yang menempel di barang, dan
   * selisihnya tinggal sebagai beban periode. Negatif = LEBIH diserap.
   */
  selisih: number;
}

/**
 * Varians penyerapan upah & overhead, dibaca dari BUKU BESAR.
 *
 * Bukan dihitung ulang dari perintah produksi: kalau ia dihitung ulang, ia bisa
 * berbeda dari Laba Rugi tanpa satu pun penjaga menyadarinya. Dibaca dari
 * jurnal, ia berdamai menurut konstruksi.
 */
export async function variansPenyerapan(
  client: Client,
  from: Date,
  to: Date
): Promise<{ upah: VariansPenyerapan; overhead: VariansPenyerapan }> {
  const [labor, overhead] = await Promise.all([
    resolveAccountId(MAPPING_KEYS.DIRECT_LABOR, "IDR", client),
    resolveAccountId(MAPPING_KEYS.FACTORY_OVERHEAD, "IDR", client),
  ]);

  const rows = await client.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: [labor, overhead] },
      journal: { date: { gte: from, lte: to } },
    },
    _sum: { debit: true, credit: true },
  });

  const bagi = (accountId: number): VariansPenyerapan => {
    const row = rows.find((r) => r.accountId === accountId);
    const dibebankan = round2(num(row?._sum.debit));
    const diserap = round2(num(row?._sum.credit));
    return { dibebankan, diserap, selisih: round2(dibebankan - diserap) };
  };

  return { upah: bagi(labor), overhead: bagi(overhead) };
}
