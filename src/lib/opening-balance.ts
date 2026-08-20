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
import { round2 } from "@/lib/posting/rules";
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

/**
 * One opening receivable/payable, per partner (customer or supplier).
 *
 * ── Nomor & tanggal dokumen (issue #381 tahap 3) ───────────────────────────
 * Ketiganya OPSIONAL, dan itu yang membuat dua jalur masuk hidup berdampingan:
 *
 *   • WISAYA penyiapan mengumpulkan satu TOTAL per mitra — orang yang mengetik
 *     saldo awal jarang punya rincian fakturnya di tangan. Tanpa nomor, satu
 *     dokumen pembuka dibuat untuk seluruh saldonya, bertanggal awal tahun buku.
 *   • IMPOR berkas membawa RINCIANNYA — nomor faktur asli, tanggal terbit,
 *     jatuh tempo. Umur piutangnya jadi umur yang sebenarnya, bukan umur yang
 *     dihitung dari hari pertama.
 *
 * Keduanya menghasilkan bentuk yang sama di basis data; yang berbeda hanya
 * seberapa halus rinciannya.
 */
export interface OpeningPartnerInput {
  /** `null` = mitra belum ada; ia dibuat dari `partnerName` di dalam transaksi (#425). */
  partnerId: number | null;
  partnerName: string;
  currency: string;
  amount: number;
  rate?: number | null;
  /** Nomor dokumen asli. Kosong → diturunkan dari nama mitra. */
  documentNo?: string | null;
  /** Tanggal terbit asli. Kosong → tanggal jurnal pembuka. */
  documentDate?: Date | null;
  dueDate?: Date | null;
}

/**
 * Satu baris saldo awal PERSEDIAAN, per barang (issue #379).
 *
 * Menggantikan `inventory: number` — satu angka gelondongan yang menerbitkan
 * jurnal TANPA satu pun gerakan stok, sehingga Neraca menunjukkan persediaan
 * sementara laporan stok kosong. Keduanya menjawab pertanyaan yang sama dan
 * dibaca dari sumber yang berbeda, jadi selisihnya tidak pernah terlihat oleh
 * siapa pun sampai ada akuntan yang membandingkannya.
 */
export interface OpeningStockInput {
  itemId: number;
  /** Nama barang — hanya untuk memo jurnal & catatan gerakan. */
  itemName: string;
  quantity: number;
  /** Harga pokok per satuan, IDR (nilai base). */
  unitCost: number;
}

/**
 * Satu aset tetap yang dibawa masuk dari sistem lama (issue #381 tahap 4).
 *
 * Akun-akunnya DISERTAKAN, tidak dicari di sini: akun aset/akumulasi/beban
 * tinggal di `fixed_asset_categories`, dan route yang mencocokkan nama kategori
 * ke barisnya sudah memegangnya. Pola yang sama dengan `partnerName` —
 * pencarian nama bukan urusan modul ini.
 */
export interface OpeningFixedAssetInput {
  assetNo: string;
  name: string;
  categoryId: number;
  assetAccountId: number;
  accumulatedAccountId: number;
  expenseAccountId: number;
  acquisitionDate: Date;
  cost: number;
  residual: number;
  usefulLifeMonths: number;
  /** Yang SUDAH disusutkan di sistem lama. */
  accumulated: number;
  lastDepreciationYear: number | null;
  lastDepreciationMonth: number | null;
  location: string | null;
}

