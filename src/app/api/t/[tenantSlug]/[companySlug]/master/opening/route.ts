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
import { FIXED_ASSET_COLUMNS, parseFixedAssetRows } from "@/lib/import/fixed-assets";
import { OPENING_STOCK_COLUMNS, parseOpeningStockRows } from "@/lib/import/opening-stock";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Kind = "receivables" | "payables" | "fixed-assets" | "stock";

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
  /*
   * Aset tetap ikut di route ini, BUKAN di `master/import` yang menulis — dan
   * itu bukan penempatan sembarangan: nilainya masuk ke JURNAL PEMBUKA, jadi ia
   * harus lahir di dalam transaksi sekali-jalan `applyOpeningBalances` bersama
   * jurnalnya. Route yang menulis asetnya lebih dulu akan meninggalkan register
   * tanpa jurnal bila langkah kedua gagal — persis cacat yang #387 tutup.
   *
   * `partners` tidak dipakai untuk jenis ini (yang dicocokkan KATEGORI, bukan
   * mitra); cabangnya terpisah di POST.
   */
  "fixed-assets": {
    columns: FIXED_ASSET_COLUMNS,
    sheetName: "Aset Tetap",
    fileName: "templat-aset-tetap.xlsx",
    partners: () => Promise.resolve([]),
  },
  /*
   * Saldo stok awal (issue #381, berkas terakhir dari enam). Alasan
   * penempatannya sama dengan aset tetap: nilainya masuk ke JURNAL PEMBUKA,
   * jadi ia milik jalur `opening`, bukan `master/import` yang menulis langsung.
   *
   * `partners` tidak dipakai — yang dicocokkan BARANG lewat kodenya, dan
   * cabangnya terpisah di POST.
   */
  stock: {
    columns: OPENING_STOCK_COLUMNS,
    sheetName: "Stok Awal",
    fileName: "templat-stok-awal.xlsx",
    partners: () => Promise.resolve([]),
  },
} as const;

