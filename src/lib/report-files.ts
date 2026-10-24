"use client";

/**
 * Berkas laporan di sisi peramban: ambil payload, jadikan PDF atau lembar sebar.
 *
 * ══ SATU JALUR, DUA PEMANGGIL ══════════════════════════════════════════════
 * Tombol Excel di halaman laporan sudah lama melakukan tarian ini — POST
 * payload, baca `Content-Disposition`, rakit `<a download>`, bersihkan URL
 * objeknya. Dialog parameter di Pusat Laporan butuh tarian yang sama persis,
 * dan menyalinnya berarti dua salinan yang akan berbeda pada perbaikan
 * berikutnya. Jadi ia pindah ke sini, dan keduanya memanggilnya.
 *
 * Payload-nya sendiri tetap satu-satunya sumber angka: halaman menyerahkan
 * payload yang baru saja direndernya, sedangkan dialog memintanya ke
 * `/api/reports/payload` dengan parameter yang sama. Tidak ada jalur kedua yang
 * menghitung ulang apa pun.
 */
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { businessISODate } from "@sai/core/business-date";
import type { ReportPdfKind } from "@/lib/report-pdf-kinds";
import { apiFetch } from "@/lib/api-fetch";
import { documentPdfHref, parseTenantPath } from "@sai/core/tenant-routes";
// Nama dokumennya datang dari penentu bentuk laporan (#323). Ia statis dengan
// sengaja: `statement-layout.ts` tidak mengimpor apa pun, jadi ia tak menyeret
// jsPDF — yang tetap dimuat malas di `downloadStatementPdf()` di bawah.
import { STATEMENT_TITLES } from "@/lib/statement-layout";

/** Tanggal berkas — hari ini, bukan periode laporan (dua hal berbeda). */
function stamp(): string {
  return businessISODate(new Date());
}

