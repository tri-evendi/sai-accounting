/**
 * PENYIMPANAN BERKAS DOKUMEN (issue #367) — di mana byte-nya tinggal, dan
 * bagaimana namanya disusun.
 *
 * ══ KENAPA BUKAN `public/uploads` LAGI ══════════════════════════════════════
 * Sampai issue ini, setiap dokumen setiap PT ditulis ke SATU direktori bersama
 * `public/uploads/`, dengan nama `<nama-asli>_<epoch-ms>.<ext>`, lalu disajikan
 * sebagai BERKAS STATIS. Barisnya di tabel `documents` memang hidup di basis
 * data PT — isolasi #104 berlaku penuh untuk barisnya — tetapi berkasnya tidak
 * mengenal perusahaan, tenant, maupun pemiliknya.
 *
 * Berkas statis TIDAK melewati satu pun penjaga. `proxy.ts` memantulkan
 * pengambilan anonim ke `/login`, dan itu satu-satunya pagar yang ada — padahal
 * proxy memang tidak pernah membuktikan keanggotaan (#73: proxy jaring
 * pengaman, keputusan izin di `requirePagePermission`/`requireApiPermission`).
 * Jadi pemegang sesi di tenant MANA PUN yang tahu nama berkasnya bisa mengambil
 * dokumen tenant lain — dan namanya bukan rahasia yang dirancang: ia
 * mempertahankan nama yang diketik pengguna, diacak hanya oleh stempel
 * milidetik.
 *
 * ══ BENTUK BARUNYA ══════════════════════════════════════════════════════════
 *   data/documents/<companyId>/<uuid>.<ext>
 *
 * Tiga keputusan, semuanya disengaja:
 *
 *   • DI LUAR `public/`. Tidak ada perender berkas statis yang bisa
 *     menjangkaunya; satu-satunya jalan keluar adalah route handler ber-izin
 *     (`/api/documents/[id]/file`).
 *   • Nama di disk UUID — TANPA satu byte pun masukan pengguna. Nama asli tetap
 *     hidup di kolom `documents.filename`, tempatnya sejak awal, dan dipulangkan
 *     lewat `Content-Disposition`. Nama yang tidak bisa ditebak bukan pengganti
 *     izin, ia hanya menghapus satu kelas kesalahan (tabrakan nama, path
 *     traversal, nama yang membocorkan isi).
 *   • Disekat per `companyId`. Bukan sebagai penjaga — penjaganya adalah baris
 *     `documents` yang dibaca dari basis data PT AKTIF — melainkan supaya
 *     "seluruh dokumen sebuah PT" menjadi sesuatu yang bisa ditunjuk: ekspor
 *     mandiri (#142) menyalinnya, penghancuran buku menghapusnya.
 *
 * `documents.filepath` karena itu menyimpan KUNCI RELATIF (`<companyId>/<uuid>.<ext>`),
 * bukan URL. Kolom yang isinya URL adalah kolom yang mengundang dirinya dipakai
 * sebagai `href`, dan begitulah kebocoran ini lahir pertama kali.
 *
 * ══ BARIS LAMA ══════════════════════════════════════════════════════════════
 * Baris yang `filepath`-nya masih berbentuk `/uploads/<nama>` tetap bisa dibaca
 * (`legacyPublicName`) sampai `bun run migrate:documents` memindahkannya. Itu
 * kelonggaran BACA saja: tidak ada satu pun jalur tulis di repo ini yang boleh
 * menghasilkan bentuk lama lagi — dijaga `tests/no-public-uploads.test.ts`.
 *
 * ══ TANPA `server-only` ═════════════════════════════════════════════════════
 * Sengaja, alasan yang sama dengan `mailer-core.ts`: skrip pemindahan dan skrip
 * penghapusan tenant berjalan lewat tsx DI LUAR Next dan wajib bisa menyusun
 * jalur yang sama persis dengan yang dipakai aplikasi. Modul ini murni jalur +
 * nama; ia tidak membaca sesi dan tidak memutuskan izin apa pun.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";

/** Akar penyimpanan dokumen. Sejajar `data/audit`, dan sama-sama volume. */
export const DOCUMENTS_ROOT = path.join(process.cwd(), "data", "documents");

