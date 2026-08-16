/**
 * PPN (Indonesian VAT) — the single source of truth for the tax rate and for how
 * a document's DPP / PPN / total are derived from it (issue #16).
 *
 * Pure module: no Prisma, no I/O — safe to import into Zod schemas and client
 * components, exactly like ./validations/fx and ./posting/rules. Money is rounded
 * with the same `round2` the posting rules use, so a figure computed here and the
 * figure the ledger stores can never disagree by a cent.
 *
 * WHAT THIS MODULE IS NOT: it does not post anything. A taxable invoice stores the
 * PPN it computes here into `invoices.tax_amount`, and the auto-posting engine
 * (src/lib/posting) turns that into the Hutang PPN Keluaran leg. Purchases mirror
 * it through PPN Masukan. A 0% / non-taxable document computes PPN 0, and the
 * posting engine then emits NO VAT line at all — never a zero one.
 */
import { round2 } from "@/lib/posting/rules";

/**
 * Tarif PPN bawaan, dalam persen. 11% di Indonesia sejak 1 April 2022 (UU HPP).
 *
 * ══ PERANNYA BERUBAH DI ISSUE #368 — BACA INI SEBELUM MEMAKAINYA ═══════════
 * Dulu ini SATU-SATUNYA tarif yang ada, dengan alasan yang ditulis di sini:
 * "angka statuter dengan tepat satu nilai benar pada satu waktu, sama untuk
 * setiap pemakai aplikasi — bukan konfigurasi per-tenant". Dua premisnya gugur
 * begitu pendaftaran dibuka untuk umum:
 *
 *   1. "tepat satu nilai pada satu waktu" benar hanya bila waktunya diabaikan.
 *      Dokumen yang dicatat MUNDUR ke bulan sebelum tarif berubah harus memakai
 *      tarif yang berlaku PADA TANGGALNYA.
 *   2. "sama untuk setiap pemakai" tidak benar untuk perusahaan NON-PKP, yang
 *      tidak memungut PPN sama sekali.
 *
 * Jadi bawaan per perusahaan sekarang datang dari `companyTaxRateOn()` di bawah,
 * yang membaca tabel `tax_rates` + penanda `is_pkp`.
 *
 * Konstanta ini TETAP ADA dan tetap benar untuk dua hal:
 *
 *   • BENIH. Perusahaan baru disemai dengan nilai ini sebagai tarif pertamanya
 *     (`ensureTaxRates` di `lib/tax-rates.ts`), lalu tabelnya yang berbicara.
 *   • FAKTA TINGKAT PLATFORM — tagihan langganan KAMI sendiri
 *     (`subscription-lifecycle.ts`) dan klaim harga di halaman pemasaran
 *     (`landing-pricing`, `landing-faq`). Itu PPN yang dipungut SAI, bukan yang
 *     dipungut pelanggan; ia tidak boleh ikut berubah ketika satu perusahaan
 *     menyunting tarifnya sendiri.
 *
 * Yang TIDAK boleh lagi memakainya: bawaan formulir dokumen milik perusahaan.
 * Dijaga `tests/tax-rates.test.ts`.
 */
export const DEFAULT_TAX_RATE = 11;

/** Satu baris tarif yang berlaku sejak sebuah tanggal. */
export interface TaxRateRow {
  /** Tarif dalam persen. */
  rate: number;
  /** Tanggal mulai berlaku, `YYYY-MM-DD`. */
  effectiveFrom: string;
}

/** Profil pajak sebuah perusahaan: memungut PPN atau tidak, dan tarif mana. */
export interface CompanyTaxProfile {
  /** Pengusaha Kena Pajak. `false` → tidak memungut PPN sama sekali. */
  isPkp: boolean;
  /** Riwayat tarif, urutan bebas. */
  rates: TaxRateRow[];
}

