/**
 * Saldo Awal / opening balances (issue #20) — orchestration.
 *
 * Turns the setup wizard's opening balances into ONE balanced opening journal
 * and marks the company set up, atomically and exactly once. The balancing math
 * lives in a PURE helper (`buildOpeningBalanceLines` in `@/lib/posting/rules`);
 * this module only resolves account ids from the mappings, posts through the
 * same `postJournal` every other write funnels through (so the period lock #13
 * and `assertBalanced` apply unchanged), and enforces run-once.
 *
 * ── RUN-ONCE ────────────────────────────────────────────────────────────────
 * Two guards, both checked INSIDE the transaction so they see the same snapshot
 * as the write:
 *   1. `company_settings.is_setup` — the flag the wizard flips.
 *   2. a live `journals.source_type = "opening_balance"` — the authoritative
 *      one. Even if the flag were somehow reset, a second opening journal is
 *      refused, so the ledger can never carry two.
 *
 * ── PER-CUSTOMER / PER-SUPPLIER AR/AP ───────────────────────────────────────
 * Each receivable/payable is one journal line into the currency's AR/AP control
 * account (resolved via `ar_default`/`ap_default`), carrying the partner's name
 * in `memo`. That reflects the totals in the Neraca (control-account balance)
 * and Neraca Saldo. Note: the Piutang/Utang AGING sub-ledger reads source
 * documents (invoices/purchases), not journal lines, so opening balances entered
 * here do not appear as aged open documents there — capturing that would mean
 * creating opening invoice/purchase records (an ETL concern, see the issue).
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { postJournal } from "@/lib/ledger";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import {
  buildOpeningBalanceLines,
  openingEquityPlug,
  type OpeningBalanceLine,
} from "@/lib/posting/rules";

/** `journals.source_type` tag for the opening journal — the run-once authority. */
export const OPENING_BALANCE_SOURCE = "opening_balance";

/** Raised when the wizard is run a second time, or with nothing to post. */
export class OpeningBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpeningBalanceError";
  }
}

type Client = typeof prisma | Prisma.TransactionClient;

/**
 * Run-once guard, as a pure function so the rule is unit-testable without a DB.
 *
 * Refuses a second setup on EITHER signal: the `is_setup` flag, or the presence
 * of a live `opening_balance` journal. The journal is the stronger of the two —
 * even if the flag were reset, a second opening journal is still refused, so the
 * ledger can never carry two.
 */
export function assertCanRunSetup(opts: {
  isSetup: boolean;
  liveOpeningJournals: number;
}): void {
  if (opts.isSetup) {
    throw new OpeningBalanceError(
      "Perusahaan sudah selesai setup. Wizard saldo awal hanya bisa dijalankan sekali."
    );
  }
  if (opts.liveOpeningJournals > 0) {
    throw new OpeningBalanceError(
      "Jurnal pembuka (saldo awal) sudah pernah dibuat. Tidak dapat membuat yang kedua."
    );
  }
}

/** One opening cash/bank balance — the user picks a specific cash_bank account. */
export interface OpeningCashInput {
  accountId: number;
  currency: string;
  amount: number;
  /** Rate to IDR; required (and > 0) for a non-IDR balance. */
  rate?: number | null;
}

/** One opening receivable/payable, per partner (customer or supplier). */
export interface OpeningPartnerInput {
  partnerId: number;
  partnerName: string;
  currency: string;
  amount: number;
  rate?: number | null;
}

