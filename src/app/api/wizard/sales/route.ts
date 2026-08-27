/**
 * Wizard "Penjualan Baru" — satu panggilan, satu transaksi (issue #5).
 *
 * ── KENAPA SATU ENDPOINT, BUKAN BEBERAPA PANGGILAN BERURUTAN ────────────────
 * Kriteria penerimaan issue #5 berbunyi: "bisa dibatalkan tanpa menyisakan data
 * setengah jadi". Memanggil `/api/customers`, lalu `/api/delivery-orders`, lalu
 * `/api/invoices` satu per satu TIDAK bisa memenuhi itu: setiap panggilan
 * commit sendiri-sendiri, jadi kegagalan pada panggilan ketiga (periode
 * tertutup, stok kurang, pemetaan akun hilang) meninggalkan pelanggan dan surat
 * jalan yang sudah terlanjur tertulis — beserta jurnal HPP-nya. Karena itu
 * seluruh wizard dikirim sekali dan ditulis di dalam SATU `prisma.$transaction`:
 * semua berhasil bersama, atau tidak ada satu baris pun yang tertinggal.
 *
 * Harganya adalah endpoint tambahan, dan risikonya endpoint itu diam-diam jadi
 * jalan pintas yang lebih longgar dari route biasa. Risiko itu ditutup dengan
 * cara yang sama seperti #37/#38 menutupnya: BUKAN dengan salinan kedua,
 * melainkan dengan memanggil fungsi yang sama.
 *   • Zod  → `deliveryOrderSchema` & `invoiceSchema` yang asli, bukan turunan;
 *   • tulis+jurnal → `createDeliveryOrderInTx` / `createInvoiceInTx`, yaitu isi
 *     transaksi `/api/delivery-orders` dan `/api/invoices` sendiri;
 *   • penjaga → `assertStockAvailable`, `assertWithinContract`, kunci periode,
 *     dan gerbang persetujuan ikut terbawa karena berada DI DALAM fungsi itu.
 *
 * ── TIDAK ADA AKUNTANSI BARU ────────────────────────────────────────────────
 * Wizard ini TIDAK membuat kontrak. Kontrak dan faktur sama-sama memposting
 * D: Piutang / K: Pendapatan di app ini, jadi membuat keduanya untuk barang yang
 * sama akan menghitung pendapatan dua kali. Yang ditulis paling banyak:
 * pelanggan baru → surat jalan → faktur. Bila pengguna memilih kontrak yang
 * sudah ada, fakturnya hanya DITAUTKAN ke kontrak itu (dan karenanya dibatasi
 * sisanya) — persis pola "Ambil" #15.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { invoiceSchema } from "@/lib/validations/invoice";
import { deliveryOrderSchema } from "@/lib/validations/delivery-order";
import {
  customerDataFromPartner,
  salesWizardSchema,
} from "@/lib/validations/wizard";
import {
  createDeliveryOrderInTx,
  createInvoiceInTx,
  loadItemNames,
} from "@/lib/document-writes";
import { ContractBuyerMismatchError, OverInvoiceError } from "@/lib/document-chain";
import { OverIssueError } from "@/lib/delivery-orders";
import { approvalNotice } from "@/lib/approval-requests";

/**
 * Galat yang menyebut LANGKAH mana yang harus dibuka kembali di wizard.
 *
 * Pesannya sebuah KUNCI kamus (fase B), diterjemahkan di sini — batas tampilan
 * yang tahu bahasa pengguna. `{ text }` adalah pintu untuk prosa yang datang
 * dari modul lain (mis. `OverInvoiceError.message`), yang belum disapu.
 * `details` melewati `translateFieldErrors` persis seperti route biasa.
 */
