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
 */

import "server-only";

import JSZip from "jszip";

import { controlDb } from "@/lib/control-db";
import { getCompanyClient } from "@/lib/company-clients";
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
  slug: string;
  name: string;
  databaseName: string;
  isActive: boolean;
}

async function exportCompanyInto(
  zip: JSZip,
  company: CompanyToExport
): Promise<{ tables: number; rows: number }> {
  const db = getCompanyClient(company.databaseName);
  const folder = zip.folder(company.slug)!;

  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables " +
      "WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' " +
      "AND table_name <> '_prisma_migrations' ORDER BY table_name"
  );

  let totalRows = 0;
  for (const t of tables) {
    const table = assertSafeIdentifier(String(t.table_name));
    const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
      "SELECT column_name FROM information_schema.columns " +
        "WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
      table
    );
    const header = columns.map((c) => assertSafeIdentifier(String(c.column_name)));

    const parts: string[] = [];
    let offset = 0;
    for (;;) {
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM \`${table}\` ORDER BY \`${header[0]}\` LIMIT ${CHUNK} OFFSET ${offset}`
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

  return { tables: tables.length, rows: totalRows };
}

export interface TenantExportResult {
  filename: string;
  buffer: Buffer;
  companies: number;
  tables: number;
  rows: number;
}

/** Bangun arsip ekspor untuk sebuah tenant. Pemanggil (route) yang menjaga
 *  izin dan menulis jejak auditnya. */
export async function buildTenantExport(tenantId: number): Promise<TenantExportResult> {
  const tenant = await controlDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, name: true, status: true, planKey: true, createdAt: true },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} tidak ditemukan.`);

  const companies = await controlDb.company.findMany({
    where: { tenantId },
    select: { slug: true, name: true, databaseName: true, isActive: true },
    orderBy: { slug: "asc" },
  });

  const zip = new JSZip();
  const generatedAt = new Date();

  let tables = 0;
  let rows = 0;
  for (const company of companies) {
    const result = await exportCompanyInto(zip, company);
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
      "Simpan arsip ini baik-baik: UU KUP menuntut buku dan catatan pembukuan\r\n" +
      "disimpan 10 (sepuluh) tahun.\r\n"
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const stamp = generatedAt.toISOString().slice(0, 10);
  return {
    filename: `ekspor-${tenant.slug}-${stamp}.zip`,
    buffer,
    companies: companies.length,
    tables,
    rows,
  };
}
