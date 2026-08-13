/**
 * `bun run db:seed:demo <slug-perusahaan>` — mengisi SATU perusahaan dengan tiga
 * bulan transaksi contoh yang benar-benar terbukukan (issue #355).
 *
 * ══ MASALAH YANG DISELESAIKAN ═══════════════════════════════════════════════
 *
 * Audit produksi 13 Agustus 2026: perusahaan baru punya 38 akun dan nol
 * transaksi, jadi SETIAP laporan berbunyi "Rp 0". Pengguna awam akuntansi tidak
 * bisa membedakan laporan yang BEKERJA dari laporan yang RUSAK — keduanya
 * terlihat persis sama pada hari pertama. Satu-satunya tampilan buku terisi yang
 * pernah dilihat calon pengguna adalah GAMBAR di halaman pemasaran.
 *
 * ══ KENAPA MEMPOSTING, BUKAN SEKADAR MENULIS BARIS ═════════════════════════
 *
 * `prisma/seed.ts` membuat faktur & kas tetapi TIDAK PERNAH memposting jurnal —
 * ia fixture pengembangan, bukan buku. Dipakai sebagai demo ia justru merusak
 * kepercayaan: Neraca-nya tidak seimbang dan Laba/Rugi-nya kosong meski daftar
 * fakturnya penuh, sehingga pengguna baru menyimpulkan aplikasinya salah hitung.
 *
 * Skrip ini karena itu menempuh `postForSource()` — MESIN POSTING YANG SAMA yang
 * dipakai formulir sungguhan. Konsekuensinya disengaja: angka demo mematuhi
 * aturan akuntansi yang sama, Neraca Saldo-nya seimbang, dan HPP-nya lahir dari
 * biaya rata-rata tertimbang seperti transaksi asli. Kalau mesin postingnya
 * berubah, demo ini ikut berubah — itu fitur, bukan beban.
 *
 * ══ DETERMINISTIK, BUKAN ACAK ══════════════════════════════════════════════
 *
 * Tanpa satu pun `Math.random()`. Demo yang berubah tiap dijalankan tak bisa
 * dijadikan rujukan: tangkapan layar dokumentasi basi seketika, dan laporan bug
 * "angkanya beda dengan di panduan" tak bisa ditelusuri. Tanggalnya relatif
 * terhadap `--today` (bawaan: hari ini) supaya demonya selalu "tiga bulan
 * terakhir", tetapi POLANYA sama persis setiap kali.
 *
 * ══ PAGAR PENGAMAN ═════════════════════════════════════════════════════════
 *
 * Ini aplikasi akuntansi: data contoh yang keliru dianggap buku sungguhan adalah
 * kesalahan yang mahal. Karena itu:
 *
 *   • Perusahaannya WAJIB disebut eksplisit lewat argumen — tidak ada bawaan,
 *     tidak ada "kalau cuma satu, pakai yang itu".
 *   • Skrip MENOLAK bila perusahaan itu sudah punya transaksi. Buku yang sudah
 *     dipakai tidak pernah disentuh, bahkan kalau slug-nya salah ketik.
 *   • Setiap catatan diberi keterangan berawalan `[CONTOH]`, jadi baris demo
 *     yang tercecer selalu bisa dikenali di layar mana pun.
 *   • Tidak ada mode "semua perusahaan" dan tidak ada `--force`.
 *
 * Skrip/cron TIDAK lahir dari sebuah permintaan HTTP, jadi seluruh pekerjaannya
 * dibungkus `runWithCompany()` (doktrin #104) — tanpa itu setiap query melempar.
 */

/*
 * Impor RELATIF dan `dotenv/config` lebih dulu — pola yang sama dengan
 * `verify-local-setup.ts`, dan bukan selera: `lib/company-registry.ts` diawali
 * `import "server-only"`, yang tidak bisa diselesaikan di luar bundler Next.
 * Skrip `tsx` yang menyentuhnya mati sebelum baris pertamanya berjalan. Karena
 * itu perusahaannya dibaca langsung dari basis data kendali di bawah, dan
 * `CompanyContext`-nya dirakit di sini.
 */
