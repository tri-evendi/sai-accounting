/**
 * Mengambil BYTE sebuah dokumen (issue #367) — satu-satunya jalan keluar
 * berkas unggahan.
 *
 * ══ PERUSAHAAN DATANG DARI JALUR, BUKAN HEADER (issue #489) ════════════════
 * Route ini hidup di `/api/t/{tenant}/{company}/…`, dan itu BUKAN gaya:
 * berkasnya diambil oleh `<iframe src>`, `<img src>`, dan `<a href download>`
 * — tiga hal yang tidak melewati `apiFetch()` dan karena itu TIDAK BISA
 * membawa sepasang header `x-tenant-slug`/`x-company-slug`.
 *
 * Sampai #489 alamatnya bertengger di bawah /api/documents (tanpa tenant), jadi
 * setiap permintaan tiba tanpa lingkup sama sekali: `enterCompanyFromRequest`
 * memulangkan `no-scope` dan penjaga menjawab 409 SEBELUM izin sempat
 * diperiksa. Yang dilihat pengguna bukan pesan galat melainkan pratinjau kosong
 * dan tombol Unduh yang diam — dua gejala dari satu permintaan yang sama.
 * `lib/company-scope.ts` sudah menyebut jalur ini sebagai jawabannya sejak
 * #158; route inilah yang belum ikut pindah.
 *
 * Alamat lama sengaja disebut tanpa tanda kutip di komentar ini: ia SEJARAH,
 * bukan alamat yang berlaku, dan `tests/document-file-route-tenant.test.ts`
 * memang menolak bentuk terkutipnya di mana pun di dalam `src/`.
 *
 * Jalur MENGALAHKAN header (`lib/company-request.ts`): alamat unduhan tidak
 * boleh bisa dibelokkan oleh header yang kebetulan ikut terbawa peramban.
 *
 * ══ KEPEMILIKAN DIBUKTIKAN BASIS DATANYA, BUKAN NAMA BERKAS ════════════════
 * Sampai issue ini berkasnya adalah berkas STATIS di `public/uploads/`: yang
 * memisahkan dokumen satu tenant dari tenant lain hanyalah ketidaktahuan akan
 * namanya. Route ini menggantinya dengan pertanyaan yang benar — bukan "apakah
 * kamu tahu nama berkasnya", melainkan "apakah baris ini ADA di basis data PT
 * yang sedang kamu buka".
 *
 * `prisma` di sini adalah klien PT AKTIF (konteks dimasuki `requireApiPermission`).
 * Maka `findUnique({ id })` atas id milik PT lain tidak menemukan apa pun, dan
 * jawabannya 404 — sama persis dengan id yang memang tidak ada. Tidak ada
 * perbandingan kepemilikan yang ditulis tangan di sini, dan itu disengaja:
 * perbandingan yang ditulis tangan adalah perbandingan yang bisa lupa ditulis.
 *
 * ══ 404, BUKAN 403 ══════════════════════════════════════════════════════════
 * Untuk dokumen milik PT lain, 403 akan menjawab pertanyaan yang tidak berhak
 * ditanyakan penanyanya ("jadi id ini ADA di suatu tempat"). Pola yang sama
 * dengan `notFoundResponse()` di penjaga lintas-tenant (#157).
 */
import { readFile, stat } from "node:fs/promises";

import { requireApiPermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { contentTypeFor, resolveDocumentPath } from "@/lib/document-storage";
import type { TenantScopedParams } from "@/lib/tenant-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nama berkas untuk `Content-Disposition`. Dua bentuk sekaligus, sesuai RFC 6266:
 * `filename=` ASCII untuk peramban lama, `filename*=` UTF-8 untuk nama
 * sebenarnya. Tanda kutip dan baris baru dibuang — keduanya bisa memecah header.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<TenantScopedParams & { id: string }> }
) {
  /* Diurai SEKALI: `id` dan sepasang slug datang dari promise yang sama, dan
     penjaga menerima objek yang sudah jadi (`ApiRouteParams`). */
  const params = await context.params;

  const result = await requireApiPermission("document.read", params);
  if (!result.authorized) return result.response;

  const raw = params.id;
  if (!/^\d+$/.test(raw)) return new Response(null, { status: 404 });

  const document = await prisma.document.findUnique({
    where: { id: Number(raw) },
    select: { filename: true, filepath: true },
  });
  if (!document) return new Response(null, { status: 404 });

  /*
   * `filepath` yang tidak dikenali bentuknya = baris rusak, dan baris rusak
   * dijawab 404 — TIDAK PERNAH dengan menebak jalur lain. Nilainya ikut
   * menyusun jalur berkas, dan sesuatu yang menyusun jalur berkas diperiksa
   * apa pun asalnya (aturan yang sama dengan nama basis data di
   * `company-clients.ts`).
   */
  const absolute = resolveDocumentPath(document.filepath);
  if (!absolute) return new Response(null, { status: 404 });

  let size: number;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return new Response(null, { status: 404 });
    size = info.size;
  } catch {
    // Baris ada, berkasnya tidak — mis. dipulihkan dari cadangan basis data
    // saja. 404 yang jujur; jejaknya tetap terbaca di daftar dokumen.
    return new Response(null, { status: 404 });
  }

  /*
   * Dibaca UTUH, tidak di-stream, dan itu aman KARENA unggahan dibatasi 10 MB
   * di `api/upload`. Kalau batas itu suatu saat dinaikkan, di sinilah
   * `createReadStream` menggantikannya — bukan sesudah ada laporan memori.
   */
  const bytes = await readFile(absolute);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(document.filename),
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(document.filename),
      /* Isinya milik satu PT dan sudah lolos penjaga: jangan pernah disimpan
         proxy bersama, dan jangan pernah dipakai ulang sesudah izin dicabut. */
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
