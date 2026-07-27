/**
 * Wizard "Pembelian Baru" — satu panggilan, satu transaksi (issue #5).
 *
 * Sisi pemasok dari wizard penjualan, dengan alasan yang sama persis: seluruh
 * isi wizard ditulis dalam SATU `prisma.$transaction` supaya membatalkan di
 * langkah mana pun tidak meninggalkan pemasok yatim atau stok yang bertambah
 * tanpa utangnya tercatat. Lihat catatan panjang di `../sales/route.ts`.
 *
 * ── TIDAK ADA AKUNTANSI BARU ────────────────────────────────────────────────
 * App ini mencatat pembelian sebagai satu baris `supplier_transactions`
 * bertipe `purchase` (D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha) —
 * itulah satu-satunya cara pembelian dicatat, lewat formulir di halaman
 * pemasok. Wizard memakai jalur yang sama (`createSupplierTransactionInTx`),
 * bukan jalur baru.
 *
 * Barang masuk gudang (langkah 3) ditulis sebagai pergerakan stok `in`, yang
 * memang TIDAK menghasilkan jurnal apa pun: persediaannya sudah didebet oleh
 * jurnal pembelian di atas (lihat `buildStockMovementEntry`). Jadi tidak ada
 * pendebetan ganda; yang ditambahkan pergerakan itu hanyalah kuantitas dan
 * harga pokok per unit — satu-satunya masukan HPP rata-rata saat barang keluar.
 *
 * `stock_movements.unit_cost` selalu IDR, jadi harga beli valas sudah dikalikan kursnya
 * oleh `buildPurchasePayload` di sisi peramban dan diperiksa ulang di sini
 * lewat `wizardReceiptSchema`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { supplierTransactionSchema } from "@/lib/validations/finance";
import {
  purchaseWizardSchema,
  supplierDataFromPartner,
  wizardReceiptSchema,
} from "@/lib/validations/wizard";
import {
  createStockInMovementsInTx,
  createSupplierTransactionInTx,
  loadItemNames,
} from "@/lib/document-writes";

/**
 * Galat yang menyebut LANGKAH mana yang harus dibuka kembali di wizard.
 *
 * Pesannya sebuah KUNCI kamus (fase B), diterjemahkan di sini — batas tampilan
 * yang tahu bahasa pengguna. `{ text }` adalah pintu untuk prosa yang datang
 * dari modul lain (mis. `OverInvoiceError.message`), yang belum disapu.
 * `details` melewati `translateFieldErrors` persis seperti route biasa.
 */
