/**
 * Pesan validasi (zod) yang MENGIKUTI BAHASA — fondasi fase A.
 *
 * ── Masalahnya ──────────────────────────────────────────────────────────────
 * Pesan zod dipanggang saat modul dimuat (`z.string().min(1, "…")`), sekali
 * untuk seluruh proses. Jadi pesan itu TIDAK BISA diterjemahkan di dalam skema:
 *
 *   • mengubah skema menjadi pabrik (`makeInvoiceSchema(t)`) melanggar aturan
 *     "satu skema, diimpor bukan disalin" (Konvensi Form MASTER.md) dan
 *     merontokkan `tests/form-schema-parity.test.ts`;
 *   • `z.setErrorMap()` global adalah state tingkat modul yang dibagi seluruh
 *     permintaan server yang berjalan bersamaan — bahasa satu pengguna akan
 *     bocor ke pengguna lain.
 *
 * ── Bentuk yang dipakai ─────────────────────────────────────────────────────
 * Skema membawa KUNCI kamus yang stabil; penerjemahan terjadi di setiap BATAS
 * TAMPILAN, tempat bahasa pengguna memang diketahui:
 *
 *   skema  →  "validation.dateRequired"
 *               ├── client: `FormMessage` (components/ui/form.tsx) → useT/kamus
 *               ├── server: `translateFieldErrors()` di route handler
 *               └── jalur pesan API: `humanizeFieldMessage()` (lib/form-guards)
 *
 * Kunci ditulis lewat `vmsg("validation.…")`, yang bertipe `ValidationKey` —
 * salah ketik ditolak `tsc`, bukan baru terlihat sebagai teks aneh di layar.
 *
 * ── Kenapa ADA teks bahasa Indonesia di berkas ini ──────────────────────────
 * `VALIDATION_MESSAGES` adalah cadangan bahasa sumber, persis pola yang sudah
 * dipakai `lib/constants.ts`, `lib/nav.ts`, dan `lib/quick-actions.ts`: nilai
 * literal untuk modul murni, kamus untuk tampilan, dan `tests/i18n.test.ts`
 * menahan keduanya tetap satu kata.
 *
 * Gunanya bukan kenyamanan, melainkan JAMINAN: batas tampilan yang belum
 * menerima kamus (fase B belum menyapu seluruh route API, fase C belum menyapu
 * `form-guards.ts`) tetap menampilkan kalimat bahasa Indonesia yang SAMA PERSIS
 * seperti sebelum penyapuan ini — bukan `validation.dateRequired` mentah di
 * layar pengguna.
 *
 * MURNI: tanpa React, tanpa `next/headers`, tanpa Prisma, tanpa `server-only`.
 * Dipakai skema (client + server), `FormMessage`, route handler, dan tes.
 */

import { lookupMessage, type Dictionary, type DictionaryKey, type TranslationValues } from "./dictionary";

/** Kunci kamus di bawah namespace `validation.` — satu-satunya yang sah di skema. */
export type ValidationKey = Extract<DictionaryKey, `validation.${string}`>;

/**
 * Kunci pesan sebagai `string`, untuk slot `message` zod yang hanya menerima
 * string. Fungsinya identitas; nilainya ada pada TIPE argumennya — inilah yang
 * membuat `z.string().min(1, vmsg("validation.dateRequierd"))` gagal `tsc`.
 */
export function vmsg(key: ValidationKey): string {
  return key;
}

/**
 * Pesan BERPARAMETER (nominal, mata uang) untuk `ctx.addIssue`.
 *
 * Nilai penampung tidak bisa ikut lewat `message` saja: `zodResolver` hanya
 * meneruskan `message` ke react-hook-form, dan `error.flatten()` polos juga
 * membuang sisanya. Karena itu bentuknya dua lapis:
 *
 *   • `message` — sudah berisi kalimat bahasa sumber yang TERISI, jadi batas
 *     tampilan mana pun (termasuk yang belum disapu) menampilkan kalimat yang
 *     sama persis seperti sebelumnya;
 *   • `params`  — kunci + nilainya, sebagai data terstruktur milik zod (bukan
 *     sandi yang diselundupkan ke dalam teks pesan), sehingga
 *     `translateFieldErrors()` bisa menyusun ulang kalimatnya dalam bahasa
 *     pengguna.
 */