import "dotenv/config";
import { controlDb } from "../src/lib/control-db";
import { runWithCompany, type CompanyContext } from "../src/lib/company-context";
import { prisma } from "../src/lib/prisma";
import { postForSource } from "../src/lib/posting";
import { MAPPING_KEYS, resolveAccountId } from "../src/lib/posting/mapping";

/** Penanda baris demo — muncul di layar, jadi tak pernah menyamar jadi data asli. */
const TAG = "[CONTOH]";

interface Args {
  /** Salah satu dari keduanya terisi; `--id` menang bila dua-duanya ada. */
  slug: string | null;
  companyId: number | null;
  today: Date;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const slug = positional[0] ?? null;

  const idArg = argv.find((a) => a.startsWith("--id="))?.slice("--id=".length);
  const companyId = idArg ? Number.parseInt(idArg, 10) : null;
  if (idArg && (companyId === null || Number.isNaN(companyId))) {
    throw new Error(`--id bukan angka: ${idArg}`);
  }

  if (!slug && companyId === null) {
    throw new Error(
      "Sebutkan perusahaannya: bun run db:seed:demo <slug-perusahaan>\n" +
        "atau, bila slug-nya dipakai lebih dari satu tenant: bun run db:seed:demo --id=<id>\n" +
        "Tidak ada nilai bawaan — mengisi perusahaan yang keliru dengan data contoh " +
        "jauh lebih mahal daripada mengetik slug-nya."
    );
  }
  const todayArg = argv.find((a) => a.startsWith("--today="))?.slice("--today=".length);
  const today = todayArg ? new Date(`${todayArg}T12:00:00`) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error(`--today bukan tanggal yang sah: ${todayArg}`);
  }
  return { slug, companyId, today };
}

/** Hari ke-`day` pada bulan yang `monthsAgo` bulan sebelum `today`. */
function dateIn(today: Date, monthsAgo: number, day: number): Date {
  return new Date(today.getFullYear(), today.getMonth() - monthsAgo, day, 10, 0, 0, 0);
}

/**
 * Buku yang SUDAH DIPAKAI tidak pernah disentuh.
 *
 * Jurnal pembuka (saldo awal) sengaja TIDAK dihitung sebagai "sudah dipakai":
 * perusahaan yang baru selesai wisaya penyiapan memang sudah punya satu, dan
 * justru perusahaan seperti itulah yang paling masuk akal diisi demo.
 */
async function refuseIfInUse(): Promise<void> {
  const [invoices, cash, purchases, journals] = await Promise.all([
    prisma.invoice.count(),
    prisma.cashMovement.count(),
    prisma.supplierTransaction.count(),
    prisma.journal.count({ where: { type: { not: "opening" } } }),
  ]);
  const used = invoices + cash + purchases + journals;
  if (used > 0) {
    throw new Error(
      `Perusahaan ini sudah punya transaksi (faktur ${invoices}, kas ${cash}, ` +
        `pembelian ${purchases}, jurnal non-pembuka ${journals}). ` +
        "Skrip demo berhenti — buku yang sudah dipakai tidak pernah diisi data contoh."
    );
  }
}

const CUSTOMERS = [
  { name: `${TAG} Toko Sinar Jaya`, address: "Jl. Merdeka No. 12, Bandung", phone: "022-4210031", pic: "Bu Ratna" },
  { name: `${TAG} CV Berkah Mandiri`, address: "Jl. Diponegoro No. 8, Semarang", phone: "024-3517722", pic: "Pak Hendra" },
  { name: `${TAG} Warung Bu Tini`, address: "Jl. Pasar Baru No. 3, Bekasi", phone: "021-8891234", pic: "Bu Tini" },
];

const SUPPLIERS = [
  { name: `${TAG} PT Sumber Pangan`, address: "Jl. Industri Raya No. 20, Tangerang", phone: "021-5523100" },
  { name: `${TAG} UD Tani Makmur`, address: "Jl. Raya Solo No. 45, Klaten", phone: "0272-321900" },
];

/**
 * Tiga bulan penjualan. Sengaja NAIK dari bulan ke bulan supaya laporan
 * perbandingan periode punya sesuatu untuk ditunjukkan — demo yang datar tidak
 * mengajarkan apa pun tentang membaca tren.
 */
