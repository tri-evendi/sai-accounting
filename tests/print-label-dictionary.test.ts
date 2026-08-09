/**
 * Kalimat cetakan vs kalimat kamus — penjaga agar SATU laporan tidak berbicara
 * dengan DUA suara (issue #298).
 *
 * ── Kenapa berkas ini ada ───────────────────────────────────────────────────
 * Untuk laporan yang sama, label barisnya datang dari dua tempat: layar membaca
 * kunci kamus (`t("reports.…")`), sedangkan PDF dan lembar sebar membaca
 * konstanta bahasa Indonesia di `statement-layout.ts` / lapisan ekspor. Saat
 * #241, #258, #274 dan #275 mendarat, keduanya SENGAJA disamakan — tapi tidak
 * ada yang memaksa mereka TETAP sama. Mengganti satu kalimat di `id.json` adalah
 * pekerjaan yang wajar dan sering; layarnya ikut, cetakannya tidak, dan tidak
 * ada yang merah.
 *
 * ── Mana yang jadi sumber: KEDUANYA, dan penjaga ini yang mengikatnya ───────
 * Pilihan lain adalah membuat konstanta cetakan MEMBACA kamus, jadi hanya ada
 * satu sumber. Itu tidak diambil, dan alasannya tiga:
 *
 *  1. **#278 memutuskan ekspor TIDAK ber-i18n**: berkas yang lepas dari layarnya
 *     tetap berbahasa Indonesia karena ia menyentuh dokumen pajak. Kalau
 *     konstanta cetakan membaca kamus, sebuah suntingan yang dimaksudkan untuk
 *     LAYAR diam-diam ikut mengubah dokumen yang sudah dikirim orang — persis
 *     bahaya yang #278 tutup.
 *  2. **`statement-layout.ts` tidak mengimpor apa pun** (lihat kepala berkasnya):
 *     ia dipakai penyusun PDF yang berjalan di peramban. Menyeret `id.json`
 *     (200 KB) ke sana berarti menyeretnya ke bundel klien tombol Unduh PDF.
 *  3. Sebagian kalimat cetakan memang **harus** berbeda — judul kolom uang di
 *     kertas menyebut satuannya ("Kas Masuk (IDR)") karena selnya belum tentu
 *     mengulang "Rp". Sumber tunggal tetap butuh daftar pengecualian; ia hanya
 *     memindahkan daftar ini, sambil menambah satu impor.
 *
 * Ukurannya sendiri mendukung: dari 72 pasang yang diperiksa, 54 sama huruf demi
 * huruf, dan untuk EMPAT laporan keuangan label barisnya sama 100%. Karena itu
 * penjaga ini murah — ia memaku hubungan yang sudah ada, bukan memasang pipa
 * baru.
 *
 * ── Tiga daftar, dan kenapa daftar ketiganya ada ────────────────────────────
 *  • `PADANAN` — kalimat cetakan yang WAJIB sama dengan nilai kamus
 *    Indonesia-nya (atau sama + " (IDR)", lihat `Bentuk`). Nilai cetakannya
 *    diambil dari konstanta yang sungguhan, bukan disalin ke sini, jadi penjaga
 *    ini menangkap perubahan di KEDUA sisi.
 *  • `BEDA_HARI_INI` — pasangan yang HARI INI memang tidak sama. Ia TIDAK
 *    diperbaiki di sini: mengubah keluaran ekspor menyentuh dokumen yang sudah
 *    dikirim orang, dan itu keputusan tersendiri (rambu #298). Yang dilakukan
 *    penjaga: memaku KEDUA sisinya pada bunyinya hari ini, jadi tidak satu pun
 *    bisa bergeser diam-diam — dan memeriksa bahwa keduanya MASIH berbeda,
 *    supaya entri yang sudah didamaikan harus pindah ke `PADANAN` alih-alih
 *    tertinggal sebagai pengecualian yang tidak lagi mengecualikan apa pun.
 *    #309 memutuskan kedelapan temuan #298 satu per satu: tiga didamaikan dari
 *    sisi LAYAR dan pindah ke `PADANAN`, lima tinggal di sini dengan sebab yang
 *    kini menyebutkan sisi mana yang benar dan apa akibat mengubahnya.
 *  • `TANPA_PADANAN` — kalimat cetakan yang memang tidak punya lawan di kamus,
 *    beserta sebabnya. Pengecualian yang ditulis lebih baik daripada penjaga
 *    yang dilonggarkan.
 *
 * Dan sebuah pemeriksaan KELENGKAPAN: setiap kunci dari setiap tabel kalimat
 * cetakan harus muncul di salah satu dari tiga daftar itu. Kolom baru tidak bisa
 * lahir tanpa satu keputusan sadar tentang bunyinya.
 *
 * ── Cakupannya bisa BERTAMBAH, dan sekali sudah ────────────────────────────
 * Kalimat cetakan yang ditulis sebaris di dalam badan fungsi ekspor tidak bisa
 * dijangkau berkas ini — bukan karena tak layak dijaga, melainkan karena tak ada
 * yang bisa diimpor. Jalan keluarnya memindahkannya ke konstanta, dan itulah
 * yang #310 lakukan pada judul kolom pihak Umur Piutang/Utang: dua kalimat yang
 * kemarin tak terjaga kini dipasangkan di sini (`AGING_PARTY_HEADERS`), dan satu
 * di antaranya langsung menunjukkan ketidakcocokan yang selama ini tak terlihat.
 * Daftar "yang sengaja dilewati" di bawah adalah keadaan hari ini, bukan batas
 * permanen.
 *
 * Ada bentuk kedua dari kekurangan yang sama, dan ia TIDAK menambah satu pun
 * pasangan di sini: sebuah kalimat yang sudah dipatok di berkas ini boleh saja
 * hanya menjangkau SEBAGIAN permukaan cetak. `PARTY_RECAP_HEADERS` dipatok sejak
 * #298, tapi sampai #315 ia hanya dibaca lapisan PDF — lembar sebarnya
 * menyimpan salinan sebaris yang identik huruf demi huruf, jadi patok di sini
 * hijau sementara Excel-nya bebas bergeser. #315 membuat kedua lapisan membaca
 * konstanta ini; jumlah pasangannya tetap, yang berubah adalah berapa banyak
 * dokumen yang benar-benar terikat pada patoknya. Yang menjaga PEMAKAIAN-nya —
 * bukan bunyinya — adalah `tests/party-recap-header-shape.test.ts`.
 *
 * ── Yang sengaja DILEWATI penjaga ini, dan sebabnya ─────────────────────────
 *  • **Nama lembar & judul dokumen** (`name`/`title` di `report-export.ts`:
 *    "Neraca", "Laporan Arus Kas", "Kartu Stok / Mutasi Persediaan", …). Mereka
 *    bukan label baris melainkan nama DOKUMEN, dan lawan layarnya adalah judul
 *    halaman yang mengikuti aturan penamaan sendiri: dua dari empat laporan
 *    keuangan diberi awalan "Laporan" di berkasnya ("Laporan Arus Kas" vs
 *    "Arus Kas" di layar) dan dua lainnya tidak ("Neraca", "Neraca Saldo").
 *    Menyamakannya adalah keputusan penamaan, bukan pekerjaan penjaga.
 *  • **Kalimat keadaan kosong & catatan kaki** yang ditulis sebaris di lapisan
 *    ekspor ("Tidak ada dokumen pada periode ini.", catatan valas tanpa kurs).
 *    Alasannya sama: mereka tidak berbentuk konstanta — dan JANGAN mengira
 *    mereka tunggal. #322 menghitungnya: SEPULUH kalimat keadaan ekspor punya
 *    DUA salinan yang bunyinya sama, satu di `report-export.ts` dan satu di
 *    `pdf/statement-pdf.ts`, keduanya di dalam badan fungsi. Tujuh identik huruf
 *    demi huruf ("Tidak ada mutasi pada periode ini." 362/620, "Tidak ada hitung
 *    ulang stok pada periode ini." 413/654, "Tidak ada dokumen pada periode
 *    ini." 483/707, "Tidak ada dokumen yang belum lunas." 551/934, "Belum ada
 *    barang." 637/857, "Tidak ada akun kas & bank yang bergerak pada periode
 *    ini." 682/825, "Belum ada anggaran untuk periode ini." 745/773), satu
 *    catatan kaki umur piutang/utang identik (587/942), dan dua catatan valas
 *    yang hanya berbeda nama variabelnya (490/724 dan 591/946). Menyunting satu
 *    sisi mana pun membuat PDF dan Excel dari laporan yang SAMA berhenti
 *    sepakat, tanpa satu tes pun merah.
 *
 *    Yang KESEBELAS sudah keluar dari daftar ini: nama baris tanpa mitra
 *    ("Tanpa pelanggan"/"Tanpa pemasok") pindah ke `PARTY_RECAP_NO_PARTY` di
 *    `statement-layout.ts` (#322) dan kini dipasangkan di `PADANAN` — ia isi
 *    SEL, jadi ia tidak menumpang di tabel judul kolom. Sepuluh sisanya tidak
 *    ikut karena masing-masing menuntut keputusan tersendiri, bukan sekadar
 *    pemindahan: bunyi layarnya BERBEDA dari bunyi cetakannya — layar rekap
 *    mitra berkata "Tidak ada tagihan penjualan pada periode ini."
 *    (`reports.salesByCustomerEmpty`) sementara kertasnya berkata "Tidak ada
 *    dokumen pada periode ini." — jadi memindahkannya berarti sekalian memilih
 *    sisi mana yang menang, dan itu mengubah berkas yang sudah dikirim orang.
 *    Kalimat yang pindah di #322 tidak menuntut pilihan semacam itu: kedua
 *    sisinya sudah berbunyi sama.
 *  • **Anotasi** — `cashFlowReconciliationNote()`, `balanceSheetBalanceNote()`,
 *    marjin kotor, arah hasil. Bentuknya memang BERBEDA per permukaan (lencana
 *    di layar, tanda kurung di kertas); `tests/*-shape.test.ts` sudah
 *    memperlakukannya sebagai anotasi, bukan label.
 */
