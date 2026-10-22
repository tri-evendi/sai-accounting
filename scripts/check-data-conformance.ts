/**
 * Apakah DATA di setiap buku masih sesuai dengan aturan yang ditegakkan KODE?
 *
 *   bun run check-data-conformance            # semua perusahaan terdaftar
 *   bun run check-data-conformance -- --detail  # sertakan contoh barisnya
 *
 * ══ KENAPA INI ADA ══════════════════════════════════════════════════════════
 * Penjaga aplikasi bekerja di jalur TULIS: zod menolak status di luar enum,
 * `requireRateForForeign` menolak valas tanpa kurs, penjaga #424 menolak
 * pembayaran yang melebihi tagihan atau salah mata uang. Semuanya benar, dan
 * semuanya hanya berlaku bagi data yang MASUK LEWAT APLIKASI.
 *
 * Data bisa masuk lewat pintu lain: impor sekali-jalan dari sistem lama,
 * perbaikan manual lewat SQL, atau penyemai. Pintu-pintu itu tidak melewati
 * satu penjaga pun — dan audit 20–21 Agustus 2026 menunjukkan apa yang lolos
 * darinya di buku produksi:
 *
 *   • 39 kontrak berstatus `cancelled` (dua L) sementara kode mengenal
 *     `canceled` — saringan laporan piutang tidak pernah cocok, jadi kontrak
 *     BATAL ikut terhitung sebagai piutang;
 *   • 101 kontrak berstatus `completed`, nilai yang tidak ada di enum mana pun;
 *   • 720 pembayaran kontrak berlabel USD padahal uangnya CNY;
 *   • 6 pembayaran faktur berlabel USD padahal rupiah;
 *   • 609 kontrak valas tanpa kurs, sehingga tak satu pun bernilai IDR;
 *   • satu kontrak bermata uang `LC` — itu cara bayar, bukan mata uang.
 *
 * Semua itu ditemukan dengan menggali manual selama dua hari. Skrip ini
 * mengubah penggalian itu menjadi satu perintah yang bisa diulang siapa pun.
 *
 * ══ HANYA MEMBACA ═══════════════════════════════════════════════════════════
 * Tidak ada satu pun `UPDATE` di berkas ini, dan itu disengaja: keputusan
 * "angka mana yang benar" hampir selalu butuh dokumen fisik atau pemilik
 * datanya. Yang bisa diotomatiskan adalah MENEMUKANNYA, bukan menebak
 * jawabannya.
 *
 * Keluar dengan kode BUKAN NOL bila ada temuan, jadi ia bisa dipasang di cron
 * atau langkah rilis dan berbunyi sendiri.
 */
import "dotenv/config";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { PrismaClient } from "@sai/db/client/company";
import { buatAdapter } from "@sai/db/adapter";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  companyDatabaseUrl,
  DEFAULT_DB_INSTANCE_LABEL,
  toCompanyDatabaseTarget,
} from "@sai/db/company-url";

import { CONTRACT_STATUSES, CURRENCIES } from "@sai/core/constants";
import { ACCOUNT_TYPE_VALUES, EXPENSE_ACCOUNT_TYPE_VALUES } from "../src/lib/accounting";
import {
  DEFAULT_CATCH_ALL_THRESHOLD,
  assessCatchAllExpenses,
  describeCatchAllFinding,
  describeUntaggedExpense,
  findUntaggedMaterialExpenses,
} from "../src/lib/materiality";

/* Konstanta di atas adalah SUMBER yang sama dengan yang dipakai zod di jalur
   tulis (`validations/contract.ts`, `validations/fx.ts`). Menyalin daftarnya ke
   sini akan membuat pemeriksa dan penjaga bisa menyimpang diam-diam — persis
   kelas cacat yang skrip ini cari. */
const list = (values: readonly string[]) => values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");

/** Nilai IDR sebuah baris uang, diturunkan seperti `toBase()` di receivables.ts. */
const BASE = (t: string) =>
  `COALESCE(${t}.base_amount, CASE WHEN ${t}.currency = 'IDR' THEN ${t}.amount
     WHEN ${t}.rate IS NOT NULL AND ${t}.rate > 0 THEN ${t}.amount * ${t}.rate END)`;