/** Nama berkas yang aman lintas sistem berkas: hanya huruf, angka, garis bawah. */
function slug(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Ambil payload cetak untuk `reportId` beserta parameternya.
 *
 * `params` yang bernilai `undefined` tidak ikut ke alamat — rute payload sudah
 * punya bawaannya sendiri (`resolvePeriod`/`resolveAsOf`), dan mengirim
 * `?asOf=` kosong berarti memaksanya menebak dua kali.
 */
export async function fetchReportPayload(
  reportId: string,
  params: Record<string, string | undefined>
): Promise<StatementPayload> {
  const query = new URLSearchParams({ id: reportId });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const res = await apiFetch(`/api/reports/payload?${query.toString()}`);
  if (!res.ok) throw new Error(`Payload gagal diambil: ${res.status}`);
  return (await res.json()) as StatementPayload;
}

/**
 * Minta PDF-nya ke SERVER, lalu unduh (rancangan §5, tahap 1c).
 *
 * ══ PERAMBAN BERHENTI MENGHASILKAN APA PUN ═════════════════════════════════
 * Sampai tahap 1c fungsi ini memuat `statement-pdf` (1.097 baris) BESERTA
 * jsPDF ke dalam bundle peramban, lalu menggambar PDF-nya di mesin pengguna.
 * Sekarang ia mengirim muatan yang sama ke `/api/reports/pdf` dan mengunduh
 * byte yang dipulangkan — bentuk yang persis sama dengan
 * `downloadStatementWorkbook` di bawah, dan itu disengaja: dua jalur berkas
 * yang bentuknya berbeda akan berbeda juga pada perbaikan berikutnya.
 *
 * Tiga hal yang dibuka pemindahan ini, dan ketiganya mustahil dari peramban:
 * server bisa MENYIMPAN byte yang persis sama dengan yang dikirim ke customer
 * (syarat audit), paket laporan bisa terbit sendiri, dan dokumen tidak lagi
 * bergantung pada perangkat pengguna.
 *
 * `company` TIDAK lagi diteruskan: identitas dan logonya dirakit di server
 * (`serverPdfCompany`), dari basis data PT yang sedang dibuka. Merakitnya di
 * klien lalu mengirimkannya berarti nama dan logo perusahaan di kertas
 * ditentukan oleh apa yang dikirim peramban — dan peramban bukan sumber
 * kebenaran tentang PT mana ini.
 */
export async function downloadStatementPdf(payload: StatementPayload): Promise<void> {
  const res = await apiFetch("/api/reports/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PDF gagal dibuat: ${res.status}`);
  await simpanBlob(
    await res.blob(),
    res.headers.get("Content-Disposition"),
    `${slug(STATEMENT_TITLES[payload.kind])}_${stamp()}.pdf`
  );
}

/**
 * Laporan → Blob PDF dari server, TANPA mengunduhnya. Empat jenis laporan
 * memakai satu rute; `jenis` memilih izin, bentuk badan, dan generatornya di
 * sisi server (`REPORT_PDF`).
 *
 * `badan` adalah PARAMETER untuk tiga laporan yang muatannya dihitung server
 * (stok, opname, kas — 09 §5), dan muatan jadi untuk `statement`.
 *
 * Dipakai tombol pratinjau: ia menampilkan Blob-nya lebih dulu, dan unduhannya
 * dibuat dari Blob yang SAMA. Permintaan kedua akan menghasilkan `/ID` PDF yang
 * berbeda — pengenal berkas acak jsPDF — sehingga yang dilihat pengguna dan yang
 * ia simpan bukan berkas yang sama byte-nya. Satu permintaan, satu berkas.
 *
 * ── 202: laporan besar DISERAHKAN ke antrean ────────────────────────────────
 * Di atas `EXPORT_QUEUE_HANDOFF_ROWS` rutenya menerbitkan pekerjaan
 * `report.pdf` alih-alih menggambar di permintaan ini. Kita menunggu di rute
 * hasil bertenant — pintu yang sama dengan ekspor Excel — dan Blob yang
 * dipulangkan adalah buffer yang SATU KALI dibangkitkan pekerjanya. `?jenis=`
 * ikut di alamatnya: izin unduhnya milik jenis laporan, bukan `kind`-nya.
 */
export async function fetchReportPdfBlob(
  jenis: ReportPdfKind,
  badan: unknown
): Promise<Blob> {
  const res = await apiFetch(`/api/reports/pdf/${jenis}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badan),
  });
  if (res.status === 202) {
    const antre = (await res.json()) as { jobId: number; kind: string };
    const hasil = await tungguHasil(antre.jobId, antre.kind, undefined, { jenis });
    return hasil.blob();
  }
  if (!res.ok) throw new Error(`PDF gagal dibuat: ${res.status}`);
  return res.blob();
}

/** Laporan keuangan — jenis `statement`, diketik terhadap muatannya. */
export async function fetchStatementPdfBlob(payload: StatementPayload): Promise<Blob> {
  return fetchReportPdfBlob("statement", payload);
}

/**
 * Simpan sebuah Blob sebagai unduhan. SATU tempat tarian ini ditulis.
 *
 * Tiga pemanggil melakukannya persis sama — PDF laporan, workbook laporan, dan
 * pratinjau dokumen — dan menyalinnya berarti tiga salinan yang akan berbeda
 * pada perbaikan berikutnya. `revokeObjectURL` ikut, dan itu bukan kerapian:
 * URL objek yang tidak dilepas menahan seluruh Blob di memori tab selama tab
 * itu hidup.
 */
export async function simpanBlob(
  blob: Blob,
  disposition: string | null,
  bawaan: string
): Promise<void> {
  const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? bawaan;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Kirim payload ke server, unduh workbook yang dikembalikannya.
 *
 * Workbook disusun server (ExcelJS pustaka Node) dari payload yang SAMA dengan
 * layar dan PDF-nya, jadi ketiganya tak bisa berbeda angka.
 */
export async function downloadStatementWorkbook(
  payload: StatementPayload,
  sumber?: SumberLaporan,
  lapor?: (persen: number) => void
): Promise<void> {
  const query = new URLSearchParams();
  if (sumber) {
    query.set("id", sumber.reportId);
    for (const [k, v] of Object.entries(sumber.params)) if (v) query.set(k, v);
  }
  const alamat = query.size > 0 ? `/api/reports/export?${query.toString()}` : "/api/reports/export";

  const res = await apiFetch(alamat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  /*
   * ── 202: DISERAHKAN KE ANTREAN (tahap 1c, §5) ───────────────────────────
   *
   * Ekspor di atas ambang penyerahan tidak dirakit di dalam permintaan ini —
   * perakitan ExcelJS sinkron dan akan menahan setiap permintaan lain di
   * proses yang sama. Jawabannya menyebut id pekerjaannya, dan kita menunggu
   * DI RUTE HASILNYA.
   *
   * ⚠ Menunggu di rute hasil, bukan di sebuah rute status: rute hasil sudah
   * menjawab 409 `job_not_done` beserta statusnya sampai berkasnya ada. Rute
   * status kedua akan punya penjaga izinnya sendiri yang bisa menyimpang dari
   * penjaga unduhannya — dan yang menyimpang di antara keduanya adalah
   * kebocoran.
   */
  if (res.status === 202) {
    const antre = (await res.json()) as { jobId: number; kind: string };
    await unduhSaatSiap(antre.jobId, antre.kind, lapor);
    return;
  }

  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  await simpanBlob(
    await res.blob(),
    res.headers.get("Content-Disposition"),
    `Laporan_${stamp()}.xlsx`
  );
}

/**
 * Ambil PDF dokumen satuan dari SERVER, sebagai Blob.
 *
 * Dipakai tombol pratinjau. Satu permintaan, satu Blob — dan unduhannya dibuat
 * dari Blob yang sama, bukan dari permintaan kedua yang akan menghasilkan
 * `/ID` PDF yang berbeda.
 *
 * ⚠ Ia mengirim ID, bukan muatan. Faktur adalah dokumen yang dikirim ke
 * pelanggan dan disimpan sebagai bukti; angka di atas kertas diturunkan dari
 * BUKU, bukan dari apa yang kebetulan ada di memori peramban.
 */
export async function fetchDocumentPdfBlob(jenis: string, id: number): Promise<Blob> {
  const lingkup = parseTenantPath(window.location.pathname);
  if (!lingkup) {
    throw new Error(
      "alamat ini bukan jalur bertenant — dokumen selalu milik satu PT, dan " +
        "alamat cetaknya menuntut sepasang slug (#489)"
    );
  }
  const res = await apiFetch(
    documentPdfHref(lingkup.tenantSlug, lingkup.companySlug, jenis, id)
  );
  if (!res.ok) throw new Error(`PDF gagal dibuat: ${res.status}`);
  return res.blob();
}

/** Asal sebuah laporan — apa yang dibutuhkan pekerja untuk MENGHITUNGNYA ULANG. */
export interface SumberLaporan {
  reportId: string;
  params: Record<string, string | undefined>;
}

/** Jeda antar pemeriksaan, dan batas menunggunya. */
const JEDA_MS = 2_000;
const BATAS_TUNGGU_MS = 10 * 60 * 1000;

/**
 * Tunggu sampai hasil pekerjaan siap, lalu unduh.
 *
 * ══ MENUNGGU DI RUTE HASIL — SATU PINTU, SATU PENJAGA ══════════════════════
 * Rute hasil menjawab 409 `job_not_done` beserta statusnya selama pekerjaannya
 * belum selesai, dan 200 beserta byte-nya begitu selesai. Jadi menunggu dan
 * mengunduh adalah alamat yang SAMA — dan izin yang memutuskan keduanya juga
 * sama persis, tidak bisa menyimpang.
 *
 * ⚠ BATAS WAKTU, bukan menunggu selamanya: tab yang memeriksa setiap dua detik
 * tanpa henti adalah tab yang masih memeriksa besok pagi. Sepuluh menit jauh
 * di atas ekspor terbesar yang masuk akal, dan sesudahnya pekerjaannya TIDAK
 * dibatalkan — ia tetap berjalan, dan berkasnya tetap bisa diunduh nanti.
 * Yang berakhir hanya penantian ini.
 *
 * `dead` MENGHENTIKAN penantian: pekerjaan yang sudah mati tidak akan menjadi
 * hidup di pemeriksaan berikutnya, dan terus memeriksa hanya menunda kabar
 * buruk yang sudah pasti.
 */
async function unduhSaatSiap(
  jobId: number,
  kind: string,
  lapor?: (persen: number) => void
): Promise<void> {
  const res = await tungguHasil(jobId, kind, lapor);
  await simpanBlob(
    await res.blob(),
    res.headers.get("Content-Disposition"),
    `Laporan_${stamp()}.xlsx`
  );
}

/**
 * Penantian di rute hasil — dipakai unduhan ekspor (`unduhSaatSiap`) dan
 * pratinjau PDF berantre (`fetchReportPdfBlob`). Memulangkan jawaban 200-nya;
 * pemanggil yang memutuskan apakah Blob-nya disimpan atau dipratinjau.
 *
 * `query` ikut ke alamat apa adanya — `report.pdf` menuntut `?jenis=` (izin
 * unduhnya milik jenis laporan, `PER_REPORT_PERMISSION`).
 */
async function tungguHasil(
  jobId: number,
  kind: string,
  lapor?: (persen: number) => void,
  query?: Record<string, string>
): Promise<Response> {
  const lingkup = parseTenantPath(window.location.pathname);
  if (!lingkup) {
    throw new Error(
      "alamat ini bukan jalur bertenant — hasil pekerjaan selalu milik satu PT, " +
        "dan alamat unduhannya menuntut sepasang slug (#489)"
    );
  }
  const cari = query ? `?${new URLSearchParams(query).toString()}` : "";
  const href = `/api/t/${lingkup.tenantSlug}/${lingkup.companySlug}/jobs/${encodeURIComponent(kind)}/${jobId}/result${cari}`;

  const batas = Date.now() + BATAS_TUNGGU_MS;
  for (;;) {
    const res = await apiFetch(href);

    if (res.ok) return res;

    if (res.status !== 409) {
      /* 404 = bukan milik PT ini, izinnya dicabut, atau berkasnya hilang.
         Apa pun sebabnya, ia tidak akan berubah dengan menunggu. */
      throw new Error(`Hasil tidak bisa diambil: ${res.status}`);
    }

    const keadaan = (await res.json()) as { status?: string };
    if (keadaan.status === "dead") {
      throw new Error("Pekerjaan ekspor gagal — tidak ada berkas yang bisa diunduh.");
    }

    if (Date.now() > batas) {
      throw new Error(
        "Ekspornya masih dikerjakan. Berkasnya tidak hilang — coba unduh lagi sebentar lagi."
      );
    }

    lapor?.(keadaan.status === "claimed" ? 50 : 10);
    await new Promise((r) => setTimeout(r, JEDA_MS));
  }
}
