/**
 * Wizard terpandu "Penjualan Baru" & "Pembelian Baru" (issue #5) — bagian MURNI.
 *
 * Tanpa React, tanpa Prisma, tanpa DOM: urutan langkah, penjaga per langkah,
 * penyimpanan draf, dan penyusunan muatan API semuanya hidup di sini supaya bisa
 * diuji langsung di `tests/wizard.test.ts` tanpa DATABASE_URL.
 *
 * ── SATU JANJI YANG MENENTUKAN SELURUH BENTUK MODUL INI ─────────────────────
 * "Bisa dibatalkan tanpa menyisakan data setengah jadi."
 *
 * Karena itu draf HANYA hidup di peramban. Tidak ada satu pun langkah yang
 * memanggil POST; tidak ada pelanggan yang dibuat di langkah 1, tidak ada surat
 * jalan yang diterbitkan di langkah 3. Yang tersimpan di setiap langkah adalah
 * OBJEK DRAF ini — di `sessionStorage`, bukan di database. Menutup tab, menekan
 * "Batal", atau kehilangan koneksi di langkah mana pun meninggalkan database
 * persis seperti sebelum wizard dibuka.
 *
 * Seluruh isi draf baru menjadi dokumen pada satu panggilan terakhir
 * (`POST /api/wizard/sales` atau `/api/wizard/purchase`), yang menulis semuanya
 * di dalam SATU `prisma.$transaction`. Jadi ada dua lapis jaminan: sebelum
 * "Selesai" tidak ada apa pun yang ditulis, dan pada saat "Selesai" semuanya
 * berhasil bersama atau gagal bersama.
 *
 * ── UMUR DRAF ───────────────────────────────────────────────────────────────
 * Draf yang bertahan setelah refresh berguna; draf yang bangkit tiga hari
 * kemudian dengan harga lama berbahaya — pengguna akan menekan "Selesai" tanpa
 * memeriksa ulang harga dan kuantitas yang sudah tidak berlaku. Karena itu:
 *   • disimpan di `sessionStorage`, bukan `localStorage` → mati bersama tab-nya;
 *   • diberi cap `savedAt` dan kedaluwarsa setelah `DRAFT_TTL_MS` (12 jam, yaitu
 *     satu hari kerja) → refresh siang hari aman, esok pagi mulai dari nol;
 *   • diberi cap `version`; begitu bentuk draf berubah karena rilis baru, draf
 *     lama dibuang, bukan dipaksa dibaca separuh benar.
 * Draf yang dibuang selalu diberitahukan ke pengguna, tidak pernah diam-diam.
 *
 * ── TIDAK ADA AKUNTANSI BARU DI SINI ────────────────────────────────────────
 * Wizard penjualan TIDAK membuat kontrak. Di app ini kontrak DAN faktur
 * sama-sama memposting D: Piutang / K: Pendapatan (lihat `buildContractEntry`
 * dan `buildInvoiceEntry`), jadi membuat keduanya untuk barang yang sama akan
 * menghitung pendapatan dua kali. Wizard karena itu menulis paling banyak:
 * pelanggan baru (bila perlu) → surat jalan (opsional) → faktur. Bila pengguna
 * memilih kontrak yang SUDAH ADA di langkah 2, fakturnya ditautkan ke kontrak
 * itu dan dibatasi sisanya oleh `assertWithinContract` — mekanisme "Ambil" #15
 * yang sudah ada, bukan yang baru.
 */

import { round2 } from "@/lib/posting/rules";
import { lineStockKg, round3 } from "@/lib/delivery-orders";
import {
  buildContractOutstanding,
  normalizeItemName,
  pullInvoiceLines,
  type ContractOutstanding,
} from "@/lib/document-chain";
import { closedPeriodIssue, type ClosedPeriodRef } from "@/lib/form-guards";
import { DEFAULT_TAX_RATE } from "@/lib/tax";
import type { TermKey } from "@/lib/labels";

// ══════════════════════════════ Langkah ══════════════════════════════

/** Satu langkah wizard, dalam bahasa tugas (bukan istilah akuntansi). */
export interface WizardStepMeta {
  id: string;
  /** Judul pendek yang muncul di penanda langkah. */
  title: string;
  /** Satu kalimat: apa yang dikerjakan di sini. */
  description: string;
  /** Boleh dilewati tanpa mengisi apa pun. */
  optional?: boolean;
  /** Entri kamus istilah (#1/#21) — tidak ada definisi kedua ditulis di sini. */
  termKey?: TermKey;
}

