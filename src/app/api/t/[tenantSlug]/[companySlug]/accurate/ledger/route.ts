/**
 * Integrasi Accurate — unggah "Rincian Buku Besar", cocokkan dengan buku sendiri.
 *
 * POST menerima satu berkas `.xlsx` dan memulangkan salah satu dari dua hal,
 * menurut medan `mode`:
 *   - `reconcile` (bawaan) → JSON pratinjau (`AccuratePreview`)
 *   - `opening-draft`      → berkas `.xlsx` berisi RANCANGAN saldo awal
 *
 * ══ TIDAK ADA SATU PUN PENULISAN DI SINI ═══════════════════════════════════
 * Route ini hanya MEMBACA: berkasnya dibaca, buku dibaca, hasilnya dibandingkan
 * dan dipulangkan. Tidak ada akun yang dibuat, tidak ada jurnal yang diposting.
 * Itu bukan kekurangan melainkan bentuk yang dipilih: rincian buku besar hanya
 * memuat satu sisi tiap transaksi (lihat kepala `@/lib/accurate/ledger-report`),
 * jadi apa pun yang ditulis darinya akan berupa tebakan tentang lawan akunnya.
 * Saldo awal pun berhenti sebagai berkas rancangan — pintunya tetap wisaya
 * saldo awal, yang sengaja hanya bisa dilalui sekali.
 *
 * ══ KENAPA PERUSAHAAN ADA DI JALUR ═════════════════════════════════════════
 * Alasan yang sama dengan route impor akun (issue #158): satu sumber lingkup
 * untuk seluruh metode di route ini, tanpa "kadang dari header, kadang dari
 * sesi".
 *
 * RBAC: `ledger.read` — yang dipulangkan adalah isi buku besar berdampingan
 * dengan berkas pembanding, jadi ambangnya tidak boleh lebih rendah daripada
 * membaca buku besarnya langsung.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { getAccountLedger } from "@/lib/ledger";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getRequestI18n } from "@/lib/i18n/server";
import {
  AccurateReportShapeError,
  AccurateSourceUnavailableError,
  fileLedgerSource,
} from "@/lib/accurate/source";
import { parseAccuratePeriod } from "@/lib/accurate/dates";
import { reconcileLedgerReport, type SaiLedgerSide } from "@/lib/accurate/reconcile";
import { buildOpeningDraft, type ResolvedAccount } from "@/lib/accurate/opening-draft";
import { buildAccuratePreview } from "@/lib/accurate/preview";
import type { AccurateLedgerReport } from "@/lib/accurate/ledger-report";

/** Sama dengan batas unggahan impor akun — satu angka untuk satu jenis layar. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, ctx: TenantApiContext) {
  const result = await requireApiPermission("ledger.read", ctx.params);
  if (!result.authorized) return result.response;

  const { t } = await getRequestI18n();

  let file: File | null = null;
  let mode = "reconcile";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const m = form.get("mode");
    if (typeof m === "string" && m !== "") mode = m;
  } catch {
    return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: t("errors.fileTooLarge", { max: "5 MB" }) }, { status: 400 });
  }

  let report: AccurateLedgerReport;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    report = await fileLedgerSource.fetchLedgerReport({ buffer });
  } catch (error) {
    /* Bentuk berkas yang salah adalah kesalahan yang BISA diperbaiki orangnya,
       jadi pesannya diteruskan apa adanya — "berkas tidak bisa dibaca" tanpa
       menyebut apa yang kurang hanya memindahkan tebakan ke pengguna. */
    if (error instanceof AccurateReportShapeError || error instanceof AccurateSourceUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: t("errors.excelUnreadable") }, { status: 400 });
  }

  const period = parseAccuratePeriod(report.meta.period);

  /* Kode akun adalah SATU-SATUNYA penghubung kedua sistem: id internalnya jelas
     berbeda, dan nama akun sudah pasti pernah disunting salah satu pihak. */
  const codes = [...new Set(report.accounts.map((a) => a.code).filter((c) => c !== ""))];
  const owned = codes.length
    ? await prisma.account.findMany({ where: { code: { in: codes } } })
    : [];
  const byCode = new Map(owned.map((a) => [a.code, a]));

  const resolve = (code: string): ResolvedAccount | null => {
    const account = byCode.get(code);
    if (!account) return null;
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      normalBalance: account.normalBalance === "credit" ? "credit" : "debit",
      currency: account.currency,
    };
  };

  const draft = buildOpeningDraft(report.accounts, resolve, period?.to ?? null);

  if (mode === "opening-draft") {
    const buffer = await buildOpeningDraftWorkbook(report, draft);
    const stamp = (period?.to ?? new Date()).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rancangan_saldo_awal_${stamp}.xlsx"`,
      },
    });
  }

  const sides = new Map<string, SaiLedgerSide>();
  for (const account of report.accounts) {
    const own = byCode.get(account.code);
    if (!own) continue;
    const ledger = await getAccountLedger(own.id, period?.from, period?.to);
    if (!ledger) continue;
    sides.set(account.code, {
      accountId: own.id,
      code: own.code,
      name: own.name,
      opening: ledger.opening,
      closing: ledger.closing,
      totalDebit: ledger.totalDebit,
      totalCredit: ledger.totalCredit,
      rows: ledger.rows.map((r) => ({
        lineId: r.lineId,
        journalId: r.journalId,
        number: r.number,
        date: r.date,
        memo: r.memo ?? r.note ?? "",
        debit: r.debit,
        credit: r.credit,
      })),
    });
  }

  const reconciliation = reconcileLedgerReport(report.meta, report.accounts, sides);
  return NextResponse.json(
    buildAccuratePreview(reconciliation, report.repairs, draft, period)
  );
}

