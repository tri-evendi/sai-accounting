/**
 * MENGAMBIL BYTE hasil sebuah pekerjaan — satu-satunya jalan keluar
 * `result_ref` (rancangan §4).
 *
 * ══ `result_ref` ADALAH KUNCI, BUKAN KAPABILITAS ═══════════════════════════
 * Memegang kuncinya BUKAN izin untuk membacanya. Tiga aturan §4, dan ketiganya
 * jadi kode di sini:
 *
 *   1. penyimpanan objeknya PRIVAT — `data/hasil/` di luar `public/`, jadi
 *      tidak ada perender berkas statis yang bisa menjangkaunya;
 *   2. unduhan lewat RUTE INI, bukan URL penyimpanan yang dibagikan. Route ini
 *      tidak pernah memulangkan 302 ke penyimpanan mana pun: ia men-stream
 *      byte-nya. Redirect ke URL bertanda tangan akan membuat izin diperiksa
 *      SEKALI lalu tautannya hidup sendiri sampai kedaluwarsa;
 *   3. izin diperiksa SAAT MENGUNDUH. Pekerjaan hidup berjam-jam, dan orang
 *      yang perannya dicabut di antara "ekspor dimulai" dan "berkasnya siap"
 *      tidak boleh tetap menerima hasilnya.
 *
 * ══ KENAPA `kind` ADA DI JALURNYA, PADAHAL `id` SUDAH CUKUP ════════════════
 * Ini bukan kerapian URL, ini URUTAN PEMERIKSAAN — dan urutannya menentukan
 * apakah route ini membocorkan sesuatu.
 *
 * Izin yang dituntut bergantung pada JENIS pekerjaannya: hasil
 * `report.export` menuntut `report.export`, hasil `document.generate` menuntut
 * `document.read`. Satu izin tunggal untuk semuanya akan membuat siapa pun yang
 * boleh mengunduh satu dokumen juga boleh mengunduh ekspor neraca.
 *
 * Tapi jenisnya ada DI BARIS pekerjaan. Membacanya lebih dulu berarti satu
 * kueri sebelum gerbang mana pun berjalan — dan itu membocorkan: penanya
 * anonim akan menerima 401 untuk id yang ADA dan berjenis dapat-diunduh,
 * sementara id yang tidak ada dijawab 404. Dari dua jawaban itu seseorang bisa
 * mencacah berapa banyak ekspor yang pernah berjalan di SELURUH pemasangan —
 * yaitu volume pemakaian, yang doktrin #317 melarang bocor ke permukaan publik.
 *
 * Dengan `kind` di jalurnya, gerbangnya berjalan LEBIH DULU dan penanya anonim
 * selalu menerima 401 — apa pun id-nya. Jenis yang diklaim jalur itu lalu
 * **diverifikasi** terhadap barisnya, jadi ia hanya bisa MEMPERSEMPIT apa yang
 * terjangkau: mengklaim `document.generate` untuk hasil `report.export` lolos
 * gerbang `document.read` lalu gugur 404 pada perbandingan jenis.
 *
 * ══ PERUSAHAAN DATANG DARI JALUR, BUKAN HEADER (issue #489) ════════════════
 * Alamat ini mendarat di `<a href download>`, yang tidak melewati `apiFetch()`
 * dan karena itu TIDAK BISA membawa sepasang header `x-tenant-slug`/
 * `x-company-slug`. Alasan yang sama persis dengan rute berkas dokumen.
 *
 * ══ 404, BUKAN 403 ═════════════════════════════════════════════════════════
 * Untuk hasil milik PT lain, 403 akan menjawab pertanyaan yang tidak berhak
 * ditanyakan penanyanya ("jadi id ini ADA di suatu tempat"). Pola yang sama
 * dengan `notFoundResponse()` di penjaga lintas-tenant (#157).
 *
 * Yang BUKAN 404: pekerjaan yang masih berjalan. Penanyanya sudah melewati
 * gerbang izin DAN perbandingan perusahaan, jadi "belum selesai" adalah kabar
 * yang ia berhak terima — dan 404 untuk itu akan membuat tombol unduh terbaca
 * seperti rusak. Ia dijawab 409 dengan `code`, pola yang sama dengan
 * `module_inactive`.
 */
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { requireApiPermission } from "@/lib/auth-guard";
import {
  JOB_RESULT_PERMISSION,
  PER_REPORT_PERMISSION,
  isKnownKind,
  resultFilename,
} from "@sai/core/job-result";
import type { Permission } from "@sai/core/authz";
import { REPORT_PDF, isQueueableReportPdf } from "@/lib/report-pdf";
import { jobForDownload } from "@sai/platform/job-queue";
import { bolehAmbilHasil } from "@/lib/job-result-gate";
import { isResultExpired, resolveResultPath, resultSize } from "@sai/platform/job-result-store";
import { RESULT_RETENTION_DAYS } from "@sai/core/generated/job-numbers";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { contentTypeFor } from "@/lib/document-storage";
import type { TenantScopedParams } from "@sai/core/tenant-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nama berkas untuk `Content-Disposition`, dua bentuk sekaligus (RFC 6266).
 *
 * `attachment`, bukan `inline`: hasil pekerjaan adalah berkas yang diminta
 * pengguna, bukan pratinjau. `inline` atas berkas yang tipenya salah tebak
 * adalah satu langkah dari HTML yang dirender di origin kita sendiri.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const tidakAda = () => new Response(null, { status: 404 });

