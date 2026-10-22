/**
 * Hook `register` Next untuk konsol operator — isinya hanya MODE REPLIKA
 * tahap 2 (`@sai/platform/replica-mode`), dan hanya bila `CACHE_REDIS_URL`
 * disetel. Tanpanya fungsi ini pulang di baris kedua dan tidak memuat apa pun.
 *
 * Kenapa konsol ikut, padahal ia tidak direplikasi: konsol adalah PENULIS
 * data kendali yang dibaca `app-customer` (pengumuman status, logo produk,
 * pengaturan surel, isi & pengaturan situs). Invalidasinya hari ini hanya
 * mengosongkan cache proses konsol sendiri, dan aplikasi pelanggan menyusul
 * lewat TTL. Dengan bus menyala, pengosongan itu sampai ke setiap replika
 * `app-customer` seketika.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /* Baris stempel build — satu per proses, sama bentuknya dengan setiap
     layanan lain (`@sai/core/build-info`). Dilewati saat `next build`: pekerja
     build bukan proses yang melayani siapa pun. */
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { buildBanner } = await import("@sai/core/build-info");
    console.log(`[start] ${buildBanner("app-operator")}`);
  }

  if (!process.env.CACHE_REDIS_URL) return;

  const { startReplicaMode } = await import("@sai/platform/replica-mode");
  /* Tanpa akar penyimpanan: konsol berjalan SATU instans, dan `server.js`
     standalone-nya berpindah direktori ke `apps/operator/`, jadi jalur relatif
     `data/` di sini bukan volume yang dipasang compose. Penjaganya milik
     `app-customer`, satu-satunya layanan yang direplikasi. */
  await startReplicaMode({ app: "app-operator", storageRoots: [] });
}