export interface OpeningBalancesInput {
  company: {
    name: string;
    address?: string | null;
    baseCurrency: string;
    fiscalYearStart: Date;
    // ── Seller tax identity for e-Faktur (issue #17) — all optional. ──
    npwp?: string | null;
    /** PKP — memungut PPN atau tidak (issue #368). Bawaan `true`. */
    isPkp?: boolean;
    taxName?: string | null;
    taxAddress?: string | null;
    // ── Modul per kategori usaha (issue #99) — jawaban wizard, preset saja. ──
    /** Kategori usaha yang dipilih; hanya disimpan, tak pernah menegakkan apa pun. */
    businessCategory?: string | null;
    /** Modul yang aktif, sudah dinormalkan. NULL = semua modul aktif. */
    enabledModules?: string | null;
  };
  cash: OpeningCashInput[];
  receivables: OpeningPartnerInput[];
  payables: OpeningPartnerInput[];
  /** Saldo awal persediaan, PER BARANG (issue #379). */
  inventory: OpeningStockInput[];
  /** Aset tetap yang dibawa masuk (issue #381 tahap 4). */
  fixedAssets: OpeningFixedAssetInput[];
  /**
   * Buku ini memang dimulai dari NOL — tidak ada jurnal pembuka (issue #416).
   *
   * Bawaannya `false`, dan itu penting: setiap pemanggil yang tidak menyebutnya
   * tetap mendapat penjaga lama, yaitu galat bila tak ada satu baris pun untuk
   * dicatat. Yang menyalakannya hanya wisaya, dan hanya setelah orangnya
   * mencentang kalimat yang mengatakannya.
   */
  allowEmpty?: boolean;
}

/** Nilai IDR satu baris persediaan awal — satu rumus, dipakai jurnal & gerakan. */
export function openingStockValue(row: Pick<OpeningStockInput, "quantity" | "unitCost">): number {
  return round2(num(row.quantity) * num(row.unitCost));
}

