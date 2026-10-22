/**
 * Pembatas laju untuk permukaan BERSESI, dengan penyimpanan bersama bila ada
 * (tahap 2, 09 §3.4 "koordinasi sekilas: pembatas laju").
 *
 * Penghitung memori di `@sai/core/rate-limit` tidak terbagi antar-replika: dua
 * replika di belakang Traefik berarti dua kali kuota, dan penyerang yang
 * permintaannya dibagi rata tidak pernah tertahan. Di sini penghitungnya pindah
 * ke `cache-redis` — SATU kunci per subjek, `INCR` + kedaluwarsa jendela dalam
 * satu skrip Lua supaya tidak ada jendela tanpa batas waktu.
 *
 * Tanpa `CACHE_REDIS_URL` (bus mati) jawabannya `checkRateLimit` yang sama
 * persis seperti sebelum berkas ini ada — hanya dibungkus `Promise`.
 *
 * Redis mati / lambat (>500 ms) → JATUH KE PENGHITUNG MEMORI, bukan menolak dan
 * bukan meloloskan tanpa batas. Selama itu kuotanya per replika lagi — longgar,
 * tapi tetap berbatas. Pengguna yang sah tidak boleh terkunci karena cache mati.
 *
 * Endpoint PUBLIK (login, register, reset sandi) tidak di sini: mereka memakai
 * penghitung persisten di basis data kendali (`src/lib/rate-limit-persistent.ts`,
 * #138/#372), yang sudah terbagi antar-replika sejak lahir.
 */
import {
  DEFAULT_RATE_LIMIT_OPTIONS,
  checkRateLimit,
  type RateLimitOptions,
} from "@sai/core/rate-limit";

import { sharedRedis } from "./cache-bus";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs?: number };

const KEY_PREFIX = "sai:rl:v1:";

/**
 * INCR, pasang kedaluwarsa hanya pada hit pertama, pulangkan [jumlah, sisa ms].
 * Satu skrip = atomik: dua replika yang menaikkan kunci yang sama tidak bisa
 * sama-sama melihat "hit pertama" dan saling menimpa jendelanya.
 */
const SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
  "return {c, redis.call('PTTL', KEYS[1])}";

export async function checkSharedRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const redis = sharedRedis();
  if (!redis) return checkRateLimit(key, options);

  const { windowMs, maxAttempts } = { ...DEFAULT_RATE_LIMIT_OPTIONS, ...options };
  try {
    const reply = (await redis.eval(SCRIPT, 1, KEY_PREFIX + key, String(windowMs))) as [number, number];
    const count = Number(reply[0]);
    const ttl = Number(reply[1]);
    if (count > maxAttempts) {
      return { allowed: false, remaining: 0, retryAfterMs: ttl > 0 ? ttl : windowMs };
    }
    return { allowed: true, remaining: maxAttempts - count };
  } catch (error) {
    console.warn("[rate-limit] cache-redis tak terjawab — memakai penghitung memori replika ini:", error);
    return checkRateLimit(key, options);
  }
}
