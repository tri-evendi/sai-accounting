/**
 * DOKUMEN SATUAN MENJADI PDF — di server, sinkron, di-stream (rancangan §5).
 *
 * ══ SINKRON, DAN ITU JAWABAN YANG BENAR UNTUKNYA ═══════════════════════════
 * §5 membagi dokumen bukan menurut jenisnya melainkan ONGKOSNYA: satu faktur
 * adalah milidetik, dan antrean untuknya hanya menambah penantian beserta satu
 * tombol yang harus menunggu. Yang WAJIB lewat antrean adalah laporan periode
 * panjang dan paket laporan — dan jalurnya sudah ada (`interactive`).
 *
 * ══ DARI ID, BUKAN DARI MUATAN ═════════════════════════════════════════════
 * Faktur adalah dokumen yang dikirim ke pelanggan dan disimpan sebagai bukti.
 * Merendernya dari muatan yang dikirim peramban berarti angka di atas kertas
 * ditentukan oleh apa yang dikirim klien — sementara server kini tampak
 * menjaminnya. Syarat audit §5 hanya berarti sesuatu bila kertasnya diturunkan
 * dari BUKU; peta `DOCUMENT_PDF` yang memuat pemuatnya.
 *
 * ══ PERUSAHAAN DATANG DARI JALUR, BUKAN HEADER (issue #489) ════════════════
 * Alamat ini mendarat di `<iframe src>` pratinjau dan `<a href download>` —
 * keduanya tidak melewati `apiFetch()` dan karena itu TIDAK BISA membawa
 * sepasang header lingkup. Alasan yang sama persis dengan rute berkas dokumen.
 *
 * ══ IZINNYA PER JENIS ══════════════════════════════════════════════════════
 * Faktur menuntut `invoice.read`, kontrak `contract.read`. Satu izin tunggal
 * untuk semua cetakan akan membuat siapa pun yang boleh mencetak surat jalan
 * juga boleh mencetak faktur — dan keduanya kertas yang berbeda nilainya.
 *
 * Jenisnya ada di JALUR, jadi gerbangnya berjalan sebelum satu baris pun
 * dibaca: alasan yang sama dengan rute hasil pekerjaan, hanya di sini ia lebih
 * sederhana — jenis dokumen memang bagian dari alamatnya, bukan sesuatu yang
 * harus dicari lebih dulu.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { DOCUMENT_PDF, isDocumentPdfKind } from "@/lib/document-pdf";
import type { TenantScopedParams } from "@sai/core/tenant-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tidakAda = () => new Response(null, { status: 404 });

/** RFC 6266, dua bentuk sekaligus. `inline`: pemanggilnya mempratinjaunya. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<TenantScopedParams & { jenis: string; id: string }> }
) {
  const params = await context.params;

  /* ── 1. Bentuk, sebelum apa pun menyentuh basis data ──────────────────── */
  const jenis = decodeURIComponent(params.jenis);
  if (!isDocumentPdfKind(jenis)) return tidakAda();

  const spec = DOCUMENT_PDF[jenis];
  /* `muat` null = jenis ini belum punya pemuat sisi server. 404, dan bukan
     501: bagi pemanggil keduanya sama — tidak ada kertas di alamat ini — dan
     tombolnya memang masih menggambar di peramban. */
  if (spec.muat === null) return tidakAda();

  if (!/^\d+$/.test(params.id)) return tidakAda();
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return tidakAda();

  /* ── 2. Gerbang — SEBELUM barisnya dibaca ─────────────────────────────── */
  const authz = await requireApiPermission(spec.permission, params);
  if (!authz.authorized) return authz.response;

  /* ── 3. Muat dari buku PT AKTIF ────────────────────────────────────────
   *
   * Konteksnya sudah ditanam penjaga di atas, jadi `prisma` di dalam pemuatnya
   * adalah klien PT yang sedang dibuka: id milik PT lain tidak menemukan apa
   * pun, dan jawabannya 404 — sama persis dengan id yang memang tidak ada.
   * Tidak ada perbandingan kepemilikan yang ditulis tangan di sini, dan itu
   * disengaja: perbandingan yang ditulis tangan adalah perbandingan yang bisa
   * lupa ditulis.
   */
  const pdf = await spec.muat(id);
  if (!pdf) return tidakAda();

  /* `Uint8Array` dibungkus `new Uint8Array(...)` dengan buffer yang pasti
     `ArrayBuffer`: tipe `BodyInit` menolak `Uint8Array<ArrayBufferLike>`, dan
     itu bukan rewel — ia membedakan buffer yang bisa dibagi antar-thread
     (`SharedArrayBuffer`) dari yang tidak. */
  const body = new Uint8Array(pdf.content);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(pdf.filename),
      /* Isinya milik satu PT dan sudah lolos penjaga: jangan pernah disimpan
         proxy bersama, dan jangan pernah dipakai ulang sesudah izin dicabut. */
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
