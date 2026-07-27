import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals } from "@/lib/inventory";
import { stockUpdateSchema, itemSchema, itemActiveSchema } from "@/lib/validations/inventory";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * Ringkasan stok per barang. `?active=1` membuang barang yang dinonaktifkan —
 * dipakai PEMILIH di formulir pergerakan stok, supaya barang yang sudah tidak
 * dipakai lagi tak bisa dipilih untuk gerakan BARU.
 *
 * Tanpa parameter itu jawabannya tetap SEMUA barang, termasuk yang nonaktif.
 * Sengaja: laporan stok harus menyebut setiap barang yang masih menyimpan
 * saldo. Menonaktifkan barang berarti "jangan tawarkan lagi", bukan "anggap
 * stoknya nol" — menyembunyikannya dari laporan justru akan menghilangkan
 * persediaan yang secara fisik masih ada di gudang.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("inventory.read"); // all roles can view inventory
  if (!result.authorized) return result.response;

  const activeOnly = new URL(request.url).searchParams.get("active") === "1";

  const items = await prisma.item.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: {
      stockMovements: { orderBy: { date: "desc" } },
    },
  });

  const inventory = items.map((item) => {
    const totals = calculateStockTotals(item.stockMovements);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      isActive: item.isActive,
      ...totals,
      lastMovement: item.stockMovements[0]?.date || null,
    };
  });

  return NextResponse.json(inventory);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("inventory.write"); // all roles can update inventory
  if (!result.authorized) return result.response;

  const body = await request.json();

  // Create new item
  if (body.action === "create_item") {
    const parsed = itemSchema.safeParse({ name: body.name, unit: body.unit });
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
    const item = await prisma.item.create({ data: parsed.data });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "item.create",
      entity: "item",
      entityId: item.id,
      details: { name: item.name, unit: item.unit },
      request,
    });

    return NextResponse.json(item, { status: 201 });
  }

  // Aktifkan / nonaktifkan barang (docs/DATABASE.md §1.3).
  //
  // Barang TIDAK punya route DELETE, dan itu disengaja: begitu sebuah barang
  // pernah bergerak, menghapusnya akan menghapus gerakannya (FK CASCADE) —
  // artinya menghapus dasar dari HPP dan penilaian persediaan yang sudah masuk
  // ke laporan. Menonaktifkan adalah SATU-SATUNYA cara menyingkirkan barang
  // dari pemilih, dan itu cukup: saldo, riwayat, dan jurnalnya tetap utuh.
  if (body.action === "set_item_active") {
    const parsed = itemActiveSchema.safeParse({ id: body.id, isActive: body.isActive });
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

    const item = await prisma.item.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: parsed.data.isActive ? "item.activate" : "item.deactivate",
      entity: "item",
      entityId: item.id,
      details: { name: item.name, isActive: item.isActive },
      request,
    });

    return NextResponse.json(item);
  }

  // Stock update
  const parsed = stockUpdateSchema.safeParse(body);
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

  const { date, unitCost, ...stockData } = parsed.data;

  if (stockData.type === "out") {
    const item = await prisma.item.findUnique({
      where: { id: stockData.itemId },
      include: { stockMovements: true },
    });
    if (!item) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.inventoryItemNotFound") }, { status: 404 });
    }
    const { currentStock } = calculateStockTotals(item.stockMovements);
    if (currentStock < stockData.quantity) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        {
          error: t("errors.insufficientStock", {
            available: currentStock,
            requested: stockData.quantity,
          }),
        },
        { status: 400 }
      );
    }
  }

  let stock;
  try {
    stock = await prisma.$transaction(async (tx) => {
      const created = await tx.stockMovement.create({
        data: {
          ...stockData,
          date: new Date(date),
          // Cost is captured on the way in and derived on the way out.
          unitCost: stockData.type === "in" ? unitCost : null,
        },
        include: { item: { select: { name: true } } },
      });

      // Only `out` movements post (D: HPP / K: Persediaan); incoming stock is
      // capitalised by the purchase entry. The engine returns null for the rest.
      await postForSource({ sourceType: "stock_movement", sourceId: created.id, tx });
      return created;
    });
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: stockData.type === "in" ? "stock.in" : "stock.out",
    entity: "stock",
    entityId: stock.id,
    details: {
      itemId: stock.itemId,
      itemName: stock.item.name,
      quantity: Number(stock.quantity),
      type: stock.type,
    },
    request,
  });

  return NextResponse.json(stock, { status: 201 });
}