/** Penjualan: pelanggan → barang → (opsional) surat jalan → tagihan → ringkasan. */
export const SALES_STEPS = [
  {
    id: "pelanggan",
    title: "Pelanggan",
    description: "Pilih pelanggan yang sudah ada, atau isi datanya bila pembeli baru.",
    termKey: "pelanggan",
  },
  {
    id: "barang",
    title: "Barang & Harga",
    description: "Barang apa yang dijual, berapa banyak, dan berapa harganya per kg.",
  },
  {
    id: "pengiriman",
    title: "Surat Jalan",
    description: "Bila barangnya sudah dikirim, catat pengirimannya. Boleh dilewati.",
    optional: true,
    termKey: "surat_jalan",
  },
  {
    id: "faktur",
    title: "Tagihan",
    description: "Nomor dan tanggal tagihan, lalu berapa banyak yang ditagihkan.",
    termKey: "faktur",
  },
  {
    id: "ringkasan",
    title: "Ringkasan",
    description: "Periksa sekali lagi. Data baru tersimpan setelah menekan Selesai.",
  },
] as const satisfies readonly WizardStepMeta[];

/** Pembelian: pemasok → barang → (opsional) barang masuk → pembelian → ringkasan. */
export const PURCHASE_STEPS = [
  {
    id: "pemasok",
    title: "Pemasok",
    description: "Pilih pemasok yang sudah ada, atau isi datanya bila pemasok baru.",
    termKey: "pemasok",
  },
  {
    id: "barang",
    title: "Barang & Harga",
    description: "Barang apa yang dibeli, berapa banyak, dan berapa harga belinya.",
  },
  {
    id: "penerimaan",
    title: "Barang Masuk",
    description: "Bila barangnya sudah sampai gudang, catat penerimaannya. Boleh dilewati.",
    optional: true,
    termKey: "persediaan",
  },
  {
    id: "pembelian",
    title: "Catat Pembelian",
    description: "Tanggal, jatuh tempo, dan PPN Masukan atas pembelian ini.",
    termKey: "pembelian",
  },
  {
    id: "ringkasan",
    title: "Ringkasan",
    description: "Periksa sekali lagi. Data baru tersimpan setelah menekan Selesai.",
  },
] as const satisfies readonly WizardStepMeta[];

export type SalesStepId = (typeof SALES_STEPS)[number]["id"];
export type PurchaseStepId = (typeof PURCHASE_STEPS)[number]["id"];

/** Posisi sebuah langkah; -1 bila tidak dikenal. */
export function stepIndex(steps: readonly WizardStepMeta[], id: string): number {
  return steps.findIndex((s) => s.id === id);
}

/** Langkah berikutnya, atau null bila sudah di ujung. */
export function nextStepId(steps: readonly WizardStepMeta[], id: string): string | null {
  const i = stepIndex(steps, id);
  if (i < 0 || i >= steps.length - 1) return null;
  return steps[i + 1].id;
}

/** Langkah sebelumnya, atau null bila sudah di awal. */
export function prevStepId(steps: readonly WizardStepMeta[], id: string): string | null {
  const i = stepIndex(steps, id);
  if (i <= 0) return null;
  return steps[i - 1].id;
}

/**
 * Bolehkah melompat langsung ke `target` saat sedang di `current`?
 *
 * Hanya MUNDUR yang boleh dilompati. Maju harus lewat tombol "Lanjut" supaya
 * penjaga langkah yang sedang dibuka benar-benar dijalankan — melompat ke depan
 * lewat penanda langkah akan melewati penjaga itu tanpa terlihat.
 */
export function canJumpToStep(
  steps: readonly WizardStepMeta[],
  target: string,
  current: string
): boolean {
  const t = stepIndex(steps, target);
  const c = stepIndex(steps, current);
  return t >= 0 && c >= 0 && t <= c;
}

// ══════════════════════════════ Draf ══════════════════════════════

/** Mitra dagang: yang sudah terdaftar, atau yang diisi di langkah 1. */
export interface PartnerDraft {
  mode: "existing" | "new";
  /** Dipakai saat `mode === "existing"`. */
  id: number | null;
  /** Dipakai saat `mode === "new"`. */
  name: string;
  address: string;
  phone: string;
  email: string;
  /** Pelanggan saja — narahubung. */
  pic: string;
  /** Pelanggan saja — NPWP pembeli (#17). */
  npwp: string;
  /** Pelanggan saja — bebas PPN (#16). */
  taxExempt: boolean;
}

export function emptyPartner(): PartnerDraft {
  return {
    mode: "existing",
    id: null,
    name: "",
    address: "",
    phone: "",
    email: "",
    pic: "",
    npwp: "",
    taxExempt: false,
  };
}

/**
 * Satu baris barang penjualan. SATU baris membawa ketiga tahapnya sekaligus —
 * dipesan (langkah 2), dikirim (langkah 3), ditagihkan (langkah 4) — supaya
 * ketiganya mustahil kehilangan sinkronisasi ketika baris ditambah atau dihapus.
 */
export interface SalesLineDraft {
  /** FK master stok. null = barang diketik bebas, jadi tidak bisa dibuat surat jalan. */
  itemId: number | null;
  itemName: string;
  /** Kuantitas yang disepakati, dalam kg. */
  quantity: number;
  /** Harga per kg dalam mata uang faktur. */
  price: number;
  unit: string;
  /** Langkah 3 — ikut dikirim? */
  ship: boolean;
  shipBags: number;
  shipKgPerBag: number;
  /** Langkah 4 — kg yang ditagihkan (0 = tidak ditagihkan sekarang). */
  billQuantity: number;
}

