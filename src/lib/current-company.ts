/**
 * "Perusahaan mana yang sedang dibuka?" — SATU jawaban untuk seluruh kode
 * server (issue #104).
 *
 * Dua sumber, berurutan:
 *
 *   1. **Konteks `AsyncLocalStorage`** — dipasang `runWithCompany()` (skrip,
 *      cron, seed, tes), yang memakai `als.run()` dan karena itu merambat ke
 *      SELURUH pekerjaan di dalam callback-nya.
 *   2. **Penyimpan per-permintaan** — ditulis penjaga jalur/permintaan; lihat
 *      `setRouteCompany` di bawah. Inilah sumber yang melayani permintaan HTTP.
 *
 * Kalau keduanya kosong: **MELEMPAR**. Tidak pernah ada perusahaan bawaan.
 *
 * ══ SUMBER KETIGA YANG DIHAPUS: SESI (issue #158) ══════════════════════════
 * Sampai #158 ada sumber ketiga — `companyId` di JWT. Ia lahir sebagai jaring
 * pengaman untuk jalur yang tidak melewati penjaga, dan justru itu yang membuat
 * seluruh kelas kesalahan ini bisa bertahan: route yang lupa membawa lingkupnya
 * TETAP BEKERJA, dengan perusahaan yang kebetulan terakhir dibuka di tab mana
 * pun, tanpa galat dan tanpa jejak. Setelah penjaga API mengambil lingkupnya
 * dari permintaan (`lib/company-request.ts`) dan route self-scoped menyebutnya
 * sendiri, jaring itu tidak lagi menangkap apa pun kecuali kesalahan.
 *
 * Menghapusnya mengubah "lupa membawa perusahaan" dari sunyi menjadi berisik:
 * `MissingCompanyContextError`, di query pertama, bukan neraca yang tidak cocok
 * berbulan-bulan kemudian. Itu tetap berlaku dan tidak boleh dibatalkan.
 *
 * ══ APA YANG DIUKUR DI ISSUE #333 ══════════════════════════════════════════
 * Berkas ini dulu menyandarkan sumber kedua pada `cache()` React, dengan
 * kalimat "`cache()` React mengembalikan objek yang sama sepanjang satu render".
 * Kalimat itu benar — dan justru di situ letak lubangnya: ROUTE HANDLER BUKAN
 * SEBUAH RENDER. Diukur di dalam route handler Next 16.2.1 yang sungguhan
 * (`next dev`, Node 22.22):
 *
 *   • di dalam ROUTE HANDLER: `holder() === holder()` → **false**. `cache()`
 *     tanpa dispatcher React menjalankan fungsinya lagi setiap kali, jadi
 *     `setRouteCompany()` menulis ke satu objek dan pembacaan berikutnya
 *     menerima `{ value: null }` yang LAIN. Sumber kedua tidak pernah bekerja
 *     untuk API — sekali pun.
 *   • di dalam RENDER halaman: `holder() === holder()` → **true**, dan nilainya
 *     terbaca sampai ke komponen anak. Itulah sebabnya halaman selamat dan
 *     hanya route handler yang menjawab 500.
 *
 * Sekarang penyimpannya tidak lagi bertanya kepada React. Ia dikunci pada objek
 * yang Next sendiri lingkupkan per permintaan: hasil `await headers()`. Diukur
 * di kedua tempat — route handler DAN render — dua pemanggilan `headers()`
 * dalam satu permintaan mengembalikan objek yang IDENTIK, dan permintaan lain
 * mendapat objek lain. `WeakMap` di atasnya karena itu otomatis per-permintaan:
 * tidak ada kebocoran antar-permintaan maupun antar-pengguna, dan entrinya mati
 * bersama permintaannya tanpa perlu dibersihkan.
 *
 * ══ DAN SATU SIFAT `enterWith` YANG DIUKUR ULANG ═══════════════════════════
 * Berkas ini dulu menulis bahwa `enterWith` "merambat ke kelanjutan pemanggil
 * bila belum ada store". Yang benar lebih sempit, dan selisihnya menentukan:
 *
 *   • `enterWith` yang dipanggil SEBELUM `await` apa pun di fungsi itu →
 *     merambat ke pemanggil. ✅
 *   • `enterWith` yang dipanggil SESUDAH sebuah `await` → **tidak** merambat;
 *     pemanggil melihat store lamanya (atau tidak sama sekali). ❌
 *
 * Penjaga SELALU berada di kasus kedua — ia menanam konteks setelah membaca
 * basis data kendali. Karena itu `enterCompanyContext()` di penjaga tidak
 * pernah sampai ke badan route maupun ke komponen halaman: diukur `null` di
 * keduanya. Ia dipertahankan untuk pemanggil yang menanam TANPA await lebih
 * dulu, tetapi kebenaran permintaan HTTP bertumpu pada sumber kedua di bawah —
 * bukan pada rambatan ALS.
 */

