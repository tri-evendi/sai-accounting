import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET() {
  const result = await requireApiPermission("supplier.read");
  if (!result.authorized) return result.response;

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { transactions: { orderBy: { date: "desc" }, take: 5 } },
  });

  return NextResponse.json(suppliers);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("supplier.write");
  if (!result.authorized) return result.response;

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

  const supplier = await prisma.supplier.create({ data: parsed.data });
  return NextResponse.json(supplier, { status: 201 });
}