export function emptySalesLine(): SalesLineDraft {
  return {
    itemId: null,
    itemName: "",
    quantity: 0,
    price: 0,
    unit: "kg",
    ship: false,
    shipBags: 1,
    shipKgPerBag: 0,
    billQuantity: 0,
  };
}

export interface SalesDraft {
  customer: PartnerDraft;
  /**
   * Kontrak sumber yang SUDAH ADA (opsional). Bila diisi, barisnya ditarik dari
   * sisa kontrak lewat `/api/contracts/[id]/outstanding` dan fakturnya ditautkan
   * ke kontrak itu — sehingga `assertWithinContract` di server ikut berlaku.
   */
  contractId: number | null;
  lines: SalesLineDraft[];
  delivery: {
    include: boolean;
    date: string;
    consigneeId: number | null;
    vehicleNo: string;
    containerNo: string;
    notes: string;
  };
  invoice: {
    invoiceNo: string;
    date: string;
    dueDate: string;
    currency: string;
    /** 0 = belum diisi. Wajib > 0 untuk mata uang selain IDR. */
    rate: number;
    taxable: boolean;
    taxRate: number;
  };
}

export function emptySalesDraft(today: string): SalesDraft {
  return {
    customer: emptyPartner(),
    contractId: null,
    lines: [emptySalesLine()],
    delivery: {
      include: false,
      date: today,
      consigneeId: null,
      vehicleNo: "",
      containerNo: "",
      notes: "",
    },
    invoice: {
      invoiceNo: "",
      date: today,
      dueDate: "",
      currency: "IDR",
      rate: 0,
      taxable: true,
      taxRate: DEFAULT_TAX_RATE,
    },
  };
}

/** Satu baris barang pembelian: dipesan (langkah 2) + diterima (langkah 3). */
export interface PurchaseLineDraft {
  itemId: number | null;
  itemName: string;
  /** Kuantitas dalam satuan stok (kg). */
  quantity: number;
  /** Harga beli per unit, dalam mata uang dokumen. */
  price: number;
  unit: string;
  /** Langkah 3 — sudah sampai gudang? */
  receive: boolean;
  receiveQuantity: number;
}

export function emptyPurchaseLine(): PurchaseLineDraft {
  return {
    itemId: null,
    itemName: "",
    quantity: 0,
    price: 0,
    unit: "kg",
    receive: false,
    receiveQuantity: 0,
  };
}

export interface PurchaseDraft {
  supplier: PartnerDraft;
  lines: PurchaseLineDraft[];
  receipt: {
    include: boolean;
    date: string;
  };
  purchase: {
    date: string;
    dueDate: string;
    currency: string;
    /** 0 = belum diisi. Wajib > 0 untuk mata uang selain IDR. */
    rate: number;
    /** PPN Masukan, dalam mata uang dokumen. */
    taxAmount: number;
    note: string;
  };
}

export function emptyPurchaseDraft(today: string): PurchaseDraft {
  return {
    supplier: emptyPartner(),
    lines: [emptyPurchaseLine()],
    receipt: { include: false, date: today },
    purchase: {
      date: today,
      dueDate: "",
      currency: "IDR",
      rate: 0,
      taxAmount: 0,
      note: "",
    },
  };
}

// ══════════════════════ Hitungan turunan (murni) ══════════════════════

/** Kg yang benar-benar dikirim untuk satu baris — 0 bila baris tidak dicentang. */
export function shipKg(line: SalesLineDraft): number {
  if (!line.ship) return 0;
  return lineStockKg({ bags: line.shipBags, kgPerBag: line.shipKgPerBag });
}

/** Nilai pesanan (langkah 2) dalam mata uang faktur. */
export function salesOrderValue(draft: SalesDraft): number {
  return round2(draft.lines.reduce((s, l) => s + l.quantity * l.price, 0));
}

/** DPP faktur — hanya baris yang benar-benar ditagihkan. */
export function salesInvoiceSubtotal(draft: SalesDraft): number {
  return round2(draft.lines.reduce((s, l) => s + l.billQuantity * l.price, 0));
}

/** PPN faktur menurut isian langkah 4 (server tetap menghitung ulang). */
export function salesInvoiceTax(draft: SalesDraft): number {
  if (!draft.invoice.taxable) return 0;
  return round2((salesInvoiceSubtotal(draft) * (draft.invoice.taxRate || 0)) / 100);
}

/** Nilai bruto faktur = DPP + PPN. */
export function salesInvoiceTotal(draft: SalesDraft): number {
  return round2(salesInvoiceSubtotal(draft) + salesInvoiceTax(draft));
}

/** Nilai pembelian sebelum PPN, dalam mata uang dokumen. */
export function purchaseValue(draft: PurchaseDraft): number {
  return round2(draft.lines.reduce((s, l) => s + l.quantity * l.price, 0));
}

