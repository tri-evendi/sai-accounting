/**
 * Penulisan dokumen DI DALAM satu transaksi — dipakai bersama oleh route biasa
 * dan oleh wizard terpandu (issue #5).
 *
 * ── KENAPA MODUL INI ADA ────────────────────────────────────────────────────
 * Wizard "Penjualan Baru" menulis surat jalan DAN faktur sekaligus, dan wizard
 * "Pembelian Baru" menulis pemasok, barang masuk, dan pembelian sekaligus. Semua
 * itu harus terjadi dalam SATU `prisma.$transaction` supaya membatalkan di
 * tengah jalan tidak meninggalkan dokumen setengah jadi.
 *
 * Yang TIDAK boleh terjadi: wizard punya salinan kedua dari aturan yang sudah
 * dijalankan route biasa, lalu keduanya berbeda seiring waktu. Karena itu inti
 * penulisan setiap dokumen dipindahkan ke sini dan route lamanya memanggil
 * fungsi yang sama. Satu-satunya perbedaan antara wizard dan route biasa adalah
 * SIAPA yang membuka transaksinya, bukan aturan apa yang berlaku.
 *
 * ── APA YANG TETAP DIJAGA (tidak satu pun dilonggarkan) ─────────────────────
 *  • `assertWithinContract` — faktur tidak boleh melebihi sisa kontrak (#15);
 *  • `assertStockAvailable` — surat jalan tidak boleh membuat stok negatif (#14);
 *  • `ensureApprovalRequest` — ambang persetujuan, dibuat SEBELUM posting (#25);
 *  • `postForSource` — satu-satunya mesin jurnal; tidak ada jurnal tulis tangan;
 *  • kunci periode (`assertPeriodOpen`, di dalam mesin jurnal itu) — #13.
 *
 * ── APA YANG TIDAK ADA DI SINI ──────────────────────────────────────────────
 * Zod, HTTP, dan audit log. Validasi dilakukan pemanggil dengan skema yang sudah
 * ada (`invoiceSchema`, `deliveryOrderSchema`, …) sebelum transaksi dibuka;
 * audit ditulis pemanggil SETELAH transaksi sukses, karena log berkas tidak ikut
 * di-rollback. Tidak ada aturan akuntansi baru satu pun di file ini.
 */
import type { Prisma } from "@/generated/prisma/client";
import { invoiceSubtotal, type InvoiceInput } from "@/lib/validations/invoice";
import type { DeliveryOrderInput } from "@/lib/validations/delivery-order";
import type { SupplierTransactionInput } from "@/lib/validations/finance";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { postForSource } from "@/lib/posting";
import { ensureApprovalRequest, type ApprovalRequestRow } from "@/lib/approval-requests";
import { assertWithinContract, contractOutstandingForInvoice } from "@/lib/document-chain";
import {
  assertStockAvailable,
  lineStockKg,
  nextDeliveryOrderNo,
  sumRequestedKgByItem,
} from "@/lib/delivery-orders";

/** Klien transaksi Prisma — modul ini tidak pernah membuka transaksinya sendiri. */
type Tx = Prisma.TransactionClient;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ─────────────────────────── Master barang ───────────────────────────

/**
 * Nama kanonik setiap barang yang dirujuk, atau `null` bila ada yang tidak
 * terdaftar di master stok. Dipakai baik oleh route surat jalan maupun wizard
 * supaya pesan "barang tidak ditemukan" berbunyi sama di keduanya.
 */
export async function loadItemNames(
  client: Pick<Tx, "item">,
  itemIds: number[]
): Promise<Map<number, string> | null> {
  const unique = [...new Set(itemIds)];
  const masters = await client.item.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  if (masters.length !== unique.length) return null;
  return new Map(masters.map((m) => [m.id, m.name]));
}

// ─────────────────────────── Faktur ───────────────────────────

export interface CreateInvoiceResult {
  invoice: Prisma.InvoiceGetPayload<{ include: { items: true } }>;
  approval: ApprovalRequestRow | null;
  /** Nilai bruto dokumen (DPP + PPN) dalam mata uangnya sendiri. */
  total: number;
}

/**
 * Buat faktur + jurnalnya di dalam transaksi pemanggil.
 *
 * Urutannya sengaja: penjaga sisa kontrak lebih dulu (supaya faktur yang
 * melebihi kontrak tidak pernah sempat tertulis), lalu dokumen, lalu pengajuan
 * persetujuan, baru posting — sehingga gerbang #25 sudah terlihat oleh
 * `postForSource` dan jurnalnya ditahan bila memang perlu disetujui.
 */