/**
 * Direktori `public/uploads` LAMA — hanya dibaca (baris yang belum dipindahkan)
 * dan dikosongkan oleh skrip pemindahan. Tidak ada yang menulis ke sini lagi.
 */
export const LEGACY_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Ekstensi yang boleh diunggah, beserta tipe MIME yang dipulangkan. */
export const DOCUMENT_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

/**
 * Bentuk kunci penyimpanan. Diperiksa SEBELUM menyentuh berkas apa pun: nilainya
 * datang dari kolom basis data, dan sesuatu yang menyusun jalur berkas layak
 * diperiksa apa pun asalnya (aturan yang sama dengan `SAFE_DATABASE_NAME` di
 * `company-clients.ts`).
 */
const STORAGE_KEY =
  /^[1-9][0-9]{0,9}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

/** Nama berkas lama yang aman dibaca: satu segmen, tanpa jalur, tanpa titik-dua. */
const LEGACY_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$/;

/** Kunci penyimpanan baru untuk sebuah unggahan. `ext` sudah ber-titik & huruf kecil. */
export function newStorageKey(companyId: number, ext: string): string {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`companyId tidak sah untuk penyimpanan dokumen: ${String(companyId)}`);
  }
  const normalized = ext.toLowerCase();
  if (!DOCUMENT_CONTENT_TYPES[normalized]) {
    throw new Error(`Ekstensi tidak diizinkan: ${JSON.stringify(ext)}`);
  }
  return `${companyId}/${randomUUID()}${normalized}`;
}

export function isStorageKey(value: string): boolean {
  return STORAGE_KEY.test(value);
}

/**
 * Nama berkas lama di balik `filepath` berbentuk `/uploads/<nama>`, atau `null`
 * bila `filepath` bukan bentuk lama (atau bentuk lama yang namanya tidak wajar).
 */
export function legacyPublicName(filepath: string): string | null {
  if (!filepath.startsWith("/uploads/")) return null;
  const name = filepath.slice("/uploads/".length);
  return LEGACY_NAME.test(name) ? name : null;
}

/**
 * Jalur absolut sebuah `documents.filepath`, apa pun bentuknya — atau `null`
 * bila nilainya tidak dikenali. `null` berarti 404, TIDAK PERNAH tebakan:
 * `filepath` yang aneh adalah baris yang rusak, bukan undangan mencari-cari.
 */
export function resolveDocumentPath(filepath: string): string | null {
  if (isStorageKey(filepath)) return path.join(DOCUMENTS_ROOT, filepath);
  const legacy = legacyPublicName(filepath);
  return legacy ? path.join(LEGACY_UPLOAD_DIR, legacy) : null;
}

/** Direktori seluruh dokumen satu PT — yang disalin ekspor, yang dihapus. */
export function companyDocumentsDir(companyId: number): string {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`companyId tidak sah: ${String(companyId)}`);
  }
  return path.join(DOCUMENTS_ROOT, String(companyId));
}

/** Tipe MIME dari nama berkas; yang tak dikenal jadi unduhan biasa. */
export function contentTypeFor(filename: string): string {
  return DOCUMENT_CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Alamat pengambilan sebuah dokumen. SATU tempat rumus ini ditulis — halaman
 * daftar, tombol pratinjau, dan jawaban unggah semuanya memakainya, jadi jalur
 * route-nya tidak punya salinan yang bisa menyimpang.
 */
export function documentFileHref(id: number): string {
  return `/api/documents/${id}/file`;
}

/**
 * Buang seluruh dokumen sebuah PT. Dipakai penghancuran buku (gerbang KEDUA
 * penghapusan tenant, sesudah masa retensi) — bukan oleh gerbang pertama:
 * dokumen unggahan adalah BUKTI PEMBUKUAN, jadi ia mengikuti nasib buku
 * besarnya, bukan nasib data pribadi. Tidak ada di sini = bukan galat.
 */
export async function removeCompanyDocuments(companyId: number): Promise<void> {
  await rm(companyDocumentsDir(companyId), { recursive: true, force: true });
}
