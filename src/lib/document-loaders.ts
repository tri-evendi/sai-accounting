/**
 * PEMUAT DOKUMEN SATUAN — baris buku → bentuk yang diminta generatornya.
 *
 * ══ INILAH PEKERJAAN SEBENARNYA DARI §5, DAN BUKAN PEMINDAHAN GENERATOR ════
 * Generator PDF sudah fungsi murni (data → byte) dan sudah terbukti berjalan di
 * Node sejak #465. Yang hari ini hidup di PERAMBAN bukan generatornya melainkan
 * PERAKITAN DATANYA: tiap halaman memetakan baris Prisma-nya sendiri menjadi
 * bentuk yang diminta generatornya, di dalam JSX-nya.
 *
 * Memindahkan pemetaan itu ke sini adalah seluruh isi §5 untuk dokumen satuan —
 * dan ia yang membuat syarat auditnya berarti: kertasnya diturunkan dari BUKU,
 * bukan dari apa yang kebetulan ada di memori peramban.
 *
 * ══ TIGA ATURAN YANG MENGIKAT SETIAP PEMUAT DI SINI ════════════════════════
 *
 *  1. **`prisma` adalah klien PT AKTIF.** Konteksnya dimasuki penjaga rute,
 *     jadi `findUnique` atas id milik PT lain tidak menemukan apa pun — dan
 *     jawabannya `null`, yang rutenya ubah menjadi 404. Tidak ada satu
 *     perbandingan kepemilikan yang ditulis tangan di berkas ini, dan itu
 *     disengaja: perbandingan yang ditulis tangan adalah perbandingan yang bisa
 *     lupa ditulis (#367).
 *
 *  2. **`null` BUKAN galat.** Dokumen yang tidak ada di buku ini dan dokumen
 *     yang memang tidak pernah ada dijawab sama — 404 — sebab membedakannya
 *     hanya memberi tahu penebak bahwa id itu ADA di suatu tempat (#157).
 *
 *  3. **Bentuknya diketik terhadap TUNTUTAN generatornya** (`ContractData`,
 *     `ShippingDocData`, `ReturnPdfData`), bukan terhadap tebakan. Medan yang
 *     bergeser di generator karena itu gugur di `tsc` di sini — bukan muncul
 *     sebagai kolom kosong di kertas yang sudah dikirim ke pelanggan.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { ContractData } from "@/lib/pdf/contract-pdf";
import type { ShippingDocData } from "@/lib/pdf/shipping-pdf";
import type { ReturnPdfData } from "@/lib/pdf/return-pdf";
import { serverPdfCompany } from "@/lib/pdf-company";
import type { DocumentPdf } from "@/lib/document-pdf";

/**
 * Nama berkas yang aman lintas sistem berkas DAN lintas header.
 *
 * Nomor dokumen boleh memuat `/` — dan itu memecah nama berkas di sebagian
 * klien surel maupun header `Content-Disposition`. Aturan yang sama dengan
 * nama lampiran faktur (#465).
 */
function namaBerkas(prefix: string, nomor: string): string {
  return `${prefix}_${nomor.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`;
}