/** Total nilai persediaan awal — inilah yang didebit ke akun Persediaan. */
export function openingStockTotal(rows: OpeningStockInput[]): number {
  return round2(rows.reduce((sum, row) => sum + openingStockValue(row), 0));
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

  /*
   * Persediaan — SATU baris jurnal untuk TOTALNYA, bukan satu baris per barang.
   *
   * Buku besar mencatat NILAI; rinciannya per barang adalah urusan buku
   * pembantu, dan buku pembantu persediaan di aplikasi ini adalah
   * `stock_movements` — yang diterbitkan `applyOpeningBalances` dari daftar
   * yang sama. Satu baris jurnal per barang akan menggandakan rincian yang
   * sudah ada di tempat yang benar, dan membuat jurnal pembuka perusahaan
   * dengan 2.000 barang mustahil dibaca manusia.
   */
  const inventoryTotal = openingStockTotal(input.inventory);
  if (inventoryTotal > 0) {
    const accountId = await resolveAccountId(MAPPING_KEYS.INVENTORY, "IDR", client);
    lines.push({
      accountId,
      side: "debit",
      amount: inventoryTotal,
      currency: "IDR",
      rate: 1,
      memo: `Persediaan awal — ${input.inventory.length} barang`,
    });
  }

  /*
   * ══ ASET TETAP: DUA SISI, DIGABUNG PER AKUN (issue #381 tahap 4) ══════════
   *
   * Membuat baris `fixed_assets` saja TIDAK menerbitkan jurnal apa pun —
   * pembuatan aset bukan sumber posting di aplikasi ini (hanya penyusutan dan
   * pelepasan yang memposting). Jadi tanpa baris di bawah, daftar aset akan
   * menunjukkan Rp 2 miliar sementara neraca menunjukkan nol: bentuk cacat yang
   * sama persis dengan F-3 (#379), di permukaan yang baru.
   *
   * Aset dicatat KOTOR: harga perolehan di debit, akumulasi penyusutan di
   * kredit sebagai kontra-aset. Menuliskan nilai bukunya saja (perolehan −
   * akumulasi) akan menghasilkan neraca yang angkanya benar tetapi kehilangan
   * informasi yang justru dicari pembacanya — berapa yang sudah disusutkan.
   *
   * DIGABUNG PER AKUN, bukan satu baris per aset: buku besar mencatat NILAI,
   * rinciannya milik register aset. Perusahaan dengan 400 aset akan punya
   * jurnal pembuka yang mustahil dibaca manusia kalau setiap aset punya
   * barisnya sendiri — alasan yang sama dengan persediaan di #379. Kategori
   * yang berbeda memakai akun yang berbeda, jadi penggabungannya per AKUN,
   * bukan satu untuk semuanya.
   */
  const assetByAccount = new Map<number, number>();
  const accumulatedByAccount = new Map<number, number>();
  for (const a of input.fixedAssets) {
    const cost = num(a.cost);
    if (cost > 0) {
      assetByAccount.set(a.assetAccountId, round2((assetByAccount.get(a.assetAccountId) ?? 0) + cost));
    }
    const accumulated = num(a.accumulated);
    if (accumulated > 0) {
      accumulatedByAccount.set(
        a.accumulatedAccountId,
        round2((accumulatedByAccount.get(a.accumulatedAccountId) ?? 0) + accumulated)
      );
    }
  }
  for (const [accountId, amount] of assetByAccount) {
    lines.push({
      accountId,
      side: "debit",
      amount,
      currency: "IDR",
      rate: 1,
      memo: "Aset tetap — harga perolehan",
    });
  }
  for (const [accountId, amount] of accumulatedByAccount) {
    lines.push({
      accountId,
      side: "credit",
      amount,
      currency: "IDR",
      rate: 1,
      memo: "Akumulasi penyusutan aset tetap",
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
  /**
   * NULL bila buku dimulai dari nol (issue #416) — tidak ada jurnal pembuka
   * yang diposting, dan `company_settings.opening_journal_id` ikut kosong.
   * Halaman ringkasan penyiapan & `/setup/done` sudah lama memagari keduanya
   * dengan `settings.openingJournalId ? … : null`, jadi tak ada layar yang
   * perlu berubah untuk memahaminya.
   */
  journalId: number | null;
  journalNumber: string | null;
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
            npwp: input.company.npwp ?? null,
            isPkp: input.company.isPkp ?? true,
            taxName: input.company.taxName ?? null,
            taxAddress: input.company.taxAddress ?? null,
            businessCategory: input.company.businessCategory ?? null,
            enabledModules: input.company.enabledModules ?? null,
            isSetup: false,
          },
        });

    /*
     * ══ MITRA YANG BELUM ADA LAHIR DI SINI (issue #425) ═══════════════════════
     *
     * Perusahaan yang PINDAH dari pembukuan lain tiba dengan nol pelanggan dan
     * nol pemasok, dan tidak bisa membuatnya dari wisaya — gerbang setup
     * memantulkan menu master kembali ke wisaya itu sendiri. Sampai issue ini,
     * akibatnya bukan layar buntu melainkan sesuatu yang lebih sunyi: wisayanya
     * tetap bisa diselesaikan (kas saja cukup), hanya tanpa piutang lamanya —
     * dan karena wisaya JALAN SEKALI, piutang itu tidak akan pernah bisa
     * dicatat sebagai dokumen pembuka. Umur piutang kosong, faktur lama tidak
     * bisa dilunasi karena tidak ada yang bisa ditunjuk.
     *
     * DI DALAM transaksi yang sama, dan itu seluruh alasannya ada di sini alih-
     * alih di route impor: mitra yang dibuat lebih dulu lalu jurnalnya gagal
     * akan meninggalkan pelanggan yatim yang tak pernah diminta siapa pun.
     *
     * Nama dicocokkan ULANG ke basis data sebelum membuat — bukan hanya
     * mengandalkan `partnerId` yang null dari route. Antara berkas diunggah dan
     * simpan ditekan, orang yang sama bisa saja sudah membuat mitra itu lewat
     * jalan lain; membuatnya lagi akan memecah satu pelanggan menjadi dua yang
     * namanya sama persis.
     */
    const partnerIds = await resolveOpeningPartners(input, tx);
    /* Dipakai di TIGA tempat di bawah (nomor dokumen cadangan, `customerId`,
       `supplierId`). Sebuah fungsi, bukan payload yang ditulis ulang: saldo awal
       yang sudah divalidasi tidak perlu disusun kedua kalinya hanya untuk
       menempelkan satu kolom. */
    const customerIdFor = (r: OpeningPartnerInput) =>
      r.partnerId ?? partnerIds.customers.get(partnerKey(r.partnerName))!;
    const supplierIdFor = (p: OpeningPartnerInput) =>
      p.partnerId ?? partnerIds.suppliers.get(partnerKey(p.partnerName))!;

    const lines = await resolveOpeningLines(input, tx);
    if (lines.length === 0 && !input.allowEmpty) {
      throw new OpeningBalanceError(
        "Tidak ada saldo awal untuk dicatat. Isi minimal satu saldo (kas, piutang, utang, atau persediaan)."
      );
    }

    /*
     * ── BUKU YANG DIMULAI DARI NOL (issue #416) ─────────────────────────────
     *
     * Tanpa satu baris pun, tidak ada jurnal pembuka — dan itu BUKAN jurnal
     * kosong melainkan ketiadaan jurnal. Memposting jurnal tanpa baris akan
     * meninggalkan dokumen yang tidak menyatakan apa pun di buku besar, dan
     * `buildOpeningBalanceLines` memang menolaknya sejak semula.
     *
     * Yang tetap terjadi: baris `company_settings` dibuat/diperbarui dan
     * `is_setup` menyala. Penjaga sekali-jalan karena itu tidak melemah — POST
     * kedua tetap ditolak `assertCanRunSetup` lewat bendera itu, persis seperti
     * buku yang punya jurnal pembuka ditolak lewat jurnalnya.
     */
    let journal: Awaited<ReturnType<typeof postJournal>> | null = null;
    let equityPlug = 0;

    if (lines.length > 0) {
      const equityAccountId = await resolveAccountId(MAPPING_KEYS.OPENING_EQUITY, "IDR", tx);
      equityPlug = openingEquityPlug(lines);
      const journalLines = buildOpeningBalanceLines({
        lines,
        equityAccountId,
        equityMemo: "Modal/Ekuitas — saldo awal",
      });

      // Post through the same primitive as every other write: assertBalanced and
      // the period lock (#13) both apply here, unbypassed.
      journal = await postJournal(
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
    }

    /*
     * ══ SISI KEDUA PIUTANG & UTANG: DOKUMENNYA (issue #381 tahap 3) ════════
     *
     * Jurnal di atas menyatakan NILAI piutang/utang di akun kontrolnya. Buku
     * besar PEMBANTU — umur piutang, daftar tagihan yang bisa dilunasi —
     * membaca DOKUMEN SUMBER, bukan baris jurnal. Tanpa dokumen di sini,
     * perusahaan pindahan memulai hidupnya dengan neraca yang menunjukkan
     * piutang miliaran dan umur piutang yang kosong, serta faktur lama yang
     * tidak bisa dilunasi karena tidak ada yang bisa ditunjuk.
     *
     * Bentuknya meniru #379 persis: satu baris jurnal untuk nilainya, dokumen
     * per mitra untuk rinciannya, dalam TRANSAKSI YANG SAMA.
     *
     * ⚠ Dokumennya ditandai `isOpening`, dan penanda itulah yang menahan
     * penggandaan: mesin posting menolaknya (`buildStampedEntry`), dan jalur
     * sunting menolak mengubahnya. Tanpa penanda itu, SUNTINGAN pertama pada
     * faktur pembuka akan menerbitkan jurnal di atas nilai yang sudah ada.
     *
     * ⚠ Faktur pembuka WAJIB punya satu baris item. Total faktur di seluruh
     * aplikasi ini dihitung dari `invoice_items` (`receivables.ts`), bukan dari
     * sebuah kolom nilai — faktur tanpa baris bernilai NOL dan dilewati diam-
     * diam oleh umur piutang, yaitu persis kegagalan yang bagian ini ada untuk
     * memperbaikinya. Sisi UTANG tidak simetris: `supplier_transactions` dibaca
     * dari kolom `amount`, jadi ia tidak butuh baris apa pun.
     */
    for (const r of input.receivables) {
      const amount = num(r.amount);
      if (amount <= 0) continue;
      const date = r.documentDate ?? input.company.fiscalYearStart;
      await tx.invoice.create({
        data: {
          invoiceNo: r.documentNo?.trim() || `SA-AR-${customerIdFor(r)}`,
          date,
          dueDate: r.dueDate ?? null,
          customerId: customerIdFor(r),
          currency: r.currency,
          rate: r.rate ?? null,
          baseAmount: round2(amount * rateFor(r.currency, r.rate)),
          isOpening: true,
          status: "pending",
          items: {
            create: [
              {
                itemName: `Saldo awal piutang — ${r.partnerName}`,
                quantity: 1,
                price: amount,
              },
            ],
          },
        },
      });
    }

    for (const p of input.payables) {
      const amount = num(p.amount);
      if (amount <= 0) continue;
      await tx.supplierTransaction.create({
        data: {
          supplierId: supplierIdFor(p),
          date: p.documentDate ?? input.company.fiscalYearStart,
          dueDate: p.dueDate ?? null,
          type: "purchase",
          amount,
          currency: p.currency,
          rate: p.rate ?? null,
          baseAmount: round2(amount * rateFor(p.currency, p.rate)),
          isOpening: true,
          note: `Saldo awal utang — ${p.partnerName}`,
        },
      });
    }

    /*
     * ══ REGISTER ASET TETAP (issue #381 tahap 4) ═══════════════════════════
     *
     * Sisi kedua dari baris jurnal aset tetap di atas. Keduanya dalam
     * transaksi yang SAMA — setengahnya saja adalah persis cacat yang bagian
     * ini ada untuk mencegahnya: register tanpa jurnal (daftar aset terisi,
     * neraca nol) atau jurnal tanpa register (neraca terisi, daftar aset
     * kosong dan tidak ada yang bisa disusutkan).
     *
     * ⚠ TIDAK ada baris `fixed_asset_depreciation` yang dibuat, dan itu
     * disengaja: setiap baris riwayat di aplikasi ini berpasangan dengan
     * JURNAL yang benar-benar diposting, sementara beban bulan-bulan itu sudah
     * dibebankan di pembukuan lama. Yang dibawa hanya KEADAANNYA
     * (`accumulatedDepreciation` + `lastDepreciation*`), dan `depreciateAsset`
     * menolak periode yang sudah tercakup keadaan itu.
     */
    for (const a of input.fixedAssets) {
      await tx.fixedAsset.create({
        data: {
          assetNo: a.assetNo,
          name: a.name,
          categoryId: a.categoryId,
          acquisitionDate: a.acquisitionDate,
          acquisitionCost: a.cost,
          residualValue: a.residual,
          usefulLifeMonths: a.usefulLifeMonths,
          assetAccountId: a.assetAccountId,
          accumulatedAccountId: a.accumulatedAccountId,
          expenseAccountId: a.expenseAccountId,
          location: a.location,
          status: "active",
          accumulatedDepreciation: a.accumulated,
          lastDepreciationYear: a.lastDepreciationYear,
          lastDepreciationMonth: a.lastDepreciationMonth,
        },
      });
    }

    /*
     * ══ SISI KEDUA PERSEDIAAN: BUKU PEMBANTUNYA (issue #379) ═══════════════
     *
     * Jurnal di atas baru menyatakan NILAINYA. Tanpa gerakan stok pembuka,
     * laporan Nilai Persediaan — yang membaca `stock_movements`, bukan jurnal —
     * tetap kosong, dan perusahaan memulai hidupnya dengan dua angka yang
     * menjawab pertanyaan yang sama secara berbeda.
     *
     * Bentuknya meniru PEMBELIAN, satu-satunya tempat di sistem ini yang kedua
     * sisinya memang sudah sinkron: jurnalnya mendebit Persediaan, dan
     * gerakan stoknya (`createStockInMovementsInTx`) sengaja tidak memposting
     * apa pun. Di sini pun begitu.
     *
     * ⚠ `postForSource` TIDAK dipanggil, dan itu keputusan yang disengaja.
     * Memanggilnya tidak akan menggandakan apa pun — `buildStockMovementEntry`
     * memulangkan `null` untuk gerakan `in` — tapi justru itu masalahnya:
     * sebuah pemanggilan yang tidak melakukan apa-apa adalah pemanggilan yang
     * akan disalahpahami orang berikutnya sebagai "di sinilah jurnalnya
     * terbit". Nilainya sudah ada di jurnal pembuka, satu baris di atas.
     *
     * Tanggalnya SAMA dengan jurnal pembuka: rata-rata tertimbang membaca
     * gerakan urut waktu, dan stok yang seolah masuk sesudah transaksi pertama
     * akan salah menghargai HPP-nya.
     */
    for (const row of input.inventory) {
      await tx.stockMovement.create({
        data: {
          itemId: row.itemId,
          quantity: row.quantity,
          type: "in",
          date: input.company.fiscalYearStart,
          unitCost: row.unitCost,
          note: `Saldo awal — ${row.itemName}`,
        },
      });
    }

    const saved = await tx.companySetting.update({
      where: { id: setting.id },
      data: {
        name: input.company.name,
        address: input.company.address ?? null,
        baseCurrency: input.company.baseCurrency,
        fiscalYearStart: input.company.fiscalYearStart,
        npwp: input.company.npwp ?? null,
        isPkp: input.company.isPkp ?? true,
        taxName: input.company.taxName ?? null,
        taxAddress: input.company.taxAddress ?? null,
        // Modul (issue #99): NULL = semua aktif, jadi wizard yang dilewati
        // begitu saja meninggalkan aplikasi persis seperti sebelum fitur ini ada.
        businessCategory: input.company.businessCategory ?? null,
        enabledModules: input.company.enabledModules ?? null,
        isSetup: true,
        openingJournalId: journal?.id ?? null,
      },
    });

    return {
      settingId: saved.id,
      journalId: journal?.id ?? null,
      journalNumber: journal?.number ?? null,
      equityPlug,
    };
  });
}

