/**
 * JALUR `interactive` — ekspor & dokumen yang DITUNGGU pengguna di layar.
 *
 *   bun workers/interactive.ts
 *
 * ══ KENAPA JALUR INI LAHIR, PADAHAL EKSPORNYA SUDAH BISA ═══════════════════
 * `/api/reports/export` sudah menghasilkan lembar sebar secara SINKRON, dan
 * untuk laporan berukuran biasa itu jawaban yang benar — milidetik, satu
 * permintaan, tanpa antrean. Yang TIDAK bisa dilayaninya adalah laporan yang
 * besar, dan rancangan §5 menyebut sebabnya dengan tepat: kalau sebelas
 * pengguna menekan "cetak laporan tahunan" bersamaan, yang harus menahannya
 * adalah ANTREAN — bukan event loop milik halaman orang lain.
 *
 * Sampai tahap ini jawabannya 413: ekspor di atas `EXPORT_MAX_ROWS` DITOLAK.
 * Jalur ini mengubah penolakan itu menjadi "akan dikerjakan", dan itulah satu
 * kemampuan yang benar-benar bertambah — bukan pemindahan beban yang sama ke
 * tempat lain.
 *
 * ══ NODE, BUKAN GO — DAN ITU KEPUTUSAN §3.3 ════════════════════════════════
 * Jalur ini MENGHITUNG angka akuntansi (ia memanggil `buildReportPayload`,
 * yang membaca buku). Go berhenti di depan garis itu sampai ada pemicu
 * TERUKUR, sebab `contract/` membangkitkan konstanta — bukan aturan — dan dua
 * implementasi "laba ditahan periode ini" bisa sama-sama konsisten di dalam
 * dirinya dan tetap berbeda hasilnya.
 *
 * Yang dibeli proses Node terpisah tanpa menyentuh satu aturan pun: event loop
 * sendiri (ekspor tidak lagi memblokir permintaan interaktif) dan batas memori
 * sendiri (ekspor yang kehabisan memori menjatuhkan pelari, bukan aplikasi).
 *
 * ══ MUATANNYA PARAMETER, BUKAN ANGKA ═══════════════════════════════════════
 * Muatan membawa `reportId` + parameter, dan pekerjanya MENGHITUNG ulang dari
 * buku PT. Itu bukan pilihan gaya: `jobs` hidup di basis data KENDALI, dan
 * kendali tidak memuat satu angka akuntansi pun — menaruh muatan laporan di
 * sana membatalkan janji isolasi fisik #104 pada saat itu juga.
 *
 * Akibat sampingannya justru lebih benar: laporan dihitung pada saat ia
 * DIKERJAKAN, bukan pada saat seseorang menekan tombol. Untuk ekspor yang
 * menunggu di antrean beberapa menit, angka yang lebih baru adalah angka yang
 * lebih berguna — dan keduanya datang dari SATU pembangun payload, jadi tidak
 * ada dua implementasi yang bisa menyimpang.
 */
import "dotenv/config";

import { runLane, type JobContext } from "./runner";
import { dalamKonteksPerusahaan } from "./jalur-perusahaan";
import { provisionCompanyJob } from "./company-provision";
import { writeJobResult } from "@sai/platform/job-result-store";
import { isExportable, reportById } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { buildReportPayload } from "../src/lib/report-payload";
import { buildReportSheet } from "../src/lib/report-export";
import { STATEMENT_TITLES } from "../src/lib/statement-layout";
import { buildWorkbookBuffer } from "../src/lib/xlsx";
import { getCompanyIdentity } from "../src/lib/company-identity";
import { runReadOnly } from "../src/lib/read-replica";
import { applyEfakturRecord } from "../src/lib/efaktur-record";

/** Muatan `report.export` — PARAMETER saja. */
interface MuatanEkspor {
  reportId?: unknown;
  params?: unknown;
}

/**
 * Nama berkas hasil — dari sumber yang SAMA dengan rute sinkronnya.
 *
 * `STATEMENT_TITLES` dan bukan kamus i18n: pekerja tidak punya permintaan HTTP,
 * jadi ia tidak punya bahasa pengguna — dan nama berkas yang berbeda antara
 * ekspor sinkron dan ekspor berantre adalah dua nama untuk satu laporan.
 * `statement-layout.ts` tidak mengimpor apa pun, jadi memakainya di sini tidak
 * menyeret satu modul pun.
 *
 * Segmen jalur di repo ini sempit dengan sengaja (`isValidResultRef`), jadi apa
 * pun di luar pola dibuang — judul laporan memuat spasi, dan `/` memecah jalur
 * maupun header `Content-Disposition`.
 */