interface Check {
  key: string;
  judul: string;
  /**
   * Tanpa `nilai`: harus memulangkan kolom `label`; jumlah barisnya = jumlah
   * pelanggaran. Dengan `nilai`: SQL-nya cuma MENGUMPULKAN angka, dan
   * keputusannya diambil di TypeScript.
   */
  sql: string;
  /**
   * Aturan yang tinggal di modul MURNI, bukan di SQL.
   *
   * Ada karena tidak setiap aturan pantas ditulis sebagai SQL: pagar
   * materialitas (#444) butuh membandingkan tiap akun dengan TOTAL seluruh
   * akun, dan menuliskannya sebagai SQL berarti menaruh aturan akuntansi di
   * tempat yang tidak bisa diuji tanpa MySQL. Yang dipulangkan tetap bentuk
   * yang sama — daftar `label` — jadi pelapornya tidak perlu tahu bedanya.
   */
  nilai?: (rows: Record<string, unknown>[]) => { label: string }[];
}

/**
 * Ambang pangsa akun penampung, dari `--ambang-penampung=<persen>`.
 *
 * Bisa ditimpa karena "material" bergantung pada bukunya: 5% dari beban sebuah
 * PT dagang dan 5% dari beban sebuah PT jasa adalah dua percakapan berbeda.
 */
const ambangPenampung = (() => {
  const arg = process.argv.find((a) => a.startsWith("--ambang-penampung="));
  const persen = arg ? Number(arg.slice(arg.indexOf("=") + 1)) : NaN;
  return Number.isFinite(persen) && persen > 0 ? persen / 100 : DEFAULT_CATCH_ALL_THRESHOLD;
})();

