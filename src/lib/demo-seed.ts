/**
 * Data CONTOH sebuah buku — inti yang bisa dipanggil dua pihak (issue #355).
 *
 * ══ KENAPA BERKAS INI ADA ═══════════════════════════════════════════════════
 *
 * Semula seluruh isinya tinggal di `scripts/seed-demo.ts`, dan itu cukup selama
 * pemanggilnya cuma baris perintah. Sejak buku perusahaan BARU ikut diisi data
 * contoh pada akhir wisaya penyiapan, pemanggilnya ada DUA — sebuah skrip tsx
 * dan sebuah route Next — dan menyalin 200 baris transaksi ke tempat kedua
 * berarti dua kumpulan angka yang akan berpisah diam-diam pada perubahan
 * pertama. Karena itu angkanya tinggal di SINI, dan kedua pemanggil hanya
 * membawa pagar masing-masing.
 *
 * ── TANPA `import "server-only"`, DAN ITU DISENGAJA ────────────────────────
 * `scripts/seed-demo.ts` berjalan di bawah `tsx`, di luar bundler Next. Modul
 * yang diawali `server-only` mati di sana sebelum baris pertamanya berjalan —
 * persis alasan skrip itu tidak pernah menyentuh `lib/company-registry.ts`.
 * Berkas ini karena itu tidak boleh menambahkannya, dan tidak boleh mengimpor
 * apa pun yang membawanya.
 *
 * ── KONTEKS PERUSAHAAN ADALAH URUSAN PEMANGGIL ────────────────────────────
 * Tidak ada `runWithCompany()` di sini. Route mendapat konteksnya dari penjaga;
 * skrip membungkus panggilannya sendiri (doktrin #104). Menaruhnya di sini akan
 * menyembunyikan pertanyaan "buku SIAPA yang sedang diisi" — pertanyaan yang di
 * aplikasi akuntansi multi-PT tidak boleh pernah tersembunyi.
 */

import { prisma } from "@/lib/prisma";
import { postForSource } from "@/lib/posting";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import { OPENING_BALANCE_SOURCE } from "@/lib/opening-balance";

/** Penanda baris contoh — muncul di layar, jadi tak pernah menyamar jadi data asli. */
export const SAMPLE_TAG = "[CONTOH]";

export const SAMPLE_CUSTOMERS = [
  { name: `${SAMPLE_TAG} Toko Sinar Jaya`, address: "Jl. Merdeka No. 12, Bandung", phone: "022-4210031", pic: "Bu Ratna" },
  { name: `${SAMPLE_TAG} CV Berkah Mandiri`, address: "Jl. Diponegoro No. 8, Semarang", phone: "024-3517722", pic: "Pak Hendra" },
  { name: `${SAMPLE_TAG} Warung Bu Tini`, address: "Jl. Pasar Baru No. 3, Bekasi", phone: "021-8891234", pic: "Bu Tini" },
];

export const SAMPLE_SUPPLIERS = [
  { name: `${SAMPLE_TAG} PT Sumber Pangan`, address: "Jl. Industri Raya No. 20, Tangerang", phone: "021-5523100" },
  { name: `${SAMPLE_TAG} UD Tani Makmur`, address: "Jl. Raya Solo No. 45, Klaten", phone: "0272-321900" },
];

/**
 * Tiga bulan penjualan. Sengaja NAIK dari bulan ke bulan supaya laporan
 * perbandingan periode punya sesuatu untuk ditunjukkan — demo yang datar tidak
 * mengajarkan apa pun tentang membaca tren.
 */
export const SAMPLE_SALES = [
  { monthsAgo: 3, day: 6, customer: 0, amount: 12_500_000, paidAfterDays: 12 },
  { monthsAgo: 3, day: 19, customer: 1, amount: 8_750_000, paidAfterDays: 20 },
  { monthsAgo: 2, day: 4, customer: 2, amount: 6_200_000, paidAfterDays: 9 },
  { monthsAgo: 2, day: 15, customer: 0, amount: 15_400_000, paidAfterDays: 18 },
  { monthsAgo: 2, day: 27, customer: 1, amount: 9_900_000, paidAfterDays: null }, // masih piutang
  { monthsAgo: 1, day: 8, customer: 2, amount: 11_300_000, paidAfterDays: 14 },
  { monthsAgo: 1, day: 21, customer: 0, amount: 18_600_000, paidAfterDays: null }, // masih piutang
];

/** Pembelian ke pemasok — pasangan biaya bagi penjualan di atas. */
export const SAMPLE_PURCHASES = [
  { monthsAgo: 3, day: 3, supplier: 0, amount: 7_400_000 },
  { monthsAgo: 2, day: 2, supplier: 1, amount: 5_100_000 },
  { monthsAgo: 2, day: 20, supplier: 0, amount: 8_800_000 },
  { monthsAgo: 1, day: 5, supplier: 1, amount: 6_600_000 },
];

/**
 * Beban operasional bulanan — yang membuat Laba/Rugi terbaca sebagai laporan
 * sungguhan alih-alih daftar penjualan. Semuanya keluar dari kas/bank.
 */
