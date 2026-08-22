import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { normalBalanceFor, resolveExpenseNature } from "@/lib/accounting";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET() {
  // `core` needs to read the chart of accounts to pick a counter account on the
  // cash form. Writing accounts stays `bos`-only.
  const result = await requireApiPermission("account.read");
  if (!result.authorized) return result.response;

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = accountSchema.safeParse(body);

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

  const { code, name, type, currency, parentId, expenseNature, isActive } = parsed.data;

  try {
    const account = await prisma.account.create({
      data: {
        code,
        name,
        type,
        currency,
        parentId: parentId ?? null,
        normalBalance: normalBalanceFor(type),
        expenseNature: resolveExpenseNature(type, expenseNature),
        isActive: isActive ?? true,
      },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.accountCodeTaken") }, { status: 409 });
    }
    throw e;
  }
}