const CHECKS: Check[] = [
  {
    key: "status-kontrak",
    judul: "Status kontrak di luar kosakata aplikasi",
    sql: `SELECT CONCAT(contract_no, ' → ', status) AS label FROM contracts
          WHERE status NOT IN (${list(CONTRACT_STATUSES)})`,
  },
  {
    key: "status-faktur",
    judul: "Status faktur di luar kosakata aplikasi",
    /* Faktur memakai triple yang sama dengan kontrak — lihat
       `validations/invoice.ts:22`. Bila suatu saat keduanya berpisah, daftar ini
       ikut berpisah di sana, bukan di sini. */
    sql: `SELECT CONCAT(invoice_no, ' → ', status) AS label FROM invoices
          WHERE status NOT IN (${list(CONTRACT_STATUSES)})`,
  },
  {
    key: "mata-uang-tak-dikenal",
    judul: "Mata uang yang tidak dikenal aplikasi",
    sql: `SELECT label FROM (
            SELECT CONCAT('kontrak ', contract_no, ' → ', currency) AS label, currency FROM contracts
            UNION ALL SELECT CONCAT('faktur ', invoice_no, ' → ', currency), currency FROM invoices
            UNION ALL SELECT CONCAT('bayar kontrak #', id, ' → ', currency), currency FROM contract_payments
            UNION ALL SELECT CONCAT('bayar faktur #', id, ' → ', currency), currency FROM invoice_payments
            UNION ALL SELECT CONCAT('transaksi pemasok #', id, ' → ', currency), currency FROM supplier_transactions
          ) x WHERE currency NOT IN (${list(CURRENCIES)})`,
  },
  {
    key: "valas-tanpa-nilai-idr",
    judul: "Dokumen valas tanpa kurs — nilai IDR-nya tidak diketahui",
    /* Bukan sekadar kerapian: dokumen tanpa nilai IDR tidak ikut dijumlahkan di
       laporan mana pun, jadi kewajiban/piutangnya tidak terlihat oleh siapa pun
       yang membaca totalnya. */
    sql: `SELECT label FROM (
            SELECT CONCAT('kontrak ', contract_no, ' (', currency, ')') AS label, currency, rate, base_amount FROM contracts
            UNION ALL SELECT CONCAT('faktur ', invoice_no, ' (', currency, ')'), currency, rate, base_amount FROM invoices
            UNION ALL SELECT CONCAT('bayar kontrak #', id, ' (', currency, ')'), currency, rate, base_amount FROM contract_payments
            UNION ALL SELECT CONCAT('bayar faktur #', id, ' (', currency, ')'), currency, rate, base_amount FROM invoice_payments
          ) x WHERE currency <> 'IDR' AND rate IS NULL AND base_amount IS NULL`,
  },
  {
    key: "mata-uang-bayar-beda",
    judul: "Mata uang pembayaran berbeda dari dokumennya",
    /* Ditolak jalur tulis sejak #424. Yang tersisa hanya warisan — dan setiap
       barisnya berarti satu pelunasan yang nilainya tidak bisa dipercaya. */
    sql: `SELECT label FROM (
            SELECT CONCAT('bayar faktur #', p.id, ': ', p.currency, ' atas ', i.invoice_no, ' (', i.currency, ')') AS label
              FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.currency <> i.currency
            UNION ALL
            SELECT CONCAT('bayar kontrak #', p.id, ': ', p.currency, ' atas ', c.contract_no, ' (', c.currency, ')')
              FROM contract_payments p JOIN contracts c ON c.id = p.contract_id WHERE p.currency <> c.currency
          ) x`,
  },
  {
    key: "kelebihan-bayar-faktur",
    judul: "Faktur yang dibayar melebihi nilainya",
    /* Nilai faktur dihitung dari BARISNYA, bukan dari sebuah kolom nilai —
       aturan yang sama dipakai seluruh aplikasi (lihat kepala receivables.ts).
       Faktur yang punya pembayaran tanpa nilai IDR dilewati: sisanya memang
       tidak bisa dihitung, dan menganggapnya nol akan mengarang tuduhan. */
    sql: `SELECT CONCAT(i.invoice_no, ': dibayar ', ROUND(pay.terbayar, 0), ' atas nilai ', ROUND(nilai.total, 0)) AS label
            FROM invoices i
            JOIN (SELECT invoice_id, SUM(quantity * price) AS total FROM invoice_items GROUP BY invoice_id) nilai
              ON nilai.invoice_id = i.id
            JOIN (SELECT p.invoice_id, SUM(${BASE("p")}) AS terbayar, COUNT(*) FILTER (WHERE ${BASE("p")} IS NULL) AS tak_terukur
                    FROM invoice_payments p GROUP BY p.invoice_id) pay
              ON pay.invoice_id = i.id
           WHERE pay.tak_terukur = 0
             AND pay.terbayar > (nilai.total + COALESCE(i.tax_amount, 0)) + 0.005`,
  },
  {
    key: "jurnal-timpang",
    judul: "Jurnal yang debit ≠ kredit",
    /* Kalau yang ini pernah berbunyi, berhenti dan cari sebabnya sebelum apa
       pun yang lain: seluruh laporan berdiri di atasnya. */
    sql: `SELECT CONCAT(j.number, ': debit ', ROUND(SUM(l.base_debit), 2), ' vs kredit ', ROUND(SUM(l.base_credit), 2)) AS label
            FROM journals j JOIN journal_lines l ON l.journal_id = j.id
           GROUP BY j.id, j.number HAVING ABS(SUM(l.base_debit) - SUM(l.base_credit)) > 0.005`,
  },
  {
    key: "jurnal-tanpa-baris",
    judul: "Jurnal tanpa satu baris pun",
    sql: `SELECT j.number AS label FROM journals j
           WHERE NOT EXISTS (SELECT 1 FROM journal_lines l WHERE l.journal_id = j.id)`,
  },
  {
    key: "tipe-akun",
    judul: "Akun bertipe atau bersaldo normal yang tidak dikenal",
    sql: `SELECT CONCAT(code, ' ', name, ' → ', type, '/', normal_balance) AS label FROM accounts
           WHERE type NOT IN (${list(ACCOUNT_TYPE_VALUES)}) OR normal_balance NOT IN ('debit','credit')`,
  },
  {
    key: "akun-penampung",
    judul: "Akun penampung beban berskala material",
    /* SQL-nya sengaja BODOH: ia cuma menjumlahkan beban per akun. Yang tahu
       apa itu "penampung" dan apa itu "material" adalah `@/lib/materiality`,
       dan di sanalah aturannya diuji — tanpa MySQL. */
    sql: `SELECT a.code AS code, a.name AS name, a.type AS type,
                 a.expense_nature AS nature,
                 SUM(l.base_debit - l.base_credit) AS amount
            FROM accounts a
            JOIN journal_lines l ON l.account_id = a.id
           WHERE a.type IN (${list(EXPENSE_ACCOUNT_TYPE_VALUES)})
           GROUP BY a.id, a.code, a.name, a.type, a.expense_nature`,
    nilai: (rows) =>
      assessCatchAllExpenses(
        rows.map((r) => ({
          code: String(r.code ?? ""),
          name: String(r.name ?? ""),
          type: String(r.type ?? ""),
          nature: r.nature == null ? null : String(r.nature),
          // SUM() tiba sebagai Decimal/string lewat driver-nya, bukan number.
          amount: Number(r.amount ?? 0),
        })),
        { threshold: ambangPenampung }
      ).findings.map((f) => ({ label: describeCatchAllFinding(f) })),
  },
  {
    key: "beban-tanpa-sifat",
    judul: "Beban berskala material yang belum ditandai sifatnya",
    /* Bukan "setiap akun beban wajib bersifat" — kosong memang jawaban yang sah
       (#445). Yang disebut hanyalah yang benar-benar menggerakkan angka, sebab
       daftar sepanjang bagan akun adalah daftar yang diabaikan. */
    sql: `SELECT a.code AS code, a.name AS name, a.type AS type,
                 a.expense_nature AS nature,
                 SUM(l.base_debit - l.base_credit) AS amount
            FROM accounts a
            JOIN journal_lines l ON l.account_id = a.id
           WHERE a.type IN (${list(EXPENSE_ACCOUNT_TYPE_VALUES)})
           GROUP BY a.id, a.code, a.name, a.type, a.expense_nature`,
    nilai: (rows) =>
      findUntaggedMaterialExpenses(
        rows.map((r) => ({
          code: String(r.code ?? ""),
          name: String(r.name ?? ""),
          type: String(r.type ?? ""),
          nature: r.nature == null ? null : String(r.nature),
          amount: Number(r.amount ?? 0),
        })),
        { threshold: ambangPenampung }
      ).findings.map((f) => ({ label: describeUntaggedExpense(f) })),
  },
];

