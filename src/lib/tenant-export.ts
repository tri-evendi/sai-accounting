/**
 * EKSPOR DATA MANDIRI (issue #142) — hak akses UU PDP + jalan keluar yang
 * bermartabat: SELURUH buku setiap PT milik tenant, dalam bentuk yang terbuka
 * tanpa aplikasi ini (ZIP berisi CSV per tabel).
 *
 * ══ ATURAN YANG MEMBENTUKNYA ════════════════════════════════════════════════
 * • SEMUA PT milik tenant — termasuk yang NONAKTIF: penonaktifan menyembunyikan
 *   perusahaan dari pemilih, bukan dari kewajiban simpannya.
 * • Bekerja untuk tenant SUSPENDED — itulah intinya secara hukum: pelanggan
 *   yang berhenti membayar tetap wajib menyimpan pembukuannya (UU KUP) dan
 *   karenanya tetap harus bisa MENGUNDUHNYA. Penjaga tenant tidak memeriksa
 *   status, dan tidak ada satu pun cabang di sini yang menolaknya.
 * • GENERIK lewat information_schema, bukan daftar tabel pilihan: daftar yang
 *   diketik tangan pasti tertinggal saat skema tumbuh, dan ekspor "hampir
 *   semua" adalah janji hukum yang diingkari diam-diam. Satu-satunya yang
 *   dikecualikan adalah pembukuan alat (`_prisma_migrations`).
 * • Baca ber-potongan (1000 baris, ORDER BY kolom pertama) — mesin ~1GB tidak
 *   boleh menelan tabel terbesar sekaligus.
 * • BERKAS DOKUMEN IKUT (issue #367). Sampai issue itu ekspor ini memulangkan
 *   baris `documents` TANPA dokumennya — berkasnya hidup di `public/uploads`,
 *   di luar jangkauan sapuan information_schema, jadi "seluruh buku" tidak
 *   pernah benar-benar seluruhnya. Sejak berkasnya disekat per perusahaan
 *   (`data/documents/<companyId>/`), ia bisa disebut dan karena itu disalin.
 *
 * ══ ARSIPNYA DI-STREAM, TIDAK DIKUMPULKAN DI MEMORI ════════════════════════
 * Menambahkan berkas ke arsip yang dibangun UTUH di memori akan mengubah
 * ekspor menjadi cara paling mudah menjatuhkan mesin ~3,6 GB: satu tenant
 * dengan 200 dokumen 10 MB adalah 2 GB dalam satu permintaan. Maka isi berkas
 * masuk sebagai ALIRAN (`createReadStream`) dan arsipnya keluar sebagai aliran
 * (`generateNodeStream`) — puncak memorinya tinggal CSV-nya saja, persis
 * seperti sebelum issue ini.
 *
 * Konsekuensi bentuk: fungsi di bawah tidak lagi memulangkan `Buffer`
 * melainkan pembuka aliran. Jumlah tabel & baris tetap DIKETAHUI sebelum
 * aliran dimulai (CSV-nya sudah disusun saat itu), jadi jejak audit tenant
 * tetap bisa ditulis sebelum satu byte pun terkirim.
 *
 * ══ PADANAN GO (jalur `bulk`, 23 Okt 2026) ═════════════════════════════════
 * `services/integrator/internal/tenantexport` menulis arsip yang SAMA — isi
 * setiap berkas byte demi byte — sebagai pekerjaan `tenant.data_export`.
 * Sakelarnya `runner:` kind itu di `contract/kinds.yaml`; selama `node`, modul
 * INI yang melayani `GET /api/tenant/export`. Mengubah bentuk apa pun di sini
 * (nama berkas, kolom, teks BACA-SAYA, bentuk nilai di `export-csv.ts`) berarti
 * mengubah sisi Go juga — `bun run parity:tenant-export` yang menyebut
 * selisihnya, `tests/tenant-export-job.test.ts` menjaga teks pengantarnya.
 */

import "server-only";
import { businessISODate } from "@sai/core/business-date";

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";

import JSZip from "jszip";

import { controlDb } from "@sai/core/control-db";
import { getCompanyClient } from "@/lib/company-clients";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  toCompanyDatabaseTarget,
  type DbInstanceRef,
} from "@sai/db/company-url";
import { resolveDocumentPath } from "@/lib/document-storage";
import { toCsv } from "@/lib/export-csv";

const CHUNK = 1000;

/** Nama tabel/kolom dari information_schema — tetap dipagari sebelum ditanam
 *  ke SQL: identifier tidak bisa jadi parameter, jadi bentuknya yang dijaga. */