export const SAMPLE_EXPENSES = [
  { day: 2, description: "Sewa kios", amount: 2_500_000 },
  { day: 5, description: "Gaji karyawan", amount: 4_200_000 },
  { day: 12, description: "Listrik & air", amount: 780_000 },
  { day: 25, description: "Transport & bensin", amount: 950_000 },
];

/** Hari ke-`day` pada bulan yang `monthsAgo` bulan sebelum `today`. */
export function dateIn(today: Date, monthsAgo: number, day: number): Date {
  return new Date(today.getFullYear(), today.getMonth() - monthsAgo, day, 10, 0, 0, 0);
}

/**
 * Apakah buku ini SUDAH DIPAKAI?
 *
 * Jurnal pembuka (saldo awal) sengaja TIDAK dihitung: perusahaan yang baru
 * selesai wisaya penyiapan memang sudah punya satu, dan justru perusahaan
 * seperti itulah yang paling masuk akal diisi contoh.
 *
 * ── KENAPA `sourceType`, BUKAN `type` ──────────────────────────────────────
 * Versi pertama pagar ini membaca `type: { not: "opening" }` — dan "opening"
 * BUKAN nilai yang pernah ditulis siapa pun. `journals.type` hanya mengenal
 * `general, sales, purchase, cash, adjustment, reversal` (lihat komentar
 * kolomnya di `prisma/schema.prisma`); wisaya menulis jurnal pembukanya sebagai
 * `type = "general"` dengan `source_type = "opening_balance"`. Penanda yang SAH
 * memang yang kedua — `opening-balance.ts` menyebutnya "the authoritative one".
 *
 * Akibatnya pengecualian itu tidak pernah cocok sekali pun: setiap perusahaan
 * yang selesai menyiapkan saldo awal — persis kasus yang fungsi ini layani —
 * dinilai "sudah dipakai". Terlihat di produksi 14 Agustus 2026 pada
 * perusahaan `demo`.
 *
 * ── KENAPA `OR` DENGAN `null`, BUKAN `not` SAJA ────────────────────────────
 * `source_type` NULLABLE: jurnal yang diketik tangan lewat formulir Jurnal
 * tidak punya sumber. Sebuah `{ not: … }` sendirian bergantung pada cara Prisma
 * menerjemahkan `NOT` pada kolom nullable — dan bila ia mendarat sebagai
 * `source_type <> '…'` polos, SQL menilai baris NULL sebagai UNKNOWN dan tidak
 * menghitungnya. Jurnal manual adalah transaksi paling sungguhan yang ada;
 * membiarkannya lolos berarti pagar ini gagal-TERBUKA pada buku yang justru
 * sudah dipakai. Ditulis eksplisit supaya benar tanpa bergantung pada tafsir.
 */
export async function bookActivity(): Promise<{
  invoices: number;
  cash: number;
  purchases: number;
  journals: number;
  total: number;
}> {
  const [invoices, cash, purchases, journals] = await Promise.all([
    prisma.invoice.count(),
    prisma.cashMovement.count(),
    prisma.supplierTransaction.count(),
    prisma.journal.count({
      where: {
        OR: [{ sourceType: null }, { sourceType: { not: OPENING_BALANCE_SOURCE } }],
      },
    }),
  ]);
  return {
    invoices,
    cash,
    purchases,
    journals,
    total: invoices + cash + purchases + journals,
  };
}

export interface SampleBookResult {
  customers: number;
  suppliers: number;
  invoices: number;
  payments: number;
  purchases: number;
  expenses: number;
}

/**
 * Isi buku perusahaan yang SEDANG AKTIF dengan tiga bulan transaksi contoh.
 *
 * Semuanya lewat `postForSource()` — MESIN POSTING YANG SAMA yang dipakai
 * formulir sungguhan. Konsekuensinya disengaja: Neracanya seimbang, Laba/Rugi
 * terisi, dan HPP-nya lahir dari aturan yang sama dengan transaksi asli. Kalau
 * mesin postingnya berubah, contoh ini ikut berubah — itu fitur, bukan beban.
 *
 * Pemanggil WAJIB memastikan dua hal lebih dulu: konteks perusahaan sudah
 * masuk, dan `bookActivity().total === 0`. Fungsi ini tidak memeriksanya
 * sendiri supaya kedua pemanggil bisa memberi KALIMAT yang berbeda atas
 * penolakan yang sama — skrip berhenti dengan galat, route diam-diam melewati.
 */
