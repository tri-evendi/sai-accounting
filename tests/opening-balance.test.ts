/**
 * Saldo Awal / opening balances (issue #20).
 *
 * The balancing math is a PURE helper (`buildOpeningBalanceLines` /
 * `openingEquityPlug`), so most of this needs no database: it drives the builder
 * and checks the produced journal balances on IDR base through the very same
 * `prepareLines`/`assertBalanced` production posting uses. The fake client covers
 * the one path that touches posting (the opening journal lands with
 * `source_type = "opening_balance"`, which is what the run-once guard keys on).
 */
import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  prepareLines,
  postJournal,
  UnbalancedJournalError,
  type JournalLineInput,
} from "@/lib/ledger";
import {
  buildOpeningBalanceLines,
  openingEquityPlug,
  PostingRuleError,
  type OpeningBalanceLine,
} from "@/lib/posting/rules";
import {
  assertCanRunSetup,
  OpeningBalanceError,
  OPENING_BALANCE_SOURCE,
} from "@/lib/opening-balance";
import { createFakeClient } from "./fake-client";

// Stand-in account ids; the real ones come from account_mappings at runtime.
const KAS = 10;
const AR_IDR = 11;
const AR_USD = 12;
const PERSEDIAAN = 13;
const AP_IDR = 20;
const MODAL = 30;

function baseTotals(lines: JournalLineInput[]) {
  const prepared = prepareLines(lines);
  const debit = prepared.reduce((s, l) => s + l.baseDebit, 0);
  const credit = prepared.reduce((s, l) => s + l.baseCredit, 0);
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
}

/** The single Modal/Ekuitas line the builder emitted (or undefined if none). */
function modalLine(lines: JournalLineInput[]) {
  return lines.find((l) => l.accountId === MODAL);
}

describe("opening-balance builder — balanced by construction (assets = liabilities + equity)", () => {
  it("balances an IDR-only set and books the equity plug on the credit side", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: KAS, side: "debit", amount: 100_000_000, currency: "IDR", rate: 1 },
      { accountId: AR_IDR, side: "debit", amount: 50_000_000, currency: "IDR", rate: 1 },
      { accountId: PERSEDIAAN, side: "debit", amount: 30_000_000, currency: "IDR", rate: 1 },
      { accountId: AP_IDR, side: "credit", amount: 40_000_000, currency: "IDR", rate: 1 },
    ];
    // assets 180.000.000 − liabilities 40.000.000 = 140.000.000 → CREDIT Modal
    expect(openingEquityPlug(lines)).toBe(140_000_000);

    const journal = buildOpeningBalanceLines({ lines, equityAccountId: MODAL });
    const modal = modalLine(journal);
    expect(modal?.credit).toBe(140_000_000);
    expect(modal?.debit).toBeUndefined();

    const { debit, credit } = baseTotals(journal);
    expect(debit).toBe(credit);
    expect(() => assertBalanced(prepareLines(journal))).not.toThrow();
  });

  it("books the plug on the DEBIT side when liabilities exceed assets (negative equity)", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: KAS, side: "debit", amount: 100_000_000, currency: "IDR", rate: 1 },
      { accountId: AP_IDR, side: "credit", amount: 150_000_000, currency: "IDR", rate: 1 },
    ];
    expect(openingEquityPlug(lines)).toBe(-50_000_000);

    const journal = buildOpeningBalanceLines({ lines, equityAccountId: MODAL });
    const modal = modalLine(journal);
    expect(modal?.debit).toBe(50_000_000);
    expect(modal?.credit).toBeUndefined();
    expect(() => assertBalanced(prepareLines(journal))).not.toThrow();
  });

  it("emits NO modal line when assets and liabilities already net to zero equity", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: KAS, side: "debit", amount: 40_000_000, currency: "IDR", rate: 1 },
      { accountId: AP_IDR, side: "credit", amount: 40_000_000, currency: "IDR", rate: 1 },
    ];
    expect(openingEquityPlug(lines)).toBe(0);
    const journal = buildOpeningBalanceLines({ lines, equityAccountId: MODAL });
    expect(modalLine(journal)).toBeUndefined();
    expect(() => assertBalanced(prepareLines(journal))).not.toThrow();
  });
});

