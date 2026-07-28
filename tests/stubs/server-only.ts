/**
 * Pengganti paket `server-only` saat tes.
 *
 * Paket aslinya sengaja MELEMPAR bila ikut terbawa ke bundel peramban — itulah
 * gunanya, dan `tests/server-only-boundary.test.ts` menjaga batas yang sama
 * secara statis. Tapi di dalam vitest tidak ada bundel peramban sama sekali:
 * yang ada hanya Node, dan impor itu gagal diselesaikan sehingga SELURUH modul
 * sisi server menjadi tak bisa diuji sebagai unit.
 *
 * Modul kosong ini membuat impornya berhasil tanpa mengubah apa pun yang
 * dijamin paket aslinya di produksi.
 */
export {};