/** Nilai pembelian termasuk PPN Masukan. */
export function purchaseTotal(draft: PurchaseDraft): number {
  return round2(purchaseValue(draft) + (draft.purchase.taxAmount || 0));
}

/**
 * Sisa per baris draf, memakai aritmetika dokumen berantai yang SAMA dengan
 * kontrak sungguhan (`buildContractOutstanding`, #15): baris langkah 2 berperan
 * sebagai "yang dijanjikan", kiriman langkah 3 sebagai "yang sudah dikirim".
 * Belum ada yang difakturkan — draf belum menyentuh database sama sekali.
 */
export function salesDraftOutstanding(draft: SalesDraft): ContractOutstanding {
  return buildContractOutstanding({
    lines: draft.lines
      .filter((l) => l.itemName.trim().length > 0)
      .map((l) => ({
        itemName: l.itemName,
        bags: 1,
        kgPerBag: l.quantity,
        pricePerKg: l.price,
      })),
    delivered: draft.lines
      .filter((l) => l.itemName.trim().length > 0 && shipKg(l) > 0)
      .map((l) => ({ itemName: l.itemName, quantity: shipKg(l) })),
  });
}

/** Dari mana kuantitas tagihan ditarik di langkah 4. */
export type SalesPullSource = "order" | "delivery";

/**
 * Isi `billQuantity` dengan pola "Ambil" — bukan diketik ulang.
 *
 * `"order"` menarik seluruh yang dipesan; `"delivery"` hanya yang sudah dicatat
 * dikirim di langkah 3. Kuantitasnya datang dari `pullInvoiceLines` — fungsi
 * yang sama yang dipakai tombol "Ambil" di formulir faktur biasa — lalu dibagi
 * kembali ke baris-baris draf sebanding dengan bobot masing-masing. Pembagian
 * itu hanya berarti ketika dua baris memakai NAMA barang yang sama (yang oleh
 * `buildContractOutstanding` memang digabung jadi satu); pada kasus biasa
 * hasilnya persis kuantitas baris itu sendiri.
 */
export function applySalesPull(draft: SalesDraft, source: SalesPullSource): SalesDraft {
  const { lines } = salesDraftOutstanding(draft);
  const pulled = pullInvoiceLines(lines, source === "delivery" ? "delivery" : "contract");
  const pulledByKey = new Map(pulled.map((p) => [normalizeItemName(p.itemName), p.quantity]));

  const weightOf = (l: SalesLineDraft) => (source === "delivery" ? shipKg(l) : l.quantity);
  const weightByKey = new Map<string, number>();
  for (const l of draft.lines) {
    const key = normalizeItemName(l.itemName);
    weightByKey.set(key, (weightByKey.get(key) ?? 0) + weightOf(l));
  }

  return {
    ...draft,
    lines: draft.lines.map((l) => {
      const key = normalizeItemName(l.itemName);
      const total = pulledByKey.get(key) ?? 0;
      const weight = weightByKey.get(key) ?? 0;
      if (total <= 0 || weight <= 0) return { ...l, billQuantity: 0 };
      return { ...l, billQuantity: round3((total * weightOf(l)) / weight) };
    }),
  };
}

/** Isi kuantitas kirim langkah 3 dari kuantitas pesanan (1 bag × sisa kg). */
export function fillDeliveryFromOrder(draft: SalesDraft): SalesDraft {
  return {
    ...draft,
    lines: draft.lines.map((l) =>
      l.itemId == null || l.quantity <= 0
        ? { ...l, ship: false }
        : { ...l, ship: true, shipBags: l.shipBags > 0 ? l.shipBags : 1, shipKgPerBag: l.quantity }
    ),
  };
}

/** Isi kuantitas terima langkah 3 dari kuantitas pesanan pembelian. */
export function fillReceiptFromOrder(draft: PurchaseDraft): PurchaseDraft {
  return {
    ...draft,
    lines: draft.lines.map((l) =>
      l.itemId == null || l.quantity <= 0
        ? { ...l, receive: false }
        : { ...l, receive: true, receiveQuantity: l.quantity }
    ),
  };
}

// ══════════════════════ Penjaga per langkah ══════════════════════

/** Keterangan tambahan yang tidak ada di dalam draf sendiri. */
export interface WizardGuardContext {
  /** Bulan buku yang sudah ditutup (#13) — cermin UI dari `assertPeriodOpen`. */
  closedPeriods?: readonly ClosedPeriodRef[];
  /** Stok tersedia per `itemId` (kg) — cermin UI dari `assertStockAvailable`. */
  stockByItem?: ReadonlyMap<number, number>;
  /** Sisa per nama barang pada kontrak sumber, bila sebuah kontrak dipilih. */
  contractRemainingKg?: ReadonlyMap<string, number>;
}

const trimmed = (v: string) => v.trim();