function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Identifier tidak aman untuk ekspor: ${JSON.stringify(name)}`);
  }
  return name;
}

interface CompanyToExport {
  /** Dipakai menemukan direktori dokumennya (`data/documents/<id>/`). */
  id: number;
  slug: string;
  name: string;
  databaseName: string;
  dbInstance: DbInstanceRef | null;
  isActive: boolean;
}

/**
 * Nama entri di dalam arsip. Nama asli boleh mengandung apa saja — termasuk
 * pemisah jalur, yang di dalam ZIP berarti FOLDER; sebuah nama berisi `../`
 * adalah entri yang menulis ke luar tempat orang mengekstraknya (zip-slip).
 * Id di depan sekaligus menyelesaikan nama kembar tanpa menebak.
 */
function archiveEntryName(id: number, filename: string): string {
  const safe = filename.replace(/[\\/]/g, "_").replace(/^\.+/, "_").slice(0, 120) || "dokumen";
  return `${id}-${safe}`;
}

async function exportCompanyInto(
  zip: JSZip,
  company: CompanyToExport
): Promise<{ tables: number; rows: number }> {
  const db = getCompanyClient(company);
  const folder = zip.folder(company.slug)!;

  /*
   * `table_schema = current_schema()`: di PostgreSQL `table_schema` berarti
   * **skema** di dalam basis data yang sedang disambungi, bukan basis datanya
   * (padanan MySQL `DATABASE()` sudah dicabut bersama MariaDB, #636).
   */
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables " +
      "WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' " +
      "AND table_name <> '_prisma_migrations' ORDER BY table_name"
  );

  let totalRows = 0;
  for (const t of tables) {
    const table = assertSafeIdentifier(String(t.table_name));
    const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
      "SELECT column_name FROM information_schema.columns " +
        "WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position",
      table
    );
    const header = columns.map((c) => assertSafeIdentifier(String(c.column_name)));

    const parts: string[] = [];
    let offset = 0;
    for (;;) {
      /* Pengutip identifier PostgreSQL adalah tanda kutip GANDA. Sampai #636
         baris ini masih memakai backtick MySQL — sintaks yang DITOLAK
         PostgreSQL — jadi sejak penukaran 15 Okt setiap ekspor mandiri gagal
         pada tabel pertama. Namanya sudah dipagari `assertSafeIdentifier`. */
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${table}" ORDER BY "${header[0]}" LIMIT ${CHUNK} OFFSET ${offset}`
      );
      if (rows.length === 0 && offset === 0) break;
      parts.push(
        toCsv(
          header,
          rows.map((row) => header.map((col) => row[col]))
        )
      );
      totalRows += rows.length;
      if (rows.length < CHUNK) break;
      offset += CHUNK;
    }

    // Potongan lanjutan membawa header+BOM sendiri dari toCsv — buang selain
    // yang pertama supaya berkasnya satu tabel utuh.
    const content =
      parts.length === 0
        ? toCsv(header, [])
        : parts[0] +
          parts
            .slice(1)
            .map((p) => p.split("\r\n").slice(1).join("\r\n"))
            .join("");
    folder.file(`${table}.csv`, content);
  }

  await exportDocumentsInto(folder, db);

  return { tables: tables.length, rows: totalRows };
}

/**
 * Berkas dokumen perusahaan ini (issue #367) — isinya masuk sebagai ALIRAN,
 * jadi tidak ada satu berkas pun yang pernah utuh di memori proses.
 *
 * Baris yang berkasnya tidak ada di disk TIDAK didiamkan: ia dicatat di
 * `BERKAS-TIDAK-DITEMUKAN.txt`. Ekspor yang diam-diam melewati sesuatu adalah
 * ekspor yang mengaku lengkap padahal tidak — larangan yang sama dengan
 * "daftar tabel yang diketik tangan" di kepala berkas ini.
 */
async function exportDocumentsInto(
  folder: JSZip,
  db: ReturnType<typeof getCompanyClient>
): Promise<void> {
  const missing: string[] = [];
  let cursor = 0;

  for (;;) {
    const documents = await db.document.findMany({
      where: { id: { gt: cursor } },
      select: { id: true, filename: true, filepath: true },
      orderBy: { id: "asc" },
      take: CHUNK,
    });
    if (documents.length === 0) break;
    cursor = documents[documents.length - 1].id;

    for (const doc of documents) {
      const absolute = resolveDocumentPath(doc.filepath);
      if (!absolute || !(await isReadableFile(absolute))) {
        missing.push(`${doc.id}\t${doc.filename}\t${doc.filepath}`);
        continue;
      }
      folder.file(`documents/${archiveEntryName(doc.id, doc.filename)}`, createReadStream(absolute));
    }

    if (documents.length < CHUNK) break;
  }

  if (missing.length > 0) {
    folder.file(
      "documents/BERKAS-TIDAK-DITEMUKAN.txt",
      "Baris `documents` berikut ada di basis data, tetapi berkasnya tidak\r\n" +
        "ditemukan di penyimpanan saat ekspor ini dibuat.\r\n\r\n" +
        "id\tnama berkas\tkunci penyimpanan\r\n" +
        missing.join("\r\n") +
        "\r\n"
    );
  }
}

