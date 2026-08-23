/**
 * Bank reconciliation — pure logic (issue #24).
 *
 * These tests pin the behaviour the issue's acceptance criteria describe, with
 * no database in sight:
 *   1. Matching drives the book-vs-statement difference to 0 when fully matched.
 *   2. Unmatched items surface on BOTH sides, and a statement-only item (e.g. a
 *      bank charge) keeps the difference non-zero until resolved.
 *   3. CSV parsing accepts valid rows and rejects malformed ones (never coerces).
 *   4. A locked reconciliation — and a reconciled movement — block casual edits.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeReconciliation,
  canMatch,
  movementSigned,
  assertStatementUnlocked,
  assertMovementEditable,
  isStatementLocked,
  ReconciliationLockedError,
  ReconciledMovementError,
  type ReconItem,
} from "@/lib/reconciliation";

const item = (id: number, amount: number, matched = false): ReconItem => ({
  id,
  amount,
  matched,
});

describe("movementSigned", () => {
  it("is debit − credit (money in positive, out negative)", () => {
    expect(movementSigned({ debit: 100, credit: 0 })).toBe(100);
    expect(movementSigned({ debit: 0, credit: 30 })).toBe(-30);
    expect(movementSigned({ debit: "0", credit: "12.5" })).toBe(-12.5);
  });
});

describe("summarizeReconciliation — difference and completion", () => {
  it("reaches difference 0 and complete=true when everything matches", () => {
    const summary = summarizeReconciliation({
      openingBalance: 0,
      closingBalance: 70,
      book: [item(1, 100, true), item(2, -30, true)],
      statement: [item(11, 100, true), item(12, -30, true)],
    });
    expect(summary.difference).toBe(0);
    expect(summary.unmatchedBook).toHaveLength(0);
    expect(summary.unmatchedStatement).toHaveLength(0);
    expect(summary.complete).toBe(true);
  });

  it("matching progressively reduces the difference to 0", () => {
    const book = [item(1, 100), item(2, -30)];
    const statement = [item(11, 100), item(12, -30)];
    const opening = 0;
    const closing = 70; // statementNet = 70

    // Nothing matched yet: difference is the full statement net movement.
    const none = summarizeReconciliation({ openingBalance: opening, closingBalance: closing, book, statement });
    expect(none.difference).toBe(70);
    expect(none.complete).toBe(false);

    // Match the +100 pair only.
    const partial = summarizeReconciliation({
      openingBalance: opening,
      closingBalance: closing,
      book: [item(1, 100, true), item(2, -30)],
      statement: [item(11, 100, true), item(12, -30)],
    });
    expect(partial.difference).toBe(-30);
    expect(partial.complete).toBe(false);

    // Match everything → 0 and done.
    const full = summarizeReconciliation({
      openingBalance: opening,
      closingBalance: closing,
      book: [item(1, 100, true), item(2, -30, true)],
      statement: [item(11, 100, true), item(12, -30, true)],
    });
    expect(full.difference).toBe(0);
    expect(full.complete).toBe(true);
  });

  it("surfaces unmatched items on BOTH sides", () => {
    const summary = summarizeReconciliation({
      openingBalance: 0,
      closingBalance: 95,
      // Book has a +100 receipt; statement has that plus a −5 bank charge the
      // books never recorded, and is missing a −30 payment still outstanding.
      book: [item(1, 100), item(2, -30)],
      statement: [item(11, 100), item(12, -5)],
    });
    expect(summary.unmatchedBook.map((i) => i.id)).toEqual([1, 2]);
    expect(summary.unmatchedStatement.map((i) => i.id)).toEqual([11, 12]);
    expect(summary.complete).toBe(false);
  });

  it("a statement-only bank charge keeps the difference non-zero", () => {
    // +100 matched on both sides; a −5 charge sits unmatched on the statement.
    const summary = summarizeReconciliation({
      openingBalance: 0,
      closingBalance: 95, // statementNet = 95
      book: [item(1, 100, true)],
      statement: [item(11, 100, true), item(12, -5)],
    });
    expect(summary.matchedBookTotal).toBe(100);
    expect(summary.difference).toBe(-5); // 95 − 100
    expect(summary.unmatchedStatement.map((i) => i.id)).toEqual([12]);
    expect(summary.complete).toBe(false);
  });

  it("a book-only outstanding item leaves difference at 0 but not complete", () => {
    // Statement fully explained by matched book (+100); a −30 book payment has
    // not cleared the bank yet, so it stays unmatched on the book side.
    const summary = summarizeReconciliation({
      openingBalance: 0,
      closingBalance: 100,
      book: [item(1, 100, true), item(2, -30)],
      statement: [item(11, 100, true)],
    });
    expect(summary.difference).toBe(0);
    expect(summary.unmatchedBook.map((i) => i.id)).toEqual([2]);
    expect(summary.complete).toBe(false);
  });
});

describe("canMatch", () => {
  it("matches equal signed amounts, rejects unequal", () => {
    expect(canMatch({ amount: 100 }, { amount: 100 })).toBe(true);
    expect(canMatch({ amount: -30 }, { amount: -30 })).toBe(true);
    expect(canMatch({ amount: 100 }, { amount: -100 })).toBe(false);
    expect(canMatch({ amount: 100 }, { amount: 100.5 })).toBe(false);
  });

  it("tolerates sub-cent rounding noise", () => {
    expect(canMatch({ amount: 100 }, { amount: 100.004 })).toBe(true);
    expect(canMatch({ amount: 100 }, { amount: 100.01 })).toBe(false);
  });
});

describe("lock / edit guards", () => {
  it("blocks match/unmatch on a locked reconciliation", () => {
    expect(isStatementLocked({ status: "locked" })).toBe(true);
    expect(() => assertStatementUnlocked({ status: "locked" })).toThrow(
      ReconciliationLockedError
    );
    expect(() => assertStatementUnlocked({ status: "draft" })).not.toThrow();
  });

  it("blocks casual edits of a reconciled movement", () => {
    expect(() => assertMovementEditable({ reconciled: true })).toThrow(
      ReconciledMovementError
    );
    expect(() => assertMovementEditable({ reconciled: false })).not.toThrow();
  });
});

/*
 * Parser rekening koran PINDAH ke `tests/bank-statement-import.test.ts` (#468).
 *
 * Ia bukan sekadar berpindah berkas: kasus di sini dulu membuktikan parser
 * menerima `date,description,amount` — judul yang tidak dikeluarkan bank mana
 * pun. Penggantinya menguji berkas yang benar-benar keluar dari BCA dsb.,
 * termasuk kedua kelas kesalahan yang tidak pernah menerbitkan galat: arah
 * mutasi dan urutan hari/bulan. Berkas ini kembali fokus pada PENCOCOKAN.
 */