const SALES = [
  { monthsAgo: 3, day: 6, customer: 0, amount: 12_500_000, paidAfterDays: 12 },
  { monthsAgo: 3, day: 19, customer: 1, amount: 8_750_000, paidAfterDays: 20 },
  { monthsAgo: 2, day: 4, customer: 2, amount: 6_200_000, paidAfterDays: 9 },
  { monthsAgo: 2, day: 15, customer: 0, amount: 15_400_000, paidAfterDays: 18 },
  { monthsAgo: 2, day: 27, customer: 1, amount: 9_900_000, paidAfterDays: null }, // masih piutang
  { monthsAgo: 1, day: 8, customer: 2, amount: 11_300_000, paidAfterDays: 14 },
  { monthsAgo: 1, day: 21, customer: 0, amount: 18_600_000, paidAfterDays: null }, // masih piutang
];

/** Pembelian ke pemasok — pasangan biaya bagi penjualan di atas. */
const PURCHASES = [
  { monthsAgo: 3, day: 3, supplier: 0, amount: 7_400_000 },
  { monthsAgo: 2, day: 2, supplier: 1, amount: 5_100_000 },
  { monthsAgo: 2, day: 20, supplier: 0, amount: 8_800_000 },
  { monthsAgo: 1, day: 5, supplier: 1, amount: 6_600_000 },
];

/**
 * Beban operasional bulanan — yang membuat Laba/Rugi terbaca sebagai laporan
 * sungguhan alih-alih daftar penjualan. Semuanya keluar dari kas/bank.
 */
const EXPENSES = [
  { day: 2, description: "Sewa kios", amount: 2_500_000 },
  { day: 5, description: "Gaji karyawan", amount: 4_200_000 },
  { day: 12, description: "Listrik & air", amount: 780_000 },
  { day: 25, description: "Transport & bensin", amount: 950_000 },
];