/** Satu `jsPDF` → byte. Dipanggil SEKALI per dokumen — lihat §5. */
function keByte(doc: { output: (jenis: string) => unknown }): Uint8Array {
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

/* ── Kontrak ─────────────────────────────────────────────────────────────── */

const kontrakInclude = {
  items: true,
  payments: true,
  /* `consigneeRef`, bukan `consignee`: yang terakhir kolom TEKS warisan. Nama
     master menang bila tertaut (#22), teks bebas jadi jatuhannya — turunan yang
     sama persis dengan halaman kontrak, bukan turunan kedua. */
  consigneeRef: { select: { name: true } },
} as const;

export async function contractPdfById(id: number): Promise<DocumentPdf | null> {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: kontrakInclude,
  });
  if (!contract) return null;

  const data: ContractData = {
    contractNo: contract.contractNo,
    date: contract.date.toISOString(),
    buyer: contract.buyer,
    consignee: contract.consigneeRef?.name ?? contract.consignee ?? null,
    packaging: contract.packaging,
    shipment: contract.shipment,
    top1: contract.top1,
    top2: contract.top2,
    currency: contract.currency,
    status: contract.status,
    items: contract.items.map((i) => ({
      itemName: i.itemName,
      bags: Number(i.bags),
      kgPerBag: Number(i.kgPerBag),
      pricePerKg: Number(i.pricePerKg),
    })),
    payments: contract.payments.map((p) => ({
      date: p.date.toISOString(),
      amount: Number(p.amount),
      currency: p.currency,
      note: p.note,
    })),
  };

  const [{ generateContractPDF }, company] = await Promise.all([
    import("@/lib/pdf/contract-pdf"),
    serverPdfCompany("contract-pdf"),
  ]);
  return {
    filename: namaBerkas("Kontrak", contract.contractNo),
    content: keByte(generateContractPDF(data, company)),
  };
}

/* ── Surat jalan ─────────────────────────────────────────────────────────── */

/**
 * ══ ADA DUA SURAT JALAN DI APLIKASI INI, DAN KEDUANYA SAH ══════════════════
 *
 * Mereka memakai GENERATOR yang sama (`generateShippingPDF` — satu tata letak,
 * bukan dua) tetapi SUMBER yang berbeda, dan itu bukan duplikasi yang lupa
 * dibereskan:
 *
 *   • surat jalan dari KONTRAK — tombol di halaman kontrak, sebelum ada surat
 *     jalan sungguhan. Nomornya nomor kontrak;
 *   • surat jalan dari SURAT JALAN — tombol di halaman `delivery_orders`,
 *     dokumen berantai #16. Nomornya `SJ.YYYY.MM.NNNNN`, dan kendaraan serta
 *     kontainernya dilipat ke baris `shipment`.
 *
 * Keduanya karena itu punya kunci jenisnya SENDIRI di `DOCUMENT_PDF`. Satu
 * kunci untuk keduanya akan membuat `id` berarti dua hal tergantung siapa yang
 * memanggilnya — dan id yang berarti dua hal adalah id yang suatu hari memuat
 * dokumen yang salah.
 */
export async function contractShippingPdfById(id: number): Promise<DocumentPdf | null> {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { items: true, consigneeRef: { select: { name: true } } },
  });
  if (!contract) return null;

  const data: ShippingDocData = {
    contractNo: contract.contractNo,
    date: contract.date.toISOString(),
    buyer: contract.buyer,
    consignee: contract.consigneeRef?.name ?? contract.consignee ?? null,
    shipment: contract.shipment,
    items: contract.items.map((i) => ({
      itemName: i.itemName,
      bags: Number(i.bags),
      kgPerBag: Number(i.kgPerBag),
    })),
  };

  const [{ generateShippingPDF }, company] = await Promise.all([
    import("@/lib/pdf/shipping-pdf"),
    serverPdfCompany("shipping-pdf"),
  ]);
  return {
    filename: namaBerkas("SuratJalan", contract.contractNo),
    content: keByte(generateShippingPDF(data, company)),
  };
}

/**
 * Surat jalan dari baris `delivery_orders` (dokumen berantai #16).
 *
 * `buyer` diturunkan sama dengan halamannya: pembeli kontrak yang tertaut,
 * kalau tidak nama consignee, kalau tidak `-`. Turunan kedua akan menghasilkan
 * kertas yang berbeda dari yang dicetak orang hari ini.
 *
 * Kendaraan & kontainer dilipat ke satu baris `shipment` — bentuk yang sama
 * dengan tombolnya, sebab `ShippingDocData` memang hanya punya satu medan
 * pengiriman dan melebarkannya berarti mengubah tata letak untuk KEDUA surat
 * jalan.
 */