async function stepError(
  step: "pemasok" | "barang" | "penerimaan" | "pembelian",
  message: DictionaryKey | { text: string },
  error?: Parameters<typeof translateFieldErrors>[0],
  status = 400
) {
  const { dictionary, t } = await getRequestI18n();
  return NextResponse.json(
    {
      error: typeof message === "string" ? t(message) : message.text,
      step,
      details: error ? translateFieldErrors(error, dictionary) : undefined,
      saved: false,
    },
    { status }
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("purchase.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const envelope = purchaseWizardSchema.safeParse(body);
  if (!envelope.success) {
    return stepError("pemasok", "errors.wizardIncomplete", envelope.error);
  }
  const { supplier } = envelope.data;

  // ── Pemasok: dipilih dari daftar, atau data baru lewat `supplierSchema` ────
  let existingSupplierName: string | null = null;
  if (supplier.mode === "existing") {
    const row = await prisma.supplier.findUnique({
      where: { id: supplier.id as number },
      select: { name: true },
    });
    if (!row) return stepError("pemasok", "errors.supplierNotFound");
    existingSupplierName = row.name;
  }
  const newSupplier = supplier.mode === "new" ? supplierDataFromPartner(supplier) : null;
  if (newSupplier && !newSupplier.success) {
    return stepError("pemasok", "errors.wizardSupplierInvalid", newSupplier.error);
  }
  const supplierName = existingSupplierName ?? newSupplier?.data?.name ?? "";

  // ── Pembelian: skema yang SAMA dengan `POST /api/suppliers/[id]/transactions`.
  // `supplierId` sementara diisi 1 hanya agar skema (yang mewajibkan sebuah id
  // positif) bisa dijalankan sebelum pemasok barunya ada; nilai sebenarnya
  // dipasang di dalam transaksi. Alokasi tidak berlaku — ini pembelian, bukan
  // pembayaran, dan skemanya sendiri yang menolak alokasi pada pembelian.
  const purchaseParsed = supplierTransactionSchema.safeParse({
    ...(envelope.data.purchase as Record<string, unknown>),
    supplierId: supplier.mode === "existing" ? supplier.id : 1,
    type: "purchase",
    allocations: undefined,
  });
  if (!purchaseParsed.success) {
    return stepError("pembelian", "errors.wizardPurchaseInvalid", purchaseParsed.error);
  }

  // ── Barang masuk (opsional) ────────────────────────────────────────────────
  const receiptRaw = envelope.data.receipt;
  let receipt: { date: string; items: { itemId: number; quantity: number; unitCost: number }[] } | null =
    null;
  if (receiptRaw != null) {
    const parsed = wizardReceiptSchema.safeParse(receiptRaw);
    if (!parsed.success) {
      return stepError("penerimaan", "errors.wizardReceiptInvalid", parsed.error);
    }
    const nameById = await loadItemNames(
      prisma,
      parsed.data.items.map((i) => i.itemId)
    );
    if (!nameById) {
      return stepError("penerimaan", "errors.stockItemNotFound");
    }
    receipt = {
      date: parsed.data.date,
      items: parsed.data.items.map((i) => ({
        itemId: i.itemId,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
    };
  }

  // ── SATU transaksi untuk seluruh wizard ────────────────────────────────────
  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const supplierId =
        newSupplier && newSupplier.success
          ? (await tx.supplier.create({ data: newSupplier.data })).id
          : (supplier.id as number);

      const { transaction } = await createSupplierTransactionInTx(
        tx,
        { ...purchaseParsed.data, supplierId },
        {
          requestedById: parseInt(result.session.user.id, 10),
          supplierName,
        }
      );

      const movements = receipt
        ? await createStockInMovementsInTx(
            tx,
            new Date(receipt.date),
            receipt.items.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              note: `Pembelian ${supplierName} — TRX-${transaction.id}`.slice(0, 500),
            }))
          )
        : [];

      return {
        supplierId,
        supplierCreated: newSupplier != null,
        transaction,
        movements,
      };
    });
  } catch (e) {
    return handlePostingError(e);
  }

  // ── Jejak audit: entri yang SAMA dengan route biasa, plus satu penanda ─────
  const username = result.session.user.email;
  const userId = result.session.user.id;

  await writeAuditLog({
    userId,
    username,
    action: "supplier_transaction.purchase",
    entity: "supplier_transaction",
    entityId: outcome.transaction.id,
    details: {
      supplierId: outcome.supplierId,
      supplierName,
      type: "purchase",
      amount: Number(outcome.transaction.amount),
      taxAmount: Number(outcome.transaction.taxAmount),
      currency: outcome.transaction.currency,
      allocations: [],
      viaWizard: true,
    },
    request,
  });

  for (const movement of outcome.movements) {
    await writeAuditLog({
      userId,
      username,
      action: "stock.in",
      entity: "stock",
      entityId: movement.id,
      details: { itemId: movement.itemId, quantity: movement.quantity, type: "in", viaWizard: true },
      request,
    });
  }

  await writeAuditLog({
    userId,
    username,
    action: "wizard.purchase",
    entity: "supplier_transaction",
    entityId: outcome.transaction.id,
    details: {
      supplierId: outcome.supplierId,
      supplierCreated: outcome.supplierCreated,
      movementCount: outcome.movements.length,
    },
    request,
  });

  return NextResponse.json(
    {
      supplierId: outcome.supplierId,
      supplierName,
      purchase: {
        id: outcome.transaction.id,
        amount: Number(outcome.transaction.amount),
        currency: outcome.transaction.currency,
      },
      receiptCount: outcome.movements.length,
    },
    { status: 201 }
  );
}