async function seed(args: Args): Promise<void> {
  await refuseIfInUse();

  // ── Master data ──────────────────────────────────────────────────────────
  const customers = [];
  for (const c of CUSTOMERS) customers.push(await prisma.customer.create({ data: c }));
  console.log(`  ✓ ${customers.length} pelanggan contoh`);

  const suppliers = [];
  for (const s of SUPPLIERS) suppliers.push(await prisma.supplier.create({ data: s }));
  console.log(`  ✓ ${suppliers.length} pemasok contoh`);

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
        "Jalankan wisaya penyiapan perusahaannya lebih dulu — demo tidak menebak akun."
    );
  }

  // ── Penjualan + pelunasannya ─────────────────────────────────────────────
  let invoiceSeq = 0;
  for (const sale of SALES) {
    const date = dateIn(args.today, sale.monthsAgo, sale.day);
    invoiceSeq += 1;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-CONTOH-${String(invoiceSeq).padStart(3, "0")}`,
        date,
        status: "signed",
        items: {
          create: [
            {
              itemName: `${TAG} Penjualan barang dagang`,
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
          note: `${TAG} Pelunasan`,
        },
      });
      await postForSource({ sourceType: "invoice_payment", sourceId: payment.id });
    }
  }
  console.log(`  ✓ ${SALES.length} faktur penjualan (2 sengaja belum lunas → Piutang terisi)`);

  // ── Pembelian ────────────────────────────────────────────────────────────
  for (const purchase of PURCHASES) {
    const tx = await prisma.supplierTransaction.create({
      data: {
        supplierId: suppliers[purchase.supplier].id,
        date: dateIn(args.today, purchase.monthsAgo, purchase.day),
        type: "receive",
        amount: purchase.amount,
        currency: "IDR",
        note: `${TAG} Pembelian barang dagang`,
      },
    });
    await postForSource({ sourceType: "supplier_transaction", sourceId: tx.id });
  }
  console.log(`  ✓ ${PURCHASES.length} pembelian ke pemasok`);

  // ── Beban operasional, berulang tiap bulan ───────────────────────────────
  let expenseCount = 0;
  for (const monthsAgo of [3, 2, 1]) {
    for (const expense of EXPENSES) {
      const movement = await prisma.cashMovement.create({
        data: {
          type: "bank",
          date: dateIn(args.today, monthsAgo, expense.day),
          description: `${TAG} ${expense.description}`,
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
  console.log(`  ✓ ${expenseCount} beban operasional (3 bulan × ${EXPENSES.length})`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  /* `--id` menang: ia dipakai justru untuk membedah slug yang ambigu. */
  const companyId = args.companyId ?? (await slugToId(args.slug as string));
  const row = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
  });
  if (!row) {
    throw new Error(`Perusahaan dengan id ${companyId} tidak ditemukan di basis data kendali.`);
  }
  if (!row.isActive) {
    throw new Error(`Perusahaan "${row.slug}" nonaktif. Skrip demo berhenti.`);
  }
  const company: CompanyContext = {
    companyId: row.id,
    slug: row.slug,
    databaseName: row.databaseName,
  };

  console.log(`\nMengisi data contoh ke: ${row.name} (${row.slug})`);
  console.log(`Periode: tiga bulan sebelum ${args.today.toISOString().slice(0, 10)}\n`);

  await runWithCompany(company, () => seed(args));

  /*
   * Perusahaannya DITANDAI demo setelah isinya jadi, bukan sebelum (issue #355).
   *
   * Urutannya penting: `is_demo` menyalakan gerbang tulis di kedua penjaga, dan
   * menandainya lebih dulu berarti skrip ini memblokir dirinya sendiri kalau
   * suatu saat ia dijalankan lewat jalur yang melewati penjaga. Ditandai di
   * akhir, buku yang setengah terisi juga tidak pernah sempat berspanduk
   * "contoh" tanpa isi contohnya.
   */
  await controlDb.company.update({ where: { id: companyId }, data: { isDemo: true } });
  /*
   * TANPA `invalidateCompany()` — dan itu disengaja, bukan kelalaian.
   *
   * Fungsi itu tinggal di `lib/company-registry.ts`, yang diawali
   * `import "server-only"`; skrip `tsx` yang menyentuhnya mati sebelum baris
   * pertamanya berjalan (terbukti sekali saat berkas ini ditulis, dan dijaga
   * `tests/seed-demo.test.ts`).
   *
   * Ia juga tidak akan berguna: cache registry hidup di dalam PROSES aplikasi,
   * sedangkan skrip ini proses terpisah — memanggilnya di sini hanya akan
   * mengosongkan cache milik dirinya sendiri, yang seketika mati bersamanya.
   * Cache aplikasinya kedaluwarsa sendiri dalam 60 detik (TTL registry).
   */

  console.log(
    `\nSelesai. Buka Pusat Laporan — Laba/Rugi, Neraca, dan Arus Kas kini terisi.\n` +
      `Setiap baris contoh diberi awalan "${TAG}" supaya mudah dikenali.\n`
  );
}

/**
 * Slug → id, lewat basis data kendali.
 *
 * `findFirst`, bukan `findUnique`: slug perusahaan unik PER TENANT
 * (`@@unique([tenantId, slug])`), bukan unik global — dua tenant boleh
 * sama-sama punya "pt-maju". Skrip ini menolak bila slug-nya ambigu daripada
 * diam-diam memilih salah satunya; mengisi buku tenant yang keliru dengan data
 * contoh adalah persis kesalahan yang seluruh pagar di berkas ini cegah.
 */
async function slugToId(slug: string): Promise<number> {
  const rows = await controlDb.company.findMany({
    where: { slug },
    select: { id: true, name: true, tenantId: true },
  });
  if (rows.length === 0) {
    throw new Error(`Perusahaan "${slug}" tidak ditemukan di basis data kendali.`);
  }
  if (rows.length > 1) {
    const daftar = rows.map((r) => `  • id=${r.id} tenant=${r.tenantId} — ${r.name}`).join("\n");
    throw new Error(
      `Slug "${slug}" dipakai ${rows.length} perusahaan di tenant berbeda:\n${daftar}\n` +
        "Skrip berhenti — sebutkan id perusahaannya lewat --id=<id>."
    );
  }
  return rows[0].id;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