export function vissue(
  key: ValidationKey,
  values: TranslationValues
): { message: string; params: { i18nKey: ValidationKey; i18nValues: TranslationValues } } {
  return {
    message: interpolate(VALIDATION_MESSAGES[key], values),
    params: { i18nKey: key, i18nValues: values },
  };
}

/** Ganti `{nama}` dengan nilainya; penampung tanpa nilai dibiarkan apa adanya. */
function interpolate(text: string, values: TranslationValues): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Teks satu pesan validasi dalam bahasa pengguna.
 *
 * Menerima APA SAJA, karena itulah yang sebenarnya lewat di batas tampilan:
 * kunci kamus dari skema, prosa dari server, hasil `humanizeFieldMessage`, atau
 * pesan yang bukan keduanya. Urutannya:
 *
 *   1. kunci yang ada di kamus aktif  → teksnya, dalam bahasa pengguna;
 *   2. kunci `validation.*` tanpa kamus → cadangan bahasa Indonesia;
 *   3. selain itu                      → dikembalikan APA ADANYA.
 *
 * Langkah 3 yang membuat prosa server & teks yang sudah dimanusiakan tetap
 * tampil; langkah 2 yang memastikan kunci mentah tidak pernah sampai ke layar.
 */
export function translateMessage(
  dictionary: Dictionary | null | undefined,
  message: string,
  values?: TranslationValues
): string {
  if (!message) return message;
  const fromDictionary = lookupMessage(dictionary, message, values);
  if (fromDictionary !== null) return fromDictionary;
  const fallback = sourceMessage(message);
  return fallback === null ? message : interpolate(fallback, values ?? {});
}

/** Teks bahasa sumber bila `message` adalah kunci validasi; null bila bukan. */
export function sourceMessage(message: string): string | null {
  return Object.prototype.hasOwnProperty.call(VALIDATION_MESSAGES, message)
    ? VALIDATION_MESSAGES[message as ValidationKey]
    : null;
}

/** Apakah teks ini sebuah kunci pesan validasi (dan bukan prosa)? */
export function isValidationKey(message: string): message is ValidationKey {
  return sourceMessage(message) !== null;
}

/** Bentuk `error.flatten()` — sengaja diketik lepas dari versi zod. */
export interface FlatFieldErrors {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}

/** Sepotong `ZodError` yang dibutuhkan penerjemah — bukan seluruh kelasnya. */
interface FlattenableError {
  flatten<U>(mapper: (issue: TranslatableIssue) => U): {
    formErrors: U[];
    fieldErrors: Record<string, U[] | undefined>;
  };
}

interface TranslatableIssue {
  message: string;
  params?: Record<string, unknown>;
}

/**
 * `error.flatten()` yang isinya sudah berbahasa pengguna — dipakai route
 * handler sebagai `details` pada jawaban 400:
 *
 * ```ts
 * const parsed = invoiceSchema.safeParse(body);
 * if (!parsed.success) {
 *   const { dictionary, t } = await getRequestI18n();   // lib/i18n/server
 *   return NextResponse.json(
 *     { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
 *     { status: 400 }
 *   );
 * }
 * ```
 *
 * Pesan yang BUKAN kunci (prosa yang sudah ditulis manusia, atau keluaran
 * bawaan zod untuk `.max()` tanpa pesan) diteruskan apa adanya — menerjemahkan
 * tidak boleh berarti menelan yang tidak dikenal.
 */
export function translateFieldErrors(
  error: FlattenableError,
  dictionary: Dictionary | null | undefined
): FlatFieldErrors {
  return error.flatten((issue) => translateIssue(issue, dictionary));
}

/** Satu issue zod → kalimat berbahasa pengguna (menghormati `vissue` params). */
export function translateIssue(
  issue: TranslatableIssue,
  dictionary: Dictionary | null | undefined
): string {
  const params = issue.params;
  const key = params?.i18nKey;
  if (typeof key === "string") {
    const values = (params?.i18nValues ?? {}) as TranslationValues;
    return translateMessage(dictionary, key, values);
  }
  return translateMessage(dictionary, issue.message);
}

/**
 * Teks bahasa sumber (Indonesia) setiap kunci validasi.
 *
 * Bertipe `Record<ValidationKey, string>` DENGAN SENGAJA: menambah kunci di
 * `dictionaries/id.json` tanpa menambahkannya di sini langsung ditolak `tsc`,
 * dan sebaliknya. `tests/i18n-validation.test.ts` menahan teksnya tetap sama
 * kata demi kata dengan `id.json`.
 */
