/**
 * PENYIMPANAN HASIL PEKERJAAN — di mana byte-nya tinggal, dan apa yang TIDAK
 * boleh menjangkaunya.
 *
 * ══ BENTUKNYA ══════════════════════════════════════════════════════════════
 *   data/hasil/<putaran>/<berkas>
 *
 * `<putaran>` = `<kind-tanpa-titik>-<jobId>`, dan `<berkas>` nama yang dilihat
 * pengguna. `result_ref` di tabel `jobs` menyimpan `<putaran>/<berkas>` —
 * KUNCI RELATIF, bukan URL. Kolom yang isinya URL adalah kolom yang mengundang
 * dirinya dipakai sebagai `href`, dan begitulah kebocoran dokumen lahir
 * pertama kali di repo ini (#367).
 *
 * ══ TIGA KEPUTUSAN, SEMUANYA DISENGAJA ═════════════════════════════════════
 *
 *  • **DI LUAR `public/`.** Tidak ada perender berkas statis yang bisa
 *    menjangkaunya; satu-satunya jalan keluar adalah route handler ber-izin.
 *    Aturan yang sama yang memindahkan dokumen keluar dari `public/uploads`
 *    (#367), dan alasannya sama: berkas statis TIDAK melewati satu pun penjaga.
 *
 *  • **Disekat per PUTARAN, bukan per perusahaan.** Berbeda dari
 *    `data/documents/<companyId>/…`, dan sengaja: pemilik hasil pekerjaan
 *    adalah PEKERJAANNYA, dan kepemilikan perusahaannya dibuktikan baris
 *    `jobs.company_id` yang dibaca rute unduhan — bukan oleh nama direktori.
 *    Nama direktori yang memuat `companyId` akan mengundang orang
 *    membandingkannya dengan konteks aktif, dan perbandingan yang ditulis
 *    tangan adalah perbandingan yang bisa lupa ditulis.
 *
 *  • **Satu direktori per pekerjaan, dibuang utuh.** Pekerjaan yang
 *    menghasilkan beberapa berkas (paket laporan) tidak menuntut bentuk baru,
 *    dan pembersihannya satu `rm -rf` yang tidak bisa menyentuh hasil
 *    pekerjaan lain.
 *
 * ══ RETENSI TERIKAT PADA BARIS `jobs` ══════════════════════════════════════
 * `DONE_RETENTION_DAYS` membuang baris `done` sesudah 14 hari, dan baris itu
 * satu-satunya yang tahu di mana hasilnya berada. Objek yang hidup lebih lama
 * daripada barisnya adalah berkas yang tak bisa dijangkau siapa pun lagi
 * sementara cakramnya tetap terpakai — peringatan yang sudah tertulis di
 * `@sai/core/job-backoff` sejak sebelum ada satu hasil pun. `pruneOrphanResults`
 * di bawah itulah pembayarannya.
 *
 * ══ TANPA `server-only` ════════════════════════════════════════════════════
 * Alasan yang sama dengan `document-storage.ts`: pelari jalur berjalan DI LUAR
 * Next (`bun workers/…`) dan wajib menyusun jalur yang sama persis dengan yang
 * dibaca aplikasi. Modul ini jalur + byte; ia tidak membaca sesi dan tidak
 * memutuskan izin apa pun. Izinnya diputuskan rute unduhan.
 */