export async function createInvoiceInTx(
  tx: Tx,
  input: InvoiceInput,
  opts: { requestedById: number }
): Promise<CreateInvoiceResult> {
  const {
    items,
    date,
    dueDate,
    pebDate,
    rate,
    currency,
    taxable,
    taxRate,
    taxAmount,
    contractId,
    ...invoiceData
  } = input;

  // Server tetap otoritatif atas PPN: dihitung ulang dari tarifnya, jadi angka
  // basi dari peramban tidak pernah sampai ke buku besar.
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  // Penjaga sisa kontrak (#15) — di dalam transaksi, jadi angkanya adalah angka
  // yang benar-benar akan tersimpan.
  if (contractId != null) {
    const { lines } = await contractOutstandingForInvoice(tx, contractId);
    assertWithinContract(lines, items);
  }

  const invoice = await tx.invoice.create({
    data: {
      ...invoiceData,
      contractId: contractId ?? null,
      currency,
      taxable: tax.taxable,
      taxRate: tax.taxRate,
      dpp: tax.dpp,
      taxAmount: tax.taxAmount,
      rate: fxRate,
      baseAmount,
      date: new Date(date),
      dueDate: toDateOrNull(dueDate),
      pebDate: toDateOrNull(pebDate),
      items: { create: items },
    },
    include: { items: true },
  });

  const approval = await ensureApprovalRequest({
    client: tx,
    sourceType: "invoice",
    documentId: invoice.id,
    documentNo: invoice.invoiceNo,
    amount: tax.total,
    currency,
    rate: fxRate,
    baseAmount,
    requestedById: opts.requestedById,
  });

  await postForSource({ sourceType: "invoice", sourceId: invoice.id, tx });

  return { invoice, approval, total: tax.total };
}

// ─────────────────────────── Surat jalan ───────────────────────────

export type CreatedDeliveryOrder = Prisma.DeliveryOrderGetPayload<{ include: { items: true } }>;

/**
 * Terbitkan surat jalan + kurangi stok + posting HPP, di dalam transaksi
 * pemanggil.
 *
 * HPP tidak dihitung di sini: setiap baris menghasilkan satu pergerakan stok
 * `out` yang diposting lewat mesin yang sudah ada (`stock_movement`) — jalur yang
 * sama persis dengan pengeluaran stok manual. Tidak ada aturan HPP kedua.
 */
export async function createDeliveryOrderInTx(
  tx: Tx,
  input: DeliveryOrderInput,
  opts: { nameById: Map<number, string> }
): Promise<CreatedDeliveryOrder> {
  const { date, contractId, invoiceId, consigneeId, vehicleNo, containerNo, notes, items } = input;
  const itemIds = [...new Set(items.map((i) => i.itemId))];
  const doDate = new Date(date);

  // Penjaga stok, di dalam transaksi supaya membaca stok yang konsisten dan ikut
  // ter-rollback bila menyala.
  const stockRows = await tx.stock.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, quantity: true, type: true },
  });
  const availableByItem = new Map<number, number>();
  for (const s of stockRows) {
    const signed = (s.type === "in" ? 1 : -1) * num(s.quantity);
    availableByItem.set(s.itemId, num(availableByItem.get(s.itemId)) + signed);
  }
  const requestedByItem = sumRequestedKgByItem(items);
  assertStockAvailable(
    itemIds.map((id) => ({
      itemId: id,
      itemName: opts.nameById.get(id) ?? String(id),
      kg: num(requestedByItem.get(id)),
    })),
    availableByItem
  );

  const no = await nextDeliveryOrderNo(tx, doDate);
  const order = await tx.deliveryOrder.create({
    data: {
      no,
      date: doDate,
      contractId: contractId ?? null,
      invoiceId: invoiceId ?? null,
      consigneeId: consigneeId ?? null,
      vehicleNo: vehicleNo || null,
      containerNo: containerNo || null,
      notes: notes || null,
      status: "issued",
      items: {
        create: items.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          bags: i.bags,
          kgPerBag: i.kgPerBag,
          quantity: lineStockKg(i),
        })),
      },
    },
    include: { items: true },
  });

  for (const line of order.items) {
    const movement = await tx.stock.create({
      data: {
        itemId: line.itemId,
        quantity: line.quantity,
        type: "out",
        date: doDate,
        unitCost: null,
        note: `Surat jalan ${no} — ${line.itemName}`,
      },
    });
    await postForSource({ sourceType: "stock_movement", sourceId: movement.id, tx });
  }

  return order;
}

