/**
 * LAPORAN menjadi PDF — DI SERVER (rancangan §5), empat jenis, satu rute.
 *
 * READ-ONLY. Ia menjalankan generator yang SAMA yang dulu dijalankan peramban,
 * dan men-stream byte-nya.
 *
 * ══ SESUDAH INI PERAMBAN TIDAK MENGGAMBAR — DAN TIDAK MERAKIT — APA PUN ═══
 * Sebelas modul `src/lib/pdf/` dulu berjalan di peramban. Dengan rute ini
 * jumlahnya **nol**: dokumen satuan lewat rute dokumen (dari ID, dari BUKU),
 * laporan lewat rute ini, ekspor besar lewat antrean.
 *
 * Tiga laporan (stok, opname, kas) kini juga tidak lagi DIRAKIT peramban:
 * badannya PARAMETER, dan muatannya dihitung di sini dari buku PT aktif oleh
 * pembaca yang sama dengan halamannya (`REPORT_PDF[jenis].sumber ===
 * "parameter"`, `src/lib/report-pdf-payload.ts`). Hanya laporan keuangan
 * (`statement`) yang masih mengirim muatan jadi — lihat `REPORT_PDF`.
 *
 * ══ YANG DIPUTUSKAN PER JENIS TIDAK ADA DI RUTE INI ═══════════════════════
 * Izin, bentuk muatan, penghitung baris, dan nama berkas hidup di `REPORT_PDF`
 * — dan `Record`-nya LENGKAP, jadi jenis baru tidak mengompilasi sampai
 * keempatnya diputuskan. Rute ini karena itu tidak punya satu pun `switch` atas
 * jenis: yang ia lakukan sama untuk keempatnya, dalam urutan yang sama.
 *
 * ⚠ **URUTANNYA ADALAH PENJAGANYA.** Jenis diperiksa SEBELUM izin, sebab izin
 * yang dituntut ditentukan jenisnya — dan jenis yang tidak dikenal karena itu
 * dijawab 404 tanpa menyentuh sesi. Sesudah itu izin, lalu ukuran badan, lalu
 * bentuk, lalu muatan (buku dibaca HANYA sesudah izin dan bentuk lolos), lalu
 * jumlah baris. Menggambar adalah hal TERAKHIR yang terjadi.
 *
 * Perusahaan datang dari penjaga (`requireApiPermission`), dan `prisma` di
 * dalam pembangun muatannya adalah klien PT AKTIF — jadi laporan PT lain tidak
 * bisa diminta dari sini: penanya yang bukan anggota PT itu sudah dijawab 404
 * oleh penjaganya, sebelum satu baris buku dibaca.
 *
 * ══ ONGKOSNYA CPU YANG HARI INI GRATIS — DIBELAH MENURUT UKURAN ═══════════
 * Perakitan PDF tadinya berjalan di mesin pengguna: satu peramban per pengguna,
 * paralel sempurna, nol beban server. Pembelahnya satu angka, SAMA dengan
 * ekspor Excel (`/api/reports/export`): `EXPORT_QUEUE_HANDOFF_ROWS`.
 *
 *  • di bawahnya: sinkron, di permintaan ini — milidetik;
 *  • di atasnya, untuk jenis yang muatannya dihitung server: pekerjaan
 *    `report.pdf` di jalur `interactive` (202 + `jobId`). Pekerjanya
 *    menghitung ulang muatannya dengan fungsi yang SAMA, menggambarnya SEKALI,
 *    dan menyimpan buffer itu; kliennya menunggu di rute hasil bertenant.
 *    Penggambaran jsPDF sinkron dan menahan event loop proses yang melayani
 *    halaman orang lain — sebab yang sama dengan ExcelJS di rute ekspor.
 *
 * `EXPORT_MAX_ROWS` tetap plafon 413 untuk yang tidak bisa diantrekan
 * (`statement`), dan untuk jatuh-kembali bila penerbitan tidak menghasilkan
 * baris. Batas byte badan juga tetap, sebelum diurai — keduanya 413.
 *
 * ══ BYTE-NYA DIHASILKAN SEKALI ════════════════════════════════════════════
 * `output("arraybuffer")` dipanggil TEPAT sekali, dan buffer itulah yang
 * dipulangkan. Itu bukan penghematan: syarat audit §5 adalah "yang disimpan
 * sama dengan yang dikirim", dan satu-satunya cara itu dijamin adalah satu
 * buffer untuk kedua tujuan — bukan dua pembangkitan yang kebetulan sama.
 *
 * Diukur di sesi ini: dua INSTANCE jsPDF atas muatan yang sama berbeda pada
 * `/ID` di trailer (pengenal berkas acak, 60 byte) dan — bila jamnya berjalan —
 * `/CreationDate`. Isinya identik. Jadi "byte identik" adalah sifat SATU
 * pembangkitan, bukan sifat yang bisa diandalkan dari dua.
 */