export async function seedSampleBook(opts: {
  today: Date;
  onStep?: (message: string) => void;
}): Promise<SampleBookResult> {
  const { today, onStep } = opts;
  const step = (message: string) => onStep?.(message);

  // ── Master data ──────────────────────────────────────────────────────────
  const customers = [];
  for (const c of SAMPLE_CUSTOMERS) customers.push(await prisma.customer.create({ data: c }));
  step(`${customers.length} pelanggan contoh`);

  const suppliers = [];
  for (const s of SAMPLE_SUPPLIERS) suppliers.push(await prisma.supplier.create({ data: s }));
  step(`${suppliers.length} pemasok contoh`);

  /*
   * Sisi lawan untuk kas: beban operasional. Dibaca dari PEMETAAN perusahaan,
   * bukan dari kode akun yang ditanam di sini — bagan akun boleh berbeda antar
   * perusahaan, dan menanam "6101" akan meledak diam-diam pada bagan lain.
   */
  let expenseAccountId: number;
  try {
    expenseAccountId = await resolveAccountId(MAPPING_KEYS.PURCHASE_EXPENSE, "IDR", prisma);
  } catch {
    /* `resolveAccountId` melempar `MissingMappingError`, tidak mengembalikan
       null. Diterjemahkan ke kalimat yang menyebut JALAN KELUARNYA — pesan
       aslinya benar tapi tidak memberi tahu apa yang harus dikerjakan. */
    throw new Error(
      "Pemetaan akun beban (purchase_expense) belum ada di perusahaan ini. " +
        "Jalankan wisaya penyiapan perusahaannya lebih dulu — contoh tidak menebak akun."
    );
  }

  // ── Penjualan + pelunasannya ─────────────────────────────────────────────
  let invoiceSeq = 0;
  let payments = 0;
  for (const sale of SAMPLE_SALES) {
    const date = dateIn(today, sale.monthsAgo, sale.day);
    invoiceSeq += 1;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-CONTOH-${String(invoiceSeq).padStart(3, "0")}`,
        date,
        status: "signed",
        /*
         * Fakturnya DITAUTKAN ke pelanggannya (issue #35 menyediakan kolomnya).
         * Tanpa ini piutangnya ada di Neraca tetapi tak berpemilik, dan grafik
         * Umur Piutang — yang lahir di rilis yang sama dengan data contoh ini —
         * tampil kosong pada buku yang justru dibuat untuk memamerkannya.
         */
        customerId: customers[sale.customer].id,
        items: {
          create: [
            {
              itemName: `${SAMPLE_TAG} Penjualan barang dagang`,
              quantity: 1,
              price: sale.amount,
              unit: "paket",
            },
          ],
        },
      },
    });
    await postForSource({ sourceType: "invoice", sourceId: invoice.id });

    if (sale.paidAfterDays !== null) {
      const paidAt = new Date(date.getTime() + sale.paidAfterDays * 86_400_000);
      const payment = await prisma.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          date: paidAt,
          amount: sale.amount,
          currency: "IDR",
          note: `${SAMPLE_TAG} Pelunasan`,
        },
      });
      await postForSource({ sourceType: "invoice_payment", sourceId: payment.id });
      payments += 1;
    }
  }
  step(`${SAMPLE_SALES.length} faktur penjualan (2 sengaja belum lunas → Piutang terisi)`);

  // ── Pembelian ────────────────────────────────────────────────────────────
  for (const purchase of SAMPLE_PURCHASES) {
    const tx = await prisma.supplierTransaction.create({
      data: {
        supplierId: suppliers[purchase.supplier].id,
        date: dateIn(today, purchase.monthsAgo, purchase.day),
        /* "purchase", BUKAN "receive". `supplier_transactions.type` hanya
           mengenal dua nilai — `validations/finance.ts` mengunci
           `z.enum(["purchase", "payment"])`, dan mesin posting hanya punya
           aturan untuk kedua itu. Menulis lewat Prisma langsung (seperti di
           sini) melewati zod, jadi nilai ketiga lolos sampai `postForSource`
           melemparnya — SETELAH baris pertamanya terlanjur tersimpan. */
        type: "purchase",
        amount: purchase.amount,
        currency: "IDR",
        note: `${SAMPLE_TAG} Pembelian barang dagang`,
      },
    });
    await postForSource({ sourceType: "supplier_transaction", sourceId: tx.id });
  }
  step(`${SAMPLE_PURCHASES.length} pembelian ke pemasok`);

  // ── Beban operasional, berulang tiap bulan ───────────────────────────────
  let expenseCount = 0;
  for (const monthsAgo of [3, 2, 1]) {
    for (const expense of SAMPLE_EXPENSES) {
      const movement = await prisma.cashMovement.create({
        data: {
          type: "bank",
          date: dateIn(today, monthsAgo, expense.day),
          description: `${SAMPLE_TAG} ${expense.description}`,
          currency: "IDR",
          debit: 0,
          credit: expense.amount, // uang KELUAR = sisi kredit buku kas
        },
      });
      /* `counterAccountId` WAJIB untuk cash_movement: mesin posting tidak boleh
         menebak sisi lawan sebuah transaksi kas. */
      await postForSource({
        sourceType: "cash_movement",
        sourceId: movement.id,
        counterAccountId: expenseAccountId,
      });
      expenseCount += 1;
    }
  }
  step(`${expenseCount} beban operasional (3 bulan × ${SAMPLE_EXPENSES.length})`);

  return {
    customers: customers.length,
    suppliers: suppliers.length,
    invoices: SAMPLE_SALES.length,
    payments,
    purchases: SAMPLE_PURCHASES.length,
    expenses: expenseCount,
  };
}
