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
import { postForSource, unpostForSource } from "@/lib/posting";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import { OPENING_BALANCE_SOURCE } from "@/lib/opening-balance";

/** Penanda baris contoh — muncul di layar, jadi tak pernah menyamar jadi data asli. */
export const SAMPLE_TAG = "[CONTOH]";

/**
 * Awalan nomor faktur contoh.
 *
 * Dipakai DUA arah: saat menulis, dan saat mencari kembali untuk dihapus.
 * Karena itu ia konstanta, bukan literal yang diketik dua kali — sebuah
 * penghapus yang mencari awalan yang tidak lagi ditulis penyemainya akan
 * melaporkan "tidak ada data contoh" pada buku yang penuh dengannya.
 */
export const SAMPLE_INVOICE_PREFIX = "INV-CONTOH-";

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
        invoiceNo: `${SAMPLE_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`,
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

/* ────────────────────────────────────────────────────────────────────────── */
/* MENGHAPUS kembali data contoh                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ── KENAPA INI HARUS ADA ───────────────────────────────────────────────────
 *
 * Sejak buku perusahaan BARU ikut diisi contoh, setiap pelanggan memulai
 * pembukuannya dengan pendapatan yang bukan miliknya. Awalan `[CONTOH]` menandai
 * BARISNYA, tetapi laporan tidak menampilkan baris — ia menampilkan ANGKA. Di
 * Laba/Rugi tidak ada satu pun tanda bahwa Rp 82 juta itu karangan, dan angka
 * yang salah dipercaya tidak menimbulkan galat apa pun: ia dibawa ke rapat, ke
 * bank, atau ke kantor pajak.
 *
 * Tanpa tindakan ini "boleh dihapus" hanyalah benar secara teknis — ~23 dokumen
 * dihapus satu per satu lewat layar yang berbeda-beda, dengan urutan yang harus
 * ditebak sendiri (pelunasan sebelum faktur, dokumen sebelum mitra). Yang
 * ditawarkan sebagai kemudahan berubah menjadi pekerjaan rumah, dan pekerjaan
 * rumah yang membosankan tidak dikerjakan — datanya menetap.
 *
 * ── DIKENALI DARI YANG DITULIS PENYEMAI, BUKAN DARI TEBAKAN ────────────────
 * Faktur dikenali dari `SAMPLE_INVOICE_PREFIX` (bentuk yang tidak mungkin
 * diketik orang), selebihnya dari awalan `SAMPLE_TAG` pada catatan/nama —
 * persis medan yang ditulis `seedSampleBook` di atas.
 */
export interface SampleDataSummary {
  invoices: number;
  payments: number;
  purchases: number;
  expenses: number;
  customers: number;
  suppliers: number;
  total: number;
}

const SAMPLE_INVOICE_WHERE = { invoiceNo: { startsWith: SAMPLE_INVOICE_PREFIX } } as const;
const SAMPLE_NOTE_WHERE = { note: { startsWith: SAMPLE_TAG } } as const;

/** Apa saja yang masih tersisa dari data contoh di buku yang sedang aktif. */
export async function sampleDataSummary(): Promise<SampleDataSummary> {
  const [invoices, payments, purchases, expenses, customers, suppliers] = await Promise.all([
    prisma.invoice.count({ where: SAMPLE_INVOICE_WHERE }),
    prisma.invoicePayment.count({ where: { invoice: SAMPLE_INVOICE_WHERE } }),
    prisma.supplierTransaction.count({ where: SAMPLE_NOTE_WHERE }),
    prisma.cashMovement.count({ where: { description: { startsWith: SAMPLE_TAG } } }),
    prisma.customer.count({ where: { name: { startsWith: SAMPLE_TAG } } }),
    prisma.supplier.count({ where: { name: { startsWith: SAMPLE_TAG } } }),
  ]);
  return {
    invoices,
    payments,
    purchases,
    expenses,
    customers,
    suppliers,
    total: invoices + payments + purchases + expenses + customers + suppliers,
  };
}

