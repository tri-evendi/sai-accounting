/**
 * Account mapping: the indirection between posting rules and the Chart of Accounts.
 *
 * Rules ask for a *slot* ("where does receivable go?") by key; this module answers
 * with a real account id, looked up from the `account_mappings` table. Nothing in
 * src/lib/posting hardcodes a COA code — a company that renumbers its chart only
 * edits mappings.
 *
 * Currency overrides: a mapping row with a concrete ISO code wins over the "any"
 * row for that currency. So `ar_default` resolves to 110201 normally but to
 * 110203 (Piutang Usaha CNY) when posting a CNY document.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Sentinel stored in `account_mappings.currency` for the currency-agnostic default. */
export const ANY_CURRENCY = "any";

/** Every slot a posting rule may ask for. Values are enum-like lowercase snake_case. */
export const MAPPING_KEYS = {
  /** Piutang Usaha — debited by sales, credited by receipts. */
  AR_DEFAULT: "ar_default",
  /** Penjualan Barang Dagang. */
  SALES_DEFAULT: "sales_default",
  /** Hutang PPN Keluaran (output VAT on sales). */
  VAT_OUT: "vat_out",
  /** PPN Masukan (input VAT on purchases). */
  VAT_IN: "vat_in",
  /** Hutang Usaha — credited by purchases, debited by supplier payments. */
  AP_DEFAULT: "ap_default",
  /** Persediaan Barang Dagang. */
  INVENTORY: "inventory",
  /** Beban Pokok Penjualan. */
  COGS: "cogs",
  /** Fallback cash/bank account when no specific one is implied. */
  CASH_DEFAULT: "cash_default",
  /** Cash slots keyed by CashAccount.type (bank | kas_besar | kas_kecil). */
  CASH_BANK: "cash_bank",
  CASH_KAS_BESAR: "cash_kas_besar",
  CASH_KAS_KECIL: "cash_kas_kecil",
  /** Non-inventory purchases land here (Beban Administrasi & Umum). */
  PURCHASE_EXPENSE: "purchase_expense",
  /**
   * Laba/Rugi Selisih Kurs — realized FX difference on settling a foreign
   * receivable/payable at a rate other than the document's (issue #23).
   * Currency-agnostic: the difference is already an IDR base amount.
   */
  FX_GAIN_LOSS: "fx_gain_loss",
  /**
   * Uang Muka Penjualan (issue #26) — a LIABILITY. Credited when a customer pays
   * before the invoice exists, debited when the invoice compensates it. Never
   * revenue: the sale is not earned until the goods are invoiced.
   */
  ADVANCE_SALES: "advance_sales",
  /**
   * Uang Muka Pembelian (issue #26) — an ASSET. Debited when we pay a supplier
   * before their invoice exists, credited when the purchase compensates it.
   * Never an expense: nothing has been consumed yet.
   */
  ADVANCE_PURCHASE: "advance_purchase",
} as const;

export type MappingKey = (typeof MAPPING_KEYS)[keyof typeof MAPPING_KEYS];

export const MAPPING_KEY_VALUES = Object.values(MAPPING_KEYS) as MappingKey[];

/** Human labels (Indonesian) used in error messages and any future settings UI. */
export const MAPPING_KEY_LABELS: Record<MappingKey, string> = {
  ar_default: "Piutang Usaha",
  sales_default: "Penjualan",
  vat_out: "Hutang PPN Keluaran",
  vat_in: "PPN Masukan",
  ap_default: "Hutang Usaha",
  inventory: "Persediaan",
  cogs: "Beban Pokok Penjualan",
  cash_default: "Kas/Bank (default)",
  cash_bank: "Bank",
  cash_kas_besar: "Kas Besar",
  cash_kas_kecil: "Kas Kecil",
  purchase_expense: "Beban Pembelian",
  fx_gain_loss: "Laba/Rugi Selisih Kurs",
  advance_sales: "Uang Muka Penjualan",
  advance_purchase: "Uang Muka Pembelian",
};

/**
 * Defaults seeded from COA_TEMPLATE codes (src/lib/accounting.ts).
 * `currency` omitted means the "any" fallback row.
 */
