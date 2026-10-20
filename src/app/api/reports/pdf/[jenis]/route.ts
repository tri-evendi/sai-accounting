/**
 * LAPORAN menjadi PDF — DI SERVER (rancangan §5), empat jenis, satu rute.
 *
 * READ-ONLY. Ia menerima muatan laporan yang sudah dihitung halaman yang
 * memintanya, menjalankan generator yang SAMA yang dulu dijalankan peramban,
 * dan men-stream byte-nya.
 *
 * ══ SESUDAH INI PERAMBAN TIDAK MENGGAMBAR APA PUN ══════════════════════════
 * Sebelas modul `src/lib/pdf/` dulu berjalan di peramban. Dengan rute ini
 * jumlahnya **nol**: dokumen satuan lewat rute dokumen (dari ID, dari BUKU),
 * laporan lewat rute ini (dari muatan), ekspor besar lewat antrean.
 *
 * ══ KENAPA LAPORAN MEMAKAI MUATAN SEMENTARA DOKUMEN MEMAKAI ID ════════════
 * Satu pertanyaan: siapa yang menerima kertasnya. Dokumen diserahkan ke pihak
 * LUAR, jadi angkanya wajib diturunkan dari buku. Laporan di sini dicetak oleh
 * orang yang sedang menatapnya — yang harus dijamin justru kebalikannya:
 * kertasnya sama dengan LAYARNYA. Uraian penuhnya di
 * `lib/validations/report-pdf.ts`.
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
 * bentuk, lalu jumlah baris. Menggambar adalah hal TERAKHIR yang terjadi.
 *
 * ══ ONGKOSNYA CPU YANG HARI INI GRATIS ════════════════════════════════════
 * Perakitan PDF tadinya berjalan di mesin pengguna: satu peramban per pengguna,
 * paralel sempurna, nol beban server. Rute ini SINKRON, dan itu sah untuk
 * laporan yang sudah tampil di layar — muatannya sudah dihitung, jadi yang
 * tersisa hanya menggambar. Yang WAJIB lewat antrean adalah ekspor besar dan
 * paket laporan (§5), dan ambangnya satu angka: `EXPORT_QUEUE_HANDOFF_ROWS`.
 *
 * Yang menahan rute ini sementara itu batas yang SAMA dengan ekspor Excel: byte
 * badan sebelum diurai, lalu jumlah baris pada muatan yang sudah divalidasi.
 * Keduanya 413.
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

import { requireApiPermission } from "@/lib/auth-guard";
import { readBoundedText } from "@/lib/request-body";
import { EXPORT_MAX_BODY_BYTES, EXPORT_MAX_ROWS } from "@sai/core/export-limits";
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
  const muatan: unknown = parsed.data;

  /*
   * Batas BARIS dihitung dari muatan yang SUDAH divalidasi, oleh penghitung
   * milik jenisnya. Untuk `statement` penghitung itu `buildReportSheet` —
   * pemeta yang sama dengan ekspor Excel, sebab dua penghitung untuk satu
   * laporan berarti ada ukuran yang ditolak satu tombol dan diterima tombol di
   * sebelahnya.
   */
  const baris = spec.barisnya(muatan);
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

  const filename = `${spec.slug(muatan)}_${new Date().toISOString().slice(0, 10)}.pdf`;

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