import { chown, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { isValidResultRef } from "@sai/core/job-result";
import type { JobKind } from "@sai/core/generated/job-kinds";
import { RESULT_OWNER_GID, RESULT_OWNER_UID } from "@sai/core/generated/job-numbers";

/** Akar penyimpanan hasil. Sejajar `data/documents` & `data/audit` — volume. */
export const RESULTS_ROOT = path.join(process.cwd(), "data", "hasil");

/**
 * Akar yang bisa DISUNTIK — satu-satunya alasannya pengujian.
 *
 * Fungsi paling berbahaya di berkas ini `pruneOrphanResults`: ia MENGHAPUS,
 * dan dua pagarnya (himpunan id yang lengkap, umur minimal) adalah jenis
 * jaminan yang tidak boleh dibuktikan dengan membaca kode saja. Tanpa seam ini,
 * mengujinya berarti menulis dan menghapus di bawah `data/hasil` repo yang
 * sedang dipakai orang — jadi ia tidak akan diuji, dan yang tidak diuji di
 * jalur penghapusan adalah yang akhirnya menghapus hal yang salah.
 *
 * Ia TIDAK dibaca dari lingkungan, dan itu disengaja: akar yang bisa disetel
 * `.env` adalah akar yang bisa salah disetel di produksi — dan salah setelnya
 * berarti pembersih menyapu direktori yang bukan miliknya. Satu-satunya yang
 * boleh mengubahnya adalah pemanggil di dalam kode, yaitu tes.
 */
export type OpsiAkar = { akar?: string };

/**
 * Serahkan berkas hasil ke pembacanya, bila penulisnya root.
 *
 * ══ KENAPA ══════════════════════════════════════════════════════════════════
 * Sejak Okt 2026 pelari jalur berjalan sebagai `node` (uid 1000, `USER` di tahap
 * `migrator` dan `integrator`) — uid yang sama dengan `app-customer`, satu-
 * satunya pembaca volume `hasil` — jadi fungsi ini tidak melakukan apa pun di
 * image yang sekarang. Ia tetap ada untuk proses yang dijalankan sebagai root
 * (`docker compose run --user root …`, pemasangan yang menimpa `user:`): tanpa
 * penyerahan, berkasnya 0600 di direktori 0700 milik root, jadi `stat` dari rute unduhan ditolak dan SETIAP hasil dijawab 404:
 * pekerjaan `done`, berkas ada di cakram, dan tidak satu pun bisa diunduh.
 * Modenya tidak dilonggarkan — yang diperbaiki PEMILIKNYA, ke uid yang memang
 * membacanya (`contract/kinds.yaml` → `results`, dibaca juga pelari Go).
 *
 * Bukan root (pengembang, tes) → tidak ada yang perlu diserahkan, dan
 * `chown` ke uid lain memang akan ditolak.
 */
async function serahkanKePembaca(...jalur: string[]): Promise<void> {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  for (const j of jalur) await chown(j, RESULT_OWNER_UID, RESULT_OWNER_GID);
}

/**
 * Nama direktori putaran untuk satu pekerjaan.
 *
 * `jobId` ikut, dan ia yang membuat nama ini TIDAK BISA bertabrakan antar
 * pekerjaan — termasuk dua pekerjaan `report.export` dari dua PT di detik yang
 * sama. Titik pada `kind` dibuang karena segmen jalur di repo ini sempit
 * dengan sengaja (`isValidResultRef`).
 */
export function resultDir(kind: JobKind, jobId: number): string {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error(`jobId tidak sah: ${String(jobId)}`);
  }
  return `${kind.replace(/\./g, "-")}-${jobId}`;
}

/**
 * Jalur absolut sebuah `result_ref`, atau `null` bila bentuknya tidak dikenal.
 *
 * `null` dan BUKAN melempar, dengan sengaja: pemanggilnya rute unduhan, dan
 * jawaban yang benar untuk `result_ref` yang rusak adalah 404 — bukan 500 yang
 * memberi tahu penanyanya bahwa ia menyentuh sesuatu yang nyata.
 *
 * Validasinya ada di `@sai/core/job-result` supaya bisa diuji tanpa
 * menyentuh berkas apa pun. Di sini hanya penggabungannya — dan `path.join`
 * tidak dipercaya sendiri: ia menormalkan `..` dengan rapi, dan rapi adalah
 * persis yang membuat lolosnya tidak terlihat.
 */