/** Alasan sebuah langkah belum boleh dilanjutkan. Kosong = boleh lanjut. */
function partnerBlockers(partner: PartnerDraft, noun: string): string[] {
  if (partner.mode === "existing") {
    return partner.id == null ? [`Pilih ${noun} dari daftar, atau isi ${noun} baru.`] : [];
  }
  const issues: string[] = [];
  if (!trimmed(partner.name)) issues.push(`Nama ${noun} wajib diisi.`);
  if (partner.name.length > 100) issues.push(`Nama ${noun} terlalu panjang (maksimal 100 huruf).`);
  if (partner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partner.email)) {
    issues.push("Alamat email belum benar. Contoh yang benar: nama@perusahaan.com.");
  }
  return issues;
}

function currencyBlockers(currency: string, rate: number): string[] {
  if (currency !== "IDR" && !(rate > 0)) {
    return [`Kurs ke IDR wajib diisi untuk mata uang ${currency} — buku besar mencatat nilai IDR.`];
  }
  return [];
}

/** Baris barang yang terisi namanya (baris kosong diabaikan, bukan ditolak). */
function filledSalesLines(draft: SalesDraft): SalesLineDraft[] {
  return draft.lines.filter((l) => trimmed(l.itemName).length > 0);
}

function filledPurchaseLines(draft: PurchaseDraft): PurchaseLineDraft[] {
  return draft.lines.filter((l) => trimmed(l.itemName).length > 0);
}

/** Penjaga satu langkah wizard penjualan. */
export function validateSalesStep(
  draft: SalesDraft,
  step: SalesStepId,
  ctx: WizardGuardContext = {}
): string[] {
  const issues: string[] = [];
  const lines = filledSalesLines(draft);

  if (step === "pelanggan") {
    issues.push(...partnerBlockers(draft.customer, "pelanggan"));
  }

  if (step === "barang") {
    if (lines.length === 0) {
      issues.push("Tambahkan minimal satu barang beserta jumlah dan harganya.");
    }
    for (const [i, l] of lines.entries()) {
      if (!(l.quantity > 0)) issues.push(`Jumlah barang baris ${i + 1} harus lebih besar dari 0.`);
      if (l.price < 0) issues.push(`Harga baris ${i + 1} tidak boleh negatif — isi 0 atau lebih.`);
    }
    const remaining = ctx.contractRemainingKg;
    if (remaining) {
      for (const l of lines) {
        const sisa = remaining.get(normalizeItemName(l.itemName));
        if (sisa != null && l.quantity > sisa) {
          issues.push(
            `${l.itemName}: ${l.quantity} kg melebihi sisa kontrak ${sisa} kg. ` +
              `Kurangi jumlahnya sampai sama dengan sisa.`
          );
        }
      }
    }
  }

  if (step === "pengiriman" && draft.delivery.include) {
    const periodIssue = closedPeriodIssue(
      draft.delivery.date,
      ctx.closedPeriods ?? [],
      "Tanggal surat jalan"
    );
    if (!trimmed(draft.delivery.date)) issues.push("Tanggal surat jalan wajib diisi.");
    if (periodIssue) issues.push(periodIssue);

    const shipped = draft.lines.filter((l) => shipKg(l) > 0);
    if (shipped.length === 0) {
      issues.push(
        "Belum ada barang yang dicentang untuk dikirim. Centang barangnya, atau lewati langkah ini."
      );
    }
    for (const l of shipped) {
      if (l.itemId == null) {
        issues.push(
          `${l.itemName} tidak ada di daftar stok, jadi tidak bisa masuk surat jalan. ` +
            `Pilih barangnya dari daftar stok di langkah Barang & Harga, atau jangan dikirim.`
        );
        continue;
      }
      if (shipKg(l) > l.quantity) {
        issues.push(
          `${l.itemName}: yang dikirim ${shipKg(l)} kg melebihi yang dipesan ${l.quantity} kg.`
        );
      }
    }
  }

  if (step === "faktur") {
    if (!trimmed(draft.invoice.invoiceNo)) issues.push("Nomor tagihan wajib diisi.");
    if (draft.invoice.invoiceNo.length > 50) issues.push("Nomor tagihan maksimal 50 huruf.");
    if (!trimmed(draft.invoice.date)) issues.push("Tanggal tagihan wajib diisi.");
    const periodIssue = closedPeriodIssue(
      draft.invoice.date,
      ctx.closedPeriods ?? [],
      "Tanggal tagihan"
    );
    if (periodIssue) issues.push(periodIssue);
    issues.push(...currencyBlockers(draft.invoice.currency, draft.invoice.rate));
    if (draft.invoice.taxable && (draft.invoice.taxRate < 0 || draft.invoice.taxRate > 100)) {
      issues.push("Tarif PPN harus antara 0 dan 100 persen.");
    }

    const billed = lines.filter((l) => l.billQuantity > 0);
    if (billed.length === 0) {
      issues.push('Belum ada barang yang ditagihkan. Tekan "Ambil" atau isi jumlah tagihannya.');
    }
    for (const l of billed) {
      if (l.billQuantity > l.quantity) {
        issues.push(
          `${l.itemName}: yang ditagihkan ${l.billQuantity} kg melebihi yang dipesan ${l.quantity} kg.`
        );
      }
    }
    if (salesInvoiceSubtotal(draft) <= 0) {
      issues.push("Nilai tagihan masih 0. Periksa jumlah dan harga barangnya.");
    }
  }

  if (step === "ringkasan") {
    // Ringkasan mengulang seluruh penjaga: seorang pengguna bisa saja mundur,
    // mengubah sesuatu, lalu melompat maju lagi lewat penanda langkah.
    for (const s of ["pelanggan", "barang", "pengiriman", "faktur"] as const) {
      issues.push(...validateSalesStep(draft, s, ctx));
    }
  }

  // Penjaga stok berlaku di langkah pengiriman DAN ringkasan — apa pun yang
  // ditolak `assertStockAvailable` di server sudah terbaca lebih dulu di layar.
  if ((step === "pengiriman" || step === "ringkasan") && draft.delivery.include && ctx.stockByItem) {
    const requested = new Map<number, number>();
    for (const l of draft.lines) {
      if (l.itemId == null) continue;
      const kg = shipKg(l);
      if (kg > 0) requested.set(l.itemId, round3((requested.get(l.itemId) ?? 0) + kg));
    }
    for (const [itemId, kg] of requested) {
      const available = ctx.stockByItem.get(itemId) ?? 0;
      if (kg > available) {
        const name = draft.lines.find((l) => l.itemId === itemId)?.itemName ?? "Barang";
        issues.push(
          `Stok tidak cukup: ${name} (diminta ${kg} kg, tersedia ${available} kg). ` +
            `Kurangi jumlahnya, atau catat barang masuk lebih dulu.`
        );
      }
    }
  }

  return [...new Set(issues)];
}