async function stepError(
  step: "pelanggan" | "barang" | "pengiriman" | "faktur",
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
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const envelope = salesWizardSchema.safeParse(body);
  if (!envelope.success) {
    return stepError("pelanggan", "errors.wizardIncomplete", envelope.error);
  }
  const { customer, contractId } = envelope.data;

  // ── Validasi setiap dokumen dengan skemanya SENDIRI (bukan turunan) ────────
  const invoiceParsed = invoiceSchema.safeParse({
    ...(envelope.data.invoice as Record<string, unknown>),
    // Ditentukan server: pelanggan baru belum punya id sampai transaksinya jalan,
    // dan tautan kontrak datang dari amplop, bukan dari sub-objek faktur.
    customerId: null,
    contractId,
  });
  if (!invoiceParsed.success) {
    return stepError("faktur", "errors.wizardInvoiceInvalid", invoiceParsed.error);
  }

  const deliveryRaw = envelope.data.delivery;
  let deliveryParsed: ReturnType<typeof deliveryOrderSchema.safeParse> | null = null;
  if (deliveryRaw != null) {
    deliveryParsed = deliveryOrderSchema.safeParse({
      ...(deliveryRaw as Record<string, unknown>),
      contractId,
      invoiceId: null,
    });
    if (!deliveryParsed.success) {
      return stepError("pengiriman", "errors.wizardDeliveryOrderInvalid", deliveryParsed.error);
    }
  }

  // ── Pemeriksaan ramah atas dokumen/master yang dirujuk ─────────────────────
  // Dilakukan SEBELUM transaksi supaya pelanggaran FK tidak muncul sebagai 500.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    return stepError("barang", "errors.sourceContractNotFound");
  }

  let existingCustomerName: string | null = null;
  if (customer.mode === "existing") {
    const row = await prisma.customer.findUnique({
      where: { id: customer.id as number },
      select: { name: true },
    });
    if (!row) return stepError("pelanggan", "errors.customerNotFound");
    existingCustomerName = row.name;
  }

  const newCustomer = customer.mode === "new" ? customerDataFromPartner(customer) : null;
  if (newCustomer && !newCustomer.success) {
    return stepError("pelanggan", "errors.wizardCustomerInvalid", newCustomer.error);
  }

  let nameById: Map<number, string> | null = null;
  if (deliveryParsed?.success) {
    nameById = await loadItemNames(
      prisma,
      deliveryParsed.data.items.map((i) => i.itemId)
    );
    if (!nameById) {
      return stepError("pengiriman", "errors.stockItemNotFound");
    }
    const consigneeId = deliveryParsed.data.consigneeId;
    if (
      consigneeId != null &&
      !(await prisma.consignee.findUnique({ where: { id: consigneeId } }))
    ) {
      return stepError("pengiriman", "errors.consigneeNotFound");
    }
  }

  const deliveryInput = deliveryParsed?.success ? deliveryParsed.data : null;

  // ── SATU transaksi untuk seluruh wizard ────────────────────────────────────
  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      // Pelanggan baru ikut di dalam transaksi: membatalkan karena faktur gagal
      // tidak boleh meninggalkan pelanggan yatim di master data.
      const customerId =
        newCustomer && newCustomer.success
          ? (await tx.customer.create({ data: newCustomer.data })).id
          : (customer.id as number);

      const deliveryOrder =
        deliveryInput && nameById
          ? await createDeliveryOrderInTx(tx, deliveryInput, { nameById })
          : null;

      const { invoice, approval } = await createInvoiceInTx(
        tx,
        { ...invoiceParsed.data, customerId, contractId },
        { requestedById: parseInt(result.session.user.id, 10) }
      );

      // Tautan surat jalan → faktur (rantai dokumen #15/#16). Dilakukan setelah
      // fakturnya ada; masih di dalam transaksi yang sama, jadi rantainya tidak
      // pernah terlihat separuh tersambung.
      if (deliveryOrder) {
        await tx.deliveryOrder.update({
          where: { id: deliveryOrder.id },
          data: { invoiceId: invoice.id },
        });
      }

      return {
        customerId,
        customerCreated: newCustomer != null,
        deliveryOrder,
        invoice,
        approval,
      };
    });
  } catch (e) {
    if (e instanceof OverInvoiceError) {
      return stepError("faktur", { text: e.message });
    }
    /* Ketidakcocokan pihak dikembalikan ke langkah PELANGGAN, bukan "faktur":
       di situlah pemilihnya berada, dan wisaya melompat ke langkah yang
       disebut `step`. Menyebut "faktur" akan membuang pengguna ke layar yang
       tidak memuat satu pun isian yang bisa memperbaikinya. */
    if (e instanceof ContractBuyerMismatchError) {
      return stepError("pelanggan", { text: e.message });
    }
    if (e instanceof OverIssueError) {
      return stepError("pengiriman", { text: e.message });
    }
    return handlePostingError(e);
  }

  // ── Jejak audit: entri yang SAMA dengan route biasa, plus satu penanda ─────
  const username = result.session.user.email;
  const userId = result.session.user.id;

  if (outcome.deliveryOrder) {
    await writeAuditLog({
      userId,
      username,
      action: "delivery_order.create",
      entity: "delivery_order",
      entityId: outcome.deliveryOrder.id,
      details: {
        no: outcome.deliveryOrder.no,
        itemCount: outcome.deliveryOrder.items.length,
        totalKg: outcome.deliveryOrder.items.reduce((s, i) => s + Number(i.quantity), 0),
        viaWizard: true,
      },
      request,
    });
  }

  if (contractId != null) {
    await writeAuditLog({
      userId,
      username,
      action: "invoice.pull_from_contract",
      entity: "invoice",
      entityId: outcome.invoice.id,
      details: {
        invoiceNo: outcome.invoice.invoiceNo,
        contractId,
        itemCount: outcome.invoice.items.length,
        totalQuantity: outcome.invoice.items.reduce((s, i) => s + Number(i.quantity), 0),
        viaWizard: true,
      },
      request,
    });
  }

  if (outcome.approval) {
    await writeAuditLog({
      userId,
      username,
      action: "approval.request",
      entity: "approval_request",
      entityId: outcome.approval.id,
      details: {
        sourceType: "invoice",
        documentId: outcome.invoice.id,
        documentNo: outcome.invoice.invoiceNo,
        baseAmount: Number(outcome.approval.baseAmount),
        thresholdAmount: Number(outcome.approval.thresholdAmount),
        approverRole: outcome.approval.approverRole,
      },
      request,
    });
  }

  await writeAuditLog({
    userId,
    username,
    action: "wizard.sales",
    entity: "invoice",
    entityId: outcome.invoice.id,
    details: {
      invoiceNo: outcome.invoice.invoiceNo,
      customerId: outcome.customerId,
      customerCreated: outcome.customerCreated,
      contractId,
      deliveryOrderNo: outcome.deliveryOrder?.no ?? null,
    },
    request,
  });

  return NextResponse.json(
    {
      customerId: outcome.customerId,
      customerName: existingCustomerName ?? newCustomer?.data?.name ?? null,
      deliveryOrder: outcome.deliveryOrder
        ? { id: outcome.deliveryOrder.id, no: outcome.deliveryOrder.no }
        : null,
      invoice: { id: outcome.invoice.id, invoiceNo: outcome.invoice.invoiceNo },
      approval: approvalNotice(outcome.approval, "Faktur"),
    },
    { status: 201 }
  );
}