/** Adapter basis data KENDALI. Buku PT tidak dibuka lewat sini — URL-nya
 *  dari `@sai/db/company-url` (tahap 4). */
function adapterFor(raw: string) {
  return buatAdapter(raw, { batasKoneksi: 2 });
}


/**
 * Mencatat putaran ini ke `conformance_runs` (basis data PLATFORM).
 *
 * ⚠ INI SATU-SATUNYA TULISAN DI SELURUH BERKAS, dan sasarannya PLATFORM —
 * bukan buku PT mana pun. Pemeriksa ini tidak boleh, dan tidak pernah,
 * mengubah satu angka akuntansi: keputusan "angka mana yang benar" hampir
 * selalu butuh dokumen fisik atau pemilik datanya, dan yang boleh
 * diotomatiskan hanya MENEMUKANNYA. Penjaganya
 * `tests/check-data-conformance.test.ts`.
 *
 * MENELAN galatnya, dengan sengaja: jejak yang gagal ditulis tidak boleh
 * membatalkan pemeriksaan yang sudah selesai, dan tidak boleh mengubah kode
 * keluar yang dipakai CI. Platform yang tak terjangkau berarti `/api/health`
 * menjawab `unknown` — jawaban jujur — bukan berarti sapuannya gagal.
 *
 * Impornya DINAMIS: berkas ini dijalankan `tsx` di luar Next, dan klien Prisma
 * platform yang belum dibangkitkan tidak boleh meruntuhkan pemeriksaannya
 * (doktrin #137 — penagihan mati ≠ aplikasi mati, diperluas ke perkakas).
 */
