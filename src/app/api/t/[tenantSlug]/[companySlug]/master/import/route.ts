/**
 * Impor & templat MASTER DATA — pelanggan, pemasok, barang (issue #381, tahap 2).
 *
 * - `GET  ?kind=customers|suppliers|items` → templat `.xlsx` (judul + contoh + legenda)
 * - `POST ?kind=…` + `file` → validasi SELURUH baris, lalu tulis yang baru
 *
 * ══ SATU ROUTE, TIGA JENIS ══════════════════════════════════════════════════
 * Bukan penghematan baris: ketiganya menjawab satu pertanyaan yang sama bagi
 * penggunanya, dan aturan yang mengikat ketiganya — tolak seutuhnya bila ada
 * baris salah, lewati yang sudah ada alih-alih menimpanya, batas ukuran berkas
 * — harus dijawab dengan cara yang sama persis. Tiga route terpisah adalah tiga
 * tempat untuk menjawabnya berbeda, dan yang menyimpang selalu yang paling
 * jarang dibuka.
 *
 * ══ IZIN BERBEDA PER JENIS, DAN ITU BUKAN DETAIL ═══════════════════════════
 * `customer.write`, `supplier.write`, `inventory.write` — masing-masing jenis
 * dijaga izin yang SAMA dengan membuatnya satu per satu lewat formulir. Sebuah
 * jalur impor yang izinnya lebih longgar daripada jalur manualnya adalah pintu
 * belakang, dan pintu belakang selalu ditemukan.
 *
 * ══ KENAPA PERUSAHAAN DI JALUR, BUKAN DI HEADER (issue #158) ═══════════════
 * Alasan yang sama persis dengan impor daftar akun: templat diambil lewat
 * `<a href download>` biasa, dan sebuah tautan tidak melewati `apiFetch()`.
 * Menyisakan route yang perusahaannya "kadang dari header, kadang dari sesi"
 * berarti menyisakan lubang yang #158 tutup.
 *
 * ══ TIDAK MENIMPA, TIDAK MENGHAPUS ══════════════════════════════════════════
 * Baris yang namanya SUDAH ADA di basis data dilewati dan DILAPORKAN, tidak
 * pernah ditimpa. Impor adalah cara memasukkan yang belum ada — bukan cara
 * menulis ulang pekerjaan orang, dan seseorang yang mengunggah berkas lama
 * untuk kedua kalinya tidak boleh kehilangan suntingan yang ia buat sesudahnya.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import type { Permission } from "@/lib/authz";
import { readFirstSheetRows } from "@/lib/xlsx-read";
import ExcelJS from "exceljs";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getRequestI18n } from "@/lib/i18n/server";
import { writeAuditLog } from "@/lib/audit";
import { buildTemplate } from "@/lib/import/template";
import type { ColumnSpec } from "@/lib/import/spec";
import {
  CUSTOMER_COLUMNS,
  ITEM_COLUMNS,
  SUPPLIER_COLUMNS,
  parseCustomerRows,
  parseItemRows,
  parseSupplierRows,
  type MasterImportResult,
} from "@/lib/import/master";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Kind = "customers" | "suppliers" | "items";

interface KindSpec {
  permission: Permission;
  columns: readonly ColumnSpec[];
  sheetName: string;
  /** Nama berkas templat — tanpa spasi, supaya unduhannya rapi di mana pun. */
  fileName: string;
  parse: (sheet: unknown[][]) => MasterImportResult<{ name: string }>;
  /** Nama yang SUDAH ADA di basis data (huruf kecil, untuk membandingkan). */
  existingNames: () => Promise<Set<string>>;
  /** Tulis baris baru. Menerima hasil parse yang sudah disaring. */
  create: (rows: { name: string }[]) => Promise<number>;
}

const KINDS: Record<Kind, KindSpec> = {
  customers: {
    permission: "customer.write",
    columns: CUSTOMER_COLUMNS,
    sheetName: "Pelanggan",
    fileName: "templat-pelanggan.xlsx",
    parse: (sheet) => parseCustomerRows(sheet),
    existingNames: async () =>
      new Set(
        (await prisma.customer.findMany({ select: { name: true } })).map((c) =>
          c.name.toLowerCase()
        )
      ),
    create: async (rows) => {
      const data = rows as ReturnType<typeof parseCustomerRows>["rows"];
      const result = await prisma.customer.createMany({
        data: data.map((r) => ({
          name: r.name,
          address: r.address,
          phone: r.phone,
          email: r.email,
          pic: r.pic,
          npwp: r.npwp,
          taxExempt: r.taxExempt,
        })),
      });
      return result.count;
    },
  },
  suppliers: {
    permission: "supplier.write",
    columns: SUPPLIER_COLUMNS,
    sheetName: "Pemasok",
    fileName: "templat-pemasok.xlsx",
    parse: (sheet) => parseSupplierRows(sheet),
    existingNames: async () =>
      new Set(
        (await prisma.supplier.findMany({ select: { name: true } })).map((s) =>
          s.name.toLowerCase()
        )
      ),
    create: async (rows) => {
      const data = rows as ReturnType<typeof parseSupplierRows>["rows"];
      const result = await prisma.supplier.createMany({
        data: data.map((r) => ({
          name: r.name,
          address: r.address,
          phone: r.phone,
          email: r.email,
        })),
      });
      return result.count;
    },
  },
  items: {
    permission: "inventory.write",
    columns: ITEM_COLUMNS,
    sheetName: "Barang",
    fileName: "templat-barang.xlsx",
    parse: (sheet) => parseItemRows(sheet),
    existingNames: async () =>
      new Set(
        (await prisma.item.findMany({ select: { name: true } })).map((i) => i.name.toLowerCase())
      ),
    create: async (rows) => {
      const data = rows as ReturnType<typeof parseItemRows>["rows"];
      const result = await prisma.item.createMany({
        data: data.map((r) => ({ name: r.name, unit: r.unit })),
      });
      return result.count;
    },
  },
};

