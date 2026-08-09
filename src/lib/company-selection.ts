/**
 * PT mana yang menjadi "yang sedang dibuka" setelah sebuah perusahaan LAHIR
 * (issue #339) — bagian MURNI-nya.
 *
 * ══ MASALAH YANG DISELESAIKAN ══════════════════════════════════════════════
 * Pemilihan otomatis hanya pernah terjadi di SATU tempat: `authorize()` di
 * `lib/auth.ts`, saat masuk, ketika perusahaan pemakainya kebetulan tepat satu.
 * Pendaftar baru menempuh urutan yang membuat tempat itu tidak pernah menjawab
 * benar — ia masuk ketika perusahaannya masih NOL, lalu membuat yang pertama.
 * Sesudah itu tidak ada satu pun jalur yang memilihkan: revalidasi berkala di
 * `lib/auth.ts` hanya bisa MELEPAS perusahaan yang aksesnya dicabut. Yang ia
 * lihat berikutnya adalah chrome dasbor tanpa peran — layar memuat yang tidak
 * pernah selesai.
 *
 * ══ KEPUTUSANNYA, DAN KENAPA IA BERBENTUK BEGINI ═══════════════════════════
 * Perusahaan yang baru dibuat diambil HANYA bila sesi itu belum menunjuk
 * perusahaan mana pun. Dua sisinya sama-sama disengaja:
 *
 *  • **Belum ada yang dipilih → ambil.** Tidak ada tebakan di sini: yang
 *    diambil bukan "yang pertama menurut abjad" melainkan yang BARU SAJA
 *    dibuat orang itu sendiri, satu detik sebelumnya, dengan namanya yang ia
 *    ketik sendiri. Larangan #104 berlaku untuk MENEBAK di antara beberapa
 *    kemungkinan; di sini tidak ada kemungkinan kedua.
 *
 *  • **Sudah ada yang dipilih → jangan pindah.** Orang yang sedang bekerja di
 *    PT A lalu membuat PT B tetap di PT A. Berpindah buku tanpa diminta adalah
 *    kelas kesalahan termahal di aplikasi ini: ia tidak berbunyi saat terjadi
 *    dan baru muncul berbulan-bulan kemudian sebagai neraca yang tidak cocok.
 *    Jalan ke PT baru tetap ada — sebagai tautan yang ditekan sendiri.
 *
 * ⚠ Yang diputuskan di sini murni PEMILIHAN — "PT mana yang sedang dibuka" —
 * BUKAN otorisasi. Angka yang keluar dari fungsi ini masih harus melewati
 * `update({ companyId })`, yang memeriksa ULANG keanggotaannya ke basis data
 * kendali (callback `jwt` di `lib/auth.ts`), dan penjaga halaman tetap membaca
 * keanggotaan tiap permintaan (#158). Sesi tidak menjadi sumber kebenaran query
 * karena berkas ini.
 *
 * MURNI dan tanpa `server-only`: pemakainya formulir di peramban, dan tesnya
 * berjalan tanpa React maupun Prisma.
 */

/**
 * @param currentCompanyId PT yang SEDANG dibuka menurut sesi; `null`/`undefined`
 *   berarti belum ada satu pun yang dipilih.
 * @param createdCompanyId PT yang barusan lahir. `undefined` bila alirannya
 *   tidak membawanya (server yang lebih tua daripada #339) — keadaan normal,
 *   bukan kegagalan.
 * @returns id yang harus dipilih, atau `null` bila tidak ada yang perlu diubah.
 */
export function companyToAdoptAfterCreate(
  currentCompanyId: number | null | undefined,
  createdCompanyId: number | null | undefined
): number | null {
  if (typeof createdCompanyId !== "number") return null;
  if (currentCompanyId != null) return null;
  return createdCompanyId;
}