/**
 * Berapa buku disapu BERSAMAAN.
 *
 * ══ KENAPA ANGKANYA BUKAN SEKADAR MENIRU MIGRATION ════════════════════════
 * `COMPANY_MIGRATE_CONCURRENCY` bawaannya 2 karena tiap pelaksananya satu
 * proses Prisma CLI plus satu backend PostgreSQL, dan ia berjalan sementara
 * aplikasi masih melayani. Sapuan ini jauh lebih ringan — nol proses anak,
 * satu klien per buku, hanya BACA.
 *
 * Yang membatasinya tetap ada, dan bukan memori melainkan **basis datanya**:
 * sebelas pemeriksaan per buku adalah sebelas `$queryRawUnsafe` yang menyapu
 * tabel, pada satu `db-postgres` yang juga melayani aplikasi. Delapan buku
 * serentak berarti 88 sapuan tabel bersamaan — dan pemeriksaan kesesuaian yang
 * memperlambat orang yang sedang membukukan adalah pemeriksaan yang akhirnya
 * dimatikan.
 *
 * Jadi bawaannya 3: lebih cepat dari berurutan, masih di bawah ambang di mana
 * ia terasa oleh pengguna. Plafonnya 8, dan nilai salah tulis diabaikan dengan
 * BUNYI — angka yang diam-diam jatuh ke bawaan membuat orang mengira ia sedang
 * menjalankan sesuatu yang lain.
 */
function batasSerentak(): number {
  const raw = process.env.CONFORMANCE_CONCURRENCY;
  if (raw === undefined || raw === "") return 3;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(
      `⚠ CONFORMANCE_CONCURRENCY=${JSON.stringify(raw)} bukan bilangan bulat ≥ 1 — memakai 3.`
    );
    return 3;
  }
  if (n > 8) {
    console.warn(`⚠ CONFORMANCE_CONCURRENCY=${n} di atas plafon 8 — memakai 8.`);
    return 8;
  }
  return n;
}

/** Catatan satu buku di dalam jejak putaran — lihat `rekam`. */
interface CatatanBuku {
  slug: string;
  databaseName: string;
  /** Instans `db-postgres` buku ini (tahap 4); `default` = instans bawaan. */
  instance: string;
  /** ok | findings | error — sama kosakatanya dengan status putaran. */
  status: "ok" | "findings" | "error";
  findingCount: number;
  durationMs: number;
}

async function rekam(hasil: {
  startedAt: Date;
  status: "ok" | "findings" | "error";
  companiesChecked: number;
  companiesFailed: number;
  findingCount: number;
  findings: string[];
  failures: string[];
  perCompany: CatatanBuku[];
}) {
  try {
    const { controlDb } = await import("@sai/core/control-db");
    await controlDb.conformanceRun.create({
      data: {
        startedAt: hasil.startedAt,
        finishedAt: new Date(),
        status: hasil.status,
        companiesChecked: hasil.companiesChecked,
        companiesFailed: hasil.companiesFailed,
        findingCount: hasil.findingCount,
        /* Dipangkas: satu putaran bisa menghasilkan ribuan baris temuan, dan
           jejak ini dibaca untuk tahu APA yang harus diperiksa orang — bukan
           untuk menggantikan pemeriksaannya. Jumlah utuhnya ada di
           `findingCount`. */
        /*
         * `perCompany` adalah "baris jejak per basis data" yang §6 tuntut, dan
         * ia di dalam JSON — bukan tabel tersendiri. Itu mengikuti preseden yang
         * sudah ada: `backup_runs` pun satu baris per PUTARAN, dan bukti
         * per-basis-datanya hidup di `manifest.json` di dalam putaran itu.
         *
         * Yang hilang dari pilihan ini nyata: isi JSON tidak bisa dikueri, jadi
         * "buku mana yang paling sering gagal" belum bisa dijawab SQL. Pemicu
         * untuk memindahkannya ke tabel: ada orang yang sungguh menanyakan itu.
         * Sampai hari itu, tabel tambahan hanya menambah migration dan retensi
         * untuk pertanyaan yang belum pernah diajukan.
         *
         * TIDAK dipangkas, berbeda dari `findings`: panjangnya terikat jumlah
         * perusahaan (19), bukan jumlah temuan (bisa ribuan).
         */
        details: JSON.stringify({
          findings: hasil.findings.slice(0, 200),
          failures: hasil.failures,
          perCompany: hasil.perCompany,
        }),
      },
    });
  } catch (error) {
    console.error(
      `\n⚠ jejak putaran tidak tercatat (${error instanceof Error ? error.message : String(error)}).` +
        "\n  Pemeriksaannya sendiri TIDAK terpengaruh — lihat hasil di atas."
    );
  }
}