async function isReadableFile(absolute: string): Promise<boolean> {
  try {
    return (await stat(absolute)).isFile();
  } catch {
    return false;
  }
}

export interface TenantExportResult {
  filename: string;
  /**
   * Membuka aliran arsipnya. Dipanggil SETELAH jejak audit ditulis, sebab sejak
   * byte pertama terkirim tidak ada lagi kesempatan menjawab galat dengan
   * status HTTP.
   */
  openStream: () => Readable;
  companies: number;
  tables: number;
  rows: number;
}

/** Bangun arsip ekspor untuk sebuah tenant. Pemanggil (route) yang menjaga
 *  izin dan menulis jejak auditnya.
 *
 *  `now` hanya untuk `bun run parity:tenant-export`: ia memaku stempel
 *  "Dibuat" di `tenant.json`/`BACA-SAYA.txt` supaya arsip TS dan arsip Go
 *  (`internal/tenantexport`) bisa dibandingkan byte demi byte. */
export async function buildTenantExport(
  tenantId: number,
  options: { now?: Date } = {}
): Promise<TenantExportResult> {
  const tenant = await controlDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, name: true, status: true, planKey: true, createdAt: true },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} tidak ditemukan.`);

  const companies = await controlDb.company.findMany({
    where: { tenantId },
    select: { id: true, slug: true, name: true, ...COMPANY_DATABASE_TARGET_SELECT, isActive: true },
    orderBy: { slug: "asc" },
  });

  const zip = new JSZip();
  const generatedAt = options.now ?? new Date();

  let tables = 0;
  let rows = 0;
  for (const company of companies) {
    const result = await exportCompanyInto(zip, { ...company, ...toCompanyDatabaseTarget(company) });
    tables += result.tables;
    rows += result.rows;
  }

  zip.file(
    "tenant.json",
    JSON.stringify(
      {
        exportedAt: generatedAt.toISOString(),
        tenant: {
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          planKey: tenant.planKey,
          createdAt: tenant.createdAt.toISOString(),
        },
        companies: companies.map((c) => ({
          slug: c.slug,
          name: c.name,
          isActive: c.isActive,
        })),
      },
      null,
      2
    )
  );
  zip.file(
    "BACA-SAYA.txt",
    "EKSPOR DATA SAI ACCOUNTING\r\n" +
      "==========================\r\n\r\n" +
      `Tenant   : ${tenant.name} (${tenant.slug})\r\n` +
      `Dibuat   : ${generatedAt.toISOString()}\r\n` +
      `Perusahaan: ${companies.map((c) => c.slug).join(", ") || "(belum ada)"}\r\n\r\n` +
      "Setiap folder adalah satu perusahaan (PT); setiap berkas .csv adalah satu\r\n" +
      "tabel pembukuannya, apa adanya — dibuka dengan Excel, LibreOffice, atau\r\n" +
      "editor teks; encoding UTF-8 (ber-BOM), pemisah koma, tanggal ISO-8601.\r\n" +
      "Nilai uang tercantum sebagai teks desimal, tidak pernah dibulatkan.\r\n\r\n" +
      "Sub-folder `documents/` berisi berkas yang pernah diunggah ke perusahaan\r\n" +
      "itu (kontrak, B/L, faktur pindaian). Namanya diawali id barisnya di tabel\r\n" +
      "`documents.csv`, supaya keduanya bisa dipasangkan kembali.\r\n\r\n" +
      "Simpan arsip ini baik-baik: UU KUP menuntut buku dan catatan pembukuan\r\n" +
      "disimpan 10 (sepuluh) tahun.\r\n"
  );

  const stamp = businessISODate(generatedAt);
  return {
    filename: `ekspor-${tenant.slug}-${stamp}.zip`,
    /*
     * DIBUNGKUS `Readable` Node sungguhan. `generateNodeStream` memulangkan
     * `Readable` dari `readable-stream@2` (dependensi JSZip), yang TIDAK punya
     * `Symbol.asyncIterator` — dan `Readable.from()` di rute menolaknya
     * ("The \"iterable\" argument must be an instance of Iterable"), SESUDAH
     * jejak auditnya ditulis. Ditemukan 23 Okt 2026 saat skrip paritas
     * `parity:tenant-export` pertama kali memanggil fungsi ini di luar mock.
     * `wrap()` adalah jembatan resmi aliran lama → aliran Node.
     */
    openStream: () =>
      new Readable().wrap(
        zip.generateNodeStream({
          type: "nodebuffer",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        })
      ),
    companies: companies.length,
    tables,
    rows,
  };
}
