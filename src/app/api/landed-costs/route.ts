/**
 * Dokumen biaya impor (issue #495 butir 1) — daftar, bahan formulir, dan simpan.
 *
 * Route ini TIDAK memuat satu pun aturan akuntansi. Semuanya ada di
 * `lib/landed-cost.ts` (aritmetikanya, murni & teruji tanpa basis data) dan
 * `lib/landed-cost-data.ts` (urutan tulisnya). Yang di sini hanya HTTP: izin,
 * zod, transaksi, jejak audit, dan penerjemahan galat.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { landedCostSchema } from "@/lib/validations/landed-cost";
import {
  createLandedCostInTx,
  listReceiptCandidates,
  onHandByItem,
  LandedCostError,
} from "@/lib/landed-cost-data";
import { PICKER_DEFAULT_TAKE, PICKER_MAX_TAKE, type PickerOption } from "@/lib/picker";
import { toBase } from "@/lib/receivables";

/** Rentang bawaan pemilih penerimaan: 180 hari ke belakang. Satu kontainer
 *  jarang menunggu tagihannya lebih lama dari itu, dan rentang tak berbatas
 *  memuat seluruh riwayat stok ke dalam satu layar. */
const DEFAULT_RANGE_DAYS = 180;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const result = await requireApiPermission("landed_cost.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);

  // ── Detail satu tagihan: berapa RUPIAH yang akan disebar ─────────────────
  // Layar butuh angka ini untuk memperlihatkan pembagiannya sebelum disimpan.
  // Ia diturunkan di server dengan `toBase` yang sama dengan yang dipakai daftar
  // Utang — bukan dihitung ulang di peramban dari `amount × rate`, yang akan
  // berselisih dengan buku pada baris valas yang menyimpan `base_amount` sendiri.
  const purchaseIdParam = searchParams.get("purchaseId");
  if (purchaseIdParam) {
    const purchaseId = parseInt(purchaseIdParam, 10);
    if (!Number.isInteger(purchaseId)) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
    }
    const purchase = await prisma.supplierTransaction.findFirst({
      where: { id: purchaseId, type: "purchase" },
      include: { supplier: { select: { name: true } }, landedCost: { select: { id: true } } },
    });
    if (!purchase) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.purchaseNotFound") }, { status: 404 });
    }
    return NextResponse.json({
      id: purchase.id,
      date: purchase.date,
      currency: purchase.currency,
      supplier: purchase.supplier?.name ?? null,
      /* `null` = valas tanpa kurs. Dinyatakan sebagai KETIADAAN, tidak pernah
         dibulatkan diam-diam jadi nol — nol akan menyebar "tidak ada biaya"
         dengan sangat meyakinkan. */
      amount: toBase({
        amount: purchase.amount,
        currency: purchase.currency,
        rate: purchase.rate,
        baseAmount: purchase.baseAmount,
      }),
      alreadySpread: purchase.landedCost != null,
    });
  }

  // ── Pemilih tagihan: pembelian yang BELUM pernah disebar ──────────────────
  // `landedCost: null` ada di kueri, bukan cuma di penjaga tulis: menawarkan
  // tagihan yang sudah disebar berarti menawarkan satu-satunya tindakan yang
  // pasti ditolak, dan pengguna tidak bisa melihat sebabnya dari daftar.
  if (searchParams.has("searchPurchase")) {
    const search = (searchParams.get("searchPurchase") ?? "").trim();
    const rawTake = parseInt(searchParams.get("take") ?? "", 10);
    const take =
      Number.isFinite(rawTake) && rawTake > 0
        ? Math.min(rawTake, PICKER_MAX_TAKE)
        : PICKER_DEFAULT_TAKE;
    const idMatch = /^(?:trx-?)?(\d+)$/i.exec(search);
    const purchases = await prisma.supplierTransaction.findMany({
      where: {
        type: "purchase",
        isOpening: false,
        landedCost: null,
        ...(search
          ? {
              OR: [
                ...(idMatch ? [{ id: parseInt(idMatch[1], 10) }] : []),
                { supplier: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      orderBy: { date: "desc" },
      take,
      select: {
        id: true,
        date: true,
        currency: true,
        amount: true,
        supplier: { select: { name: true } },
      },
    });
    return NextResponse.json({
      options: purchases.map((p) => ({
        value: String(p.id),
        label: `TRX-${p.id} · ${p.supplier?.name ?? "—"} · ${p.date.toISOString().slice(0, 10)}`,
        hint: `${p.currency || "IDR"} ${Number(p.amount).toFixed(2)}`,
      })),
    } satisfies { options: PickerOption[] });
  }

  // ── Bahan formulir: penerimaan yang bisa ditumpangi + saldo barangnya ─────
  // Saldo ikut supaya layar bisa memperlihatkan pembagiannya memakai MESIN YANG
  // SAMA (`planLandedCost`) dengan yang akan menulisnya. Pratinjau yang dihitung
  // dengan rumus kedua adalah pratinjau yang suatu hari berbeda dari hasilnya.
  const to = parseDate(searchParams.get("to")) ?? new Date();
  const from =
    parseDate(searchParams.get("from")) ??
    new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const asOf = parseDate(searchParams.get("asOf")) ?? to;
  const itemIdParam = parseInt(searchParams.get("itemId") ?? "", 10);

  const candidates = await listReceiptCandidates({
    from,
    to,
    itemId: Number.isInteger(itemIdParam) ? itemIdParam : null,
  });
  const onHand = await onHandByItem([...new Set(candidates.map((c) => c.itemId))], asOf, prisma);

  return NextResponse.json({
    candidates,
    onHand: Object.fromEntries(onHand),
  });
}

export async function POST(request: Request) {
  const result = await requireApiPermission("landed_cost.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = landedCostSchema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const input = parsed.data;

  let created;
  try {
    created = await prisma.$transaction((tx) =>
      createLandedCostInTx(tx, {
        purchaseId: input.purchaseId,
        date: new Date(input.date),
        basis: input.basis,
        movementIds: input.movementIds,
        note: input.note,
      })
    );
  } catch (e) {
    /* Penolakan yang punya SEBAB dijawab 400 dengan kalimatnya sendiri — bukan
       500. Semuanya keadaan yang bisa diperbaiki pengguna dari layar yang sama
       (pilih tagihan lain, lengkapi kursnya, pilih penerimaan). */
    if (e instanceof LandedCostError) {
      return NextResponse.json({ error: e.message, code: e.code, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "landed_cost.create",
    entity: "landed_cost",
    entityId: created.document.id,
    details: {
      number: created.document.number,
      purchaseId: input.purchaseId,
      basis: input.basis,
      amount: created.plan.amount,
      capitalized: created.plan.totalCapitalized,
      expensed: created.plan.totalExpensed,
      items: created.plan.lines.length,
    },
    request,
  });

  return NextResponse.json(
    {
      id: created.document.id,
      number: created.document.number,
      amount: created.plan.amount,
      capitalized: created.plan.totalCapitalized,
      expensed: created.plan.totalExpensed,
    },
    { status: 201 }
  );
}