export async function deliveryOrderPdfById(id: number): Promise<DocumentPdf | null> {
  const order = await prisma.deliveryOrder.findUnique({
    where: { id },
    include: {
      items: true,
      consignee: { select: { name: true } },
      contract: { select: { buyer: true } },
    },
  });
  if (!order) return null;

  const shipment =
    [
      order.vehicleNo ? `Kendaraan: ${order.vehicleNo}` : null,
      order.containerNo ? `Kontainer: ${order.containerNo}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const data: ShippingDocData = {
    contractNo: order.no,
    date: order.date.toISOString(),
    buyer: order.contract?.buyer ?? order.consignee?.name ?? "-",
    consignee: order.consignee?.name ?? null,
    shipment,
    items: order.items.map((i) => ({
      itemName: i.itemName,
      bags: i.bags,
      kgPerBag: Number(i.kgPerBag),
    })),
  };

  const [{ generateShippingPDF }, company] = await Promise.all([
    import("@/lib/pdf/shipping-pdf"),
    serverPdfCompany("delivery-order-pdf"),
  ]);
  return {
    filename: namaBerkas("SuratJalan", order.no),
    content: keByte(generateShippingPDF(data, company)),
  };
}

/* ── Retur ───────────────────────────────────────────────────────────────── */

/**
 * Nota retur penjualan.
 *
 * `originLabel` = nomor faktur asalnya, dan `partyName` dari pelanggan faktur
 * itu — turunan yang sama dengan halaman daftar retur. Keduanya DIBACA, tidak
 * disalin dari baris retur: retur penjualan punya pelanggan hanya sejauh
 * fakturnya punya (faktur warisan bisa tidak punya).
 */
export async function salesReturnPdfById(id: number): Promise<DocumentPdf | null> {
  const retur = await prisma.salesReturn.findUnique({
    where: { id },
    include: {
      items: true,
      invoice: { select: { invoiceNo: true } },
      customer: { select: { name: true } },
    },
  });
  if (!retur) return null;

  const data: ReturnPdfData = {
    kind: "sales",
    returnNo: retur.returnNo,
    date: retur.date.toISOString(),
    originLabel: retur.invoice.invoiceNo,
    partyName: retur.customer?.name ?? null,
    currency: retur.currency,
    taxAmount: Number(retur.taxAmount),
    taxRate: retur.taxRate == null ? null : Number(retur.taxRate),
    reason: retur.reason,
    items: retur.items.map((i) => ({
      itemName: i.itemName,
      quantity: Number(i.quantity),
      price: Number(i.price),
    })),
  };
  return renderRetur(data);
}

/**
 * Nota retur pembelian.
 *
 * `originLabel` = `TRX-<purchaseId>`, dan bentuk itu diwarisi apa adanya dari
 * halaman daftar retur. Ia label, bukan nomor dokumen: transaksi pembelian di
 * buku ini tidak punya nomor sendiri, dan mengarang satu di sini akan
 * menghasilkan nota yang menyebut nomor yang tidak ada di mana pun.
 */
export async function purchaseReturnPdfById(id: number): Promise<DocumentPdf | null> {
  const retur = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: { items: true, supplier: { select: { name: true } } },
  });
  if (!retur) return null;

  const data: ReturnPdfData = {
    kind: "purchase",
    returnNo: retur.returnNo,
    date: retur.date.toISOString(),
    originLabel: `TRX-${retur.purchaseId}`,
    partyName: retur.supplier?.name ?? null,
    currency: retur.currency,
    taxAmount: Number(retur.taxAmount),
    taxRate: retur.taxRate == null ? null : Number(retur.taxRate),
    reason: retur.reason,
    items: retur.items.map((i) => ({
      itemName: i.itemName,
      quantity: Number(i.quantity),
      price: Number(i.price),
    })),
  };
  return renderRetur(data);
}

/** Satu perender untuk kedua arah retur — bentuknya memang satu. */
async function renderRetur(data: ReturnPdfData): Promise<DocumentPdf> {
  const [{ generateReturnPDF }, company] = await Promise.all([
    import("@/lib/pdf/return-pdf"),
    serverPdfCompany("return-pdf"),
  ]);
  return {
    filename: namaBerkas("Retur", data.returnNo),
    content: keByte(generateReturnPDF(data, company)),
  };
}
