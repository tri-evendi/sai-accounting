/**
 * MODE REPLIKA (tahap 2) — satu pintu yang dipanggil hook `register` kedua
 * aplikasi Next. Tanpa `CACHE_REDIS_URL` pulang seketika dan TIDAK memuat apa
 * pun: tiga modul di bawah diimpor dinamis, jadi produksi satu-replika tidak
 * membawa satu baris pun dari jalur ini ke memorinya.
 *
 * Yang dinyalakan, berurutan:
 *   1. bus invalidasi cache (`cache-bus.ts`) — tidak menunggu Redis siap;
 *   2. handler cache Next dengan buku tag bersama (`next-cache-tags.ts`) —
 *      WAJIB sebelum permintaan pertama, dan `register` memang ditunggu Next;
 *   3. penjaga penyimpanan bersama (`replica-storage.ts`) — satu-satunya yang
 *      boleh menolak start.
 */
import type { StorageRoot } from "./replica-storage";

export async function startReplicaMode(options: { app: string; storageRoots: StorageRoot[] }): Promise<boolean> {
  if (!process.env.CACHE_REDIS_URL) return false;
  // Pekerja `next build` bukan proses yang melayani siapa pun.
  if (process.env.NEXT_PHASE === "phase-production-build") return false;

  const { startCacheBus } = await import("./cache-bus");
  const { installNextCacheHandlers } = await import("./next-cache-tags");
  const { assertSharedStorage } = await import("./replica-storage");

  await startCacheBus();
  await installNextCacheHandlers();
  await assertSharedStorage(options.storageRoots);
  console.info(`[replika] ${options.app}: mode replika aktif (CACHE_REDIS_URL disetel).`);
  return true;
}