import { describe, expect, it } from "vitest";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { CASH_FLOW_CATEGORY_LABELS } from "@/lib/reports";
import { formatNumber } from "@/lib/utils";
import {
  AGING_HEADERS,
  AGING_PARTY_HEADERS,
  BALANCE_SHEET_HEADERS,
  BALANCE_SHEET_PRINT_LABELS,
  BUDGET_HEADERS,
  CASH_BANK_HEADERS,
  CASH_FLOW_HEADERS,
  CASH_FLOW_PRINT_LABELS,
  INCOME_STATEMENT_HEADERS,
  INCOME_STATEMENT_PRINT_LABELS,
  PARTY_RECAP_HEADERS,
  PARTY_RECAP_NO_PARTY,
  STOCK_MOVEMENT_HEADERS,
  STOCK_VALUE_HEADERS,
  TRIAL_BALANCE_HEADERS,
  TRIAL_BALANCE_PRINT_LABELS,
} from "@/lib/statement-layout";

/** Penerjemah bahasa SUMBER — kamus `id.json` yang sungguhan, bukan tiruan. */
const t = (key: string, values?: Record<string, string | number>) =>
  translate(id, key, values);

/**
 * Bagaimana kalimat cetakan berhubungan dengan nilai kamusnya.
 *
 * `kamus+IDR` bukan kelonggaran melainkan ATURAN yang berlaku di seluruh berkas
 * ekspor: judul kolom uang di kertas menyebut satuannya, karena selnya belum
 * tentu mengulang "Rp" dan lembar sebar menyimpan angka telanjang. Layar tidak
 * perlu — di sana setiap sel uang digambar `Money`, yang selalu membawa "Rp".
 * Dinyatakan sebagai aturan, bukan sebagai pasangan yang dipatok, supaya
 * penggantian kata di kamus tetap tertangkap: ubah `reports.colCashIn` menjadi
 * "Kas Diterima" dan penjaga ini menuntut kertasnya berbunyi
 * "Kas Diterima (IDR)".
 */
