/**
 * Target penjualan — upsert one sales target (issue #29).
 *
 * A target is a PLAN, not a ledger entry: no journal is posted. One target per
 * (period, customer, item) combination — because MySQL treats NULLs as distinct
 * in a unique index, a plain `upsert` cannot key on the nullable customer/item,
 * so this find-or-updates by the exact combination (nulls included) to give the
 * same "one row, edited in place" behaviour a full key would. bos-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { salesTargetSchema } from "@/lib/validations/budget";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request) {
  const result = await requireApiPermission("budget.manage");
  if (!result.authorized) return result.response;

  const parsed = salesTargetSchema.safeParse(await request.json());
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
  const { year, month, amount, note } = parsed.data;
  const customerId = parsed.data.customerId ?? null;
  const itemId = parsed.data.itemId ?? null;

  // Referenced master rows must exist (the FK enforces it too, but a clear 400
  // beats a raw constraint error).
  if (customerId !== null) {
    const c = await prisma.customer.count({ where: { id: customerId } });
    if (c === 0) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.customerNotFound") }, { status: 400 });
    }
  }
  if (itemId !== null) {
    const i = await prisma.item.count({ where: { id: itemId } });
    if (i === 0) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.commodityNotFound") }, { status: 400 });
    }
  }

  const existing = await prisma.salesTarget.findFirst({
    where: { year, month, customerId, itemId },
  });

  const target = existing
    ? await prisma.salesTarget.update({
        where: { id: existing.id },
        data: { amount, note: note ?? null },
      })
    : await prisma.salesTarget.create({
        data: { year, month, customerId, itemId, amount, note: note ?? null },
      });

  return NextResponse.json(target, { status: existing ? 200 : 201 });
}
