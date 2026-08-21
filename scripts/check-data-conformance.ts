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

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { CONTRACT_STATUSES, CURRENCIES } from "../src/lib/constants";
import { ACCOUNT_TYPE_VALUES } from "../src/lib/accounting";

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
  /** Harus memulangkan kolom `label`; jumlah barisnya = jumlah pelanggaran. */
  sql: string;
}

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
    sql: `SELECT CONCAT(i.invoice_no, ': dibayar ', FORMAT(pay.terbayar, 0), ' atas nilai ', FORMAT(nilai.total, 0)) AS label
            FROM invoices i
            JOIN (SELECT invoice_id, SUM(quantity * price) AS total FROM invoice_items GROUP BY invoice_id) nilai
              ON nilai.invoice_id = i.id
            JOIN (SELECT p.invoice_id, SUM(${BASE("p")}) AS terbayar, SUM(${BASE("p")} IS NULL) AS tak_terukur
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
    sql: `SELECT CONCAT(j.number, ': debit ', FORMAT(SUM(l.base_debit), 2), ' vs kredit ', FORMAT(SUM(l.base_credit), 2)) AS label
            FROM journals j JOIN journal_lines l ON l.journal_id = j.id
           GROUP BY j.id HAVING ABS(SUM(l.base_debit) - SUM(l.base_credit)) > 0.005`,
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
];

function adapterFor(raw: string, database?: string) {
  const url = new URL(raw);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? url.pathname.slice(1),
    connectionLimit: 2,
  });
}

function companyTemplate(): string {
  return (
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!
  );
}

async function main() {
  const detail = process.argv.includes("--detail");

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const control = new ControlClient({ adapter: adapterFor(controlUrl) });
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { slug: true, databaseName: true, isActive: true },
  });
  await control.$disconnect();

  let totalTemuan = 0;
  const gagal: string[] = [];

  for (const company of companies) {
    const label = `${company.slug}${company.isActive ? "" : " [nonaktif]"}`;
    const prisma = new PrismaClient({ adapter: adapterFor(companyTemplate(), company.databaseName) });
    const temuan: { check: Check; rows: { label: string }[] }[] = [];

    try {
      for (const check of CHECKS) {
        const rows = (await prisma.$queryRawUnsafe(check.sql)) as { label: string }[];
        if (rows.length > 0) temuan.push({ check, rows });
      }
    } catch (error) {
      gagal.push(`${company.slug}: ${error instanceof Error ? error.message : String(error)}`);
      await prisma.$disconnect();
      continue;
    }
    await prisma.$disconnect();

    if (temuan.length === 0) {
      console.log(`✓ ${label} — bersih`);
      continue;
    }

    console.log(`\n✗ ${label}`);
    for (const { check, rows } of temuan) {
      totalTemuan += rows.length;
      console.log(`   ${check.judul}: ${rows.length}`);
      /* Tiga contoh, bukan semuanya: daftar 609 baris di terminal menyembunyikan
         justru pemeriksaan lain yang ikut berbunyi. `--detail` untuk seluruhnya. */
      const tampil = detail ? rows : rows.slice(0, 3);
      for (const r of tampil) console.log(`      · ${r.label}`);
      if (!detail && rows.length > tampil.length) {
        console.log(`      … ${rows.length - tampil.length} lagi (pakai --detail)`);
      }
    }
  }

  console.log(
    `\n${totalTemuan === 0 ? "Bersih" : `${totalTemuan} temuan`} di ${companies.length} perusahaan.`
  );

  if (gagal.length > 0) {
    console.error(`\n${gagal.length} perusahaan gagal diperiksa:`);
    for (const g of gagal) console.error(`   ${g}`);
  }

  /* Kode keluar BUKAN NOL bila ada temuan ATAU ada buku yang gagal diperiksa —
     buku yang tidak terperiksa bukan buku yang bersih. */
  if (totalTemuan > 0 || gagal.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
