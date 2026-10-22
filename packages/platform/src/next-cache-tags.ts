/**
 * `cacheHandler` Next yang DITULIS SENDIRI (09 §9: pustaka yang beredar
 * menyasar Next 13–15; Next 16 di sini memakai model `updateTags` /
 * `refreshTags` / `getExpiration`). Hanya dipasang bila `CACHE_REDIS_URL`
 * disetel — lewat `installNextCacheHandlers()` dari hook `register`.
 *
 * ══ YANG DIBAGI: TAG, BUKAN ISI ══════════════════════════════════════════
 * Cache data Next di aplikasi ini hari ini tiga `unstable_cache` (katalog
 * paket, pengaturan situs, isi situs) — masing-masing SATU baris kecil yang
 * dibaca ulang paling sering sekali per lima menit per replika. Menyalin isinya
 * ke Redis tidak membeli apa pun yang terukur. Yang SALAH dengan dua replika
 * adalah invalidasinya: `updateTag()` di konsol operator (atau di replika 1)
 * hanya menandai tag basi di proses itu, dan replika lain menyajikan isi lama
 * sampai `revalidate` habis.
 *
 * Maka yang dibagi adalah buku tag. Isi tetap di cache bawaan Next per replika
 * (`createDefaultCacheHandler` + `FileSystemCache` untuk `unstable_cache`), dan
 * keduanya membaca peta tag yang sama di dalam proses
 * (`tags-manifest.external` — berkas `.external` tidak pernah dibundel, jadi
 * satu instans per proses). Handler ini menulis ke peta itu untuk tag yang
 * dibasikan replika LAIN:
 *
 *   • `updateTags` lokal  → peta lokal (lewat handler bawaan) + pesan bus +
 *                           baris di buku tag Redis;
 *   • pesan bus masuk     → `updateTags` handler bawaan → peta lokal;
 *   • `refreshTags`       → kalau bus sedang tidak koheren, tarik buku tag
 *                           dari Redis (dibatasi sekali per 2 detik). Next
 *                           memanggilnya hanya untuk `'use cache'`, jadi jalur
 *                           `unstable_cache` bergantung pada pesan bus — dan
 *                           pada penarikan buku tag saat langganan pulih.
 *
 * Redis mati: `updateTags` tetap berlaku lokal (perilaku hari ini), dan replika
 * lain menyusul lewat `revalidate`-nya sendiri — paling lama lima menit, sama
 * seperti sebelum tahap 2. Tidak ada isi cache yang hilang karena Redis hilang.
 *
 * ⚠ Dipasang lewat `globalThis[Symbol.for('@next/cache-handlers')]`, kait yang
 * dibaca `initializeCacheHandlers` Next — BUKAN lewat `cacheHandlers` di
 * `next.config.ts`. Sebabnya: konfigurasi dibekukan saat build, sementara image
 * dibangun CI tanpa Redis. Lewat konfigurasi, handler ini akan terpasang di
 * produksi satu-replika juga, dan "tanpa `CACHE_REDIS_URL` perilakunya
 * identik" berubah dari fakta menjadi klaim. Kaitnya tidak terdokumentasi;
 * `tests/next-cache-tags.test.ts` memeriksa bahwa Next yang terpasang masih
 * membacanya, jadi peningkatan Next yang mencabutnya merah di verify.
 */
import type { CacheEntry, CacheHandler } from "next/dist/server/lib/cache-handlers/types";

import { busLostAt, cacheBusState, onBusMessage, onBusResync, publishBus, sharedRedis } from "./cache-bus";

export const NEXT_TAGS_TOPIC = "next-tags";
/** Hash Redis: tag → JSON `{ at, expire? }`. Buku, bukan sumber kebenaran — boleh hilang. */
export const NEXT_TAGS_LEDGER_KEY = "sai:next-tags:v1";
/** Buku tag lebih tua dari ini tidak berguna: `revalidate` terpanjang di aplikasi ini 5 menit. */
const LEDGER_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_MIN_INTERVAL_MS = 2_000;

/** Ukuran cache bawaan Next (`cacheMaxMemorySize` bawaan, config-shared). */
export const NEXT_DEFAULT_CACHE_MAX_BYTES = 50 * 1024 * 1024;

type Durations = { expire?: number };
type TagMessage = { tags: string[]; durations?: Durations };

function isTagMessage(value: unknown): value is TagMessage {
  const v = value as TagMessage | null;
  return !!v && Array.isArray(v.tags) && v.tags.every((t) => typeof t === "string");
}