export const DEFAULT_MAPPINGS: { key: MappingKey; code: string; currency?: string }[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, code: "110201" },
  { key: MAPPING_KEYS.AR_DEFAULT, code: "110201", currency: "IDR" },
  { key: MAPPING_KEYS.AR_DEFAULT, code: "110202", currency: "USD" },
  { key: MAPPING_KEYS.AR_DEFAULT, code: "110203", currency: "CNY" },

  { key: MAPPING_KEYS.SALES_DEFAULT, code: "4101" },
  { key: MAPPING_KEYS.VAT_OUT, code: "2103" },
  { key: MAPPING_KEYS.VAT_IN, code: "1105" },
  { key: MAPPING_KEYS.AP_DEFAULT, code: "2101" },
  { key: MAPPING_KEYS.INVENTORY, code: "1104" },
  { key: MAPPING_KEYS.COGS, code: "5101" },
  { key: MAPPING_KEYS.PURCHASE_EXPENSE, code: "610104" },
  // 7101 Laba/Rugi Selisih Kurs. The live Accurate books use 720103 "Laba/Rugi
  // Terealisasi (CNY)"; this seeds the equivalent slot in the template COA, and a
  // company on a different chart just repoints the mapping row.
  { key: MAPPING_KEYS.FX_GAIN_LOSS, code: "7101" },

  // Uang muka (issue #26). Currency-specific like AR/cash: a CNY advance belongs
  // in a CNY account, so the compensation's two legs sit in matching currencies
  // and the only gap between them is the rate — which is what the FX plug is for.
  // The "any" fallback points at the IDR *leaf*, not the 2102/1103 parent —
  // same as ar_default's "any" → 110201. A parent is a summary line; posting
  // into it would put balances at two levels of the same subtree.
  { key: MAPPING_KEYS.ADVANCE_SALES, code: "210201" },
  { key: MAPPING_KEYS.ADVANCE_SALES, code: "210201", currency: "IDR" },
  { key: MAPPING_KEYS.ADVANCE_SALES, code: "210202", currency: "USD" },
  { key: MAPPING_KEYS.ADVANCE_SALES, code: "210203", currency: "CNY" },

  { key: MAPPING_KEYS.ADVANCE_PURCHASE, code: "110301" },
  { key: MAPPING_KEYS.ADVANCE_PURCHASE, code: "110301", currency: "IDR" },
  { key: MAPPING_KEYS.ADVANCE_PURCHASE, code: "110302", currency: "USD" },
  { key: MAPPING_KEYS.ADVANCE_PURCHASE, code: "110303", currency: "CNY" },

  // Cash (issue #40). NOTE WHAT IS MISSING: `cash_default` has no "any" row.
  //
  // Until #40 it had *only* an "any" row → 110102 Kas Besar, an IDR account, so
  // a CNY payment landed in Kas Besar. The journal balanced in IDR base — the
  // destination account was wrong, not the value — but the CNY cash account
  // stayed empty while an IDR one absorbed foreign movements.
  //
  // The fix is not merely to add the missing rows; it is to stop having a
  // fallback at all. An "any" mapping promises "this account can receive money
  // in any currency". For sales, VAT, COGS or fx_gain_loss that is true — those
  // slots are genuinely currency-agnostic. For cash it is a category error: a
  // cash or bank account holds exactly one currency, so there is no honest
  // account for "some currency nobody configured". With no "any" row,
  // `resolveAccountIds` raises MissingMappingError — which already names the
  // slot and the currency in Indonesian — instead of silently choosing an IDR
  // account. That is the stance `resolveRate` takes on a missing rate, and it is
  // strictly the safer failure: the remedy is a one-row insert, whereas a silent
  // misposting has to be noticed before it can be fixed.
  //
  // IDR points at 110103 Bank (IDR) rather than 110102 Kas Besar, matching
  // `cash_bank`'s IDR row. Settling an invoice, contract or advance is a
  // transfer far more often than it is physical cash, and a company that really
  // does take counter payments repoints this one row (or books them through
  // Transaksi Kas, which resolves `cash_kas_besar` and is unaffected).
  { key: MAPPING_KEYS.CASH_DEFAULT, code: "110103", currency: "IDR" },
  { key: MAPPING_KEYS.CASH_DEFAULT, code: "110104", currency: "USD" },
  { key: MAPPING_KEYS.CASH_DEFAULT, code: "110105", currency: "CNY" },

  // ── LEGACY JOURNALS: DO NOT BULK-REPOST ────────────────────────────────────
  // Foreign payments already posted into 110102 Kas Besar are wrong in the
  // account, never in the rupiah, so nothing is misstated at the company level
  // and there is no urgency to justify rewriting history in bulk. Correct them
  // one document at a time, and only where it is worth it:
  //
  //   1. Confirm the payment really was in that currency and identify the cash
  //      account it should have landed in.
  //   2. Check the document's period is open. If it is closed, a Manager
  //      reopens it deliberately (issue #13) — the lock is not to be bypassed.
  //   3. `repostForSource({ sourceType: "invoice_payment", sourceId })`, which
  //      reverses the old journal and posts a fresh one, leaving the audit
  //      trail intact rather than editing it.
  //
  // A sweep over every historical payment is deliberately not offered: it would
  // reverse and repost closed months wholesale, and each entry it touched would
  // need the same human check anyway.
  //
  // The physical-cash slots stay currency-agnostic: they are reached only from
  // an explicit CashAccount.type, where the user has already named the account.
  { key: MAPPING_KEYS.CASH_KAS_BESAR, code: "110102" },
  { key: MAPPING_KEYS.CASH_KAS_KECIL, code: "110101" },
  { key: MAPPING_KEYS.CASH_BANK, code: "110103" },
  { key: MAPPING_KEYS.CASH_BANK, code: "110103", currency: "IDR" },
  { key: MAPPING_KEYS.CASH_BANK, code: "110104", currency: "USD" },
  { key: MAPPING_KEYS.CASH_BANK, code: "110105", currency: "CNY" },
];