export interface OpeningBalancesInput {
  company: {
    name: string;
    address?: string | null;
    baseCurrency: string;
    fiscalYearStart: Date;
  };
  cash: OpeningCashInput[];
  receivables: OpeningPartnerInput[];
  payables: OpeningPartnerInput[];
  /** Persediaan awal, in IDR base. */
  inventory?: number | null;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** IDR is always 1; a foreign balance needs a positive rate or we refuse to guess. */
function rateFor(currency: string, rate?: number | null): number {
  if (currency === "IDR") return 1;
  if (rate != null && rate > 0) return rate;
  throw new OpeningBalanceError(
    `Kurs untuk saldo awal mata uang ${currency} wajib diisi. ` +
      `Jurnal pembuka tidak diposting agar nilai IDR tidak salah.`
  );
}

/** The singleton company settings row, or null before the wizard has ever run. */
export async function getCompanySettings(client: Client = prisma) {
  return client.companySetting.findFirst({ orderBy: { id: "asc" } });
}

/** Has the setup wizard completed? */
export async function isSetupComplete(client: Client = prisma): Promise<boolean> {
  const s = await getCompanySettings(client);
  return !!s?.isSetup;
}

/**
 * Resolve the wizard's opening balances into pure `OpeningBalanceLine`s.
 * Exported so the API/preview and the poster share one translation.
 */
async function resolveOpeningLines(
  input: OpeningBalancesInput,
  client: Client
): Promise<OpeningBalanceLine[]> {
  const lines: OpeningBalanceLine[] = [];

  // Kas/Bank — assets. The user picked a concrete cash_bank account, so no
  // mapping lookup: the account id is used directly.
  for (const c of input.cash) {
    const amount = num(c.amount);
    if (amount <= 0) continue;
    lines.push({
      accountId: c.accountId,
      side: "debit",
      amount,
      currency: c.currency,
      rate: rateFor(c.currency, c.rate),
      memo: "Saldo awal kas/bank",
    });
  }

  // Piutang — assets, one line per customer into the currency's AR account.
  for (const r of input.receivables) {
    const amount = num(r.amount);
    if (amount <= 0) continue;
    const accountId = await resolveAccountId(MAPPING_KEYS.AR_DEFAULT, r.currency, client);
    lines.push({
      accountId,
      side: "debit",
      amount,
      currency: r.currency,
      rate: rateFor(r.currency, r.rate),
      memo: `Piutang awal — ${r.partnerName}`,
    });
  }

  // Persediaan — asset, IDR base.
  const inventory = num(input.inventory);
  if (inventory > 0) {
    const accountId = await resolveAccountId(MAPPING_KEYS.INVENTORY, "IDR", client);
    lines.push({
      accountId,
      side: "debit",
      amount: inventory,
      currency: "IDR",
      rate: 1,
      memo: "Persediaan awal",
    });
  }

  // Utang — liabilities, one line per supplier into the currency's AP account.
  for (const p of input.payables) {
    const amount = num(p.amount);
    if (amount <= 0) continue;
    const accountId = await resolveAccountId(MAPPING_KEYS.AP_DEFAULT, p.currency, client);
    lines.push({
      accountId,
      side: "credit",
      amount,
      currency: p.currency,
      rate: rateFor(p.currency, p.rate),
      memo: `Hutang awal — ${p.partnerName}`,
    });
  }

  return lines;
}

/** Server-authoritative preview: the Modal/Ekuitas balancing figure (IDR base). */
export async function previewOpeningEquity(
  input: OpeningBalancesInput,
  client: Client = prisma
): Promise<number> {
  const lines = await resolveOpeningLines(input, client);
  return openingEquityPlug(lines);
}

export interface ApplyResult {
  settingId: number;
  journalId: number;
  journalNumber: string;
  equityPlug: number;
}

/**
 * Run the wizard: post the opening journal and mark the company set up, once.
 * Everything happens in one transaction — a failed/unbalanced journal rolls the
 * setup back, and the run-once guards are read inside it.
 */
export async function applyOpeningBalances(
  input: OpeningBalancesInput
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    // ── Run-once guards (both read inside the transaction) ──
    const existing = await getCompanySettings(tx);
    const liveOpening = await tx.journal.findMany({
      where: {
        sourceType: OPENING_BALANCE_SOURCE,
        isReversed: false,
        type: { not: "reversal" },
      },
    });
    assertCanRunSetup({
      isSetup: !!existing?.isSetup,
      liveOpeningJournals: liveOpening.length,
    });

    // The settings row is the opening journal's `source_id`, so it must exist
    // first — create/reuse the singleton before posting.
    const setting = existing
      ? existing
      : await tx.companySetting.create({
          data: {
            name: input.company.name,
            address: input.company.address ?? null,
            baseCurrency: input.company.baseCurrency,
            fiscalYearStart: input.company.fiscalYearStart,
            isSetup: false,
          },
        });

    const lines = await resolveOpeningLines(input, tx);
    if (lines.length === 0) {
      throw new OpeningBalanceError(
        "Tidak ada saldo awal untuk dicatat. Isi minimal satu saldo (kas, piutang, utang, atau persediaan)."
      );
    }

    const equityAccountId = await resolveAccountId(MAPPING_KEYS.OPENING_EQUITY, "IDR", tx);
    const equityPlug = openingEquityPlug(lines);
    const journalLines = buildOpeningBalanceLines({
      lines,
      equityAccountId,
      equityMemo: "Modal/Ekuitas — saldo awal",
    });

    // Post through the same primitive as every other write: assertBalanced and
    // the period lock (#13) both apply here, unbypassed.
    const journal = await postJournal(
      {
        date: input.company.fiscalYearStart,
        type: "general",
        note: "Saldo Awal (jurnal pembuka)",
        sourceType: OPENING_BALANCE_SOURCE,
        sourceId: setting.id,
        lines: journalLines,
      },
      tx
    );

    const saved = await tx.companySetting.update({
      where: { id: setting.id },
      data: {
        name: input.company.name,
        address: input.company.address ?? null,
        baseCurrency: input.company.baseCurrency,
        fiscalYearStart: input.company.fiscalYearStart,
        isSetup: true,
        openingJournalId: journal.id,
      },
    });

    return {
      settingId: saved.id,
      journalId: journal.id,
      journalNumber: journal.number,
      equityPlug,
    };
  });
}
