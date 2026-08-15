/**
 * Templat & PEMBACAAN berkas piutang/utang terbuka (issue #381 tahap 4).
 *
 * - `GET  ?kind=receivables|payables` → templat `.xlsx`
 * - `POST ?kind=…` + `file` → baris tervalidasi, atau galat per-baris
 *
 * ══ ROUTE INI TIDAK MENULIS APA PUN ═════════════════════════════════════════
 * Dan itu bukan kelalaian — itu seluruh bentuknya. Saldo awal adalah SATU
 * transaksi sekali-jalan (`applyOpeningBalances`): jurnal pembuka, dokumen
 * pembukanya, dan gerakan stok pembukanya lahir bersama atau tidak sama sekali.
 * Sebuah route impor yang menulis dokumen lebih dulu akan memecah transaksi itu
 * menjadi dua, dan meninggalkan dokumen tanpa jurnal bila langkah kedua gagal —
 * persis keadaan yang tahap 3 ada untuk mengakhirinya.
 *
 * Jadi route ini membaca, mencocokkan nama mitra ke id, dan MEMULANGKAN
 * barisnya. Wisaya memegangnya sampai orangnya menekan simpan; saat itulah
 * seluruh penyiapan tersimpan sekaligus.
 *
 * ══ IZINNYA `setup.manage`, BUKAN `customer.write` ══════════════════════════
 * Yang dibaca berkas ini bukan master data melainkan SALDO AWAL — angka yang
 * menentukan titik nol pembukuan. Ia milik orang yang menyiapkan buku, dan
 * gerbangnya sama dengan wisaya yang akan memakainya.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { readFirstSheetRows } from "@/lib/xlsx-read";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getRequestI18n } from "@/lib/i18n/server";
import { buildTemplate } from "@/lib/import/template";
import type { RowError } from "@/lib/import/rows";
import {
  OPENING_AP_COLUMNS,
  OPENING_AR_COLUMNS,
  parseOpeningDocuments,
} from "@/lib/import/opening-ar-ap";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Kind = "receivables" | "payables";

const KINDS = {
  receivables: {
    columns: OPENING_AR_COLUMNS,
    sheetName: "Piutang Terbuka",
    fileName: "templat-piutang-awal.xlsx",
    partners: () => prisma.customer.findMany({ select: { id: true, name: true } }),
  },
  payables: {
    columns: OPENING_AP_COLUMNS,
    sheetName: "Utang Terbuka",
    fileName: "templat-utang-awal.xlsx",
    partners: () => prisma.supplier.findMany({ select: { id: true, name: true } }),
  },
} as const;

function kindOf(request: Request): Kind | null {
  const raw = new URL(request.url).searchParams.get("kind");
  return raw === "receivables" || raw === "payables" ? raw : null;
}

export async function POST(request: Request, ctx: TenantApiContext) {
  const kind = kindOf(request);
  if (!kind) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.unknownImportKind") }, { status: 400 });
  }
  const spec = KINDS[kind];

  const result = await requireApiPermission("setup.manage", ctx.params);
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

  const parsed = parseOpeningDocuments(sheet, spec.columns);

  /*
   * Pencocokan nama mitra terjadi DI SINI, bukan di parser: parser murni dan
   * tidak boleh menyentuh basis data. Mitra yang tidak dikenali menjadi galat
   * PER BARIS seperti galat lain, dengan nomor barisnya — bukan satu pesan
   * gabungan di akhir yang memaksa orang mencari sendiri baris mana.
   */
  const partners = await spec.partners();
  const byName = new Map(partners.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const rows: {
    partnerId: number;
    partnerName: string;
    documentNo: string;
    date: string;
    dueDate: string | null;
    currency: string;
    rate: number | null;
    amount: number;
  }[] = [];
  const errors: RowError[] = [...parsed.errors];

  parsed.rows.forEach((row, i) => {
    const id = byName.get(row.partner.trim().toLowerCase());
    if (id === undefined) {
      /* Nomor barisnya diturunkan dari urutan baris yang LOLOS parse, jadi ia
         bisa meleset bila ada baris sebelumnya yang ditolak. Karena itu yang
         disebut adalah NAMANYA — satu-satunya penunjuk yang tetap benar, dan
         yang memang dicari orang di berkasnya. */
      errors.push({
        row: i + 2,
        message:
          `"${row.partner}" belum terdaftar. Impor daftarnya lebih dulu, ` +
          "atau samakan penulisan namanya.",
      });
      return;
    }
    rows.push({
      partnerId: id,
      partnerName: row.partner,
      documentNo: row.documentNo,
      date: row.date.toISOString().slice(0, 10),
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      currency: row.currency,
      rate: row.rate,
      amount: row.amount,
    });
  });

  if (errors.length > 0) {
    return NextResponse.json(
      { error: t("errors.rowsNeedFixing"), rowErrors: errors, valid: rows.length },
      { status: 422 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: t("errors.noImportRows") }, { status: 422 });
  }

  return NextResponse.json({ rows, total: rows.length, truncated: parsed.truncated });
}

export async function GET(request: Request, ctx: TenantApiContext) {
  const kind = kindOf(request);
  if (!kind) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.unknownImportKind") }, { status: 400 });
  }
  const spec = KINDS[kind];

  const result = await requireApiPermission("setup.manage", ctx.params);
  if (!result.authorized) return result.response;

  const { rows, legend } = buildTemplate(spec.columns);

  /* Ditulis langsung, BUKAN lewat `buildWorkbookBuffer` — modul itu menaruh
     spanduk di lima baris pertama, dan baris judul yang mendarat di baris 6
     membuat templat ini ditolak parsernya sendiri (alasan lengkap di
     `master/import/route.ts`). */
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