/** Cash slot for a CashAccount.type value. Unknown types fall back to cash_default. */
export function cashKeyForType(type: string | null | undefined): MappingKey {
  switch (type) {
    case "bank":
      return MAPPING_KEYS.CASH_BANK;
    case "kas_besar":
      return MAPPING_KEYS.CASH_KAS_BESAR;
    case "kas_kecil":
      return MAPPING_KEYS.CASH_KAS_KECIL;
    default:
      return MAPPING_KEYS.CASH_DEFAULT;
  }
}

/** Raised when a rule needs an account slot that nobody has configured. */
export class MissingMappingError extends Error {
  constructor(
    readonly key: string,
    readonly currency?: string
  ) {
    const label = MAPPING_KEY_LABELS[key as MappingKey] ?? key;
    const cur = currency && currency !== ANY_CURRENCY ? ` (mata uang ${currency})` : "";
    super(
      `Pemetaan akun "${label}"${cur} belum diatur. ` +
        `Tambahkan mapping "${key}" di pengaturan akun (account_mappings), ` +
        `lalu ulangi. Jurnal tidak diposting agar tidak salah catat.`
    );
    this.name = "MissingMappingError";
  }
}

/**
 * Type-only Prisma import (no `@/lib/prisma` singleton) so mapping constants can
 * be imported and unit-tested without a DATABASE_URL. Callers pass the client.
 */
type Client = Prisma.TransactionClient | PrismaClient;

/**
 * Resolve one slot to an account id. Tries the currency-specific row first, then
 * the "any" fallback. Throws MissingMappingError rather than posting a guess.
 */
export async function resolveAccountId(
  key: MappingKey,
  currency: string | null | undefined,
  client: Client
): Promise<number> {
  const wanted = currency && currency !== ANY_CURRENCY ? [currency, ANY_CURRENCY] : [ANY_CURRENCY];

  const rows = await client.accountMapping.findMany({
    where: { key, isActive: true, currency: { in: wanted } },
  });
  if (rows.length === 0) throw new MissingMappingError(key, currency ?? undefined);

  // Currency-specific row wins over the "any" fallback.
  const specific = rows.find((r) => r.currency !== ANY_CURRENCY);
  return (specific ?? rows[0]).accountId;
}

/** Batch variant — one query for several slots, so a rule needs a single round trip. */
export async function resolveAccountIds(
  keys: MappingKey[],
  currency: string | null | undefined,
  client: Client
): Promise<Record<string, number>> {
  const unique = [...new Set(keys)];
  const wanted = currency && currency !== ANY_CURRENCY ? [currency, ANY_CURRENCY] : [ANY_CURRENCY];

  const rows = await client.accountMapping.findMany({
    where: { key: { in: unique }, isActive: true, currency: { in: wanted } },
  });

  const out: Record<string, number> = {};
  for (const key of unique) {
    const matches = rows.filter((r) => r.key === key);
    if (matches.length === 0) throw new MissingMappingError(key, currency ?? undefined);
    const specific = matches.find((r) => r.currency !== ANY_CURRENCY);
    out[key] = (specific ?? matches[0]).accountId;
  }
  return out;
}

/**
 * Seed DEFAULT_MAPPINGS from COA codes. Idempotent — existing (key, currency)
 * rows are left alone, so a company's customised mapping survives a re-run.
 * Accounts that don't exist yet are skipped (run scripts/seed-coa.ts first).
 */
export async function seedDefaultMappings(client: Client) {
  const codes = [...new Set(DEFAULT_MAPPINGS.map((m) => m.code))];
  const accounts = await client.account.findMany({ where: { code: { in: codes } } });
  const idByCode = new Map(accounts.map((a) => [a.code, a.id]));

  let created = 0;
  let skipped = 0;
  for (const m of DEFAULT_MAPPINGS) {
    const accountId = idByCode.get(m.code);
    if (!accountId) {
      skipped++;
      continue;
    }
    const currency = m.currency ?? ANY_CURRENCY;
    const existing = await client.accountMapping.findUnique({
      where: { key_currency: { key: m.key, currency } },
    });
    if (existing) continue;
    await client.accountMapping.create({ data: { key: m.key, currency, accountId } });
    created++;
  }
  return { created, skipped };
}