/**
 * Rancangan saldo awal sebagai `.xlsx`.
 *
 * Bukan templat impor: ia tidak diunggah balik ke mana pun. Ia lembar kerja
 * untuk MEMERIKSA — kolom "Sisi" dan "Nominal" sudah terisi, kolom "Nama
 * (Accurate)" berdampingan dengan "Nama (di sini)" supaya akun yang kodenya
 * sama tapi artinya berbeda langsung terlihat, dan akun yang belum ada di
 * bagan akun kita ditandai alih-alih dihilangkan.
 */
async function buildOpeningDraftWorkbook(
  report: AccurateLedgerReport,
  draft: ReturnType<typeof buildOpeningDraft>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = (await getCompanyIdentity()).name;
  wb.created = new Date();

  const ws = wb.addWorksheet("Rancangan Saldo Awal");
  ws.addRow([report.meta.company ?? ""]).font = { bold: true, size: 14 };
  ws.addRow(["Rancangan Saldo Awal dari Accurate"]).font = { bold: true, size: 12 };
  ws.addRow([report.meta.period ?? ""]);
  ws.addRow([
    "Angka di bawah adalah SALDO AKHIR menurut laporan Accurate. Periksa dulu, " +
      "lalu masukkan lewat wisaya Saldo Awal — berkas ini tidak diunggah balik.",
  ]);
  ws.addRow([]);

  const header = ws.addRow([
    "Kode",
    "Nama (Accurate)",
    "Nama (di sini)",
    "Mata Uang",
    "Sisi",
    "Nominal",
    "Status",
  ]);
  header.font = { bold: true };
  [14, 34, 34, 11, 9, 18, 20].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  for (const row of draft.rows) {
    const added = ws.addRow([
      row.code,
      row.accurateName,
      row.saiName,
      row.currency,
      row.side === "debit" ? "Debit" : row.side === "credit" ? "Kredit" : "",
      row.amount,
      row.status === "ready"
        ? "Siap"
        : row.status === "zero"
          ? "Saldo nol — tidak perlu"
          : "Akun belum ada di sini",
    ]);
    added.getCell(6).numFmt = "#,##0.00";
  }

  ws.addRow([]);
  const totals = ws.addRow([
    "",
    "",
    "",
    "",
    "Total debit",
    draft.totals.debit,
    "",
  ]);
  totals.font = { bold: true };
  totals.getCell(6).numFmt = "#,##0.00";
  const credits = ws.addRow(["", "", "", "", "Total kredit", draft.totals.credit, ""]);
  credits.font = { bold: true };
  credits.getCell(6).numFmt = "#,##0.00";
  const plug = ws.addRow([
    "",
    "",
    "",
    "",
    "Selisih (diserap Modal/Ekuitas)",
    draft.totals.equityPlug,
    "",
  ]);
  plug.getCell(6).numFmt = "#,##0.00";

  return Buffer.from(await wb.xlsx.writeBuffer());
}
