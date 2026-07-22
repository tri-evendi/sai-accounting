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
 * Signed value of a book (`cash_accounts`) movement:
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
  /** Book movements in scope (`cash_accounts` rows). */
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

// ─── CSV import of statement lines ──────────────────────────────────────────

export interface ParsedStatementLine {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  description: string;
  /** Signed money: + into the bank, − out. */
  amount: number;
}

export type CsvParseResult =
  | { ok: true; rows: ParsedStatementLine[] }
  | { ok: false; errors: string[] };

/** Split one CSV record into fields, honouring simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Parse a plain decimal (optional sign, dot decimal). Rejects grouping commas. */
function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  // Deliberately strict: no thousands separators, no currency symbols. Anything
  // else is rejected with a clear message rather than silently coerced.
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normalise YYYY-MM-DD or DD/MM/YYYY to ISO YYYY-MM-DD, or null if invalid. */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if ((match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else {
    return null;
  }
  // Reject impossible dates (e.g. 2026-13-40) by round-tripping through Date.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Parse a CSV of statement lines. Header row required. Columns (case-insensitive):
 *   - `date` (YYYY-MM-DD or DD/MM/YYYY) — required
 *   - `description` — required, non-empty
 *   - `amount` (signed: + in, − out) — OR both `debit` and `credit`
 *     (bank convention: credit = money in, debit = money out → signed = credit − debit)
 *
 * All-or-nothing: if ANY row is malformed the whole import is rejected with a
 * list of clear, row-numbered messages. Nothing is silently dropped or coerced.
 */
export function parseStatementCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return { ok: false, errors: ["File CSV kosong."] };
  }

  const header = splitCsvLine(rawLines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const dateIdx = col("date");
  const descIdx = col("description");
  const amountIdx = col("amount");
  const debitIdx = col("debit");
  const creditIdx = col("credit");

  if (dateIdx === -1 || descIdx === -1) {
    return {
      ok: false,
      errors: [
        "Header CSV wajib memuat kolom 'date' dan 'description'.",
      ],
    };
  }
  const hasAmount = amountIdx !== -1;
  const hasDebitCredit = debitIdx !== -1 && creditIdx !== -1;
  if (!hasAmount && !hasDebitCredit) {
    return {
      ok: false,
      errors: [
        "Header CSV wajib memuat kolom 'amount', atau kolom 'debit' dan 'credit'.",
      ],
    };
  }

  const rows: ParsedStatementLine[] = [];
  const dataLines = rawLines.slice(1);
  if (dataLines.length === 0) {
    return { ok: false, errors: ["CSV tidak memuat baris mutasi."] };
  }

  dataLines.forEach((raw, i) => {
    const rowNo = i + 2; // +1 for header, +1 for 1-based
    const fields = splitCsvLine(raw);

    const dateRaw = fields[dateIdx] ?? "";
    const descRaw = fields[descIdx] ?? "";

    const date = parseDate(dateRaw);
    if (date === null) {
      errors.push(
        `Baris ${rowNo}: tanggal "${dateRaw}" tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY).`
      );
    }

    const description = descRaw.trim();
    if (description === "") {
      errors.push(`Baris ${rowNo}: deskripsi tidak boleh kosong.`);
    } else if (description.length > 255) {
      errors.push(`Baris ${rowNo}: deskripsi melebihi 255 karakter.`);
    }

    let amount: number | null = null;
    if (hasAmount) {
      amount = parseAmount(fields[amountIdx] ?? "");
      if (amount === null) {
        errors.push(
          `Baris ${rowNo}: nominal "${fields[amountIdx] ?? ""}" bukan angka yang valid ` +
            `(angka polos tanpa pemisah ribuan, mis. -1500000.50).`
        );
      }
    } else {
      // An empty debit or credit cell means zero on that side.
      const debit = parseAmount(fields[debitIdx] || "0");
      const credit = parseAmount(fields[creditIdx] || "0");
      if (debit === null || credit === null) {
        errors.push(
          `Baris ${rowNo}: kolom debit/credit bukan angka yang valid (angka polos, mis. 1500000.00).`
        );
      } else {
        // Bank statement convention: credit = uang masuk (+), debit = keluar (−).
        amount = round2(credit - debit);
      }
    }

    if (date !== null && description !== "" && description.length <= 255 && amount !== null) {
      rows.push({ date, description, amount });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}
