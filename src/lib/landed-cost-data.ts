/**
 * DOKUMEN BIAYA IMPOR — lapisan basis data (issue #495 butir 1).
 *
 * `lib/landed-cost.ts` memutuskan BERAPA yang menempel dan berapa yang jatuh ke
 * selisih; berkas ini yang membaca dunia nyata (saldo, penerimaan, tagihan) dan
 * menuliskan akibatnya. Pembagiannya disengaja: seluruh kebenaran aritmetikanya
 * bisa diuji tanpa basis data, dan yang di sini tinggal urutan tulis.
 *
 * ══ TIGA HAL YANG MUDAH SALAH, DAN DIJAGA DI SINI ══════════════════════════
 *
 * 1. **Dikelompokkan per BARANG, bukan per baris penerimaan.** Sebaran yang
 *    dihitung per baris akan menempelkan biaya dua kali ke saldo yang sama
 *    ketika satu kontainer memuat dua penerimaan barang yang sama: keduanya
 *    membaca `onHand` yang sama, dan keduanya mengira sisa itu miliknya.
 *
 * 2. **`onHand` dibaca PER TANGGAL DOKUMEN, bukan "sekarang".** Dokumen yang
 *    dibuka ulang bulan depan harus memulangkan angka yang sama dengan yang
 *    sudah masuk buku; saldo "sekarang" berubah setiap hari.
 *
 * 3. **Kunci periode diperiksa SENDIRI.** Dokumen yang seluruh barangnya masih
 *    di gudang tidak menerbitkan jurnal sama sekali (tak ada yang perlu
 *    dipindahkan) — dan `assertPeriodOpen` hidup DI DALAM mesin jurnal. Tanpa
 *    pemeriksaan di sini, dokumen semacam itu akan menulis baris `cost_adjust`
 *    ke bulan yang sudah dikunci, lewat satu-satunya jalur yang tidak melewati
 *    penjaga periode.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals } from "@/lib/inventory";
import { planLandedCost, type AdditionalCostBasis, type LandedCostPlan } from "@/lib/landed-cost";
import { assertPeriodOpen } from "@/lib/period";
import { postForSource, round2, unpostForSource } from "@/lib/posting";
import { toBase } from "@/lib/receivables";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Penolakan yang punya SEBAB — route menerjemahkannya jadi 400/404/409. */
export class LandedCostError extends Error {
  constructor(
    readonly code:
      | "purchase_not_found"
      | "purchase_not_a_purchase"
      | "purchase_is_opening"
      | "purchase_without_rate"
      | "purchase_already_spread"
      | "amount_not_positive"
      | "no_receipts"
      | "receipts_uncosted",
    message: string
  ) {
    super(message);
    this.name = "LandedCostError";
  }
}