// ─────────────────────────── Barang masuk ───────────────────────────

export interface StockInLine {
  itemId: number;
  /** Kuantitas dalam satuan stok (kg). */
  quantity: number;
  /** Harga pokok per unit dalam IDR — satu-satunya masukan HPP rata-rata. */
  unitCost: number;
  note?: string | null;
}

/**
 * Catat barang masuk gudang di dalam transaksi pemanggil.
 *
 * Pergerakan `in` TIDAK menghasilkan jurnal — persediaan sudah didebet oleh
 * jurnal pembeliannya (lihat `buildStockMovementEntry`). `postForSource` tetap
 * dipanggil supaya jalurnya identik dengan `/api/inventory`; mesinnya sendiri
 * yang memutuskan untuk tidak memposting apa pun.
 */
export async function createStockInMovementsInTx(
  tx: Tx,
  date: Date,
  lines: StockInLine[]
): Promise<{ id: number; itemId: number; quantity: number }[]> {
  const created: { id: number; itemId: number; quantity: number }[] = [];
  for (const line of lines) {
    const movement = await tx.stock.create({
      data: {
        itemId: line.itemId,
        quantity: line.quantity,
        type: "in",
        date,
        unitCost: line.unitCost,
        note: line.note || null,
      },
    });
    await postForSource({ sourceType: "stock_movement", sourceId: movement.id, tx });
    created.push({ id: movement.id, itemId: movement.itemId, quantity: num(movement.quantity) });
  }
  return created;
}

// ─────────────────── Transaksi pemasok (pembelian / pembayaran) ───────────────────

/** Satu baris alokasi yang sudah diperiksa `resolveAllocationLines`. */
export interface ResolvedAllocationLine {
  purchaseId: number;
  amount: number;
  base: number;
}

export interface CreateSupplierTransactionResult {
  transaction: Prisma.SupplierTransactionGetPayload<object>;
  approval: ApprovalRequestRow | null;
}

/**
 * Catat pembelian atau pembayaran pemasok + jurnalnya, di dalam transaksi
 * pemanggil.
 *
 * Hanya PEMBAYARAN yang lewat ambang persetujuan: pembelian adalah utang yang
 * dicatat, bukan uang yang keluar (lihat catatan panjang di route aslinya).
 */
export async function createSupplierTransactionInTx(
  tx: Tx,
  input: Omit<SupplierTransactionInput, "allocations">,
  opts: {
    requestedById: number;
    supplierName: string;
    allocationLines?: ResolvedAllocationLine[];
  }
): Promise<CreateSupplierTransactionResult> {
  const { date, dueDate, rate: rateInput, ...transactionData } = input;
  // base_amount menutup seluruh kewajiban: nilai bersih ditambah PPN Masukan.
  const { rate, baseAmount } = fxAmounts(
    transactionData.currency,
    transactionData.amount + transactionData.taxAmount,
    rateInput
  );

  const transaction = await tx.supplierTransaction.create({
    data: {
      ...transactionData,
      date: new Date(date),
      // Hanya pembelian yang bisa jatuh tempo; pembayaran tidak.
      dueDate: transactionData.type === "purchase" ? toDateOrNull(dueDate) : null,
      rate,
      baseAmount,
    },
  });

  const allocationLines = opts.allocationLines ?? [];
  if (allocationLines.length > 0) {
    await tx.supplierPaymentAllocation.createMany({
      data: allocationLines.map((line) => ({
        paymentId: transaction.id,
        purchaseId: line.purchaseId,
        amount: line.amount,
        currency: transactionData.currency,
        rate,
        baseAmount: line.base,
      })),
    });
  }

  const approval =
    transaction.type === "payment"
      ? await ensureApprovalRequest({
          client: tx,
          sourceType: "supplier_transaction",
          documentId: transaction.id,
          documentNo: opts.supplierName.slice(0, 50),
          amount: Number(transaction.amount),
          currency: transaction.currency,
          rate,
          baseAmount,
          requestedById: opts.requestedById,
        })
      : null;

  await postForSource({ sourceType: "supplier_transaction", sourceId: transaction.id, tx });

  return { transaction, approval };
}