export interface ClearSampleDataResult {
  removed: SampleDataSummary;
  /**
   * Mitra contoh yang SENGAJA ditinggalkan karena masih dipakai dokumen lain —
   * disebut namanya supaya penggunanya tahu kenapa daftarnya belum bersih.
   */
  keptPartners: string[];
}

/**
 * Hapus seluruh data contoh dari buku yang sedang aktif.
 *
 * ── DOKUMEN DIBALIK, BUKAN SEKADAR DIHAPUS ─────────────────────────────────
 * Setiap dokumen dilepas lewat `unpostForSource` — jalur yang SAMA dengan
 * tombol Hapus di layar faktur (`api/invoices/[id]/route.ts`). Menghapus
 * barisnya saja akan meninggalkan jurnal yang sumbernya tidak ada lagi: buku
 * besar yang tetap memuat pendapatan karangan, tanpa satu pun dokumen yang bisa
 * ditunjuk sebagai asalnya. Itu kerusakan yang lebih buruk daripada data contoh
 * yang dibiarkan.
 *
 * ── SATU TRANSAKSI UNTUK DOKUMEN ───────────────────────────────────────────
 * Semua-atau-tidak-sama-sekali. Kalau satu pembalikan ditolak — misalnya
 * periodenya sudah ditutup (`assertPeriodOpen` di `reverseJournal`) — yang
 * benar adalah tidak ada yang terhapus sama sekali, bukan buku yang separuh
 * bersih dengan jurnal yang tinggal separuh. `timeout` dinaikkan dari bawaan
 * 5 detik: ~23 dokumen dengan pembalikannya masing-masing melewatinya di kotak
 * yang sibuk, dan transaksi yang mati karena waktu terbaca seperti bug.
 *
 * ── MITRA DIHAPUS DI LUAR TRANSAKSI ITU, SATU PER SATU ─────────────────────
 * Pelanggan/pemasok contoh boleh saja SUDAH DIPAKAI dokumen sungguhan —
 * seseorang yang mencoba aplikasi ini wajar menerbitkan faktur pertamanya ke
 * "[CONTOH] Toko Sinar Jaya". Menghapusnya akan menyeret dokumen sungguhan itu
 * (atau ditolak FK di tengah transaksi dokumen, membatalkan pembersihan yang
 * sudah benar). Karena itu masing-masing dicoba sendiri-sendiri SETELAHNYA, dan
 * yang ditolak dicatat namanya alih-alih menggagalkan keseluruhan.
 */