function kindOf(request: Request): Kind | null {
  const raw = new URL(request.url).searchParams.get("kind");
  return raw === "receivables" || raw === "payables" || raw === "fixed-assets" || raw === "stock"
    ? raw
    : null;
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

  if (kind === "stock") {
    const parsedStock = parseOpeningStockRows(sheet);

    /*
     * Barang dicocokkan DI SINI, bukan di parser (yang murni) — dan lewat
     * KODE, bukan nama. Sejak #493 dua barang boleh bernama sama persis
     * (`LONG PEPPER` 100006 & 100010 di data pengguna, harga satuannya
     * berselisih hampir empat kali lipat); berkas yang dicocokkan namanya
     * tidak bisa menyatakan barang MANA yang dimaksud, dan menebaknya berarti
     * menaruh ratusan juta di barang yang salah pada hari pertama buku dibuka.
     */
    const items = await prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
    });
    const byCode = new Map(items.map((i) => [i.code.trim().toLowerCase(), i]));
    const stockErrors = [...parsedStock.errors];

    /*
     * Pesannya menyebutkan yang TERSEDIA — pola #416 yang sudah dipakai aset
     * tetap. Berkas ini paling sering diimpor DARI DALAM wisaya, tempat menu
     * Barang justru terkunci; menyuruh "buat barangnya dulu" mengirim orang ke
     * pintu yang tidak bisa dibuka. Menyebut kode yang ada menjawab keduanya:
     * bila yang dimaksud memang ada tapi beda penulisan, ia terlihat langsung.
     */
    const available = items
      .map((i) => i.code)
      .sort((a, b) => a.localeCompare(b, "id-ID"))
      .slice(0, 30);
    const hint =
      items.length > 0
        ? ` Kode yang tersedia: ${available.join(", ")}${items.length > 30 ? ", …" : ""}.`
        : " Buku ini belum punya satu barang pun — impor Daftar Barang lebih dulu.";

    parsedStock.rows.forEach((row, i) => {
      if (!byCode.has(row.code.trim().toLowerCase())) {
        stockErrors.push({
          row: i + 2,
          message: `Kode barang "${row.code}" belum ada.${hint}`,
        });
      }
    });

    if (stockErrors.length > 0) {
      return NextResponse.json(
        {
          error: t("errors.rowsNeedFixing"),
          rowErrors: stockErrors,
          valid: parsedStock.rows.length,
        },
        { status: 422 }
      );
    }
    if (parsedStock.rows.length === 0) {
      return NextResponse.json({ error: t("errors.noImportRows") }, { status: 422 });
    }

    /* Dipulangkan sebagai `itemId` — bentuk yang SAMA dengan `openingStockSchema`
       yang dipakai wisaya. Route ini tidak menulis apa pun: nilainya masuk ke
       buku bersama jurnal pembukanya di `applyOpeningBalances`, satu transaksi
       sekali-jalan. */
    return NextResponse.json({
      rows: parsedStock.rows.map((r) => {
        const item = byCode.get(r.code.trim().toLowerCase())!;
        return {
          itemId: item.id,
          code: item.code,
          /* Nama dari MASTER, bukan dari berkas: berkas boleh menuliskannya
             sekenanya, dan yang dilihat pengguna saat meninjau harus nama yang
             benar-benar akan dipakai bukunya. */
          name: item.name,
          quantity: r.quantity,
          unitCost: r.unitCost,
        };
      }),
      total: parsedStock.rows.length,
      truncated: parsedStock.truncated,
    });
  }

  if (kind === "fixed-assets") {
    const parsedAssets = parseFixedAssetRows(sheet);

    /* Kategori dicocokkan DI SINI, bukan di parser (yang murni). Kategori yang
       tidak dikenali menjadi galat PER BARIS — bukan satu pesan gabungan di
       akhir yang memaksa orang mencari sendiri baris mana. */
    const categories = await prisma.fixedAssetCategory.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const known = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    const assetErrors = [...parsedAssets.errors];

    /*
     * ── PESANNYA MENYEBUTKAN YANG TERSEDIA (issue #416) ─────────────────────
     *
     * Kalimat lama — "buat kategorinya di menu Aset Tetap" — menunjuk menu yang
     * justru TERKUNCI selama penyiapan belum selesai: gerbang setup memantulkan
     * setiap halaman ber-izin lain kembali ke wisaya. Berkas ini paling sering
     * diimpor DARI DALAM wisaya, jadi sarannya mengirim orang ke pintu yang
     * tidak bisa dibuka dan memulangkannya ke layar yang sama.
     *
     * Menyebutkan daftar yang ADA menjawab keduanya sekaligus: bila yang
     * dimaksud memang ada tapi beda penulisan, ia terlihat langsung; bila
     * daftarnya bukan yang ia harapkan, ia tahu bukunya bukan buku yang ia kira
     * (dua PT dengan nama serupa adalah keadaan yang sangat mungkin di sini).
     */
    const available = categories.map((c) => c.name).sort((a, b) => a.localeCompare(b, "id-ID"));
    const hint =
      available.length > 0
        ? ` Kategori yang tersedia: ${available.join(", ")}.`
        : " Buku ini belum punya satu kategori aset pun — modul Aset Tetap sepertinya tidak aktif.";

    parsedAssets.rows.forEach((row, i) => {
      if (!known.has(row.category.trim().toLowerCase())) {
        assetErrors.push({
          row: i + 2,
          message: `Kategori "${row.category}" belum ada.${hint}`,
        });
      }
    });

    if (assetErrors.length > 0) {
      return NextResponse.json(
        {
          error: t("errors.rowsNeedFixing"),
          rowErrors: assetErrors,
          valid: parsedAssets.rows.length,
        },
        { status: 422 }
      );
    }
    if (parsedAssets.rows.length === 0) {
      return NextResponse.json({ error: t("errors.noImportRows") }, { status: 422 });
    }

    /* Tanggal dipulangkan sebagai `YYYY-MM-DD`: payload wisaya adalah JSON, dan
       `Date` yang diserialisasi menjadi ISO penuh akan membawa zona waktu yang
       menggeser tanggal dokumen satu hari di sebagian peramban. */
    return NextResponse.json({
      rows: parsedAssets.rows.map((a) => ({
        assetNo: a.assetNo,
        name: a.name,
        category: a.category,
        acquisitionDate: a.acquisitionDate.toISOString().slice(0, 10),
        cost: a.cost,
        residual: a.residual,
        usefulLifeMonths: a.usefulLifeMonths,
        accumulated: a.accumulated,
        lastDepreciationYear: a.lastDepreciationYear,
        lastDepreciationMonth: a.lastDepreciationMonth,
        location: a.location,
      })),
      total: parsedAssets.rows.length,
      truncated: parsedAssets.truncated,
    });
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
    /** `null` = mitra ini belum ada dan akan DIBUAT bersama saldo awalnya (#425). */
    partnerId: number | null;
    partnerName: string;
    documentNo: string;
    date: string;
    dueDate: string | null;
    currency: string;
    rate: number | null;
    amount: number;
  }[] = [];
  const errors: RowError[] = [...parsed.errors];

  /*
   * ── MITRA YANG BELUM ADA BUKAN LAGI GALAT (issue #425) ────────────────────
   *
   * Dulu baris seperti itu ditolak dengan saran "impor daftarnya lebih dulu" —
   * saran yang MUSTAHIL dijalankan di tempat berkas ini paling sering diimpor:
   * di dalam wisaya penyiapan, tempat gerbang setup memantulkan menu Pelanggan
   * & Pemasok kembali ke wisaya itu sendiri. Perusahaan yang PINDAH dari
   * pembukuan lain karena itu tidak punya satu pun jalan memasukkan piutang
   * terbukanya — dan karena wisaya jalan sekali, kesempatannya hilang selamanya.
   *
   * Kini namanya dibawa apa adanya dengan `partnerId: null`, dan mitranya lahir
   * bersama saldo awalnya di dalam transaksi yang sama (`applyOpeningBalances`).
   * Route ini tetap TIDAK MENULIS APA PUN — lihat kepala berkas.
   *
   * Yang baru dikumpulkan terpisah di `newPartners` supaya layar tinjauan bisa
   * MENYEBUTKANNYA sebelum orangnya menekan simpan: mitra yang lahir dari salah
   * ketik adalah harga yang harus dibayar fitur ini, dan satu-satunya penawarnya
   * adalah menampilkan daftarnya lebih dulu.
   */
  const newPartners: string[] = [];
  const seenNew = new Set<string>();

  parsed.rows.forEach((row, i) => {
    void i;
    const id = byName.get(row.partner.trim().toLowerCase()) ?? null;
    if (id === null) {
      const key = row.partner.trim().toLowerCase();
      if (!seenNew.has(key)) {
        seenNew.add(key);
        newPartners.push(row.partner.trim());
      }
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

  return NextResponse.json({
    rows,
    total: rows.length,
    newPartners,
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
