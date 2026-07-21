/**
 * Setup wizard + Saldo Awal API (issue #20).
 *
 * GET  — everything the wizard needs in one call: whether setup is already done
 *        (and, if so, a read-only summary), plus the pickers (cash/bank accounts,
 *        customers, suppliers) and defaults.
 * POST — run the wizard once: post the balanced opening journal and mark the
 *        company set up. Manager (`bos`) only — it seeds the entire ledger.
 *
 * The opening journal is posted through the normal ledger primitive, so
 * `assertBalanced` and the period lock (#13) apply. Run-once is enforced
 * server-side in `applyOpeningBalances`; a second POST is a 409, not a duplicate.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { setupSchema } from "@/lib/validations/setup";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  applyOpeningBalances,
  getCompanySettings,
  OpeningBalanceError,
  type OpeningBalancesInput,
} from "@/lib/opening-balance";
import { COMPANY_NAME, COMPANY_ADDRESS, CURRENCIES } from "@/lib/constants";

export async function GET() {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const settings = await getCompanySettings();

  const [coaCount, cashAccounts, customers, suppliers] = await Promise.all([
    prisma.account.count({ where: { isActive: true } }),
    prisma.account.findMany({
      where: { type: "cash_bank", isActive: true },
      select: { id: true, code: true, name: true, currency: true },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // On a completed setup, hand back the opening journal for the read-only summary.
  let openingJournal = null;
  if (settings?.isSetup && settings.openingJournalId) {
    openingJournal = await prisma.journal.findUnique({
      where: { id: settings.openingJournalId },
      include: { lines: { include: { account: true } } },
    });
  }

  return NextResponse.json({
    isSetup: !!settings?.isSetup,
    settings,
    openingJournal,
    defaults: {
      name: settings?.name ?? COMPANY_NAME,
      address: settings?.address ?? COMPANY_ADDRESS,
      baseCurrency: settings?.baseCurrency ?? "IDR",
    },
    currencies: CURRENCIES,
    coaCount,
    cashAccounts,
    customers,
    suppliers,
  });
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { company, cash, receivables, payables, inventory } = parsed.data;

  // Partner names for the AR/AP line memos come from the DB, not the client.
  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  for (const r of receivables) {
    if (!customerName.has(r.partnerId)) {
      return NextResponse.json(
        { error: `Pelanggan #${r.partnerId} tidak ditemukan.` },
        { status: 400 }
      );
    }
  }
  for (const p of payables) {
    if (!supplierName.has(p.partnerId)) {
      return NextResponse.json(
        { error: `Supplier #${p.partnerId} tidak ditemukan.` },
        { status: 400 }
      );
    }
  }

  const input: OpeningBalancesInput = {
    company: {
      name: company.name,
      address: company.address ?? null,
      baseCurrency: company.baseCurrency,
      fiscalYearStart: new Date(company.fiscalYearStart),
      npwp: company.npwp ?? null,
      taxName: company.taxName ?? null,
      taxAddress: company.taxAddress ?? null,
    },
    cash: cash.map((c) => ({
      accountId: c.accountId,
      currency: c.currency,
      amount: c.amount,
      rate: c.rate,
    })),
    receivables: receivables.map((r) => ({
      partnerId: r.partnerId,
      partnerName: customerName.get(r.partnerId)!,
      currency: r.currency,
      amount: r.amount,
      rate: r.rate,
    })),
    payables: payables.map((p) => ({
      partnerId: p.partnerId,
      partnerName: supplierName.get(p.partnerId)!,
      currency: p.currency,
      amount: p.amount,
      rate: p.rate,
    })),
    inventory,
  };

  try {
    const applied = await applyOpeningBalances(input);

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "setup.create",
      entity: "company_settings",
      entityId: applied.settingId,
      details: {
        journalNumber: applied.journalNumber,
        equityPlug: applied.equityPlug,
        fiscalYearStart: company.fiscalYearStart,
      },
      request,
    });

    return NextResponse.json({ ok: true, ...applied }, { status: 201 });
  } catch (e) {
    // Run-once conflict: the wizard has already been completed. 409, not 422 —
    // the payload is fine, the operation is simply no longer available.
    if (e instanceof OpeningBalanceError) {
      return NextResponse.json({ error: e.message, code: "already_setup" }, { status: 409 });
    }
    // Missing mapping, unbalanced, closed period, … → 422 with the not-saved notice.
    return handlePostingError(e);
  }
}