async function main() {
  const detail = process.argv.includes("--detail");
  const startedAt = new Date();
  /* Baris laporan yang dulu HANYA tercetak ke stdout — kini ikut ke jejak. */
  const barisTemuan: string[] = [];

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const control = new ControlClient({ adapter: adapterFor(controlUrl) });
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { slug: true, ...COMPANY_DATABASE_TARGET_SELECT, isActive: true },
  });
  await control.$disconnect();
  const instanceOf = (c: (typeof companies)[number]): string =>
    c.dbInstanceKey ?? DEFAULT_DB_INSTANCE_LABEL;

  let totalTemuan = 0;
  const gagal: string[] = [];
  const perCompany: CatatanBuku[] = [];

  /*
   * ══ SATU BUKU, DAN KELUARANNYA DIKUMPULKAN BUKAN DICETAK ══════════════════
   * Dengan beberapa pelaksana, `console.log` di tengah pemeriksaan membuat
   * laporan dua buku saling menyisip — dan yang tidak bisa dibaca adalah justru
   * log pada hari satu di antaranya menemukan sesuatu. Jadi tiap buku
   * MEMULANGKAN barisnya, dan pencetaknya satu tempat. Pola yang sama dengan
   * `migrate-all-companies.ts`.
   */
  async function periksaSatu(company: (typeof companies)[number]): Promise<{
    baris: string[];
    temuanBaris: string[];
    jumlahTemuan: number;
    gagalPesan: string | null;
    durationMs: number;
  }> {
    const mulai = Date.now();
    const instance = instanceOf(company);
    const label =
      `${company.slug}${instance === DEFAULT_DB_INSTANCE_LABEL ? "" : ` @${instance}`}` +
      (company.isActive ? "" : " [nonaktif]");
    /* URL dari penyelesai tunggal (tahap 4). Instans tak terselesaikan = buku
       ini GAGAL diperiksa — bukan diperiksa di server bawaan. */
    let prisma: PrismaClient;
    try {
      prisma = new PrismaClient({
        adapter: buatAdapter(companyDatabaseUrl(toCompanyDatabaseTarget(company)), {
          batasKoneksi: 2,
        }),
      });
    } catch (error) {
      return {
        baris: [],
        temuanBaris: [],
        jumlahTemuan: 0,
        gagalPesan: `${company.slug}: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - mulai,
      };
    }
    const temuan: { check: Check; rows: { label: string }[] }[] = [];

    try {
      for (const check of CHECKS) {
        const raw = (await prisma.$queryRawUnsafe(check.sql)) as Record<string, unknown>[];
        const rows = check.nilai ? check.nilai(raw) : (raw as unknown as { label: string }[]);
        if (rows.length > 0) temuan.push({ check, rows });
      }
    } catch (error) {
      return {
        baris: [],
        temuanBaris: [],
        jumlahTemuan: 0,
        gagalPesan: `${company.slug}: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - mulai,
      };
    } finally {
      /* `finally`: klien yang tidak ditutup pada jalur GAGAL menahan satu
         koneksi per buku, dan sapuan yang gagal di sepuluh buku menghabiskan
         pool-nya sendiri. Jalur lama memanggilnya dua kali; di sini sekali. */
      await prisma.$disconnect();
    }

    if (temuan.length === 0) {
      return {
        baris: [`✓ ${label} — bersih`],
        temuanBaris: [],
        jumlahTemuan: 0,
        gagalPesan: null,
        durationMs: Date.now() - mulai,
      };
    }

    const baris = [`\n✗ ${label}`];
    const temuanBaris: string[] = [];
    let jumlahTemuan = 0;
    for (const { check, rows } of temuan) {
      jumlahTemuan += rows.length;
      baris.push(`   ${check.judul}: ${rows.length}`);
      for (const r of rows) temuanBaris.push(`${company.slug} · ${check.judul}: ${r.label}`);
      /* Tiga contoh, bukan semuanya: daftar 609 baris di terminal menyembunyikan
         justru pemeriksaan lain yang ikut berbunyi. `--detail` untuk seluruhnya. */
      const tampil = detail ? rows : rows.slice(0, 3);
      for (const r of tampil) baris.push(`      · ${r.label}`);
      if (!detail && rows.length > tampil.length) {
        baris.push(`      … ${rows.length - tampil.length} lagi (pakai --detail)`);
      }
    }
    return { baris, temuanBaris, jumlahTemuan, gagalPesan: null, durationMs: Date.now() - mulai };
  }

  /*
   * ══ HASILNYA DIINDEKS MENURUT URUTAN DAFTAR, BUKAN URUTAN SELESAI ════════
   * Dengan beberapa pelaksana, urutan selesai berubah tiap putaran — dan
   * laporan yang urutannya berubah membuat dua sapuan yang hasilnya SAMA
   * terbaca berbeda, yang berarti diff antar putaran berhenti berguna.
   * `migrate-all-companies.ts` menemukan hal yang sama dan menyelesaikannya
   * dengan mengurutkan ulang; di sini hasilnya langsung ditaruh pada indeksnya.
   */
  const hasil = new Array<Awaited<ReturnType<typeof periksaSatu>>>(companies.length);
  let berikut = 0;
  async function pelaksana() {
    for (;;) {
      const i = berikut++;
      if (i >= companies.length) return;
      hasil[i] = await periksaSatu(companies[i]);
    }
  }

  const serentak = Math.max(1, Math.min(batasSerentak(), companies.length));
  console.log(
    `${companies.length} buku, ${serentak} disapu bersamaan ` +
      `(CONFORMANCE_CONCURRENCY=${serentak}).\n`
  );
  await Promise.all(Array.from({ length: serentak }, () => pelaksana()));

  for (const [i, r] of hasil.entries()) {
    const company = companies[i];
    for (const b of r.baris) console.log(b);
    barisTemuan.push(...r.temuanBaris);
    totalTemuan += r.jumlahTemuan;
    if (r.gagalPesan !== null) gagal.push(r.gagalPesan);
    perCompany.push({
      slug: company.slug,
      databaseName: company.databaseName,
      instance: instanceOf(company),
      status: r.gagalPesan !== null ? "error" : r.jumlahTemuan > 0 ? "findings" : "ok",
      findingCount: r.jumlahTemuan,
      durationMs: r.durationMs,
    });
  }

  console.log(
    `\n${totalTemuan === 0 ? "Bersih" : `${totalTemuan} temuan`} di ${companies.length} perusahaan.`
  );

  /* Per instans (tahap 4) — hanya bila ada lebih dari instans bawaan, supaya
     keluaran pemasangan satu server tidak berubah satu baris pun. */
  const instansDipakai = [...new Set(perCompany.map((c) => c.instance))].sort();
  if (instansDipakai.length > 1 || instansDipakai[0] !== DEFAULT_DB_INSTANCE_LABEL) {
    for (const instans of instansDipakai) {
      const buku = perCompany.filter((c) => c.instance === instans);
      const galat = buku.filter((c) => c.status === "error").length;
      const bertemuan = buku.filter((c) => c.status === "findings").length;
      console.log(
        `   instans ${instans}: ${buku.length} buku, ${bertemuan} bertemuan, ${galat} gagal diperiksa`
      );
    }
  }

  if (gagal.length > 0) {
    console.error(`\n${gagal.length} perusahaan gagal diperiksa:`);
    for (const g of gagal) console.error(`   ${g}`);
  }

  /*
   * Jejaknya ditulis SEBELUM `process.exit` — `exit` tidak menunggu promise
   * yang masih berjalan, jadi mencatat sesudahnya berarti jejak yang hilang
   * tepat pada putaran yang paling perlu dicatat.
   */
  await rekam({
    startedAt,
    status: gagal.length > 0 ? "error" : totalTemuan > 0 ? "findings" : "ok",
    companiesChecked: companies.length,
    companiesFailed: gagal.length,
    findingCount: totalTemuan,
    findings: barisTemuan,
    failures: gagal,
    perCompany,
  });

  /* Kode keluar BUKAN NOL bila ada temuan ATAU ada buku yang gagal diperiksa —
     buku yang tidak terperiksa bukan buku yang bersih. */
  if (totalTemuan > 0 || gagal.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
