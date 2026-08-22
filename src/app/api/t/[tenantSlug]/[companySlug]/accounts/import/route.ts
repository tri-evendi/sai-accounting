/**
 * Impor & template Daftar Akun (Akun Perkiraan).
 *
 * - POST: terima file `.xlsx`, validasi seluruh baris. Bila ADA baris salah,
 *   tolak seutuhnya (422) tanpa menulis apa pun — pengguna perbaiki lalu unggah
 *   ulang, sesuai konvensi Accurate. Bila bersih, buat akun baru; kode yang
 *   SUDAH ADA di DB dilewati (dilaporkan), bukan menimpa.
 * - GET: unduh template `.xlsx` (judul kolom + contoh + legenda kode tipe).
 *
 * RBAC: `account.manage` — sama dengan membuat akun manual.
 *
 * ══ KENAPA PERUSAHAAN ADA DI JALUR, BUKAN DI HEADER (issue #158) ═══════════
 * Route ini punya satu pemanggil yang TIDAK BISA mengirim header: template
 * diambil lewat `<a href download>` biasa, dan sebuah tautan tidak melewati
 * `apiFetch()`. Menyisakan satu route yang perusahaannya "kadang dari header,
 * kadang dari sesi" berarti menyisakan persis lubang yang issue ini tutup.
 * Karena itu SELURUH route ini (unggah maupun template) tinggal di
 * `/api/t/{tenant}/{company}/…`: satu sumber lingkup untuk kedua metodenya.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { readImportSheet, type ImportSheet } from "@/lib/import/sheet";
import { parseCoaRows, ACCURATE_TYPE_LEGEND, MAX_IMPORT_ROWS } from "@/lib/coa-import";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getRequestI18n } from "@/lib/i18n/server";

export async function POST(request: Request, ctx: TenantApiContext) {
  const result = await requireApiPermission("account.manage", ctx.params);
  if (!result.authorized) return result.response;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  }
  if (!file) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.fileTooLarge", { max: "5 MB" }) }, { status: 400 });
  }

  /*
   * Dibaca lewat `readImportSheet`, bukan `readFirstSheetRows` (integrasi
   * Accurate): berkas yang datang dari tombol Ekspor di layar Akun Perkiraan
   * Accurate adalah HALAMAN CETAK — kepala/kaki halaman berulang, judul
   * kolomnya bukan baris pertama. Pembaca itu meratakannya lebih dulu dan
   * membawa serta nomor baris aslinya, sehingga galat tetap menyebut baris
   * yang dilihat orang di berkasnya. Berkas dari templat kita sendiri lewat
   * jalur yang sama persis seperti sebelumnya.
   */
  let sheet: ImportSheet;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    sheet = await readImportSheet(buffer);
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.excelUnreadable") },
      { status: 400 }
    );
  }

  const { accounts, errors } = parseCoaRows(sheet.rows, sheet.options);
  /* Perbaikan yang dilakukan pembaca laporan (sel terpotong ganti halaman)
     ikut dipulangkan — sebuah berkas yang diam-diam "diperbaiki" adalah berkas
     yang tak bisa diperiksa siapa pun. */
  const accurateRepairs = sheet.accurate?.repairs ?? [];

  if (errors.length > 0) {
    // Tolak seutuhnya — tak ada penulisan sebagian.
    const { t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("errors.rowsNeedFixing"),
        rowErrors: errors,
        valid: accounts.length,
        accurateRepairs,
      },
      { status: 422 }
    );
  }
  if (accounts.length === 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.noAccountRows") },
      { status: 422 }
    );
  }

  // Kode yang sudah ada di DB dilewati (bukan ditimpa) demi audit trail.
  const codes = accounts.map((a) => a.code);
  const existing = await prisma.account.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const existingSet = new Set(existing.map((e) => e.code));
  const toCreate = accounts.filter((a) => !existingSet.has(a.code));

  if (toCreate.length > 0) {
    await prisma.account.createMany({
      data: toCreate.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        currency: a.currency,
        isActive: true,
      })),
    });
  }

  return NextResponse.json({
    created: toCreate.length,
    skipped: existingSet.size,
    skippedCodes: [...existingSet],
    total: accounts.length,
    accurateRepairs,
  });
}

export async function GET(_request: Request, ctx: TenantApiContext) {
  const result = await requireApiPermission("account.manage", ctx.params);
  if (!result.authorized) return result.response;

  const wb = new ExcelJS.Workbook();
  wb.creator = (await getCompanyIdentity()).name;

  const ws = wb.addWorksheet("Akun Perkiraan");
  ws.columns = [
    { header: "Kode", key: "code", width: 16 },
    { header: "Nama", key: "name", width: 40 },
    { header: "Tipe", key: "type", width: 10 },
    { header: "Mata Uang", key: "currency", width: 12 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  });
  // Contoh baris (boleh dihapus pengguna).
  ws.addRow({ code: "1101001", name: "Kas Kecil", type: "BANK", currency: "IDR" });
  ws.addRow({ code: "110201", name: "Piutang Usaha", type: "AREC", currency: "IDR" });
  ws.addRow({ code: "4101", name: "Pendapatan Ekspor", type: "REVE", currency: "USD" });

  // Sheet legenda kode tipe.
  const legend = wb.addWorksheet("Kode Tipe");
  legend.columns = [
    { header: "Kode", key: "code", width: 10 },
    { header: "Arti", key: "label", width: 32 },
  ];
  legend.getRow(1).font = { bold: true };
  for (const { code, label } of ACCURATE_TYPE_LEGEND) legend.addRow({ code, label });
  legend.addRow({});
  legend.addRow({ code: "", label: `Maks. ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris. Baris pertama = judul.` });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-akun-perkiraan.xlsx"',
    },
  });
}
