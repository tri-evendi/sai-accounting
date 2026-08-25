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
 *     (`/api/t/{tenant}/{company}/documents/[id]/file`).
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
 * ══ BENTUK LAMA SUDAH TIDAK ADA ═════════════════════════════════════════════
 * Sampai 2026-08-16 modul ini juga membaca bentuk lama `/uploads/<nama>`,
 * sebagai kelonggaran BACA sementara sampai `migrate:documents` memindahkannya.
 * Pemindahan itu sudah dijalankan di pemasangan ini dan melaporkan 0 dipindahkan
 * · 0 yatim — atas tabel `documents` yang memang berisi 0 baris di keempat PT,
 * dan `public/uploads` yang berisi 0 berkas. Jadi kelonggarannya dicabut, bukan
 * "dianggap tidak terpakai": tidak ada satu baris pun yang bisa memakainya.
 *
 * Yang TETAP berlaku: tidak ada satu pun jalur tulis di repo ini yang boleh
 * menghasilkan bentuk lama lagi — dijaga `tests/no-public-uploads.test.ts`.
 * Penjaga itu sengaja tidak ikut dicabut. Ia menjaga arah, bukan sisa.
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

import { tenantApiPath } from "@/lib/tenant-routes";

/** Akar penyimpanan dokumen. Sejajar `data/audit`, dan sama-sama volume. */
export const DOCUMENTS_ROOT = path.join(process.cwd(), "data", "documents");

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
 * Jalur absolut sebuah `documents.filepath`, apa pun bentuknya — atau `null`
 * bila nilainya tidak dikenali. `null` berarti 404, TIDAK PERNAH tebakan:
 * `filepath` yang aneh adalah baris yang rusak, bukan undangan mencari-cari.
 */
export function resolveDocumentPath(filepath: string): string | null {
  return isStorageKey(filepath) ? path.join(DOCUMENTS_ROOT, filepath) : null;
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
 *
 * Sepasang slug WAJIB, dan itu bukan kerepotan yang bisa dihemat (issue #489):
 * alamat ini mendarat di `<iframe src>`, `<img src>`, dan `<a href download>`
 * — tiga hal yang tidak melewati `apiFetch()` dan tidak bisa membawa header
 * lingkup. Perusahaannya karena itu HARUS ada di jalurnya. Menjadikan slug
 * opsional berarti menghidupkan kembali alamat yang dijawab 409, dan
 * menjadikannya parameter WAJIB berarti yang lupa mengirimnya gugur di `tsc`,
 * bukan di layar pengguna.
 */
export function documentFileHref(
  tenantSlug: string,
  companySlug: string,
  id: number
): string {
  return tenantApiPath(tenantSlug, companySlug, `/documents/${id}/file`);
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