import { NextResponse } from "next/server";
import { businessISODate } from "@sai/core/business-date";

import { requireApiPermission } from "@/lib/auth-guard";
import { readBoundedText } from "@/lib/request-body";
import {
  EXPORT_MAX_BODY_BYTES,
  EXPORT_MAX_ROWS,
  EXPORT_QUEUE_HANDOFF_ROWS,
} from "@sai/core/export-limits";
import { publishJob } from "@sai/platform/job-queue";
import { REPORT_PDF, isReportPdfKind } from "@/lib/report-pdf";
import { serverPdfCompany } from "@/lib/pdf-company";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ jenis: string }> }) {
  const { jenis } = await ctx.params;

  /* Jenis DULU: izin yang dituntut ditentukan olehnya, jadi tidak ada izin yang
     bisa diperiksa sebelum jenisnya diketahui. Jenis asing = 404, tanpa
     menyentuh sesi.

     Badannya KOSONG, dan itu bukan kemalasan: tak ada manusia yang pernah
     melihat jawaban ini — tombolnya hanya pernah mengirim jenis yang ada di
     `REPORT_PDF_KINDS`, satu daftar yang dibaca kedua sisi. Kalimat untuk
     pengguna di sini akan jadi kalimat yang wajib diterjemahkan ke tiga bahasa
     dan tidak pernah dibaca satu pun. Pola yang sama dengan rute dokumen. */
  if (!isReportPdfKind(jenis)) return new Response(null, { status: 404 });
  const spec = REPORT_PDF[jenis];

  const authz = await requireApiPermission(spec.permission);
  if (!authz.authorized) return authz.response;

  const mentah = await readBoundedText(request, EXPORT_MAX_BODY_BYTES);
  if (!mentah.ok) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("reports.exportPayloadTooLarge") }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(mentah.text);
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = spec.schema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }
  const badan: unknown = parsed.data;

  /*
   * Muatan: untuk jenis `"parameter"` ia DIHITUNG di sini dari buku PT aktif
   * (pembaca yang sama dengan halamannya); untuk `statement` badannya sudah
   * muatannya.
   *
   * Batas BARIS dihitung dari muatan itu, oleh penghitung milik jenisnya. Untuk
   * `statement` penghitung itu `buildReportSheet` — pemeta yang sama dengan
   * ekspor Excel, sebab dua penghitung untuk satu laporan berarti ada ukuran
   * yang ditolak satu tombol dan diterima tombol di sebelahnya.
   */
  const muatan = await spec.muatan(badan);
  const baris = spec.barisnya(muatan);

  /*
   * ── PENYERAHAN KE ANTREAN (09 §5) — urutan dan bentuk yang SAMA dengan
   *    `/api/reports/export`: serahkan lebih dulu, tolak kemudian ───────────
   *
   * ⚠ Yang diterbitkan PARAMETER (`badan`), bukan muatan. `jobs` hidup di basis
   * data KENDALI, dan kendali tidak memuat satu angka akuntansi pun (#104).
   * Karena itu hanya jenis `"parameter"` yang bisa diserahkan: muatan
   * `statement` tidak punya asal yang bisa dihitung ulang.
   *
   * TANPA `dedupeKey`: dua klik memang dua pekerjaan (§4), sama dengan ekspor.
   * `row` null karenanya praktis tak terjangkau — bila terjadi ia JATUH KEMBALI
   * ke jalur di bawah (413 di atas plafon, digambar di sini bila tidak), bukan
   * melempar.
   */
  if (spec.sumber === "parameter" && baris > EXPORT_QUEUE_HANDOFF_ROWS) {
    const row = await publishJob({
      kind: "report.pdf",
      companyId: authz.companyId,
      payload: { jenis, params: badan },
    });
    if (row) {
      return NextResponse.json(
        { queued: true, jobId: row.id, kind: "report.pdf", rows: baris },
        { status: 202 }
      );
    }
  }

  if (baris > EXPORT_MAX_ROWS) {
    const { t, locale } = await getRequestI18n();
    const angka = new Intl.NumberFormat(locale);
    return NextResponse.json(
      {
        error: t("reports.exportTooLarge", {
          rows: angka.format(baris),
          max: angka.format(EXPORT_MAX_ROWS),
        }),
      },
      { status: 413 }
    );
  }

  /* Identitas & logo dari basis data PT yang sedang dibuka — bukan dari apa
     yang dikirim peramban. Peramban bukan sumber kebenaran tentang PT mana ini. */
  const company = await serverPdfCompany(`reports/pdf/${jenis}`);
  const doc = await spec.gambar(muatan, company);
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);

  const filename = `${spec.slug(muatan)}_${businessISODate(new Date())}.pdf`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      /* `inline`: pemanggilnya menampilkannya di pratinjau lebih dulu, dan
         unduhannya dibuat dari Blob yang SAMA di sisi klien — bukan dari
         permintaan kedua yang akan menghasilkan `/ID` yang berbeda. */
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