/**
 * Tarif yang berlaku pada `date`, atau `null` bila tidak ada baris yang
 * mencakupinya.
 *
 * Perbandingannya LEKSIKOGRAFIS atas tanggal ISO `YYYY-MM-DD`, bukan aritmetika
 * `Date`. Itu disengaja: tanggal dokumen adalah tanggal KALENDER, dan mengubahnya
 * jadi momen memasukkan zona waktu ke dalam perbandingan — sebuah faktur
 * 1 April di mesin ber-UTC bisa jatuh ke 31 Maret dan mendapat tarif lama.
 * Bandingkan teks, dan bulan tak pernah bergeser.
 *
 * `null` — bukan `DEFAULT_TAX_RATE` — ketika tanggalnya MENDAHULUI baris paling
 * awal. Memulangkan tarif hari ini untuk dokumen 2019 berarti mengarang; yang
 * jujur adalah mengaku tidak tahu dan membiarkan pemanggilnya memutuskan.
 */
export function taxRateFor(date: string, rates: readonly TaxRateRow[]): number | null {
  let best: TaxRateRow | null = null;
  for (const row of rates) {
    if (row.effectiveFrom > date) continue;
    if (best == null || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best ? best.rate : null;
}

/**
 * Tarif PPN bawaan untuk sebuah dokumen perusahaan bertanggal `date`.
 *
 * Non-PKP selalu 0 — itu pemeriksaan PERTAMA, sebelum tabel tarif dilihat sama
 * sekali, sebab perusahaan non-PKP tidak memungut PPN berapa pun tarifnya.
 *
 * Bila PKP tapi tak ada baris yang mencakup tanggalnya, jatuh ke
 * `DEFAULT_TAX_RATE`: yang dipulangkan fungsi ini hanya BAWAAN FORMULIR yang
 * masih bisa diubah pemakainya, dan bawaan statuter hari ini lebih menolong
 * daripada 0 yang diam-diam menghilangkan PPN dari faktur.
 */
export function companyTaxRateOn(date: string, profile: CompanyTaxProfile): number {
  if (!profile.isPkp) return 0;
  /*
   * Tanggal KOSONG artinya pemakai belum memilih tanggal, bukan "tanggal nol".
   * Yang benar untuknya adalah tarif TERBARU — dan itu harus dikatakan, sebab
   * perbandingan teks akan membuat "" lebih kecil dari setiap tanggal ISO,
   * sehingga tak ada baris yang cocok dan tarifnya jatuh ke konstanta. Selama
   * konstantanya kebetulan sama dengan tarif terbaru, salahnya tak terlihat —
   * dan berhenti tak terlihat tepat pada hari tarifnya berubah.
   */
  const at = date || latestEffectiveFrom(profile.rates);
  return taxRateFor(at, profile.rates) ?? DEFAULT_TAX_RATE;
}

/** Tanggal berlaku paling akhir di antara baris-barisnya; "" bila tak ada. */
function latestEffectiveFrom(rates: readonly TaxRateRow[]): string {
  let latest = "";
  for (const row of rates) if (row.effectiveFrom > latest) latest = row.effectiveFrom;
  return latest;
}

/** Export / non-VAT rate. The sensible default for foreign-currency invoices. */
export const EXPORT_TAX_RATE = 0;

export interface TaxBreakdown {
  /** DPP — Dasar Pengenaan Pajak (tax base), in the document's own currency. */
  dpp: number;
  /** Effective PPN rate applied, in percent (0 for export / non-VAT). */
  taxRate: number;
  /** PPN amount, in the document's own currency. */
  taxAmount: number;
  /** DPP + PPN, in the document's own currency. */
  total: number;
}

/**
 * DPP / PPN / total for a document at a given rate.
 *
 * A rate of 0 (export / non-VAT) yields PPN 0 — the posting engine then emits no
 * VAT line. PPN is `round2(DPP × rate ÷ 100)`, computed on the whole DPP the way
 * an Indonesian Faktur Pajak is (document-level, not per line item).
 */
export function computeTax(subtotal: number, taxRate: number = DEFAULT_TAX_RATE): TaxBreakdown {
  const dpp = round2(subtotal);
  const rate = taxRate > 0 ? taxRate : 0;
  const taxAmount = round2((dpp * rate) / 100);
  return { dpp, taxRate: rate, taxAmount, total: round2(dpp + taxAmount) };
}

export interface InvoiceTaxInput {
  /** Whether PPN applies to this document. */
  taxable?: boolean;
  /** Per-invoice rate override, in percent. Defaults to DEFAULT_TAX_RATE. */
  taxRate?: number | null;
  /**
   * Back-compat only: an explicit PPN amount from a caller that predates the
   * `taxable` + `taxRate` fields (the amount-only invoice API this issue
   * replaces). Consulted solely when `taxable` is not set.
   */
  taxAmount?: number | null;
}

export interface ResolvedInvoiceTax extends Omit<TaxBreakdown, "taxRate"> {
  taxable: boolean;
  /** NULL when no rate is known (a legacy amount-only entry, or an untaxed row). */
  taxRate: number | null;
}

/**
 * Resolve what actually gets stored on an invoice, from whatever the form/API
 * sent. The server is authoritative: when a document is `taxable`, PPN is
 * recomputed from the rate here, so a stale or tampered client amount can never
 * reach the ledger.
 *
 *   • taxable  → PPN = DPP × (taxRate ?? DEFAULT_TAX_RATE); rate stored as used
 *                (11 for the default, 0 for an explicit 0% export).
 *   • not taxable, but a raw taxAmount > 0 → honoured as-is (old amount-only
 *     callers), rate stored NULL because none was recorded.
 *   • otherwise → untaxed: PPN 0, rate NULL.
 */
export function resolveInvoiceTax(subtotal: number, input: InvoiceTaxInput): ResolvedInvoiceTax {
  if (input.taxable) {
    const b = computeTax(subtotal, input.taxRate ?? DEFAULT_TAX_RATE);
    return { dpp: b.dpp, taxRate: b.taxRate, taxAmount: b.taxAmount, total: b.total, taxable: true };
  }

  const explicit = round2(input.taxAmount ?? 0);
  const dpp = round2(subtotal);
  if (explicit > 0) {
    return { dpp, taxRate: null, taxAmount: explicit, total: round2(dpp + explicit), taxable: true };
  }
  return { dpp, taxRate: null, taxAmount: 0, total: dpp, taxable: false };
}

/**
 * The sensible tax default for a new invoice, given its currency and customer.
 *
 * Export / foreign-currency invoices are commonly PPN 0% (or not-VAT), and a
 * tax-exempt customer (non-PKP, or an export buyer) is never charged PPN — so
 * both default to non-taxable. Domestic IDR invoices default to the company's
 * own rate. This is only the DEFAULT: the form control lets the user override it
 * either way.
 *
 * `companyRate` (issue #368) adalah tarif perusahaan pada TANGGAL DOKUMEN —
 * lihat `companyTaxRateOn`. Ia opsional supaya pemanggil yang memang berbicara
 * tentang tarif tingkat platform tidak dipaksa mengarang satu; yang lalai
 * mengirimkannya mendapat `DEFAULT_TAX_RATE` seperti sebelum #368, yaitu
 * perilaku lama yang salah bagi non-PKP. Karena itu `tests/tax-rates.test.ts`
 * menuntut setiap formulir dokumen mengirimkannya.
 *
 * Nilai `0` diteruskan APA ADANYA (`??`, bukan `||`): perusahaan non-PKP
 * mengirim 0, dan `||` akan menukarnya diam-diam dengan 11.
 */
export function defaultInvoiceTax(opts: {
  currency?: string | null;
  customerTaxExempt?: boolean | null;
  companyRate?: number | null;
}): { taxable: boolean; taxRate: number } {
  const rate = opts.companyRate ?? DEFAULT_TAX_RATE;
  if (opts.customerTaxExempt) return { taxable: false, taxRate: EXPORT_TAX_RATE };
  if (opts.currency && opts.currency !== "IDR") return { taxable: false, taxRate: EXPORT_TAX_RATE };
  /* Perusahaan non-PKP: tarifnya 0, jadi dokumennya bukan dokumen ber-PPN.
     Mengembalikan `taxable: true` dengan tarif 0 akan mencetak baris "PPN 0"
     pada faktur perusahaan yang memang tidak memungut PPN. */
  if (rate <= 0) return { taxable: false, taxRate: 0 };
  return { taxable: true, taxRate: rate };
}
