/**
 * KONTEKS PERUSAHAAN per permintaan (issue #104) — bagian yang tidak menyentuh
 * basis data, supaya bisa diuji utuh (`tests/company-context.test.ts`).
 *
 * MASALAH YANG DISELESAIKAN. Sejak buku besar setiap PT hidup di basis datanya
 * sendiri, setiap query harus tahu MILIK SIAPA ia dijalankan. Mengoper klien
 * sebagai parameter ke 120 berkas yang mengimpor `@/lib/prisma` jelas bukan
 * pilihan. Jadi konteksnya dititipkan pada `AsyncLocalStorage`: dimasuki sekali
 * di gerbang permintaan, lalu terbaca oleh seluruh kode di bawahnya tanpa satu
 * pun tanda tangan fungsi berubah.
 *
 * ══ ATURAN YANG TIDAK BOLEH DILANGGAR ══════════════════════════════════════
 *
 *   KONTEKS YANG HILANG HARUS MELEMPAR — TIDAK PERNAH JATUH KE BASIS DATA
 *   BAWAAN.
 *
 * Inilah satu-satunya aturan yang benar-benar berbahaya di seluruh fitur ini.
 * Bila sebuah jalur kode berjalan tanpa konteks lalu diam-diam memakai koneksi
 * bawaan, transaksi PT A akan tertulis ke buku PT B: tanpa galat, tanpa jejak,
 * dan baru ketahuan berbulan-bulan kemudian saat neracanya tidak cocok — kalau
 * ketahuan. Melempar seketika berarti halaman itu gagal terbuka hari ini, dan
 * itu jauh lebih murah daripada pembukuan yang tercampur diam-diam.
 *
 * Karena itu tidak ada nilai bawaan, tidak ada `?? defaultCompany`, dan tidak
 * ada mode "kalau cuma satu perusahaan, pakai saja yang itu". Proses yang
 * memang tidak punya permintaan (skrip, cron, migration) WAJIB menyebut
 * perusahaannya sendiri lewat `runWithCompany()`.
 *
 * ══ `enterWith` vs `run` — DAN MANA YANG BOLEH DIANDALKAN ══════════════════
 * `runWithCompany()` (memakai `als.run`) dipakai bila seluruh pekerjaan muat di
 * dalam satu callback — skrip, cron, seed, tes. **Ia selalu bisa diandalkan.**
 *
 * `enterCompanyContext()` (memakai `als.enterWith`) dipakai gerbang
 * halaman/API, sebab sebuah penjaga tidak bisa "membungkus" render yang terjadi
 * SETELAH ia selesai. Berkas ini dulu menyebut rambatannya "jalan pintas yang
 * tergantung lingkungan". Diukur ulang di issue #333 (Node 22.22, dan di dalam
 * route handler & render Next 16.2.1 yang sungguhan), batasnya ternyata bukan
 * soal lingkungan melainkan soal `await`:
 *
 *   • `enterWith` yang dipanggil SEBELUM `await` apa pun di fungsi itu →
 *     merambat ke kelanjutan pemanggilnya. ✅
 *   • `enterWith` yang dipanggil SESUDAH sebuah `await` → **tidak** merambat.
 *     Pemanggil melihat store lamanya, atau tidak sama sekali. ❌
 *
 * Sebuah penjaga selalu berada di kasus kedua: ia membaca basis data kendali
 * lebih dulu, baru menanam. Jadi konteks yang ditanam `enterCompanyContext()`
 * dari penjaga TIDAK PERNAH sampai ke badan route maupun ke komponen halaman —
 * terukur `null` di keduanya. Ia tetap ada untuk pemanggil yang menanam tanpa
 * `await` lebih dulu, tetapi untuk permintaan HTTP kebenarannya ditopang
 * penyimpan PER-PERMINTAAN di `current-company.ts` — bukan rambatan ALS, dan
 * (sejak #158) bukan pula sesi.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface CompanyContext {
  /** `companies.id` di basis data kendali. */
  readonly companyId: number;
  /** `companies.slug` — dipakai di URL, log, dan pesan galat. */
  readonly slug: string;
  /** Nama basis data perusahaan ini. Kredensialnya TIDAK ada di sini. */
  readonly databaseName: string;
}

/** Dilempar saat kode menyentuh basis data tanpa tahu perusahaan mana. */
export class MissingCompanyContextError extends Error {
  constructor(detail?: string) {
    super(
      "Konteks perusahaan tidak ada — query dibatalkan. " +
        "Halaman & route API mendapatkannya dari penjaga (requirePagePermission / " +
        "requireApiPermission); skrip, cron, dan pekerjaan latar HARUS " +
        "membungkus pekerjaannya dengan runWithCompany(). " +
        "Ini sengaja gagal keras: jatuh ke basis data bawaan berarti menulis " +
        "transaksi satu perusahaan ke buku perusahaan lain." +
        (detail ? ` (${detail})` : "")
    );
    this.name = "MissingCompanyContextError";
  }
}

const storage = new AsyncLocalStorage<CompanyContext>();

/**
 * Jalankan `fn` dengan konteks perusahaan yang disebut eksplisit.
 * Untuk skrip, cron, tes, dan apa pun yang tidak lahir dari sebuah permintaan.
 */
export function runWithCompany<T>(context: CompanyContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Tanam konteks ke eksekusi yang SEDANG berjalan; bertahan sampai permintaannya
 * selesai. Dipakai penjaga halaman/API, yang tidak bisa membungkus render yang
 * baru terjadi setelah mereka mengembalikan nilai.
 */
export function enterCompanyContext(context: CompanyContext): void {
  storage.enterWith(context);
}

/** Konteks saat ini, atau `null` bila memang tidak ada. Untuk pemanggil yang
 *  benar-benar boleh berjalan tanpa perusahaan (mis. halaman masuk). */
export function getCompanyContext(): CompanyContext | null {
  return storage.getStore() ?? null;
}

/** Konteks saat ini, atau MELEMPAR. Inilah yang dipakai lapisan basis data. */
export function requireCompanyContext(detail?: string): CompanyContext {
  const context = storage.getStore();
  if (!context) throw new MissingCompanyContextError(detail);
  return context;
}

/** Hanya untuk tes: jalankan tanpa konteks apa pun sekalipun pemanggilnya punya. */
export function runWithoutCompany<T>(fn: () => T): T {
  return storage.exit(fn);
}