function kindOf(request: Request): Kind | null {
  const raw = new URL(request.url).searchParams.get("kind");
  return raw && raw in KINDS ? (raw as Kind) : null;
}

export async function POST(request: Request, ctx: TenantApiContext) {
  const kind = kindOf(request);
  if (!kind) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.unknownImportKind") }, { status: 400 });
  }
  const spec = KINDS[kind];

  const result = await requireApiPermission(spec.permission, ctx.params);
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: t("errors.fileTooLarge", { max: "5 MB" }) }, { status: 400 });
  }

  let sheet: unknown[][];
  try {
    sheet = await readFirstSheetRows(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: t("errors.excelUnreadable") }, { status: 400 });
  }

  const parsed = spec.parse(sheet);

  /*
   * SATU baris salah menolak SELURUH berkas (aturan #381 butir 2). Impor
   * sebagian adalah buku yang tidak bisa dijelaskan siapa pun: pengguna tidak
   * tahu mana yang masuk, dan mengunggah ulang berkas yang sudah diperbaiki
   * akan menggandakan yang terlanjur masuk.
   */
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: t("errors.rowsNeedFixing"), rowErrors: parsed.errors, valid: parsed.rows.length },
      { status: 422 }
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: t("errors.noImportRows") }, { status: 422 });
  }

  const existing = await spec.existingNames();
  const toCreate = parsed.rows.filter((r) => !existing.has(r.name.toLowerCase()));
  const skipped = parsed.rows.length - toCreate.length;

  const created = toCreate.length > 0 ? await spec.create(toCreate) : 0;

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    role: result.session.user.role,
    action: "master.import",
    entity: kind === "items" ? "item" : kind === "customers" ? "customer" : "supplier",
    details: { kind, created, skipped, total: parsed.rows.length },
    request,
  });

  return NextResponse.json({
    created,
    skipped,
    total: parsed.rows.length,
    truncated: parsed.truncated,
  });
}

export async function GET(request: Request, ctx: TenantApiContext) {
  const kind = kindOf(request);
  if (!kind) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.unknownImportKind") }, { status: 400 });
  }
  const spec = KINDS[kind];

  const result = await requireApiPermission(spec.permission, ctx.params);
  if (!result.authorized) return result.response;

  const { rows, legend } = buildTemplate(spec.columns);

  /*
   * Judul + contoh di lembar pertama, legenda di lembar kedua. Legenda TIDAK
   * ditaruh di bawah datanya, dan itu penting: orang menyalin datanya ke lembar
   * pertama lalu mengunggahnya apa adanya — sebuah legenda di baris 10 akan
   * ikut terbaca sebagai data, dan menghasilkan sepuluh galat yang membingungkan
   * pada berkas yang isinya sebenarnya benar.
   */
  /*
   * ⚠ `buildWorkbookBuffer` (@/lib/xlsx) SENGAJA tidak dipakai di sini. Ia
   * menulis spanduk perusahaan + judul + periode di lima baris pertama — benar
   * untuk laporan, fatal untuk templat: baris judul kolomnya akan mendarat di
   * baris 6, dan parser (yang membaca baris 1 sebagai judul) akan MENOLAK
   * berkas yang baru saja diunduh dari aplikasi ini sendiri.
   */
  const wb = new ExcelJS.Workbook();
  wb.creator = (await getCompanyIdentity()).name;
  wb.created = new Date();

  const ws = wb.addWorksheet(spec.sheetName);
  for (const row of rows) ws.addRow(row);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  });
  spec.columns.forEach((column, i) => {
    ws.getColumn(i + 1).width = Math.max(14, Math.min(44, column.header.length + 10));
  });

  const petunjuk = wb.addWorksheet("Petunjuk");
  for (const row of legend) petunjuk.addRow(row);
  petunjuk.getRow(1).font = { bold: true };
  petunjuk.getColumn(1).width = 22;
  petunjuk.getColumn(2).width = 12;
  petunjuk.getColumn(3).width = 90;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${spec.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