import { headers } from "next/headers";

import { getCompanyContext, MissingCompanyContextError, type CompanyContext } from "@/lib/company-context";

interface RouteCompanyHolder {
  value: CompanyContext | null;
}

/**
 * Penyimpan per-permintaan, dikunci pada objek permintaan milik Next.
 *
 * `WeakMap`, bukan `Map`: kuncinya hidup persis selama permintaannya, jadi
 * entrinya lenyap sendiri. Sebuah `Map` di sini akan menjadi kebocoran memori
 * yang tumbuh satu baris per permintaan seumur proses.
 */
const holders = new WeakMap<object, RouteCompanyHolder>();

/**
 * Penyimpan milik permintaan yang sedang berjalan, atau `null` bila memang
 * tidak ada permintaan.
 *
 * `headers()` MELEMPAR di luar lingkup permintaan (skrip, cron, seed, tes unit).
 * Itu bukan kegagalan melainkan jawaban — sama seperti di
 * `companyScopeFromRequest()`: di sana tidak ada permintaan yang bisa membawa
 * lingkup, jadi pemanggilnya harus menyebut perusahaannya sendiri lewat
 * `runWithCompany()`. Yang TIDAK terjadi di sini: menebak perusahaan.
 */
async function requestHolder(create: boolean): Promise<RouteCompanyHolder | null> {
  let anchor: object;
  try {
    anchor = await headers();
  } catch {
    return null;
  }
  if (!anchor || typeof anchor !== "object") return null;

  const existing = holders.get(anchor);
  if (existing) return existing;
  if (!create) return null;

  const fresh: RouteCompanyHolder = { value: null };
  holders.set(anchor, fresh);
  return fresh;
}

/**
 * Dipanggil penjaga jalur (`enterCompanyFromRoute`) — bukan oleh kode halaman.
 *
 * Sengaja TIDAK melempar saat tidak ada permintaan: yang berhak melempar adalah
 * pembuktian di `enterCompanyFromRoute`, supaya doktrin "konteks harus benar-
 * benar mendarat" hanya ditulis di satu tempat dan pesannya menyebut jalur yang
 * gagal.
 */
export async function setRouteCompany(context: CompanyContext): Promise<void> {
  const holder = await requestHolder(true);
  if (holder) holder.value = context;
}

/**
 * Perusahaan dari permintaan ini, atau `null`.
 *
 * Diekspor untuk SATU pemakai: penjaga jalur, yang membacanya kembali segera
 * setelah menulisnya untuk membuktikan tulisannya mendarat. Kode halaman tidak
 * pernah memanggil ini — pertanyaan "perusahaan mana?" hanya punya satu jawaban,
 * dan jawabannya `currentCompany()`.
 */
export async function routeCompany(): Promise<CompanyContext | null> {
  return (await requestHolder(false))?.value ?? null;
}

/** Konteks perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompany(): Promise<CompanyContext> {
  const fromContext = getCompanyContext();
  if (fromContext) return fromContext;

  const fromRoute = await routeCompany();
  if (fromRoute) return fromRoute;

  throw new MissingCompanyContextError();
}

/** Id perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompanyId(): Promise<number> {
  return (await currentCompany()).companyId;
}