describe("opening-balance builder — currency discipline", () => {
  it("values a foreign balance at rate → IDR base and balances the entry", () => {
    // USD 10.000 @ 15.000 = Rp 150.000.000 receivable, no other lines.
    const lines: OpeningBalanceLine[] = [
      { accountId: AR_USD, side: "debit", amount: 10_000, currency: "USD", rate: 15_000 },
    ];
    expect(openingEquityPlug(lines)).toBe(150_000_000);

    const journal = buildOpeningBalanceLines({ lines, equityAccountId: MODAL });
    // The AR line stays in USD at its rate; the equity plug is IDR base.
    const ar = journal.find((l) => l.accountId === AR_USD);
    expect(ar?.currency).toBe("USD");
    expect(ar?.rate).toBe(15_000);
    expect(modalLine(journal)?.credit).toBe(150_000_000);
    expect(modalLine(journal)?.currency).toBe("IDR");

    const { debit, credit } = baseTotals(journal);
    expect(debit).toBe(credit);
    expect(() => assertBalanced(prepareLines(journal))).not.toThrow();
  });

  it("refuses an unrated foreign balance rather than valuing it 1:1", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: AR_USD, side: "debit", amount: 10_000, currency: "USD", rate: 0 },
    ];
    expect(() => buildOpeningBalanceLines({ lines, equityAccountId: MODAL })).toThrow(
      PostingRuleError
    );
  });

  it("never sums two currencies in their own units — only in IDR base", () => {
    // Rp 100.000.000 kas + USD 1.000 @ 15.000 (= Rp 15.000.000) = Rp 115.000.000 assets.
    const lines: OpeningBalanceLine[] = [
      { accountId: KAS, side: "debit", amount: 100_000_000, currency: "IDR", rate: 1 },
      { accountId: AR_USD, side: "debit", amount: 1_000, currency: "USD", rate: 15_000 },
    ];
    expect(openingEquityPlug(lines)).toBe(115_000_000);
  });
});

describe("opening-balance builder — refusals", () => {
  it("refuses an empty set", () => {
    expect(() => buildOpeningBalanceLines({ lines: [], equityAccountId: MODAL })).toThrow(
      PostingRuleError
    );
  });

  it("refuses a non-positive balance", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: KAS, side: "debit", amount: 0, currency: "IDR", rate: 1 },
    ];
    expect(() => buildOpeningBalanceLines({ lines, equityAccountId: MODAL })).toThrow(
      PostingRuleError
    );
  });

  it("refuses using the equity account as an asset/liability line", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: MODAL, side: "debit", amount: 1_000, currency: "IDR", rate: 1 },
    ];
    expect(() => buildOpeningBalanceLines({ lines, equityAccountId: MODAL })).toThrow(
      PostingRuleError
    );
  });
});

describe("opening journal — unbalanced input is refused before save", () => {
  it("assertBalanced (the save-path guard) rejects a hand-made unbalanced entry", () => {
    // If anything ever bypassed the plug and produced Σdebit ≠ Σcredit, the ledger
    // primitive every save funnels through still refuses it.
    const lines: JournalLineInput[] = [
      { accountId: KAS, debit: 100, currency: "IDR", rate: 1 },
      { accountId: MODAL, credit: 90, currency: "IDR", rate: 1 },
    ];
    expect(() => assertBalanced(prepareLines(lines))).toThrow(UnbalancedJournalError);
  });
});

describe("run-once — prevents a second opening journal", () => {
  it("assertCanRunSetup allows the first run and refuses every later one", () => {
    // First run: nothing set up, no opening journal yet.
    expect(() => assertCanRunSetup({ isSetup: false, liveOpeningJournals: 0 })).not.toThrow();
    // is_setup already true.
    expect(() => assertCanRunSetup({ isSetup: true, liveOpeningJournals: 0 })).toThrow(
      OpeningBalanceError
    );
    // Flag reset but a live opening journal exists — still refused (the stronger guard).
    expect(() => assertCanRunSetup({ isSetup: false, liveOpeningJournals: 1 })).toThrow(
      OpeningBalanceError
    );
  });

  it("a posted opening journal is discoverable by the run-once query", async () => {
    const client = createFakeClient({ periods: [] });
    const lines = buildOpeningBalanceLines({
      lines: [
        { accountId: KAS, side: "debit", amount: 10_000_000, currency: "IDR", rate: 1 },
        { accountId: AP_IDR, side: "credit", amount: 4_000_000, currency: "IDR", rate: 1 },
      ],
      equityAccountId: MODAL,
    });
    await postJournal(
      {
        date: new Date("2026-01-01"),
        type: "general",
        note: "Saldo Awal (jurnal pembuka)",
        sourceType: OPENING_BALANCE_SOURCE,
        sourceId: 1,
        lines,
      },
      client
    );

    const live = await client.journal.findMany({
      where: { sourceType: OPENING_BALANCE_SOURCE, isReversed: false, type: { not: "reversal" } },
    });
    expect(live).toHaveLength(1);
    // Which is exactly what makes a second run refuse.
    expect(() =>
      assertCanRunSetup({ isSetup: false, liveOpeningJournals: live.length })
    ).toThrow(OpeningBalanceError);
  });
});