/** Penjaga satu langkah wizard pembelian. */
export function validatePurchaseStep(
  draft: PurchaseDraft,
  step: PurchaseStepId,
  ctx: WizardGuardContext = {}
): string[] {
  const issues: string[] = [];
  const lines = filledPurchaseLines(draft);

  if (step === "pemasok") {
    issues.push(...partnerBlockers(draft.supplier, "pemasok"));
  }

  if (step === "barang") {
    if (lines.length === 0) {
      issues.push("Tambahkan minimal satu barang beserta jumlah dan harga belinya.");
    }
    for (const [i, l] of lines.entries()) {
      if (!(l.quantity > 0)) issues.push(`Jumlah barang baris ${i + 1} harus lebih besar dari 0.`);
      if (!(l.price > 0)) issues.push(`Harga beli baris ${i + 1} harus lebih besar dari 0.`);
    }
    if (purchaseValue(draft) <= 0) {
      issues.push("Nilai pembelian masih 0. Periksa jumlah dan harga barangnya.");
    }
  }

  if (step === "penerimaan" && draft.receipt.include) {
    if (!trimmed(draft.receipt.date)) issues.push("Tanggal barang masuk wajib diisi.");
    const periodIssue = closedPeriodIssue(
      draft.receipt.date,
      ctx.closedPeriods ?? [],
      "Tanggal barang masuk"
    );
    if (periodIssue) issues.push(periodIssue);

    const received = draft.lines.filter((l) => l.receive && l.receiveQuantity > 0);
    if (received.length === 0) {
      issues.push(
        "Belum ada barang yang dicentang sebagai sudah masuk gudang. " +
          "Centang barangnya, atau lewati langkah ini."
      );
    }
    for (const l of received) {
      if (l.itemId == null) {
        issues.push(
          `${l.itemName} belum ada di daftar stok, jadi belum bisa dicatat masuk gudang. ` +
            `Pilih barangnya dari daftar stok di langkah Barang & Harga.`
        );
        continue;
      }
      if (l.receiveQuantity > l.quantity) {
        issues.push(
          `${l.itemName}: yang masuk ${l.receiveQuantity} melebihi yang dibeli ${l.quantity}.`
        );
      }
    }
  }

  if (step === "pembelian") {
    if (!trimmed(draft.purchase.date)) issues.push("Tanggal pembelian wajib diisi.");
    const periodIssue = closedPeriodIssue(
      draft.purchase.date,
      ctx.closedPeriods ?? [],
      "Tanggal pembelian"
    );
    if (periodIssue) issues.push(periodIssue);
    issues.push(...currencyBlockers(draft.purchase.currency, draft.purchase.rate));
    if (draft.purchase.taxAmount < 0) {
      issues.push("PPN Masukan tidak boleh negatif — isi 0 atau lebih.");
    }
    if (purchaseValue(draft) <= 0) {
      issues.push("Nilai pembelian masih 0. Periksa jumlah dan harga barangnya.");
    }
  }

  if (step === "ringkasan") {
    for (const s of ["pemasok", "barang", "penerimaan", "pembelian"] as const) {
      issues.push(...validatePurchaseStep(draft, s, ctx));
    }
  }

  return [...new Set(issues)];
}

