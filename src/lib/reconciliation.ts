/**
 * Bank reconciliation — pure logic (issue #24).
 *
 * Everything here is a pure function of its inputs: no Prisma, no I/O. The API
 * routes and the reconciliation page load rows from the database and hand them
 * to these helpers; the helpers decide what matches, what the running difference
 * is, and whether an edit is allowed. That is what makes the matching/difference
 * rules testable without a database (see tests/reconciliation.test.ts).
 *
 * IMPORTANT: reconciliation posts NO journals and moves no money. Matching a book
 * movement to a statement line only records that the two are the same event.
 */

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
export const MONEY_EPSILON = 0.005;

/** Round to 2 decimals (money) to keep sums free of floating-point dust. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Signed value of a book (`cash_movements`) movement:
 *   + = money into the bank (debit), − = money out (credit).
 * This is the unit both sides of a reconciliation are compared in.
 */
export function movementSigned(m: {
  // `unknown` so a Prisma `Decimal` (which `Number()` accepts at runtime) fits
  // without coupling this pure module to the Prisma client types.
  debit: unknown;
  credit: unknown;
}): number {
  return round2(Number(m.debit) - Number(m.credit));
}

/** A row on either side of the reconciliation, reduced to what matching needs. */
export interface ReconItem {
  id: number;
  /** Signed money: + into the bank, − out of the bank. */
  amount: number;
  matched: boolean;
}

export interface ReconciliationInput {
  /** Statement opening balance, in the account's own currency. */
  openingBalance: number;
  /** Statement closing balance, in the account's own currency. */
  closingBalance: number;
  /** Book movements in scope (`cash_movements` rows). */
  book: ReconItem[];
  /** Statement lines (`bank_statement_lines` rows). */
  statement: ReconItem[];
}

export interface ReconciliationSummary {
  openingBalance: number;
  closingBalance: number;
  /** closing − opening: the net movement the statement claims for the period. */
  statementNet: number;
  /** Σ signed amounts of matched book movements. */
  matchedBookTotal: number;
  /** Σ signed amounts of matched statement lines. */
  matchedStatementTotal: number;
  /** Σ signed amounts of ALL book movements in scope. */
  bookTotal: number;
  /** Σ signed amounts of ALL statement lines. */
  statementTotal: number;
  /**
   * The running difference the user drives to zero: `statementNet − matchedBookTotal`.
   * It shrinks as book movements are matched to the statement, and reaches 0 when
   * the matched movements fully account for the statement's net change. A non-zero
   * residual points straight at statement-only items (e.g. a bank charge the books
   * have not recorded yet).
   */
  difference: number;
  /** Book movements with no matching statement line (outstanding / uncleared). */
  unmatchedBook: ReconItem[];
  /** Statement lines with no matching book movement (charges, interest, errors). */
  unmatchedStatement: ReconItem[];
  /** True only when nothing is unmatched on either side AND `difference` is ~0. */
  complete: boolean;
}

function sumSigned(items: ReconItem[]): number {
  return round2(items.reduce((s, i) => s + i.amount, 0));
}

/**
 * Reduce a reconciliation to its totals, difference and the two unmatched lists.
 *
 * Completion is deliberately strict — `difference ≈ 0` is not enough on its own,
 * because a book-only outstanding item leaves the difference at 0 yet the period
 * is not truly reconciled. Both unmatched lists must be empty as well.
 */
export function summarizeReconciliation(
  input: ReconciliationInput
): ReconciliationSummary {
  const matchedBook = input.book.filter((i) => i.matched);
  const matchedStatement = input.statement.filter((i) => i.matched);
  const unmatchedBook = input.book.filter((i) => !i.matched);
  const unmatchedStatement = input.statement.filter((i) => !i.matched);

  const statementNet = round2(input.closingBalance - input.openingBalance);
  const matchedBookTotal = sumSigned(matchedBook);
  const difference = round2(statementNet - matchedBookTotal);

  const complete =
    unmatchedBook.length === 0 &&
    unmatchedStatement.length === 0 &&
    Math.abs(difference) < MONEY_EPSILON;

  return {
    openingBalance: round2(input.openingBalance),
    closingBalance: round2(input.closingBalance),
    statementNet,
    matchedBookTotal,
    matchedStatementTotal: sumSigned(matchedStatement),
    bookTotal: sumSigned(input.book),
    statementTotal: sumSigned(input.statement),
    difference,
    unmatchedBook,
    unmatchedStatement,
    complete,
  };
}

/**
 * Two rows are matchable when the same money moved: their signed amounts are
 * equal within rounding noise. Dates and descriptions are hints for the user,
 * never a hard gate — banks and books word the same event differently.
 */
export function canMatch(
  book: { amount: number },
  line: { amount: number }
): boolean {
  return Math.abs(book.amount - line.amount) < MONEY_EPSILON;
}

// ─── Lock / edit guards ─────────────────────────────────────────────────────

/** Thrown when a match/unmatch is attempted on a locked reconciliation. */
export class ReconciliationLockedError extends Error {
  constructor(
    message = "Rekonsiliasi periode ini sudah dikunci. Buka kembali (reopen) sebelum mengubah kecocokan."
  ) {
    super(message);
    this.name = "ReconciliationLockedError";
  }
}

/** Thrown when a reconciled book movement is edited without reopening first. */
export class ReconciledMovementError extends Error {
  constructor(
    message = "Transaksi sudah direkonsiliasi. Buka rekonsiliasi terkait sebelum mengubah atau menghapus transaksi ini."
  ) {
    super(message);
    this.name = "ReconciledMovementError";
  }
}

/** A reconciliation is editable only while `draft`; `locked` blocks changes. */
export function isStatementLocked(s: { status: string }): boolean {
  return s.status === "locked";
}

/** Guard: refuse to match/unmatch when the reconciliation is locked. */
export function assertStatementUnlocked(s: { status: string }): void {
  if (isStatementLocked(s)) throw new ReconciliationLockedError();
}

/**
 * Guard: refuse to casually edit/delete a book movement that has been
 * reconciled. The reconciliation must be reopened first, which clears the flag.
 */
export function assertMovementEditable(m: { reconciled: boolean }): void {
  if (m.reconciled) throw new ReconciledMovementError();
}

/*
 * ── Impor rekening koran: PINDAH ke `lib/import/bank-statement.ts` (#468) ────
 *
 * Parsernya dulu tinggal di sini. Ia pindah ketika pemetaan judulnya dibangun
 * ulang di atas `lib/import/spec.ts` (alias judul, kolom asing diabaikan) —
 * tempatnya memang di sebelah lima pengimpor lain yang memakai inti yang sama,
 * bukan di modul yang tugasnya MENCOCOKKAN mutasi.
 *
 * Berkas ini sengaja tidak memulangkan pembungkus apa pun ke sana: satu-satunya
 * pemanggilnya adalah route impor dan layar pratinjaunya, dan keduanya
 * mengimpor dari rumah barunya.
 */