function namaBerkas(payloadKind: keyof typeof STATEMENT_TITLES): string {
  const slug =
    STATEMENT_TITLES[payloadKind].replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
    "Laporan";
  return `${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

async function eksporLaporan(ctx: JobContext): Promise<string | null> {
  const muatan = (ctx.job.payload ?? {}) as MuatanEkspor;

  if (typeof muatan.reportId !== "string" || muatan.reportId === "") {
    throw new Error("muatan tanpa `reportId` — pekerjaan ini tidak bisa tahu laporan mana");
  }
  const report = reportById(muatan.reportId);
  if (!report || !isExportable(report)) {
    /*
     * Laporan yang hilang dari katalog SESUDAH pekerjaannya terbit — mis.
     * rilis yang mencabutnya. Melempar, dan tidak "dilewati": pekerjaan yang
     * diam-diam tidak menghasilkan apa pun akan terbaca `done` dengan
     * `result_ref` kosong, dan tombol unduhnya 404 tanpa sebab di mana pun.
     */
    throw new Error(`laporan \`${muatan.reportId}\` tidak ada di katalog atau tidak dapat diekspor`);
  }

  if (reportEngine(report.id) === "go") {
    /*
     * Berkas laporan ini milik Go sejak tahap 1d (`src/lib/report-engine.ts`),
     * dan versi TS untuk jalur berkas DICABUT — termasuk di sini. Yang bisa
     * sampai ke cabang ini hanya pekerjaan `report.export` yang terbit SEBELUM
     * peralihan; rute ekspor kini menerbitkannya sebagai `report.export_go`.
     * Melempar, bukan "sekali ini saja dengan TS": jalan mundur diam-diam
     * adalah dua implementasi tanpa pembanding — kelas kegagalan yang register
     * itu ada untuk mencegah. Pengguna mengekspor ulang, dan berkas barunya
     * datang dari Go.
     */
    throw new Error(
      `laporan \`${report.id}\` dihasilkan Go (report.export_go) sejak tahap 1d — ` +
        "ekspor ulang dari layar; jalur TS untuk berkas ini sudah dicabut"
    );
  }

  const params = (muatan.params ?? {}) as Record<string, string | undefined>;

  /* `false` = perusahaan NONAKTIF tetap dikerjakan: jalur ini hanya MEMBACA,
     dan mengekspor buku yang akan diarsipkan adalah justru alasan orang
     menonaktifkannya. Bedanya dari jalur `ledger` ada di
     `dalamKonteksPerusahaan`. */
  const bytes = await dalamKonteksPerusahaan(ctx.job.companyId, false, async () => {
    await ctx.progress(10);
    /* Jalur baca berat → replika baca bila terpasang (tahap 3). Tanpa
       `COMPANY_DATABASE_READ_URL_TEMPLATE` ini `buildReportPayload(...)`
       apa adanya. Aturan kesegarannya (replika memutar WAL sampai posisi
       primary saat ini, atau primary) ada di `src/lib/read-replica.ts`, dan
       itu yang membuat janji "dihitung saat dikerjakan" di kepala berkas ini
       tetap benar. Identitas perusahaan di bawah sengaja tetap ke primary:
       murah, dan bukan bacaan berat. */
    const payload = await runReadOnly(() => buildReportPayload(report, params));

    await ctx.progress(55);
    const sheet = buildReportSheet(payload);

    /* ⚠ TIDAK ada batas baris di sini, dan itu disengaja: batas di rute
       sinkron ADA untuk melindungi event loop, dan jalur ini justru yang
       menggantikannya. Yang melindungi pelari ini adalah batas memorinya
       sendiri — ia proses terpisah, jadi ekspor yang kehabisan memori
       menjatuhkan pelari dan pekerjaannya dipulangkan `reclaimStaleJobs`
       dengan `attempts + 1`, bukan menjatuhkan aplikasi. */
    await ctx.progress(70);
    const buffer = await buildWorkbookBuffer([sheet], await getCompanyIdentity());
    return new Uint8Array(buffer);
  });

  if (ctx.cancelled()) {
    /* Diperiksa SESUDAH perhitungan dan SEBELUM penulisan: pekerjaan yang
       dibatalkan tidak boleh meninggalkan berkas yang tidak akan diunduh
       siapa pun. */
    return null;
  }

  await ctx.progress(90);
  return writeJobResult(ctx.job.kind, ctx.job.id, namaBerkas(report.payloadKind), bytes);
}

/**
 * `efaktur.record` — hasil PJAP dari jalur `integration` Go ke buku PT
 * (docs/EFAKTUR.md). Di sini karena hanya Node yang menulis basis data
 * perusahaan; jalur `interactive` karena orang di layar Pajak menunggu
 * statusnya berubah, dan penulisannya satu baris — bukan jalur `ledger`
 * (tunggal-instans, untuk posting).
 */
async function catatEfaktur(ctx: JobContext): Promise<null> {
  /* `false`: perusahaan NONAKTIF tetap dicatat — kiriman ke DJP sudah terjadi,
     dan jejaknya yang hilang lebih buruk daripada baris di buku nonaktif. */
  const hasil = await dalamKonteksPerusahaan(ctx.job.companyId, false, () =>
    applyEfakturRecord(ctx.job.payload)
  );
  if (hasil === "ignored") {
    console.log(`[interactive] #${ctx.job.id} efaktur.record diabaikan (terlambat / transisi tidak sah)`);
  }
  return null;
}

void runLane({
  lane: "interactive",
  handlers: {
    /*
     * `document.generate` SENGAJA belum terdaftar. Jenisnya ada di kontrak
     * karena kedua sisi perlu menyebut nama yang sama, tapi belum ada satu
     * penerbit pun — dan pelari mengklaim hanya `kind` yang punya handler di
     * sini, jadi ketiadaannya tidak membuat baris menumpuk. Dijaga
     * `tests/kind-punya-pengklaim.test.ts`: yang ditolak adalah `kind` yang
     * DITERBITKAN tanpa pengklaim.
     */
    "report.export": eksporLaporan,
    /*
     * Buku PT baru (Okt 2026). Di jalur ini karena yang menunggu adalah orang
     * di layar `/companies/new` — kontrak `company.provision` menulis kenapa
     * bukan `schema` atau `ledger`. Pelari ini karena itu satu-satunya proses
     * yang hidup terus dengan `PROVISION_DATABASE_URL` (kredensial PEMILIK).
     */
    "company.provision": provisionCompanyJob,
    "efaktur.record": catatEfaktur,
  },
});