/** Kunci pencocokan nama mitra — tanpa peduli huruf besar/kecil & spasi tepi. */
function partnerKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Id setiap mitra yang disebut saldo awal — yang sudah ada dipakai ulang, yang
 * belum ada dibuat (issue #425).
 *
 * Dipanggil DI DALAM transaksi penyiapan. Nama kembar di dalam satu berkas
 * (dua faktur untuk pelanggan yang sama) hanya melahirkan SATU baris master:
 * peta ini dibaca sebelum setiap pembuatan.
 */
async function resolveOpeningPartners(
  input: OpeningBalancesInput,
  tx: Prisma.TransactionClient
): Promise<{ customers: Map<string, number>; suppliers: Map<string, number> }> {
  const wantedCustomers = input.receivables.filter((r) => r.partnerId == null);
  const wantedSuppliers = input.payables.filter((p) => p.partnerId == null);

  const customers = new Map<string, number>();
  const suppliers = new Map<string, number>();

  if (wantedCustomers.length > 0) {
    for (const row of await tx.customer.findMany({ select: { id: true, name: true } })) {
      customers.set(partnerKey(row.name), row.id);
    }
    for (const r of wantedCustomers) {
      const key = partnerKey(r.partnerName);
      if (customers.has(key)) continue;
      const created = await tx.customer.create({
        data: { name: r.partnerName.trim() },
        select: { id: true },
      });
      customers.set(key, created.id);
    }
  }

  if (wantedSuppliers.length > 0) {
    for (const row of await tx.supplier.findMany({ select: { id: true, name: true } })) {
      suppliers.set(partnerKey(row.name), row.id);
    }
    for (const p of wantedSuppliers) {
      const key = partnerKey(p.partnerName);
      if (suppliers.has(key)) continue;
      const created = await tx.supplier.create({
        data: { name: p.partnerName.trim() },
        select: { id: true },
      });
      suppliers.set(key, created.id);
    }
  }

  return { customers, suppliers };
}