/** Langkah pertama yang masih bermasalah, atau null bila semuanya bersih. */
export function firstBlockedSalesStep(
  draft: SalesDraft,
  ctx: WizardGuardContext = {}
): SalesStepId | null {
  for (const step of SALES_STEPS) {
    if (step.id === "ringkasan") continue;
    if (validateSalesStep(draft, step.id, ctx).length > 0) return step.id;
  }
  return null;
}

/** Langkah pertama yang masih bermasalah pada wizard pembelian. */
export function firstBlockedPurchaseStep(
  draft: PurchaseDraft,
  ctx: WizardGuardContext = {}
): PurchaseStepId | null {
  for (const step of PURCHASE_STEPS) {
    if (step.id === "ringkasan") continue;
    if (validatePurchaseStep(draft, step.id, ctx).length > 0) return step.id;
  }
  return null;
}

// ══════════════════════ Muatan API ══════════════════════

/** Bagian mitra dari muatan — bentuknya sama untuk pelanggan dan pemasok. */
export interface WizardPartnerPayload {
  mode: "existing" | "new";
  id: number | null;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  pic?: string;
  npwp?: string;
  taxExempt?: boolean;
}

function partnerPayload(p: PartnerDraft, withCustomerFields: boolean): WizardPartnerPayload {
  if (p.mode === "existing") return { mode: "existing", id: p.id };
  return {
    mode: "new",
    id: null,
    name: trimmed(p.name),
    address: trimmed(p.address) || undefined,
    phone: trimmed(p.phone) || undefined,
    email: trimmed(p.email) || undefined,
    ...(withCustomerFields
      ? {
          pic: trimmed(p.pic) || undefined,
          npwp: trimmed(p.npwp) || undefined,
          taxExempt: p.taxExempt,
        }
      : {}),
  };
}

/** Muatan `POST /api/wizard/sales`. Sub-objeknya persis bentuk yang sudah
 *  divalidasi `deliveryOrderSchema` dan `invoiceSchema` di server. */
export interface SalesWizardPayload {
  customer: WizardPartnerPayload;
  contractId: number | null;
  delivery: {
    date: string;
    consigneeId: number | null;
    vehicleNo: string;
    containerNo: string;
    notes: string;
    items: { itemId: number; itemName: string; bags: number; kgPerBag: number }[];
  } | null;
  invoice: {
    invoiceNo: string;
    date: string;
    dueDate: string;
    status: string;
    currency: string;
    rate?: number;
    taxable: boolean;
    taxRate: number;
    items: { itemName: string; quantity: number; price: number; unit: string }[];
  };
}

export function buildSalesPayload(draft: SalesDraft): SalesWizardPayload {
  const lines = filledSalesLines(draft);
  const shipped = draft.lines.filter((l) => l.itemId != null && shipKg(l) > 0);

  return {
    customer: partnerPayload(draft.customer, true),
    contractId: draft.contractId,
    delivery:
      draft.delivery.include && shipped.length > 0
        ? {
            date: draft.delivery.date,
            consigneeId: draft.delivery.consigneeId,
            vehicleNo: trimmed(draft.delivery.vehicleNo),
            containerNo: trimmed(draft.delivery.containerNo),
            notes: trimmed(draft.delivery.notes),
            items: shipped.map((l) => ({
              itemId: l.itemId as number,
              itemName: trimmed(l.itemName),
              bags: l.shipBags,
              kgPerBag: l.shipKgPerBag,
            })),
          }
        : null,
    invoice: {
      invoiceNo: trimmed(draft.invoice.invoiceNo),
      date: draft.invoice.date,
      dueDate: draft.invoice.dueDate,
      status: "pending",
      currency: draft.invoice.currency,
      rate: draft.invoice.rate > 0 ? draft.invoice.rate : undefined,
      taxable: draft.invoice.taxable,
      taxRate: draft.invoice.taxRate,
      items: lines
        .filter((l) => l.billQuantity > 0)
        .map((l) => ({
          itemName: trimmed(l.itemName),
          quantity: l.billQuantity,
          price: l.price,
          unit: trimmed(l.unit) || "kg",
        })),
    },
  };
}

/** Muatan `POST /api/wizard/purchase`. */
export interface PurchaseWizardPayload {
  supplier: WizardPartnerPayload;
  purchase: {
    date: string;
    dueDate: string;
    type: "purchase";
    amount: number;
    currency: string;
    rate?: number;
    taxAmount: number;
    note: string;
  };
  receipt: {
    date: string;
    items: { itemId: number; itemName: string; quantity: number; unitCost: number }[];
  } | null;
}

/**
 * Rincian barang ikut ke `note` pembelian: `supplier_transactions` menyimpan satu
 * nilai saja (tidak punya tabel baris), jadi satu-satunya tempat rincian itu
 * bertahan tanpa mengubah skema adalah catatannya.
 */
export function purchaseNote(draft: PurchaseDraft): string {
  const detail = filledPurchaseLines(draft)
    .map((l) => `${trimmed(l.itemName)} ${l.quantity} ${trimmed(l.unit) || "kg"} × ${l.price}`)
    .join("; ");
  const own = trimmed(draft.purchase.note);
  return [own, detail].filter(Boolean).join(" — ").slice(0, 500);
}

