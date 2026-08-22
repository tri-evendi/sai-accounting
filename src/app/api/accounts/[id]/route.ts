import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { normalBalanceFor, resolveExpenseNature } from "@/lib/accounting";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id: parseInt(id) },
    include: { parent: true, children: { orderBy: { code: "asc" } } },
  });

  if (!account) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.accountNotFound") }, { status: 404 });
  }

  return NextResponse.json(account);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const accountId = parseInt(id);
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

  // An account cannot be its own parent.
  if (parentId === accountId) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.accountOwnParent") }, { status: 400 });
  }

  // ...nor a DESCENDANT of itself: A→B→A detaches the whole branch from the
  // null root, and the Chart of Accounts (rendered from that root) silently
  // loses every account in the loop. Walk the candidate parent's ancestor
  // chain; if it passes through this account, refuse.
  if (parentId != null) {
    let cursor: number | null = parentId;
    const seen = new Set<number>();
    while (cursor != null && !seen.has(cursor)) {
      if (cursor === accountId) {
        const { t } = await getRequestI18n();
        return NextResponse.json({ error: t("errors.accountParentCycle") }, { status: 400 });
      }
      seen.add(cursor);
      const parent: { parentId: number | null } | null = await prisma.account.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  try {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        code,
        name,
        type,
        currency,
        parentId: parentId ?? null,
        normalBalance: normalBalanceFor(type),
        expenseNature: resolveExpenseNature(type, expenseNature),
        ...(isActive === undefined ? {} : { isActive }),
      },
    });
    return NextResponse.json(account);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.accountCodeTaken") }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const accountId = parseInt(id);

  // Never orphan children or break references: deactivate instead of hard-deleting when in use.
  const childCount = await prisma.account.count({ where: { parentId: accountId } });
  if (childCount > 0) {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: { isActive: false },
    });
    return NextResponse.json({ deactivated: true, reason: "has_children", account });
  }

  try {
    await prisma.account.delete({ where: { id: accountId } });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    // FK constraint (referenced by future journal lines, etc.) -> deactivate instead.
    if ((e as { code?: string }).code === "P2003") {
      const account = await prisma.account.update({
        where: { id: accountId },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: true, reason: "referenced", account });
    }
    throw e;
  }
}