export async function clearSampleData(): Promise<ClearSampleDataResult> {
  const before = await sampleDataSummary();

  const [invoices, purchases, expenses] = await Promise.all([
    prisma.invoice.findMany({ where: SAMPLE_INVOICE_WHERE, select: { id: true } }),
    prisma.supplierTransaction.findMany({ where: SAMPLE_NOTE_WHERE, select: { id: true } }),
    prisma.cashMovement.findMany({
      where: { description: { startsWith: SAMPLE_TAG } },
      select: { id: true },
    }),
  ]);

  await prisma.$transaction(
    async (tx) => {
      for (const invoice of invoices) {
        /* Pelunasan ikut terhapus lewat `onDelete: Cascade`, jadi jurnalnya
           harus dilepas LEBIH DULU — kalau tidak, buku besar menyimpan entri
           yang baris sumbernya sudah lenyap. Urutan yang sama dipakai route
           hapus faktur. */
        const payments = await tx.invoicePayment.findMany({
          where: { invoiceId: invoice.id },
          select: { id: true },
        });
        for (const payment of payments) {
          await unpostForSource({ sourceType: "invoice_payment", sourceId: payment.id, tx });
        }
        await unpostForSource({ sourceType: "invoice", sourceId: invoice.id, tx });
        await tx.invoice.delete({ where: { id: invoice.id } });
      }

      for (const purchase of purchases) {
        await unpostForSource({ sourceType: "supplier_transaction", sourceId: purchase.id, tx });
        await tx.supplierTransaction.delete({ where: { id: purchase.id } });
      }

      for (const expense of expenses) {
        await unpostForSource({ sourceType: "cash_movement", sourceId: expense.id, tx });
        await tx.cashMovement.delete({ where: { id: expense.id } });
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  const keptPartners: string[] = [];
  let customersRemoved = 0;
  let suppliersRemoved = 0;

  const customers = await prisma.customer.findMany({
    where: { name: { startsWith: SAMPLE_TAG } },
    select: { id: true, name: true },
  });
  for (const customer of customers) {
    try {
      await prisma.customer.delete({ where: { id: customer.id } });
      customersRemoved += 1;
    } catch {
      /* Masih dirujuk dokumen sungguhan (FK RESTRICT). Ditinggalkan dengan
         sengaja — nama contoh di daftar pelanggan jauh lebih murah daripada
         menghapus faktur yang benar-benar diterbitkan penggunanya. */
      keptPartners.push(customer.name);
    }
  }

  const suppliers = await prisma.supplier.findMany({
    where: { name: { startsWith: SAMPLE_TAG } },
    select: { id: true, name: true },
  });
  for (const supplier of suppliers) {
    try {
      await prisma.supplier.delete({ where: { id: supplier.id } });
      suppliersRemoved += 1;
    } catch {
      keptPartners.push(supplier.name);
    }
  }

  const removed: SampleDataSummary = {
    invoices: invoices.length,
    payments: before.payments,
    purchases: purchases.length,
    expenses: expenses.length,
    customers: customersRemoved,
    suppliers: suppliersRemoved,
    total:
      invoices.length +
      before.payments +
      purchases.length +
      expenses.length +
      customersRemoved +
      suppliersRemoved,
  };
  return { removed, keptPartners };
}

/**
 * Adakah data contoh di buku ini? — versi MURAH, untuk spanduk beranda.
 *
 * ── KENAPA HANYA FAKTUR, PADAHAL `sampleDataSummary` MENGHITUNG ENAM ───────
 * Spanduk beranda dirender pada SETIAP pemuatan beranda, selamanya, termasuk
 * di buku yang tidak pernah punya data contoh sama sekali. `sampleDataSummary`
 * menjalankan enam hitungan, dan empat di antaranya `LIKE '[CONTOH]%'` pada
 * kolom yang TIDAK berindeks (`note`, `description`, `name`) — pemindaian
 * tabel penuh, di buku produksi yang isinya bertahun-tahun. Itu harga yang
 * terlalu mahal untuk sebuah spanduk.
 *
 * `invoices.invoice_no` justru `@unique`, jadi ia berindeks: `startsWith`
 * menjadi pemindaian RENTANG indeks, bukan tabel. Satu pencarian murah,
 * dijalankan sekali per pemuatan.
 *
 * ── APA YANG DIKORBANKAN, DAN KENAPA ITU BOLEH ─────────────────────────────
 * Buku yang faktur contohnya sudah dihapus satu per satu tetapi bebannya masih
 * tersisa TIDAK akan berspanduk. Penyemai selalu menulis tujuh faktur, jadi
 * keadaan itu hanya lahir dari penghapusan manual sebagian — dan orang yang
 * menghapus faktur contoh satu per satu sudah tahu data contohnya ada.
 *
 * Yang PENTING: kartu di Pengaturan tetap memakai `sampleDataSummary` yang
 * lengkap, jadi sisa semacam itu tetap terlihat dan tetap bisa dibuang. Yang
 * dihemat di sini hanyalah pengingatnya, bukan pembersihnya.
 */
export async function hasSampleData(): Promise<boolean> {
  return (await prisma.invoice.count({ where: SAMPLE_INVOICE_WHERE })) > 0;
}