/**
 * Bungkus handler bawaan Next dengan buku tag bersama. `inner` disuntik supaya
 * tes tidak bergantung pada modul internal Next; produksi memakai
 * `createDefaultCacheHandler` milik Next sendiri.
 */
export function createSharedTagCacheHandler(inner: CacheHandler): CacheHandler {
  let lastRefresh = 0;
  /** Margin: jam replika tidak sinkron sempurna. */
  const CLOCK_MARGIN_MS = 5_000;

  const applyLedger = async (since: number): Promise<void> => {
    const redis = sharedRedis();
    if (!redis) return;
    const rows = await redis.hgetall(NEXT_TAGS_LEDGER_KEY);
    const plain: string[] = [];
    const withExpire = new Map<number, string[]>();
    for (const [tag, raw] of Object.entries(rows ?? {})) {
      try {
        const { at, expire } = JSON.parse(raw) as { at: number; expire?: number };
        if (typeof at !== "number" || at < since) continue;
        if (typeof expire === "number") withExpire.set(expire, [...(withExpire.get(expire) ?? []), tag]);
        else plain.push(tag);
      } catch {
        // Baris rusak di buku = tag yang dilewati; isi cache-nya tetap ber-`revalidate`.
      }
    }
    if (plain.length) await inner.updateTags(plain);
    for (const [expire, tags] of withExpire) await inner.updateTags(tags, { expire });
  };

  onBusMessage(NEXT_TAGS_TOPIC, (payload) => {
    if (!isTagMessage(payload)) return;
    void inner.updateTags(payload.tags, payload.durations).catch((error: unknown) => {
      console.error("[next-cache] tag dari replika lain gagal diterapkan:", error);
    });
  });

  onBusResync(async (lostAt) => {
    // Sambungan pertama sejak start: belum ada isi lokal yang bisa basi.
    if (lostAt === null) return;
    await applyLedger(lostAt - CLOCK_MARGIN_MS);
  });

  return {
    get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined> {
      return inner.get(cacheKey, softTags);
    },
    set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void> {
      return inner.set(cacheKey, pendingEntry);
    },
    async refreshTags(): Promise<void> {
      if (cacheBusState() !== "degraded") return;
      const lostAt = busLostAt();
      if (lostAt === null) return;
      const now = Date.now();
      if (now - lastRefresh < REFRESH_MIN_INTERVAL_MS) return;
      lastRefresh = now;
      try {
        await applyLedger(lostAt - CLOCK_MARGIN_MS);
      } catch {
        // Redis tak terjawab: tetap pada perilaku satu-replika.
      }
    },
    getExpiration(tags: string[]): Promise<number> {
      return inner.getExpiration(tags);
    },
    async updateTags(tags: string[], durations?: Durations): Promise<void> {
      await inner.updateTags(tags, durations);
      publishBus(NEXT_TAGS_TOPIC, { tags, durations } satisfies TagMessage);
      const redis = sharedRedis();
      if (!redis || tags.length === 0) return;
      const at = Date.now();
      const fields: Record<string, string> = {};
      for (const tag of tags) fields[tag] = JSON.stringify({ at, expire: durations?.expire });
      try {
        await redis.hset(NEXT_TAGS_LEDGER_KEY, fields);
        await redis.pexpire(NEXT_TAGS_LEDGER_KEY, LEDGER_TTL_MS);
      } catch (error) {
        console.warn("[next-cache] buku tag tidak tertulis — replika lain menyusul lewat pesan bus/revalidate:", error);
      }
    },
  };
}

/** Kunci global yang dibaca `initializeCacheHandlers` Next (use-cache/handlers.js). */
export const NEXT_CACHE_HANDLERS_SYMBOL = Symbol.for("@next/cache-handlers");

/**
 * Pasang handler sebagai `default` dan `remote` Next. WAJIB dipanggil sebelum
 * permintaan pertama — hook `register` memenuhi syarat itu (Next menunggu
 * `register` selesai sebelum memuat handler cache).
 */
export async function installNextCacheHandlers(): Promise<void> {
  const { createDefaultCacheHandler } = await import("next/dist/server/lib/cache-handlers/default");
  const handler = createSharedTagCacheHandler(createDefaultCacheHandler(NEXT_DEFAULT_CACHE_MAX_BYTES));
  const g = globalThis as unknown as Record<symbol, Record<string, unknown> | undefined>;
  g[NEXT_CACHE_HANDLERS_SYMBOL] = {
    ...g[NEXT_CACHE_HANDLERS_SYMBOL],
    DefaultCache: handler,
    RemoteCache: handler,
  };
}
