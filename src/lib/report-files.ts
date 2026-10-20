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
import { apiFetch } from "@/lib/api-fetch";
// Nama dokumennya datang dari penentu bentuk laporan (#323). Ia statis dengan
// sengaja: `statement-layout.ts` tidak mengimpor apa pun, jadi ia tak menyeret
// jsPDF — yang tetap dimuat malas di `downloadStatementPdf()` di bawah.
import { STATEMENT_TITLES } from "@/lib/statement-layout";

/** Tanggal berkas — hari ini, bukan periode laporan (dua hal berbeda). */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
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
 * Muatan laporan → Blob PDF dari server, TANPA mengunduhnya.
 *
 * Dipakai tombol pratinjau: ia menampilkan Blob-nya lebih dulu, dan unduhannya
 * dibuat dari Blob yang SAMA. Permintaan kedua akan menghasilkan `/ID` PDF yang
 * berbeda — pengenal berkas acak jsPDF — sehingga yang dilihat pengguna dan yang
 * ia simpan bukan berkas yang sama byte-nya. Satu permintaan, satu berkas.
 */
export async function fetchStatementPdfBlob(payload: StatementPayload): Promise<Blob> {
  const res = await apiFetch("/api/reports/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PDF gagal dibuat: ${res.status}`);
  return res.blob();
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
export async function downloadStatementWorkbook(payload: StatementPayload): Promise<void> {
  const res = await apiFetch("/api/reports/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  await simpanBlob(
    await res.blob(),
    res.headers.get("Content-Disposition"),
    `Laporan_${stamp()}.xlsx`
  );
}