export async function GET(
  request: Request,
  context: { params: Promise<TenantScopedParams & { kind: string; id: string }> }
) {
  /* Diurai SEKALI: `kind`, `id`, dan sepasang slug datang dari promise yang
     sama, dan penjaga menerima objek yang sudah jadi (`ApiRouteParams`). */
  const params = await context.params;

  /* ── 1. Bentuk, sebelum apa pun menyentuh basis data ──────────────────── */
  const kindDiminta = decodeURIComponent(params.kind);
  if (!isKnownKind(kindDiminta)) return tidakAda();

  const izinJenis = JOB_RESULT_PERMISSION[kindDiminta];
  /* `null` = jenis ini TIDAK PERNAH menghasilkan berkas yang bisa diunduh
     pengguna. 404 dan bukan 403: jenisnya memang tidak punya pintu di sini. */
  if (izinJenis === null) return tidakAda();

  /*
   * `report.pdf`: izinnya milik JENIS LAPORAN (`PER_REPORT_PERMISSION`), dan
   * jenis itu dibaca dari ALAMAT (`?jenis=`) — bukan dari baris, yang belum
   * boleh dibaca sebelum gerbang. Barisnya nanti WAJIB menyebut jenis yang
   * sama (langkah 3), jadi alamat hanya bisa MEMPERSEMPIT apa yang terjangkau:
   * menyebut jenis berizin longgar untuk mengambil hasil jenis berizin ketat
   * gugur di perbandingan itu.
   */
  const jenisLaporan =
    izinJenis === PER_REPORT_PERMISSION ? new URL(request.url).searchParams.get("jenis") : null;
  let izin: Permission;
  if (izinJenis === PER_REPORT_PERMISSION) {
    if (!isQueueableReportPdf(jenisLaporan)) return tidakAda();
    izin = REPORT_PDF[jenisLaporan].permission;
  } else {
    izin = izinJenis;
  }

  if (!/^\d+$/.test(params.id)) return tidakAda();
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return tidakAda();

  /* ── 2. Gerbang — SEBELUM baris pekerjaannya dibaca ───────────────────── */
  const authz = await requireApiPermission(izin, params);
  if (!authz.authorized) return authz.response;

  /* ── 3. Barisnya, lalu TIGA perbandingan ──────────────────────────────── */
  const job = await jobForDownload(id);
  if (!job) return tidakAda();

  /* Jenis yang diklaim jalur wajib cocok: tanpa ini, gerbang `document.read`
     bisa dipakai mengambil hasil `report.export`. */
  if (job.kind !== kindDiminta) return tidakAda();

  /*
   * Perusahaan dibandingkan di SINI, dan tidak di dalam kuerinya.
   *
   * `jobs` hidup di basis data KENDALI, jadi ia tidak ikut isolasi #104 yang
   * membuat `findUnique` atas id milik PT lain memulangkan kosong — pola yang
   * dipakai rute berkas dokumen tidak berlaku. Perbandingan eksplisit karena
   * itu wajib, dan `jobForDownload` sengaja TIDAK menyaringnya sendiri supaya
   * pemanggil tidak bisa memutuskan tanpa melihatnya.
   *
   * `companyId` null = pekerjaan tingkat pemasangan (cadangan, migration). Ia
   * tidak pernah punya pintu per-PT, dan peta izin sudah menyatakannya `null`
   * — pemeriksaan ini lapis kedua, bukan satu-satunya.
   */
  if (job.companyId === null || job.companyId !== authz.companyId) return tidakAda();

  /*
   * ── 4. GERBANG KEDUA: izin yang dibawa MUATANNYA ──────────────────────
   *
   * `JOB_RESULT_PERMISSION` menjawab "boleh mengunduh hasil JENIS ini". Itu
   * tidak cukup, dan alasannya sudah tertulis di `/api/reports/payload` sejak
   * #355: `report.export` hanya menjawab "boleh mengekspor laporan", bukan
   * "boleh mengekspor laporan INI".
   *
   * Tanpa gerbang ini, pekerjaan atas Nilai Persediaan yang diterbitkan ketika
   * modul Stok masih aktif tetap bisa diunduh SESUDAH modul itu dimatikan —
   * melanggar justru aturan yang §4 tuntut. Pekerjaan hidup berjam-jam; modul
   * dan peran berubah di antaranya.
   */
  /* `report.pdf`: jenis di alamat (gerbang pertama) wajib SAMA dengan yang
     disebut muatan barisnya — diperiksa di gerbang kedua, satu-satunya pembaca
     muatan di rute ini. */
  if (
    !(await bolehAmbilHasil(job.kind, job.payload, authz.session.user, {
      jenis: jenisLaporan,
    }))
  ) {
    return tidakAda();
  }

  if (job.status !== "done" || job.resultRef === null) {
    /* Sudah lolos izin DAN perusahaan, jadi keadaannya kabar yang sah. */
    return NextResponse.json(
      {
        error:
          job.status === "dead"
            ? "Pekerjaan ini gagal; tidak ada berkas yang bisa diunduh."
            : "Berkasnya belum siap.",
        code: "job_not_done",
        status: job.status,
        /* Kemajuan nyata dari pelarinya — penunggu (paket laporan) menampilkan
           persennya; kabar yang sah karena gerbang & perusahaan sudah lolos. */
        progress: job.progress,
      },
      { status: 409 }
    );
  }

  const absolute = resolveResultPath(job.resultRef);
  if (absolute === null) return tidakAda();

  const size = await resultSize(job.resultRef);
  /* Baris ada, berkasnya tidak. Dua sebab yang berbeda jawabannya:
     sudah lewat masa simpan (`results.retention_days`, TATA-KELOLA §6 — pembersih
     upkeep menghapusnya) → 410 `result_expired` supaya layar bisa berkata
     "minta lagi", bukan "rusak"; selain itu (basis data dipulihkan tanpa
     volumenya, cakram dibersihkan tangan) → 404 yang jujur. */
  if (size === null) {
    if (isResultExpired(job.finishedAt)) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.resultExpired", { days: RESULT_RETENTION_DAYS }), code: "result_expired" },
        { status: 410 }
      );
    }
    return tidakAda();
  }

  const filename = resultFilename(job.resultRef);

  /*
   * DI-STREAM, tidak dibaca utuh — dan ini satu-satunya tempat di repo ini
   * yang memang menuntutnya. Rute berkas dokumen boleh `readFile` karena
   * unggahan dibatasi 10 MB; hasil pekerjaan dibatasi
   * `EXPORT_MAX_BODY_BYTES` (16 MB) dan paket laporan belum dibatasi sama
   * sekali. Membacanya utuh berarti satu unduhan memegang seluruh berkas di
   * heap proses yang sedang melayani halaman orang lain.
   */
  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Content-Type": contentTypeFor(filename),
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(filename),
      /* Isinya milik satu PT dan sudah lolos penjaga: jangan pernah disimpan
         proxy bersama, dan jangan pernah dipakai ulang sesudah izin dicabut. */
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