/** BIM.YYYY.MM.NNNNN — pola penomoran yang sama dengan retur (issue #27). */
export async function nextLandedCostNo(tx: Tx, date: Date): Promise<string> {
  const prefix = `BIM.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const count = await tx.landedCostDocument.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

// ─────────────────────── Penerimaan yang bisa ditumpangi ───────────────────

/** Satu baris penerimaan yang boleh dipilih di layar. */
export interface ReceiptCandidate {
  movementId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string | null;
  date: string;
  quantity: number;
  unitCost: number;
  /** Nilai baris (kuantitas × harga pokok satuan), IDR. */
  value: number;
  note: string | null;
}

/**
 * Penerimaan yang bisa menanggung biaya: gerakan `in` BERBIAYA dalam rentang
 * tanggal.
 *
 * Yang tanpa `unit_cost` sengaja tidak muncul — barang yang tidak punya harga
 * pokok tidak punya apa pun untuk ditempeli, dan menampilkannya hanya melahirkan
 * baris bernilai nol yang tak pernah menerima sebaran apa pun (dasar `value`)
 * atau menyedot sebaran tanpa dasar (dasar `weight`).
 */
export async function listReceiptCandidates(
  range: { from: Date; to: Date; itemId?: number | null },
  client: Client = prisma
): Promise<ReceiptCandidate[]> {
  const rows = await client.stockMovement.findMany({
    where: {
      type: "in",
      unitCost: { not: null },
      date: { gte: range.from, lte: range.to },
      ...(range.itemId ? { itemId: range.itemId } : {}),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
    include: { item: { select: { code: true, name: true, unit: true } } },
  });

  return rows.map((m) => {
    const quantity = num(m.quantity);
    const unitCost = num(m.unitCost);
    return {
      movementId: m.id,
      itemId: m.itemId,
      itemCode: m.item.code,
      itemName: m.item.name,
      unit: m.item.unit,
      date: m.date.toISOString().slice(0, 10),
      quantity,
      unitCost,
      value: round2(quantity * unitCost),
      note: m.note,
    };
  });
}

// ─────────────────────────── Rencana sebuah dokumen ────────────────────────

/** Satu barang dalam rencana, beserta asal-usulnya. */
export interface PlannedLine {
  itemId: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  value: number;
  onHand: number;
  allocated: number;
  capitalized: number;
  expensed: number;
  /** Baris penerimaan yang menyumbang — banyak bila satu barang datang dua kali. */
  movementIds: number[];
}

export interface LandedCostPreview {
  /** Nilai IDR yang disebar — dari tagihannya, tidak pernah diketik ulang. */
  amount: number;
  basis: AdditionalCostBasis;
  totalCapitalized: number;
  totalExpensed: number;
  lines: PlannedLine[];
}

/**
 * Saldo tiap barang PER TANGGAL — dari gerakannya, memakai penjumlah yang sama
 * dengan layar Stok. Bukan kueri agregat sendiri: dua penjumlah saldo adalah dua
 * jawaban yang suatu hari berbeda soal baris `process` dan `cost_adjust`.
 */
export async function onHandByItem(
  itemIds: number[],
  asOf: Date,
  client: Client
): Promise<Map<number, number>> {
  const movements = await client.stockMovement.findMany({
    where: { itemId: { in: itemIds }, date: { lte: asOf } },
    select: { itemId: true, quantity: true, type: true, date: true },
  });
  const byItem = new Map<number, typeof movements>();
  for (const m of movements) {
    const list = byItem.get(m.itemId);
    if (list) list.push(m);
    else byItem.set(m.itemId, [m]);
  }
  return new Map(
    itemIds.map((id) => [id, calculateStockTotals(byItem.get(id) ?? []).currentStock])
  );
}

/**
 * Susun rencana lengkap sebuah dokumen — dipakai baik oleh pratinjau (baca
 * saja) maupun oleh penulisan. SATU sumber jawaban: layar tidak boleh
 * memperlihatkan pembagian yang berbeda dari yang akan tertulis.
 */
export async function planLandedCostDocument(
  input: { purchaseId: number; date: Date; basis: AdditionalCostBasis; movementIds: number[] },
  client: Client = prisma
): Promise<LandedCostPreview> {
  const purchase = await client.supplierTransaction.findUnique({
    where: { id: input.purchaseId },
    include: { landedCost: { select: { id: true } } },
  });
  if (!purchase) {
    throw new LandedCostError("purchase_not_found", "Tagihan biaya impor tidak ditemukan.");
  }
  if (purchase.type !== "purchase") {
    throw new LandedCostError(
      "purchase_not_a_purchase",
      "Yang bisa disebar hanya baris PEMBELIAN — pembayaran bukan biaya yang menempel di barang."
    );
  }
  if (purchase.isOpening) {
    throw new LandedCostError(
      "purchase_is_opening",
      "Tagihan pembuka nilainya sudah termasuk di jurnal saldo awal, jadi ia tidak boleh disebar lagi."
    );
  }
  if (purchase.landedCost) {
    throw new LandedCostError(
      "purchase_already_spread",
      "Tagihan ini sudah pernah disebar. Satu tagihan disebar sekali — menyebarnya dua kali menggandakan harga pokoknya."
    );
  }

  /* PPN Masukan (`taxAmount`) sengaja TIDAK ikut: ia pajak yang bisa
     dikreditkan, bukan biaya yang menempel di barang. Yang disebar nilai
     bersihnya saja. */
  const amount = toBase({
    amount: purchase.amount,
    currency: purchase.currency,
    rate: purchase.rate,
    baseAmount: purchase.baseAmount,
  });
  if (amount == null) {
    throw new LandedCostError(
      "purchase_without_rate",
      "Tagihan valas ini belum punya kurs, jadi nilai rupiahnya belum diketahui. Lengkapi kursnya dulu."
    );
  }
  if (amount <= 0) {
    throw new LandedCostError("amount_not_positive", "Nilai tagihannya nol — tak ada yang disebar.");
  }

  const movements = await client.stockMovement.findMany({
    where: { id: { in: input.movementIds }, type: "in" },
    include: { item: { select: { code: true, name: true } } },
    orderBy: { id: "asc" },
  });
  if (movements.length === 0) {
    throw new LandedCostError(
      "no_receipts",
      "Belum ada penerimaan barang yang dipilih — biaya harus menempel pada sesuatu."
    );
  }
  if (movements.some((m) => m.unitCost == null)) {
    throw new LandedCostError(
      "receipts_uncosted",
      "Ada penerimaan tanpa harga pokok. Barang yang tidak punya harga pokok tidak punya apa pun untuk ditempeli."
    );
  }

  /* ── Digabung PER BARANG (butir 1 di kepala berkas) ────────────────────── */
  const grouped = new Map<number, PlannedLine>();
  for (const m of movements) {
    const quantity = num(m.quantity);
    const value = round2(quantity * num(m.unitCost));
    const found = grouped.get(m.itemId);
    if (found) {
      found.quantity = round2(found.quantity + quantity);
      found.value = round2(found.value + value);
      found.movementIds.push(m.id);
    } else {
      grouped.set(m.itemId, {
        itemId: m.itemId,
        itemCode: m.item.code,
        itemName: m.item.name,
        quantity,
        value,
        onHand: 0,
        allocated: 0,
        capitalized: 0,
        expensed: 0,
        movementIds: [m.id],
      });
    }
  }

  const lines = [...grouped.values()];
  const onHand = await onHandByItem(
    lines.map((l) => l.itemId),
    input.date,
    client
  );
  for (const line of lines) line.onHand = onHand.get(line.itemId) ?? 0;

  const plan: LandedCostPlan = planLandedCost(
    lines.map((l) => ({
      itemId: l.itemId,
      value: l.value,
      quantity: l.quantity,
      onHand: l.onHand,
    })),
    amount,
    input.basis
  );

  plan.lines.forEach((split, i) => {
    lines[i].allocated = split.allocated;
    lines[i].capitalized = split.capitalized;
    lines[i].expensed = split.expensed;
  });

  return {
    amount,
    basis: input.basis,
    totalCapitalized: plan.totalCapitalized,
    totalExpensed: plan.totalExpensed,
    lines,
  };
}

// ─────────────────────────────── Penulisan ─────────────────────────────────

export interface CreateLandedCostInput {
  purchaseId: number;
  date: Date;
  basis: AdditionalCostBasis;
  movementIds: number[];
  note?: string | null;
}

/**
 * Tulis dokumennya, baris `cost_adjust`-nya, dan jurnalnya — di dalam transaksi
 * pemanggil.
 *
 * URUTANNYA DISENGAJA. Kunci periode lebih dulu (lihat butir 3 di kepala
 * berkas), lalu rencananya disusun ulang DI DALAM transaksi — bukan diterima
 * dari klien. Pratinjau di layar dibuat dari saldo beberapa detik sebelumnya;
 * yang masuk buku harus dihitung dari saldo pada saat menulis, dan tak ada
 * angka uang yang pernah datang dari peramban.
 */
export async function createLandedCostInTx(tx: Tx, input: CreateLandedCostInput) {
  await assertPeriodOpen(input.date, tx);

  const plan = await planLandedCostDocument(input, tx);
  const number = await nextLandedCostNo(tx, input.date);

  const doc = await tx.landedCostDocument.create({
    data: {
      number,
      date: input.date,
      purchaseId: input.purchaseId,
      basis: input.basis,
      amount: plan.amount,
      capitalizedAmount: plan.totalCapitalized,
      expensedAmount: plan.totalExpensed,
      note: input.note?.trim() || null,
    },
  });

  for (const line of plan.lines) {
    /*
     * Baris `cost_adjust`: kuantitas NOL, nilai naik. Ia yang membuat biayanya
     * sampai ke `weightedAverageUnitCost` — dan karena itu ke laporan Nilai
     * Persediaan, yang diturunkan dari gerakan, bukan dari buku besar.
     *
     * Tidak ditulis ketika tak ada yang menempel: baris bernilai nol tidak
     * mengubah rata-rata apa pun dan hanya memenuhi Kartu Stok dengan mutasi
     * yang tak pernah terjadi.
     */
    const adjustment =
      line.capitalized > 0
        ? await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              quantity: 0,
              type: "cost_adjust",
              date: input.date,
              valueAdjustment: line.capitalized,
              note: `Biaya impor ${number}`,
            },
          })
        : null;

    await tx.landedCostItem.create({
      data: {
        documentId: doc.id,
        itemId: line.itemId,
        /* Asal-usul hanya bisa ditunjuk kalau memang cuma satu. Barang yang
           datang dua kali dalam kontainer yang sama menjadi SATU baris di sini
           (lihat butir 1 di kepala berkas), dan menunjuk salah satunya akan
           menjadi jejak yang menyesatkan. */
        receiptMovementId: line.movementIds.length === 1 ? line.movementIds[0] : null,
        adjustmentMovementId: adjustment?.id ?? null,
        quantity: line.quantity,
        value: line.value,
        onHandQuantity: line.onHand,
        allocated: line.allocated,
        capitalized: line.capitalized,
        expensed: line.expensed,
      },
    });
  }

  /* Memindahkan bagian yang sudah terjual keluar dari Persediaan. Memulangkan
     null ketika tak ada bagian terjual — lihat `buildLandedCostEntry`. */
  await postForSource({ sourceType: "landed_cost", sourceId: doc.id, tx });

  return { document: doc, plan };
}

/**
 * Batalkan sebuah dokumen: jurnalnya dibalik, baris `cost_adjust`-nya dihapus,
 * dokumennya hilang.
 *
 * ══ KENAPA BARIS `cost_adjust` DIHAPUS, BUKAN DILAWAN DENGAN BARIS NEGATIF ══
 * Karena ia bukan peristiwa. Baris `in`/`out` mencatat barang yang benar-benar
 * bergerak dan karena itu tidak boleh dihapus — sejarahnya nyata. Baris
 * `cost_adjust` tidak mencatat peristiwa apa pun: ia HASIL HITUNGAN dokumen
 * ini, dan dokumen yang batal tidak meninggalkan hitungan.
 *
 * Jurnalnya berbeda dan diperlakukan berbeda: ia sudah TERBIT, jadi ia dibalik
 * (`unpostForSource`), tidak dihapus.
 */
export async function deleteLandedCostInTx(tx: Tx, id: number) {
  const doc = await tx.landedCostDocument.findUnique({
    where: { id },
    include: { items: { select: { adjustmentMovementId: true } } },
  });
  if (!doc) return null;

  /* Dua tanggal, dua penjaga. Tanggal DOKUMEN: barisnya hidup di sana. Tanggal
     HARI INI: jurnal pembaliknya akan terbit di sana. Membalik dokumen bulan
     lalu ke bulan yang juga sudah dikunci tetap harus ditolak. */
  await assertPeriodOpen(doc.date, tx);

  await unpostForSource({ sourceType: "landed_cost", sourceId: doc.id, tx });

  const movementIds = doc.items
    .map((i) => i.adjustmentMovementId)
    .filter((v): v is number => v != null);
  if (movementIds.length > 0) {
    await tx.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
  }
  await tx.landedCostDocument.delete({ where: { id: doc.id } });
  return doc;
}
