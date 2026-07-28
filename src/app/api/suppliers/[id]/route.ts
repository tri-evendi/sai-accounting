import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(id) },
    include: { transactions: { orderBy: { date: "desc" } } },
  });

  if (!supplier) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.supplierNotFound") }, { status: 404 });
  }

  return NextResponse.json(supplier);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);

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

  const supplier = await prisma.supplier.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json(supplier);
}

/**
 * Master data TIDAK dihapus begitu direferensikan (docs/DATABASE.md §1.3) —
 * pemasok yang masih punya transaksi atau uang muka DINONAKTIFKAN
 * (`is_active = false`): ia hilang dari pemilih, tapi setiap pembelian,
 * pembayaran, dan jurnal tetap bisa menyebut namanya. Hanya pemasok yang belum
 * pernah dipakai yang benar-benar dihapus. Pola yang sama dengan `consignees`.
 *
 * KENAPA INI PERBAIKAN, BUKAN SEKADAR KERAPIAN: FK `supplier_transactions`
 * memakai ON DELETE CASCADE. Versi sebelumnya menghapus barisnya, jadi
 * "menghapus satu pemasok" berarti MENGHAPUS SELURUH riwayat pembeliannya dan
 * membalik jurnal yang sudah diposting — kerugian data permanen yang dipicu
 * satu klik, dan persis yang dilarang standarnya.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const [transactions, advances] = await Promise.all([
    prisma.supplierTransaction.count({ where: { supplierId } }),
    prisma.advancePayment.count({ where: { supplierId } }),
  ]);

  if (transactions > 0 || advances > 0) {
    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, deactivated: true, supplier });
  }

  await prisma.supplier.delete({ where: { id: supplierId } });
  return NextResponse.json({ success: true, deactivated: false });
}