type Bentuk = "sama" | "kamus+IDR";

interface Padanan {
  /** Tempat kalimat cetakan itu tinggal, `KONSTANTA.kunci`. */
  di: string;
  /** Nilai yang BENAR-BENAR dicetak — diambil dari konstantanya, bukan disalin. */
  cetak: string;
  /** Kunci kamus yang dibaca layar untuk kalimat yang sama. */
  kunci: string;
  bentuk?: Bentuk;
  /** Nilai sisipan, untuk kunci berparameter. */
  nilai?: Record<string, string | number>;
}

/** Contoh sisipan — bunyinya tak penting, susunan katanya yang diuji. */
const KELOMPOK = "Aktivitas Operasi";
const SEKSI = "Aset";
const MARJIN = 33.3;

const PADANAN: Padanan[] = [
  // ── Arus Kas (#241) ───────────────────────────────────────────────────────
  { di: "CASH_FLOW_PRINT_LABELS.opening", cetak: CASH_FLOW_PRINT_LABELS.opening, kunci: "reports.openingCashRow" },
  { di: "CASH_FLOW_PRINT_LABELS.closing", cetak: CASH_FLOW_PRINT_LABELS.closing, kunci: "reports.closingCashRow" },
  { di: "CASH_FLOW_PRINT_LABELS.total", cetak: CASH_FLOW_PRINT_LABELS.total, kunci: "reports.netCashRow" },
  { di: "CASH_FLOW_PRINT_LABELS.empty", cetak: CASH_FLOW_PRINT_LABELS.empty, kunci: "reports.noCashMovement" },
  {
    di: "CASH_FLOW_PRINT_LABELS.subtotal()",
    cetak: CASH_FLOW_PRINT_LABELS.subtotal(KELOMPOK),
    kunci: "reports.groupSubtotal",
    nilai: { group: KELOMPOK },
  },
  { di: "CASH_FLOW_CATEGORY_LABELS.operating", cetak: CASH_FLOW_CATEGORY_LABELS.operating, kunci: "cashFlowCategory.operating" },
  { di: "CASH_FLOW_CATEGORY_LABELS.investing", cetak: CASH_FLOW_CATEGORY_LABELS.investing, kunci: "cashFlowCategory.investing" },
  { di: "CASH_FLOW_CATEGORY_LABELS.financing", cetak: CASH_FLOW_CATEGORY_LABELS.financing, kunci: "cashFlowCategory.financing" },
  { di: "CASH_FLOW_CATEGORY_LABELS.uncategorised", cetak: CASH_FLOW_CATEGORY_LABELS.uncategorised, kunci: "cashFlowCategory.uncategorised" },
  { di: "CASH_FLOW_HEADERS.item", cetak: CASH_FLOW_HEADERS.item, kunci: "reports.colSourceUse" },
  { di: "CASH_FLOW_HEADERS.inflow", cetak: CASH_FLOW_HEADERS.inflow, kunci: "reports.colCashIn", bentuk: "kamus+IDR" },
  { di: "CASH_FLOW_HEADERS.outflow", cetak: CASH_FLOW_HEADERS.outflow, kunci: "reports.colCashOut", bentuk: "kamus+IDR" },
  { di: "CASH_FLOW_HEADERS.net", cetak: CASH_FLOW_HEADERS.net, kunci: "reports.colCashNet", bentuk: "kamus+IDR" },

  // ── Neraca (#258) ─────────────────────────────────────────────────────────
  { di: "BALANCE_SHEET_PRINT_LABELS.assets", cetak: BALANCE_SHEET_PRINT_LABELS.assets, kunci: "reports.sectionAssets" },
  { di: "BALANCE_SHEET_PRINT_LABELS.liabilities", cetak: BALANCE_SHEET_PRINT_LABELS.liabilities, kunci: "reports.sectionLiabilities" },
  { di: "BALANCE_SHEET_PRINT_LABELS.equity", cetak: BALANCE_SHEET_PRINT_LABELS.equity, kunci: "reports.sectionEquity" },
  {
    di: "BALANCE_SHEET_PRINT_LABELS.sectionTotal()",
    cetak: BALANCE_SHEET_PRINT_LABELS.sectionTotal(SEKSI),
    kunci: "reports.sectionTotal",
    nilai: { section: SEKSI },
  },
  { di: "BALANCE_SHEET_PRINT_LABELS.currentNetIncome", cetak: BALANCE_SHEET_PRINT_LABELS.currentNetIncome, kunci: "reports.currentNetIncome" },
  { di: "BALANCE_SHEET_PRINT_LABELS.empty", cetak: BALANCE_SHEET_PRINT_LABELS.empty, kunci: "reports.noAccountsInSection" },
  { di: "BALANCE_SHEET_PRINT_LABELS.totalAssets", cetak: BALANCE_SHEET_PRINT_LABELS.totalAssets, kunci: "reports.totalAssets" },
  { di: "BALANCE_SHEET_PRINT_LABELS.totalLiabilitiesEquity", cetak: BALANCE_SHEET_PRINT_LABELS.totalLiabilitiesEquity, kunci: "reports.totalLiabilitiesEquity" },
  { di: "BALANCE_SHEET_HEADERS.item", cetak: BALANCE_SHEET_HEADERS.item, kunci: "common.description" },
  { di: "BALANCE_SHEET_HEADERS.amount", cetak: BALANCE_SHEET_HEADERS.amount, kunci: "reports.colStatementAmount" },

  // ── Neraca Saldo (#275) ───────────────────────────────────────────────────
  { di: "TRIAL_BALANCE_PRINT_LABELS.empty", cetak: TRIAL_BALANCE_PRINT_LABELS.empty, kunci: "reports.trialBalanceEmptyTitle" },
  { di: "TRIAL_BALANCE_PRINT_LABELS.total", cetak: TRIAL_BALANCE_PRINT_LABELS.total, kunci: "common.total" },
  { di: "TRIAL_BALANCE_HEADERS.code", cetak: TRIAL_BALANCE_HEADERS.code, kunci: "accounts.colCode" },
  { di: "TRIAL_BALANCE_HEADERS.name", cetak: TRIAL_BALANCE_HEADERS.name, kunci: "accounts.nameField" },
  { di: "TRIAL_BALANCE_HEADERS.debit", cetak: TRIAL_BALANCE_HEADERS.debit, kunci: "journal.colDebitIdr" },
  { di: "TRIAL_BALANCE_HEADERS.credit", cetak: TRIAL_BALANCE_HEADERS.credit, kunci: "journal.colCreditIdr" },

  // ── Laba/Rugi (#274) ──────────────────────────────────────────────────────
  { di: "INCOME_STATEMENT_PRINT_LABELS.sales", cetak: INCOME_STATEMENT_PRINT_LABELS.sales, kunci: "reports.sectionRevenue" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.cogs", cetak: INCOME_STATEMENT_PRINT_LABELS.cogs, kunci: "reports.sectionCogs" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.operatingExpense", cetak: INCOME_STATEMENT_PRINT_LABELS.operatingExpense, kunci: "reports.sectionOperatingExpense" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.otherIncome", cetak: INCOME_STATEMENT_PRINT_LABELS.otherIncome, kunci: "reports.sectionOtherIncome" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.otherExpense", cetak: INCOME_STATEMENT_PRINT_LABELS.otherExpense, kunci: "reports.sectionOtherExpense" },
  {
    di: "INCOME_STATEMENT_PRINT_LABELS.sectionTotal()",
    cetak: INCOME_STATEMENT_PRINT_LABELS.sectionTotal(SEKSI),
    kunci: "reports.sectionTotal",
    nilai: { section: SEKSI },
  },
  { di: "INCOME_STATEMENT_PRINT_LABELS.grossProfit", cetak: INCOME_STATEMENT_PRINT_LABELS.grossProfit, kunci: "reports.grossProfitRow" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.operatingProfit", cetak: INCOME_STATEMENT_PRINT_LABELS.operatingProfit, kunci: "reports.operatingProfitRow" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.netIncome", cetak: INCOME_STATEMENT_PRINT_LABELS.netIncome, kunci: "reports.netIncomeRow" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.empty", cetak: INCOME_STATEMENT_PRINT_LABELS.empty, kunci: "reports.noAccountsInSection" },
  {
    di: "INCOME_STATEMENT_PRINT_LABELS.grossMargin()",
    cetak: INCOME_STATEMENT_PRINT_LABELS.grossMargin(MARJIN),
    kunci: "reports.grossMarginNote",
    // Layar menyisipkan `formatNumber(pct)`; cetakan memformat sendiri dengan
    // `Intl.NumberFormat("id-ID")`. Dua pemformat yang harus menghasilkan satu
    // bunyi — jadi penjaga ini memakai yang dipakai LAYAR.
    nilai: { pct: formatNumber(MARJIN) },
  },
  { di: "INCOME_STATEMENT_PRINT_LABELS.result(laba)", cetak: INCOME_STATEMENT_PRINT_LABELS.result(true), kunci: "reports.profit" },
  { di: "INCOME_STATEMENT_PRINT_LABELS.result(rugi)", cetak: INCOME_STATEMENT_PRINT_LABELS.result(false), kunci: "reports.loss" },

  // ── Riwayat Stok ──────────────────────────────────────────────────────────
  { di: "STOCK_MOVEMENT_HEADERS.name", cetak: STOCK_MOVEMENT_HEADERS.name, kunci: "common.item" },
  { di: "STOCK_MOVEMENT_HEADERS.unit", cetak: STOCK_MOVEMENT_HEADERS.unit, kunci: "common.unit" },
  { di: "STOCK_MOVEMENT_HEADERS.opening", cetak: STOCK_MOVEMENT_HEADERS.opening, kunci: "stockMovement.colOpening" },
  { di: "STOCK_MOVEMENT_HEADERS.movedIn", cetak: STOCK_MOVEMENT_HEADERS.movedIn, kunci: "stockMovement.colIn" },
  { di: "STOCK_MOVEMENT_HEADERS.movedOut", cetak: STOCK_MOVEMENT_HEADERS.movedOut, kunci: "stockMovement.colOut" },
  { di: "STOCK_MOVEMENT_HEADERS.processed", cetak: STOCK_MOVEMENT_HEADERS.processed, kunci: "stockMovement.colProcessed" },
  { di: "STOCK_MOVEMENT_HEADERS.closing", cetak: STOCK_MOVEMENT_HEADERS.closing, kunci: "stockMovement.colClosing" },

  // ── Nilai Persediaan ──────────────────────────────────────────────────────
  { di: "STOCK_VALUE_HEADERS.name", cetak: STOCK_VALUE_HEADERS.name, kunci: "common.item" },
  { di: "STOCK_VALUE_HEADERS.unit", cetak: STOCK_VALUE_HEADERS.unit, kunci: "common.unit" },
  { di: "STOCK_VALUE_HEADERS.unitCost", cetak: STOCK_VALUE_HEADERS.unitCost, kunci: "inventory.colUnitCost", bentuk: "kamus+IDR" },
  { di: "STOCK_VALUE_HEADERS.stockValue", cetak: STOCK_VALUE_HEADERS.stockValue, kunci: "inventory.colValue", bentuk: "kamus+IDR" },

  // ── Kas & Bank ────────────────────────────────────────────────────────────
  // Didamaikan di #309: layar dulu memakai `reports.perCashAccountTitle` —
  // kunci JUDUL KARTU — sebagai judul kolom. Kuncinya sendiri tetap ada dan
  // tetap dipakai kartunya di halaman Arus Kas; yang lahir adalah kunci kolom.
  { di: "CASH_BANK_HEADERS.account", cetak: CASH_BANK_HEADERS.account, kunci: "reports.colCashBankAccount" },
  { di: "CASH_BANK_HEADERS.opening", cetak: CASH_BANK_HEADERS.opening, kunci: "reports.colOpeningBalance", bentuk: "kamus+IDR" },
  { di: "CASH_BANK_HEADERS.net", cetak: CASH_BANK_HEADERS.net, kunci: "reports.colChange", bentuk: "kamus+IDR" },
  { di: "CASH_BANK_HEADERS.closing", cetak: CASH_BANK_HEADERS.closing, kunci: "reports.colClosingBalance", bentuk: "kamus+IDR" },

  // ── Umur Piutang / Umur Utang ─────────────────────────────────────────────
  { di: "AGING_HEADERS.documentNo", cetak: AGING_HEADERS.documentNo, kunci: "common.document" },
  { di: "AGING_HEADERS.date", cetak: AGING_HEADERS.date, kunci: "common.date" },
  { di: "AGING_HEADERS.dueDate", cetak: AGING_HEADERS.dueDate, kunci: "common.dueDate" },
  { di: "AGING_HEADERS.age", cetak: AGING_HEADERS.age, kunci: "common.age" },
  { di: "AGING_HEADERS.status", cetak: AGING_HEADERS.status, kunci: "common.status" },
  { di: "AGING_HEADERS.outstanding", cetak: AGING_HEADERS.outstanding, kunci: "common.remainingIdr" },
  // Satu konstanta, dua layar. Piutang setuju; utang tidak — lihat BEDA_HARI_INI.
  { di: "AGING_HEADERS.total", cetak: AGING_HEADERS.total, kunci: "receivables.colDocumentValue" },
  // Kolom pihak — terjangkau penjaga ini sejak #310 memindahkannya ke
  // `statement-layout.ts`; sebelumnya ia string sebaris di dua lapisan ekspor.
  // Sisi utangnya TIDAK sama dengan layarnya — lihat BEDA_HARI_INI.
  { di: "AGING_PARTY_HEADERS.receivables", cetak: AGING_PARTY_HEADERS.receivables, kunci: "common.customer" },

  // ── Realisasi vs Anggaran ─────────────────────────────────────────────────
  { di: "BUDGET_HEADERS.account", cetak: BUDGET_HEADERS.account, kunci: "common.account" },
  { di: "BUDGET_HEADERS.budget", cetak: BUDGET_HEADERS.budget, kunci: "budget.colBudget", bentuk: "kamus+IDR" },
  { di: "BUDGET_HEADERS.actual", cetak: BUDGET_HEADERS.actual, kunci: "budget.colActual", bentuk: "kamus+IDR" },
  { di: "BUDGET_HEADERS.variance", cetak: BUDGET_HEADERS.variance, kunci: "budget.variance", bentuk: "kamus+IDR" },

  // ── Penjualan per Pelanggan / Pembelian per Pemasok ───────────────────────
  // Konstantanya tinggal di `statement-layout.ts` sejak #315 dan kini dibaca
  // KEDUA lapisan ekspor; sebelumnya patok di bawah hanya mengikat PDF-nya.
  // Judul kolom uang di sini membawa "(IDR)" di KEDUA sisi (bentuk "sama",
  // bukan "kamus+IDR"): selnya digambar `Money hideCurrency`, jadi layar pun
  // harus menyebut satuannya di judul — lihat `party-recap-table.tsx`.
  { di: "PARTY_RECAP_HEADERS.sales-by-customer.party", cetak: PARTY_RECAP_HEADERS["sales-by-customer"].party, kunci: "reports.colCustomer" },
  // Didamaikan di #309, dan itu perbaikan KEBENARAN bukan pilihan kata: kolom
  // ini menggambar `grossBase` — nilai SEBELUM retur, yang kolom Retur di
  // sebelahnya kurangkan menjadi Bersih. Layar menghilangkan kata "Kotor" dari
  // judulnya; angkanya tidak pernah salah, namanya yang kurang menyebutkan.
  { di: "PARTY_RECAP_HEADERS.sales-by-customer.gross", cetak: PARTY_RECAP_HEADERS["sales-by-customer"].gross, kunci: "reports.colGrossSales" },
  { di: "PARTY_RECAP_HEADERS.sales-by-customer.returns", cetak: PARTY_RECAP_HEADERS["sales-by-customer"].returns, kunci: "reports.colReturns" },
  { di: "PARTY_RECAP_HEADERS.sales-by-customer.net", cetak: PARTY_RECAP_HEADERS["sales-by-customer"].net, kunci: "reports.colNet" },
  { di: "PARTY_RECAP_HEADERS.purchases-by-supplier.party", cetak: PARTY_RECAP_HEADERS["purchases-by-supplier"].party, kunci: "reports.colSupplier" },
  { di: "PARTY_RECAP_HEADERS.purchases-by-supplier.gross", cetak: PARTY_RECAP_HEADERS["purchases-by-supplier"].gross, kunci: "reports.colGrossPurchases" },
  { di: "PARTY_RECAP_HEADERS.purchases-by-supplier.returns", cetak: PARTY_RECAP_HEADERS["purchases-by-supplier"].returns, kunci: "reports.colReturns" },
  { di: "PARTY_RECAP_HEADERS.purchases-by-supplier.net", cetak: PARTY_RECAP_HEADERS["purchases-by-supplier"].net, kunci: "reports.colNet" },

  // Isi SEL, bukan judul kolom — dan kalimat cetakan pertama yang masuk ke
  // jangkauan berkas ini bukan sebagai judul (#322). Sampai #322 ia ditulis
  // sebaris di KEDUA lapisan ekspor, jadi tak ada yang bisa diimpor ke sini;
  // sekarang kedua permukaan menyebut baris tanpa mitra dengan kata yang sama
  // sebagai syarat, bukan sebagai kebetulan.
  { di: "PARTY_RECAP_NO_PARTY.sales-by-customer", cetak: PARTY_RECAP_NO_PARTY["sales-by-customer"], kunci: "reports.noCustomerLabel" },
  { di: "PARTY_RECAP_NO_PARTY.purchases-by-supplier", cetak: PARTY_RECAP_NO_PARTY["purchases-by-supplier"], kunci: "reports.noSupplierLabel" },
];

interface Beda {
  di: string;
  /** Nilai hidup, dibaca dari konstantanya. */
  cetak: string;
  /** Bunyi cetakan HARI INI, ditulis apa adanya sebagai patok. */
  patok: string;
  kunci: string;
  /** Bunyi kamus HARI INI, dipatok supaya suntingan di sisi layar pun merah. */
  kamus: string;
  sebab: string;
}

/**
 * Ketidakcocokan yang SUDAH ADA hari ini. Temuan, bukan pekerjaan: keluarannya
 * tidak diubah di sini (rambu #298 — berkas ekspor sudah dikirim orang).
 *
 * ── Yang tersisa setelah #309 ───────────────────────────────────────────────
 * #298 menemukan DELAPAN. #309 memutuskan kedelapannya satu per satu dan
 * mendamaikan yang bisa didamaikan dari SISI LAYAR — layar tidak pernah
 * diarsipkan siapa pun, jadi memperbaikinya tidak menyentuh berkas yang sudah
 * dikirim:
 *  • `CASH_BANK_HEADERS.account` — layar salah kunci (judul kartu dipakai
 *    sebagai judul kolom); lahir `reports.colCashBankAccount`.
 *  • `…gross` ×2 — layar menghilangkan kata "Kotor" dari kolom yang memang
 *    memuat nilai sebelum retur; kamusnya yang diperbaiki.
 *
 * LIMA yang tinggal di bawah ini menunggu keputusan pemilik laporan, dan
 * masing-masing menuliskan sebabnya — satu kalimat yang sama bentuknya: sisi
 * mana yang menurut #309 benar, dan apa yang harus ikut berubah kalau
 * keputusannya diambil. Tiga (currentStock, docCount ×2) hanya bisa didamaikan
 * ke arah yang benar dengan mengubah bunyi CETAKAN — yaitu berkas yang sudah
 * dikirim & diarsipkan orang; satu (BUDGET_HEADERS.status) diusulkan TETAP
 * berbeda karena bedanya beralasan pada bentuk permukaannya; dan satu
 * (AGING_HEADERS.total) sebetulnya bisa didamaikan dari sisi layar, tapi
 * bentuk `AGING_HEADERS` sedang disentuh #310 dan dua PR tidak boleh
 * memindahkan konstanta yang sama.
 */
const BEDA_HARI_INI: Beda[] = [
  {
    di: "STOCK_VALUE_HEADERS.currentStock",
    cetak: STOCK_VALUE_HEADERS.currentStock,
    patok: "Saldo",
    kunci: "inventory.colCurrentStock",
    kamus: "Sisa Stok",
    sebab:
      "Kertas menulis \"Saldo\", layar \"Sisa Stok\" — dua nama untuk satu kolom, " +
      "dan keduanya benar menurut sumbernya sendiri. #309: kolomnya KUANTITAS, " +
      "sementara \"Saldo\" di seluruh laporan lain berarti uang (Saldo Awal / " +
      "Saldo Akhir Kas & Bank) — jadi \"Sisa Stok\" yang lebih jujur. Tapi " +
      "keduanya tidak bisa didamaikan dari sisi layar: `inventory.colCurrentStock` " +
      "juga judul kolom halaman Persediaan, permukaan awam yang justru butuh " +
      "kata biasa. Mendamaikannya berarti KERTAS yang ikut — yaitu mengubah " +
      "berkas yang sudah dikirim. (Label pemilih kolom sudah tidak ikut sejak " +
      "#316: ia membaca kunci kamus ini, jadi dialognya menyebut \"Sisa Stok\" " +
      "seperti layarnya; lihat tests/report-catalog-column-labels.test.ts.) " +
      "Menunggu keputusan pemilik laporan.",
  },
  {
    di: "AGING_HEADERS.total",
    cetak: AGING_HEADERS.total,
    patok: "Nilai Dokumen",
    kunci: "payables.colPurchaseValue",
    kamus: "Nilai Pembelian",
    sebab:
      "Satu konstanta melayani dua laporan: Piutang setuju (\"Nilai Dokumen\"), " +
      "Utang menyebutnya \"Nilai Pembelian\" di layar. #309: mendamaikannya " +
      "TIDAK harus memecah konstantanya — cukup layar Utang ikut menyebut " +
      "\"Nilai Dokumen\" seperti kembarannya di Piutang. Ditinggalkan sebagai " +
      "keputusan karena bentuk AGING_HEADERS sedang disentuh #310.",
  },
  {
    di: "BUDGET_HEADERS.status",
    cetak: BUDGET_HEADERS.status,
    patok: "Keterangan",
    kunci: "common.status",
    kamus: "Status",
    sebab:
      "Layar \"Status\", kertas \"Keterangan\". #309: ini satu-satunya dari " +
      "delapan yang bedanya BERALASAN pada bentuk permukaannya — layar " +
      "menggambar `VarianceBadge` (lencana keadaan, jadi \"Status\"), kertas " +
      "menulis kalimat \"Di atas / Di bawah / Sesuai anggaran\" dan pada baris " +
      "totalnya \"N akun melewati ambang\", yang memang keterangan dan bukan " +
      "status. Mendamaikannya juga tidak murah: layar memakai `common.status`, " +
      "kunci milik BERSAMA belasan halaman. Usul #309: TETAP BERBEDA.",
  },
  {
    di: "PARTY_RECAP_HEADERS.sales-by-customer.docCount",
    cetak: PARTY_RECAP_HEADERS["sales-by-customer"].docCount,
    patok: "Dokumen",
    kunci: "reports.colDocuments",
    kamus: "Jumlah Dokumen",
    sebab:
      "Layar \"Jumlah Dokumen\" (ia cacah), kertas \"Dokumen\". #309: di sini " +
      "LAYAR yang lebih tepat, jadi mendamaikannya dari sisi layar justru " +
      "menurunkan ketepatan — \"Dokumen\" sudah dipakai kolom NOMOR dokumen di " +
      "Umur Piutang/Utang (`common.document`), dan satu kata untuk dua arti di " +
      "keluarga laporan yang sama membingungkan. Dialog parameter pun " +
      "menamainya \"Jumlah Dokumen\" (report-catalog.ts). Usulannya: kertas " +
      "ikut menjadi \"Jumlah Dokumen\" — tapi itu mengubah berkas yang sudah " +
      "dikirim, jadi ia keputusan pemilik laporan, bukan perapian.",
  },
  {
    di: "PARTY_RECAP_HEADERS.purchases-by-supplier.docCount",
    cetak: PARTY_RECAP_HEADERS["purchases-by-supplier"].docCount,
    patok: "Dokumen",
    kunci: "reports.colDocuments",
    kamus: "Jumlah Dokumen",
    sebab: "Sama dengan Penjualan per Pelanggan — satu kunci kamus, dua laporan.",
  },
  /*
   * Baru terlihat di #310, bukan baru terjadi: judul kolom pihak Umur Utang
   * tadinya string sebaris di dalam badan fungsi ekspor, di luar jangkauan
   * penjaga ini. Setelah ia pindah ke `statement-layout.ts`, ketidakcocokan
   * yang sudah ada sejak dulu ikut kelihatan — dan diperlakukan seperti
   * ketidakcocokan lain di daftar ini: dipatok, tidak diperbaiki (rambu #298).
   */
  {
    di: "AGING_PARTY_HEADERS.payables",
    cetak: AGING_PARTY_HEADERS.payables,
    patok: "Pemasok",
    kunci: "payables.colSupplier",
    kamus: "Supplier",
    sebab:
      "Kertas menulis \"Pemasok\", layar \"Supplier\" — dan aplikasi ini memakai " +
      "kedua kata di tempat berbeda (menu \"Pemasok\", halaman utang \"Supplier\").",
  },
];

interface TanpaPadanan {
  di: string;
  /** Nilai hidup, dibaca dari konstantanya. */
  cetak: string;
  /** Bunyi cetakan HARI INI, ditulis apa adanya sebagai patok. */
  patok: string;
  sebab: string;
}

/** Kalimat cetakan yang memang tidak punya lawan di kamus. */
const TANPA_PADANAN: TanpaPadanan[] = [
  {
    di: "CASH_FLOW_PRINT_LABELS.group",
    cetak: CASH_FLOW_PRINT_LABELS.group("operating", CASH_FLOW_CATEGORY_LABELS.operating),
    patok: "Aktivitas Operasi",
    sebab:
      "Ia bukan kalimat melainkan penerus: cetakan mengembalikan `printLabel` apa " +
      "adanya, dan bunyi yang sesungguhnya datang dari CASH_FLOW_CATEGORY_LABELS " +
      "— yang dijaga terpisah di PADANAN.",
  },
  {
    di: "BUDGET_HEADERS.variancePct",
    cetak: BUDGET_HEADERS.variancePct,
    patok: "Selisih %",
    sebab:
      "Layar menulis kolom ini sebagai \"%\" — sebuah string mati di halamannya, " +
      "bukan kunci kamus. Tidak ada nilai kamus untuk dibandingkan; menambah " +
      "kuncinya adalah pekerjaan i18n, bukan pekerjaan penjaga.",
  },
];

/**
 * Setiap tabel kalimat cetakan yang dijaga berkas ini. Kelengkapannya diperiksa
 * per KUNCI, jadi kolom baru tidak bisa lahir tanpa satu keputusan sadar
 * tentang bunyinya.
 *
 * Diketik `object`, bukan `Record<string, unknown>`: tabel yang berbentuk
 * INTERFACE (`CashFlowLabels`, `BalanceSheetLabels`, …) tidak punya index
 * signature tersirat, jadi `Record<string, unknown>` menolaknya — dan
 * melonggarkannya jadi `any` berarti kehilangan penjaga ini tanpa suara.
 */
const TABEL: Record<string, object> = {
  CASH_FLOW_PRINT_LABELS,
  CASH_FLOW_HEADERS,
  CASH_FLOW_CATEGORY_LABELS,
  BALANCE_SHEET_PRINT_LABELS,
  BALANCE_SHEET_HEADERS,
  TRIAL_BALANCE_PRINT_LABELS,
  TRIAL_BALANCE_HEADERS,
  INCOME_STATEMENT_PRINT_LABELS,
  STOCK_MOVEMENT_HEADERS,
  STOCK_VALUE_HEADERS,
  CASH_BANK_HEADERS,
  AGING_HEADERS,
  AGING_PARTY_HEADERS,
  BUDGET_HEADERS,
  "PARTY_RECAP_HEADERS.sales-by-customer": PARTY_RECAP_HEADERS["sales-by-customer"],
  "PARTY_RECAP_HEADERS.purchases-by-supplier": PARTY_RECAP_HEADERS["purchases-by-supplier"],
  PARTY_RECAP_NO_PARTY,
};

/** `FOO.bar()` dan `FOO.bar(laba)` sama-sama menyebut kunci `bar`. */
function tempat(di: string): string {
  return di.replace(/\(.*\)$/, "");
}

const DISEBUT = new Set(
  [...PADANAN, ...BEDA_HARI_INI, ...TANPA_PADANAN].map((e) => tempat(e.di))
);

describe("kalimat cetakan vs kamus Indonesia (issue #298)", () => {
  describe("kalimat yang wajib sama", () => {
    for (const p of PADANAN) {
      it(`${p.di} = ${p.kunci}`, () => {
        const kamus = t(p.kunci, p.nilai);
        // Kunci yang hilang dikembalikan `translate` apa adanya — tanpa
        // pemeriksaan ini, kunci yang salah ketik akan "gagal" dengan pesan
        // yang menyalahkan konstantanya.
        expect(kamus, `kunci "${p.kunci}" tidak ada di id.json`).not.toBe(p.kunci);
        const harusnya = p.bentuk === "kamus+IDR" ? `${kamus} (IDR)` : kamus;
        expect(
          p.cetak,
          `${p.di} berbunyi lain dari kamusnya. Layar memakai "${p.kunci}"; ` +
            "kalau kalimat itu sengaja diganti, ganti KEDUANYA — mengubah " +
            "kalimat cetakan berarti mengubah berkas yang sudah dikirim orang, " +
            "jadi perubahannya harus terlihat di diff sebagai keputusan."
        ).toBe(harusnya);
      });
    }
  });

  /*
   * Yang dipatok di sini adalah KEDUA sisinya. Menyunting kamusnya membuat tes
   * ini merah persis seperti menyunting konstanta cetakannya — yaitu tujuan
   * seluruh berkas ini. Bedanya dari `PADANAN` hanya satu: pasangan ini tidak
   * pernah sama, jadi penjaganya tidak bisa berbentuk persamaan.
   */
  describe("ketidakcocokan yang sudah ada — dipatok, bukan diperbaiki", () => {
    for (const b of BEDA_HARI_INI) {
      it(`${b.di} vs ${b.kunci}`, () => {
        expect(
          b.cetak,
          `bunyi cetakan ${b.di} berubah. Ia sengaja berbeda dari layar hari ini ` +
            `(${b.sebab}) — dan mengubahnya berarti mengubah berkas yang sudah ` +
            "dikirim orang, jadi perubahannya harus diputuskan, bukan disisipkan."
        ).toBe(b.patok);
        expect(
          t(b.kunci),
          `bunyi kamus "${b.kunci}" berubah. Kolom ini sudah beda antara layar ` +
            `dan berkas (${b.sebab}); kalau bunyinya diganti, putuskan sekalian ` +
            "mana yang menang dan perbarui entri ini."
        ).toBe(b.kamus);
        expect(
          b.cetak,
          `${b.di} dan "${b.kunci}" kini SAMA. Pengecualiannya sudah tidak ` +
            "mengecualikan apa pun — pindahkan entrinya ke PADANAN supaya ia " +
            "dijaga sebagai persamaan."
        ).not.toBe(b.kamus);
      });
    }
  });

  describe("kalimat cetakan tanpa lawan di kamus", () => {
    for (const x of TANPA_PADANAN) {
      it(`${x.di} berdiri sendiri`, () => {
        expect(
          x.cetak,
          `${x.di} berubah bunyi. Ia tidak punya lawan di kamus (${x.sebab}), ` +
            "jadi tidak ada persamaan yang bisa menjaganya — hanya patok ini. " +
            "Kalau perubahannya disengaja, perbarui patoknya dalam diff yang sama."
        ).toBe(x.patok);
      });
    }
  });

  /*
   * Penjaga bagi penjaganya. Tanpa ini, kolom baru bisa lahir dengan bunyi yang
   * tidak pernah dibandingkan dengan apa pun — dan berkas ini akan tetap hijau
   * sambil menjaga makin sedikit.
   */
  it("setiap kunci di setiap tabel kalimat cetakan sudah diputuskan nasibnya", () => {
    const yatim: string[] = [];
    for (const [nama, tabel] of Object.entries(TABEL)) {
      for (const kunci of Object.keys(tabel)) {
        if (!DISEBUT.has(`${nama}.${kunci}`)) yatim.push(`${nama}.${kunci}`);
      }
    }
    expect(
      yatim,
      "Kalimat cetakan berikut tidak disebut di PADANAN, BEDA_HARI_INI, maupun " +
        "TANPA_PADANAN. Tambahkan entrinya: kalau layar punya kalimat yang sama, " +
        "ia PADANAN; kalau bunyinya berbeda hari ini, ia BEDA_HARI_INI (dan " +
        "temuan yang dilaporkan, bukan diperbaiki diam-diam); kalau memang tak " +
        "ada lawannya di kamus, ia TANPA_PADANAN beserta sebabnya."
    ).toEqual([]);
  });

  /*
   * Laba/Rugi dan Neraca sengaja BERBAGI satu tabel judul kolom (#274): keduanya
   * laporan uang dua kolom, dan layar pun memakai kunci kamus yang sama. Kalau
   * suatu saat ia dipecah menjadi dua konstanta, keduanya harus masuk PADANAN
   * masing-masing — dan tes ini yang mengingatkan.
   */
  it("judul kolom Laba/Rugi masih tabel yang sama dengan Neraca", () => {
    expect(INCOME_STATEMENT_HEADERS).toBe(BALANCE_SHEET_HEADERS);
  });
});