export const VALIDATION_MESSAGES: Record<ValidationKey, string> = {
  "validation.dateRequired": "Tanggal wajib diisi",
  // Templat transaksi berulang (issue #469).
  "validation.dateInvalid": "Tanggal belum benar (gunakan format tahun-bulan-hari).",
  "validation.sourceRequired": "Dokumen sumber wajib dipilih.",
  "validation.maxOccurrencesPositive": "Jumlah kejadian harus lebih dari nol.",
  "validation.endBeforeStart": "Tanggal berakhir tidak boleh mendahului tanggal mulai.",
  "validation.amountPositive": "Jumlah harus lebih besar dari 0",
  "validation.quantityPositive": "Jumlah harus lebih besar dari 0",
  "validation.emailInvalid": "Format email tidak valid",
  "validation.invalidInput": "Isian belum benar. Periksa lagi bagian yang bertanda merah.",
  "validation.ratePositive": "Kurs harus lebih besar dari 0",
  "validation.rateRequiredUsd": "Kurs ke IDR wajib diisi untuk mata uang USD.",
  "validation.rateRequiredCny": "Kurs ke IDR wajib diisi untuk mata uang CNY.",
  "validation.rateRequiredForeign": "Kurs ke IDR wajib diisi untuk mata uang asing.",
  // Kas fisik hanya rupiah (migrasi 0059) — slot `cash_kas_besar`/`cash_kas_kecil`
  // tidak punya baris per mata uang, jadi valas di situ mendarat di akun rupiah.
  "validation.cashPhysicalIdrOnly":
    "Kas Besar / Kas Kecil hanya untuk dokumen rupiah. Untuk mata uang asing, pilih Bank.",
  "validation.cashOnPaymentOnly":
    "Kas/bank hanya diisi pada pembayaran, bukan pada pembelian.",
  // Pemasok pada kartu stok (migrasi 0058) — hanya arah MASUK yang punya pengirim.
  "validation.supplierOnStockInOnly": "Pemasok hanya diisi pada barang masuk.",
  "validation.cashTypeOnStockInOnly": "Pemotongan kas hanya berlaku pada barang masuk.",
  "validation.accountCodeRequired": "Kode perkiraan wajib diisi",
  "validation.accountNameRequired": "Nama akun wajib diisi",
  "validation.costCenterCodeRequired": "Kode pusat biaya wajib diisi",
  "validation.costCenterNameRequired": "Nama pusat biaya wajib diisi",
  "validation.accountRequired": "Akun wajib dipilih",
  "validation.counterAccountRequired": "Akun lawan wajib dipilih",
  "validation.journalLineNotBoth": "Baris tidak boleh berisi debit dan kredit sekaligus",
  "validation.journalLineNeedsValue": "Baris harus punya nilai debit atau kredit",
  "validation.journalMinTwoLines": "Jurnal minimal 2 baris",
  "validation.advanceAmountPositive": "Jumlah uang muka harus lebih besar dari 0",
  "validation.advanceCustomerRequired": "Pelanggan wajib dipilih untuk uang muka penjualan.",
  "validation.advanceSalesNoSupplier": "Uang muka penjualan tidak boleh menunjuk supplier.",
  "validation.advanceSupplierRequired": "Supplier wajib dipilih untuk uang muka pembelian.",
  "validation.advancePurchaseNoCustomer": "Uang muka pembelian tidak boleh menunjuk pelanggan.",
  "validation.compensationAmountPositive": "Jumlah kompensasi harus lebih besar dari 0",
  "validation.advanceUsedTwice": "Uang muka yang sama dikompensasi lebih dari sekali.",
  "validation.compensationExceedsAdvance": "Kompensasi ({amount} {currency}) melebihi sisa uang muka ({remaining} {currency}).",
  "validation.rejectionNoteRequired": "Alasan penolakan wajib diisi (minimal 5 karakter).",
  "validation.identifierRequired": "Email atau nama pengguna wajib diisi",
  "validation.nameRequired": "Nama wajib diisi",
  "validation.termsRequired": "Anda harus menyetujui syarat & ketentuan",
  "validation.passwordRequired": "Kata sandi wajib diisi",
  "validation.currentPasswordRequired": "Kata sandi saat ini wajib diisi",
  "validation.passwordMin8": "Kata sandi minimal 8 karakter",
  "validation.passwordConfirmRequired": "Ulangi kata sandi baru untuk memastikan",
  "validation.passwordMismatch": "Kata sandi tidak sama",
  "validation.passwordSameAsCurrent":
    "Kata sandi baru harus berbeda dari kata sandi saat ini",
  "validation.tooManyOverrideRows": "Terlalu banyak baris override.",
  "validation.companyDatabasePrefix": "Nama basis data harus berawalan \"sai_\"",
  "validation.companySlugInvalid": "Slug hanya boleh huruf kecil, angka, dan tanda hubung (mis. pt-bumi-baru)",
  "validation.slugInvalid": "Alamat hanya boleh huruf kecil, angka, dan tanda hubung.",
  "validation.companySlugReserved": "Slug \"dashboard\" dicadangkan sistem — pilih nama lain",
  "validation.companyDatabaseInvalid": "Nama basis data hanya boleh huruf kecil, angka, dan garis bawah",
  "validation.itemNameRequired": "Nama barang wajib diisi",
  "validation.bagsMin0": "Bags harus 0 atau lebih",
  "validation.kgPerBagMin0": "Kg per bag harus 0 atau lebih",
  "validation.priceMin0": "Harga harus 0 atau lebih",
  "validation.contractNoRequired": "Nomor kontrak wajib diisi",
  "validation.buyerRequired": "Nama pembeli wajib diisi",
  "validation.atLeastOneItem": "Minimal satu baris barang",
  "validation.invoiceNoRequired": "Nomor tagihan wajib diisi",
  "validation.taxRateNotNegative": "Tarif PPN tidak boleh negatif",
  "validation.taxRateUnreasonable": "Tarif PPN tidak masuk akal",
  "validation.taxAmountNotNegative": "Pajak tidak boleh negatif",
  "validation.pickStockItem": "Pilih barang dari master stok.",
  "validation.minOneItem": "Minimal satu barang",
  "validation.maxFiftyItems": "Maksimal 50 barang",
  "validation.lineQuantityPositive": "Kuantitas (bags × kg/bag) harus lebih besar dari nol.",
  "validation.descriptionRequired": "Keterangan wajib diisi",
  "validation.debitOrCredit": "Isi salah satu: Uang Masuk atau Uang Keluar. Salah satunya harus lebih dari 0.",
  "validation.allocationAmountPositive": "Jumlah alokasi harus lebih besar dari 0",
  "validation.purchaseAllocatedTwice": "Pembelian yang sama dialokasikan lebih dari sekali.",
  "validation.allocationExceedsPayment": "Total alokasi ({total}) melebihi jumlah pembayaran ({payment}).",
  "validation.taxOnPurchaseOnly": "PPN hanya berlaku untuk transaksi pembelian, bukan pembayaran.",
  "validation.allocationOnPaymentOnly": "Alokasi hanya berlaku untuk transaksi pembayaran, bukan pembelian.",
  "validation.supplierNameRequired": "Nama pemasok wajib diisi",
  "validation.customerNameRequired": "Nama pelanggan wajib diisi",
  "validation.consigneeNameRequired": "Nama penerima barang wajib diisi",
  "validation.categoryNameRequired": "Nama kategori wajib diisi",
  "validation.usefulLifePositive": "Umur manfaat (bulan) harus lebih dari 0",
  "validation.assetNameRequired": "Nama aset wajib diisi",
  "validation.acquisitionDateRequired": "Tanggal perolehan wajib diisi",
  "validation.residualBelowCost": "Nilai residu harus lebih kecil dari nilai perolehan.",
  "validation.disposalDateRequired": "Tanggal pelepasan wajib diisi",
  "validation.transferDateRequired": "Tanggal pindah wajib diisi",
  "validation.toLocationRequired": "Lokasi tujuan wajib diisi",
  "validation.unitCostPositive": "Harga pokok per unit harus lebih besar dari 0",
  "validation.unitCostRequiredForStockIn": "Harga pokok per unit (IDR) wajib diisi untuk barang masuk, agar HPP saat barang keluar dapat dihitung.",
  "validation.physicalQtyNotNegative": "Jumlah fisik tidak boleh negatif",
  "validation.opnameMinOneItem": "Isi minimal satu barang untuk dihitung",
  "validation.yearInvalid": "Tahun tidak valid",
  "validation.monthInvalid": "Bulan tidak valid",
  "validation.reopenReasonRequired": "Alasan buka kembali wajib diisi (minimal 5 karakter)",
  "validation.periodStartRequired": "Tanggal awal periode wajib diisi",
  "validation.periodEndRequired": "Tanggal akhir periode wajib diisi",
  "validation.periodEndBeforeStart": "Tanggal akhir periode tidak boleh sebelum tanggal awal.",
  "validation.statementDescriptionRequired": "Deskripsi wajib diisi",
  "validation.statementAmountNonZero": "Nominal harus angka dan tidak boleh 0.",
  "validation.returnQuantityPositive": "Jumlah retur harus lebih besar dari nol",
  "validation.minOneReturnLine": "Minimal satu baris retur",
  "validation.openingBalancePositive": "Saldo harus lebih besar dari 0",
  "validation.openingStockPositive": "Kuantitas saldo awal harus lebih besar dari nol",
  "validation.openingStockCostPositive": "Harga pokok saldo awal harus lebih besar dari nol",
  "validation.openingStockDuplicateItem": "Barang ini sudah punya baris saldo awal",
  "validation.companyNameRequired": "Nama perusahaan wajib diisi",
  "validation.fiscalYearStartRequired": "Awal tahun buku wajib diisi",
  "validation.openingPartnerRequired":
    "Pilih mitra dari daftar, atau sebutkan namanya bila ia belum terdaftar.",
  "validation.atLeastOneOpeningBalance": "Isi minimal satu saldo awal (kas/bank, piutang, utang, atau persediaan).",
  "validation.partnerTwice": "Partner yang sama muncul lebih dari sekali.",
  "validation.partnerPickOrCreate": "Pilih mitra dari daftar, atau isi data mitra baru.",
  "validation.partnerNameRequired": "Nama wajib diisi untuk mitra baru.",
  "validation.receiptQuantityPositive": "Jumlah barang masuk harus lebih besar dari 0",
  "validation.receiptDateRequired": "Tanggal barang masuk wajib diisi",
  "validation.operatorReasonRequired": "Alasan wajib diisi (minimal 5 karakter)",
  "validation.invoiceRequired": "Tagihan wajib dipilih",
  "validation.bankRefRequired": "Referensi bank wajib diisi (minimal 3 karakter)",
  "validation.planRequired": "Paket wajib dipilih",
  "validation.confirmSlugRequired": "Ketik ulang slug tenant untuk melanjutkan",
  "validation.mailFromRequired": "Alamat pengirim wajib diisi",
  "validation.mailHostRequired": "Host SMTP wajib diisi untuk transport SMTP",
  "validation.mailPortRequired": "Port SMTP wajib diisi untuk transport SMTP",
  "validation.mailPortInvalid": "Port harus angka 1–65535",
  "validation.amountRequired": "Jumlah wajib diisi",
  "validation.amountNotNegative": "Jumlah tidak boleh negatif",
  "validation.amountTooLarge": "Jumlah terlalu besar",
  "validation.categoryRequired": "Kategori wajib dipilih",
  "validation.taxRateOutOfRange": "Tarif PPN harus antara 0 dan 100 persen",
  // Kode barang (issue #493) — identitas barang sejak nama berhenti jadi kunci.
  "validation.itemCodeRequired": "Kode barang wajib diisi",
  // Hasil Proses (issue #490).
  "validation.shrinkageValuePositive": "Nilai susut harus lebih dari nol",
  "validation.shrinkageValueRequired": "Nilai susut wajib diisi untuk Hasil Proses",
  "validation.taxRateDateInvalid": "Tanggal mulai berlaku harus tanggal yang sah (YYYY-MM-DD)",
  // Manufaktur (#495 butir 3). Urutannya CERMIN `id.json` — penjaganya
  // (`tests/i18n-validation`) menuntut kunci yang sama pada urutan yang sama,
  // supaya kamus dan sumbernya tidak bisa menyimpang diam-diam.
  // `nameRequired` dipakai ulang dari atas.
  "validation.codeRequired": "Kode wajib diisi",
  "validation.rateNotNegative": "Tarif tidak boleh negatif",
  "validation.scrapNotNegative": "Susut tidak boleh negatif",
  "validation.scrapBelow100":
    "Susut harus di bawah 100% — pada 100% tidak ada keluaran yang tersisa.",
  "validation.hoursNotNegative": "Jam tidak boleh negatif",
  "validation.pickWorkCenter": "Pilih stasiun kerja",
  "validation.pickBom": "Pilih resep produksi",
  "validation.producedPositive":
    "Jumlah hasil harus lebih dari nol. Bahan yang habis tanpa hasil dicatat sebagai susut proses.",
};
