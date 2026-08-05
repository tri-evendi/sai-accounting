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

/** Susun PDF di peramban dan unduh — jalur yang sama dengan tombol di halaman. */
export async function downloadStatementPdf(
  payload: StatementPayload,
  company: { name: string; address: string }
): Promise<void> {
  const { generateStatementPDF, STATEMENT_TITLES } = await import("@/lib/pdf/statement-pdf");
  const doc = generateStatementPDF(payload, company);
  doc.save(`${slug(STATEMENT_TITLES[payload.kind])}_${stamp()}.pdf`);
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

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? `Laporan_${stamp()}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
