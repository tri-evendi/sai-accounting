/**
 * PENJAGA PENYIMPANAN BERSAMA untuk replika (tahap 2) — hanya aktif bila
 * `CACHE_REDIS_URL` disetel.
 *
 * Dokumen unggahan (`data/documents`) dan jejak audit berkas (`data/audit`)
 * adalah VOLUME LOKAL. Dua replika di SATU host berbagi volume bernama yang
 * sama, jadi aman. Dua replika di DUA host masing-masing punya volume sendiri:
 * faktur yang diunggah lewat replika 1 tidak ada di replika 2, dan pengguna
 * melihat lampiran yang "hilang" separuh waktu — tanpa galat di mana pun.
 *
 * Penjaganya sidik penyimpanan: setiap akar menyimpan `.storage-id` (UUID yang
 * dibuat sekali), dan replika yang hidup MENYEWA kunci `sai:storage:<nama>` di
 * Redis dengan sidik itu. Replika yang start dengan sidik BERBEDA dari sewa
 * yang masih hidup MENOLAK START — itulah tanda volumenya bukan volume yang
 * sama. Sewa ber-TTL (koordinasi sekilas, 09 §3.4): host lama yang mati
 * melepaskannya sendiri dalam tiga menit.
 *
 * Redis tak terjangkau saat start → PERINGATAN, bukan penolakan: Redis mati
 * tidak boleh menghentikan aplikasi. Denyut sesudahnya tetap memeriksa dan
 * berteriak di log bila ketidakcocokan muncul belakangan.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sharedRedis, type BusRedis } from "./cache-bus";

export interface StorageRoot {
  /** Nama logis volume — SAMA di setiap aplikasi yang memasangnya (mis. `audit`). */
  name: string;
  dir: string;
  /** Volume yang dipasang `:ro` — sidik hanya dibaca, tidak pernah dibuat. */
  readOnly?: boolean;
}

export const STORAGE_LEASE_MS = 180_000;
const HEARTBEAT_MS = 60_000;
const MARKER = ".storage-id";

export class SharedStorageMismatchError extends Error {}

/** Sidik akar penyimpanan, dibuat sekali bila belum ada (dan boleh ditulis). */
export async function storageId(root: StorageRoot): Promise<string | null> {
  const file = path.join(root.dir, MARKER);
  try {
    return (await readFile(file, "utf8")).trim() || null;
  } catch {
    if (root.readOnly) return null;
  }
  await mkdir(root.dir, { recursive: true });
  const id = randomUUID();
  try {
    // `wx`: dua replika yang start bersamaan tidak saling menimpa sidik.
    await writeFile(file, id + "\n", { flag: "wx" });
    return id;
  } catch {
    return (await readFile(file, "utf8")).trim() || null;
  }
}

/**
 * Sewa satu akar. `ok` = sewa milik sidik ini (baru atau diperpanjang);
 * `mismatch` = sewa hidup milik sidik lain.
 */
export async function leaseStorage(
  redis: BusRedis,
  name: string,
  id: string
): Promise<{ ok: true } | { ok: false; holder: string }> {
  const key = `sai:storage:${name}`;
  const set = await redis.set(key, id, "PX", STORAGE_LEASE_MS, "NX");
  if (set === "OK") return { ok: true };
  const holder = await redis.get(key);
  if (holder === null) {
    // Kedaluwarsa di antara dua perintah — coba sekali lagi.
    return (await redis.set(key, id, "PX", STORAGE_LEASE_MS, "NX")) === "OK"
      ? { ok: true }
      : { ok: false, holder: (await redis.get(key)) ?? "?" };
  }
  if (holder !== id) return { ok: false, holder };
  await redis.pexpire(key, STORAGE_LEASE_MS);
  return { ok: true };
}

function mismatchMessage(root: StorageRoot, id: string, holder: string): string {
  return (
    `[replika] PENYIMPANAN '${root.name}' (${root.dir}) BUKAN volume yang dipakai replika lain ` +
    `(sidik ${id} ≠ ${holder}). Replika di host berbeda WAJIB berbagi penyimpanan dokumen ` +
    "(NFS/penyimpanan objek) — tanpanya unggahan di satu replika tak terlihat di replika lain. " +
    "docs/arsitektur/02-LAYANAN-INFRA.md §Replika."
  );
}

async function waitForRedis(timeoutMs: number): Promise<BusRedis | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const redis = sharedRedis();
    if (redis || Date.now() >= until) return redis;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Periksa setiap akar saat start, lalu perpanjang sewanya berkala. MELEMPAR
 * `SharedStorageMismatchError` bila sidik bertabrakan — hook `register` yang
 * melempar membuat Next menolak start, dan itulah yang dikehendaki.
 */
export async function assertSharedStorage(
  roots: StorageRoot[],
  options: { waitMs?: number } = {}
): Promise<void> {
  const ids: { root: StorageRoot; id: string }[] = [];
  for (const root of roots) {
    const id = await storageId(root);
    if (id) ids.push({ root, id });
  }
  if (ids.length === 0) return;

  const redis = await waitForRedis(options.waitMs ?? 5_000);
  if (!redis) {
    console.warn("[replika] cache-redis belum terjangkau — pemeriksaan penyimpanan bersama ditunda ke denyut.");
  } else {
    for (const { root, id } of ids) {
      const lease = await leaseStorage(redis, root.name, id);
      if (!lease.ok) throw new SharedStorageMismatchError(mismatchMessage(root, id, lease.holder));
    }
  }

  const timer = setInterval(() => {
    const r = sharedRedis();
    if (!r) return;
    for (const { root, id } of ids) {
      leaseStorage(r, root.name, id)
        .then((lease) => {
          if (!lease.ok) console.error(mismatchMessage(root, id, lease.holder));
        })
        .catch(() => {
          // Redis tersendat: denyut berikutnya mencoba lagi.
        });
    }
  }, HEARTBEAT_MS);
  timer.unref?.();
}
