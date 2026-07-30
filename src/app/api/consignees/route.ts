import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consigneeSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { pickerParams, type PickerOption } from "@/lib/picker";

/**
 * List consignees. `?active=1` returns only active rows — used by the Contract
 * form's searchable select so deactivated masters never appear as choices. The
 * master list page queries Prisma directly and shows inactive rows too.
 *
 * `?search=&take=&picker=1` (audit: pemilih terpotong) — `search` matches the
 * name and composes with `active=1`; `picker=1` answers the `{ options }`
 * contract for `ServerSearchableSelect`. Without the new params the old
 * response is unchanged.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("consignee.read");
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
    const consignees = await prisma.consignee.findMany({
      where,
      // No keyword: newest first (old rows are searched for, not scrolled to).
      orderBy: search ? { name: "asc" } : { createdAt: "desc" },
      take,
      select: { id: true, name: true, country: true },
    });
    return NextResponse.json({
      options: consignees.map((c) => ({
        value: String(c.id),
        label: c.name,
        ...(c.country ? { hint: c.country } : {}),
      })),
    } satisfies { options: PickerOption[] });
  }

  const consignees = await prisma.consignee.findMany({
    where,
    orderBy: { name: "asc" },
    take,
  });

  return NextResponse.json(consignees);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("consignee.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = consigneeSchema.safeParse(body);

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

  const consignee = await prisma.consignee.create({ data: parsed.data });
  return NextResponse.json(consignee, { status: 201 });
}