export function buildPurchasePayload(draft: PurchaseDraft): PurchaseWizardPayload {
  const received = draft.lines.filter(
    (l) => l.receive && l.itemId != null && l.receiveQuantity > 0
  );
  // Harga pokok stok SELALU dalam IDR (`stock.unit_cost` adalah masukan HPP
  // rata-rata), jadi harga beli valas dikalikan kursnya lebih dulu.
  const toIdr = draft.purchase.currency === "IDR" ? 1 : draft.purchase.rate || 0;

  return {
    supplier: partnerPayload(draft.supplier, false),
    purchase: {
      date: draft.purchase.date,
      dueDate: draft.purchase.dueDate,
      type: "purchase",
      amount: purchaseValue(draft),
      currency: draft.purchase.currency,
      rate: draft.purchase.rate > 0 ? draft.purchase.rate : undefined,
      taxAmount: draft.purchase.taxAmount || 0,
      note: purchaseNote(draft),
    },
    receipt:
      draft.receipt.include && received.length > 0
        ? {
            date: draft.receipt.date,
            items: received.map((l) => ({
              itemId: l.itemId as number,
              itemName: trimmed(l.itemName),
              quantity: l.receiveQuantity,
              unitCost: round2(l.price * toIdr),
            })),
          }
        : null,
  };
}

// ══════════════════════ Penyimpanan draf ══════════════════════

/** Naikkan bila bentuk draf berubah — draf versi lama akan dibuang, bukan dibaca. */
export const DRAFT_VERSION = 1;

/** Umur maksimal draf: 12 jam, yaitu satu hari kerja. Lihat catatan di kepala file. */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export type WizardKind = "sales" | "purchase";

/** Kunci `sessionStorage` per jenis wizard. */
export function draftStorageKey(kind: WizardKind): string {
  return `sai.wizard.${kind}.v${DRAFT_VERSION}`;
}

interface StoredDraft {
  version: number;
  kind: WizardKind;
  savedAt: number;
  draft: unknown;
}

export function serializeDraft(kind: WizardKind, draft: unknown, now = Date.now()): string {
  const stored: StoredDraft = { version: DRAFT_VERSION, kind, savedAt: now, draft };
  return JSON.stringify(stored);
}

/** Kenapa sebuah draf tersimpan tidak dipakai. Selalu diberitahukan ke pengguna. */
export type DraftRejection = "empty" | "corrupt" | "version" | "kind" | "expired";

export interface DraftReadResult<T> {
  draft: T | null;
  reason: DraftRejection | null;
  /** Kapan draf itu disimpan — dipakai untuk kalimat "draf dari pukul …". */
  savedAt: number | null;
}

/**
 * Baca draf tersimpan. Draf yang rusak, dari versi lain, dari jenis wizard lain,
 * atau yang sudah lewat `DRAFT_TTL_MS` DIBUANG — harga dan kuantitas yang sudah
 * basi tidak boleh diam-diam bangkit lalu ikut tersimpan.
 */
export function parseDraft<T>(
  kind: WizardKind,
  raw: string | null | undefined,
  now = Date.now()
): DraftReadResult<T> {
  if (!raw) return { draft: null, reason: "empty", savedAt: null };

  let stored: StoredDraft;
  try {
    stored = JSON.parse(raw) as StoredDraft;
  } catch {
    return { draft: null, reason: "corrupt", savedAt: null };
  }
  if (!stored || typeof stored !== "object" || stored.draft == null) {
    return { draft: null, reason: "corrupt", savedAt: null };
  }
  if (stored.version !== DRAFT_VERSION) {
    return { draft: null, reason: "version", savedAt: stored.savedAt ?? null };
  }
  if (stored.kind !== kind) {
    return { draft: null, reason: "kind", savedAt: stored.savedAt ?? null };
  }
  const savedAt = typeof stored.savedAt === "number" ? stored.savedAt : null;
  if (savedAt == null || now - savedAt > DRAFT_TTL_MS) {
    return { draft: null, reason: "expired", savedAt };
  }

  return { draft: stored.draft as T, reason: null, savedAt };
}

/** Kalimat yang dipakai halaman untuk menjelaskan draf yang dibuang. */
export function draftRejectionMessage(reason: DraftRejection): string | null {
  switch (reason) {
    case "expired":
      return (
        "Draf sebelumnya sudah lebih dari 12 jam, jadi tidak dipakai lagi — harga dan " +
        "jumlah yang lama bisa sudah tidak berlaku. Tidak ada data yang tersimpan; " +
        "silakan mulai dari langkah pertama."
      );
    case "version":
    case "kind":
    case "corrupt":
      return (
        "Draf sebelumnya tidak bisa dibaca lagi, jadi dimulai dari kosong. " +
        "Tidak ada data yang tersimpan di sistem."
      );
    case "empty":
      return null;
  }
}