export function resolveResultPath(ref: string, opsi: OpsiAkar = {}): string | null {
  if (!isValidResultRef(ref)) return null;
  const root = opsi.akar ?? RESULTS_ROOT;
  const absolute = path.join(root, ref);
  /* Pemeriksaan KEDUA, sesudah penggabungan: kalau suatu hari
     `isValidResultRef` dilonggarkan, yang gugur di sini adalah jalurnya —
     bukan keamanannya. Sabuk dan bretel di satu-satunya tempat yang
     kegagalannya berarti membaca berkas sembarang dari cakram. */
  if (!absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

/**
 * Tulis satu berkas hasil, dan pulangkan `result_ref`-nya.
 *
 * Ditulis lewat berkas sementara lalu di-`rename`: penulisan yang terputus
 * meninggalkan berkas setengah yang NAMANYA TAMPAK SAH, dan `result_ref` yang
 * sudah tercatat akan menunjuk ke sana. `rename` di satu filesystem atomik.
 */
export async function writeJobResult(
  kind: JobKind,
  jobId: number,
  filename: string,
  bytes: Uint8Array,
  opsi: OpsiAkar = {}
): Promise<string> {
  const ref = `${resultDir(kind, jobId)}/${filename}`;
  if (!isValidResultRef(ref)) {
    throw new Error(
      `nama berkas hasil tidak sah: ${filename}. Segmen jalur di repo ini ` +
        "sempit dengan sengaja — nama yang datang dari muatan pekerjaan tidak " +
        "boleh menyusun jalur berkas."
    );
  }
  const absolute = resolveResultPath(ref, opsi);
  if (absolute === null) throw new Error(`result_ref tidak sah: ${ref}`);

  await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const sementara = `${absolute}.partial`;
  await writeFile(sementara, bytes, { mode: 0o600 });
  /* Diserahkan SEBELUM `rename`: berkas yang namanya sudah sah tidak pernah
     terlihat dengan pemilik yang salah. */
  await serahkanKePembaca(path.dirname(absolute), sementara);
  await rename(sementara, absolute);
  return ref;
}

/** Ukuran berkas hasil, atau `null` bila ia tidak ada / bukan berkas. */
export async function resultSize(ref: string, opsi: OpsiAkar = {}): Promise<number | null> {
  const absolute = resolveResultPath(ref, opsi);
  if (absolute === null) return null;
  try {
    const info = await stat(absolute);
    return info.isFile() ? info.size : null;
  } catch {
    /* Baris ada, berkasnya tidak — mis. dipulihkan dari cadangan basis data
       saja, atau cakramnya dibersihkan. 404 yang jujur. */
    return null;
  }
}

/** Buang seluruh hasil satu pekerjaan. Idempoten. */
export async function removeJobResults(
  kind: JobKind,
  jobId: number,
  opsi: OpsiAkar = {}
): Promise<void> {
  const root = opsi.akar ?? RESULTS_ROOT;
  await rm(path.join(root, resultDir(kind, jobId)), { recursive: true, force: true });
}

/**
 * Buang direktori hasil yang barisnya di `jobs` sudah tidak ada.
 *
 * ══ KENAPA ARAHNYA DARI CAKRAM KE BASIS DATA, BUKAN SEBALIKNYA ═════════════
 * Pembersih yang berjalan dari daftar baris hanya bisa menemukan hasil yang
 * MASIH punya barisnya — yaitu persis yang tidak boleh dibuang. Yatim lahir
 * ketika barisnya hilang lebih dulu (`archiveDoneJobs`, penghapusan tangan,
 * pemulihan basis data ke titik yang lebih tua), jadi yang harus disapu adalah
 * CAKRAMNYA.
 *
 * ⚠ DUA PAGAR, dan keduanya ada karena kesalahan di sini berarti MENGHAPUS.
 *
 *  1. `idMasihAda` wajib memuat SELURUH id yang ada di `jobs` — bukan hanya
 *     yang punya `result_ref`. `writeJobResult` menulis berkasnya lebih dulu
 *     dan `completeJob` menulis `result_ref` sesudahnya, jadi di antara
 *     keduanya direktorinya ada sementara kolomnya masih NULL. Lihat
 *     `jobIdsPresent`.
 *
 *  2. `umurMinimalMs` — direktori yang lebih baru daripada itu TIDAK pernah
 *     dibuang, apa pun kata himpunannya. Ia menutup sisa *race* apa pun yang
 *     belum terpikirkan: sebuah hasil yang baru ditulis beberapa detik lalu
 *     hampir pasti milik pekerjaan yang sedang berjalan, dan pembersih tidak
 *     punya satu alasan pun untuk tergesa-gesa. Satu putaran kemudian ia tetap
 *     akan ada.
 *
 * Pemanggilnya WAJIB melewatkan putaran ini bila kuerinya GAGAL — himpunan
 * kosong karena basis data tak terjangkau akan terbaca sebagai "tidak ada yang
 * punya baris", dan jawabannya menghapus semuanya.
 *
 * @param idMasihAda SELURUH id pekerjaan yang barisnya masih ada di `jobs`.
 * @param umurMinimalMs direktori yang lebih muda daripada ini dilewati.
 * @returns nama direktori yang dibuang.
 */
export async function pruneOrphanResults(
  idMasihAda: ReadonlySet<number>,
  umurMinimalMs: number = 24 * 60 * 60 * 1000,
  opsi: OpsiAkar = {}
): Promise<string[]> {
  const root = opsi.akar ?? RESULTS_ROOT;
  const ambang = Date.now() - umurMinimalMs;
  let entri: string[];
  try {
    entri = await readdir(root);
  } catch {
    /* Volume yang baru dibuat datang kosong, dan direktori yang belum ada
       bukan kegagalan — ia berarti belum ada satu hasil pun. */
    return [];
  }

  const dibuang: string[] = [];
  for (const nama of entri) {
    /* `<kind-tanpa-titik>-<jobId>`: id-nya di belakang tanda hubung TERAKHIR.
       Nama yang tidak cocok dengan pola ini DILEWATI, bukan dibuang —
       direktori yang bukan milik kita tidak boleh disentuh pembersih kita. */
    const pisah = nama.lastIndexOf("-");
    if (pisah <= 0) continue;
    const id = Number(nama.slice(pisah + 1));
    if (!Number.isInteger(id) || id <= 0) continue;
    if (idMasihAda.has(id)) continue;

    const penuh = path.join(root, nama);
    try {
      const info = await stat(penuh);
      /* `mtimeMs` dan bukan `birthtimeMs`: yang terakhir tidak dapat dipercaya
         di sebagian filesystem Linux, dan nilai nol di sana akan membuat SETIAP
         direktori terbaca sebagai tua. */
      if (info.mtimeMs > ambang) continue;
    } catch {
      /* Hilang di antara `readdir` dan `stat` — tidak ada yang perlu dibuang. */
      continue;
    }

    await rm(penuh, { recursive: true, force: true });
    dibuang.push(nama);
  }
  return dibuang;
}
