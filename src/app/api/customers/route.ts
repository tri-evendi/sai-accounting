import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { pickerParams, type PickerOption } from "@/lib/picker";

/**
 * Daftar pelanggan. `?active=1` hanya mengembalikan yang aktif — dipakai pemilih
 * di formulir faktur supaya pelanggan yang sudah dinonaktifkan tidak bisa
 * dipilih untuk dokumen BARU, sementara faktur lama tetap menampilkannya.
 *
 * `?search=&take=&picker=1` (audit: pemilih terpotong) — `search` mencocokkan
 * nama, dapat digabung dengan `active=1`; `picker=1` menjawab `{ options }`
 * untuk `ServerSearchableSelect`. Tanpa parameter baru, respons lama utuh.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("customer.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";
  const { picker, search, take } = pickerParams(searchParams);

  const where =
    activeOnly || search
      ? {
          ...(activeOnly ? { isActive: true } : {}),
          ...(search ? { name: { contains: search } } : {}),
        }
      : undefined;

  if (picker) {
    const customers = await prisma.customer.findMany({
      where,
      // Tanpa kata kunci: yang terbaru dulu (dokumen lama dicari, bukan digulir).
      orderBy: search ? { name: "asc" } : { createdAt: "desc" },
      take,
      select: { id: true, name: true, taxExempt: true },
    });
    const { t } = await getRequestI18n();
    return NextResponse.json({
      options: customers.map((c) => ({
        value: String(c.id),
        label: c.name,
        ...(c.taxExempt ? { hint: t("sales.taxExempt") } : {}),
      })),
    } satisfies { options: PickerOption[] });
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take,
  });

  return NextResponse.json(customers);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("customer.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = customerSchema.safeParse(body);

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

  const customer = await prisma.customer.create({ data: parsed.data });
  return NextResponse.json(customer, { status: 201 });
}
