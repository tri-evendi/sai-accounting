/**
 * SINYAL INVALIDASI CACHE LINTAS PROSES (tabel platform `cache_signals`,
 * migration 0009).
 *
 * ══ MASALAH YANG DITUTUP ═════════════════════════════════════════════════
 * Pengaturan situs, isi halaman depan, katalog paket, logo, pengumuman status,
 * dan pengaturan surel DITULIS konsol (`app-operator`) tetapi DIBACA
 * `app-customer` (dan `svc-worker`), masing-masing dengan cache-nya sendiri.
 * `updateTag()` dan `invalidate*()` hanya membuang cache proses penulis, jadi
 * di halaman publik perubahan menunggu umur cache-nya habis (1–5 menit), dan
 * konsol mengatakan "langsung berlaku". Bus Redis (`cache-bus.ts`) menutup
 * celah ini hanya bila `CACHE_REDIS_URL` disetel, dan di produksi tidak.
 *
 * ══ BENTUKNYA ════════════════════════════════════════════════════════════
 *   • Penulis: sesudah tulisannya berhasil, `bumpCacheSignal(db, nama)` →
 *     `version = version + 1` pada satu baris.
 *   • Pembaca: `cacheSignalVersion(db, nama)` memulangkan versi saat ini.
 *     SEMUA baris dibaca dengan satu `SELECT`, paling sering sekali per
 *     `CACHE_SIGNAL_POLL_SECONDS` per proses (permintaan yang datang bersamaan
 *     berbagi satu query). Cache pemanggil menyimpan versi yang berlaku saat
 *     ia mengisi, dan membaca ulang sumbernya begitu versinya berbeda.
 * Jadi tulisan dari proses mana pun terlihat di setiap proses dalam paling
 * lama `CACHE_SIGNAL_POLL_SECONDS`, dan proses penulis sendiri seketika
 * (`bump` membuang hasil baca sinyalnya).
 *
 * Urutan "tulis dulu, naikkan versi kemudian" menutup balapan: pembaca yang
 * mengisi cache di antara keduanya mengisi data BARU di bawah versi lama, dan
 * versi baru memaksanya membaca sekali lagi. Tidak ada jalan di mana data lama
 * tersimpan di bawah versi baru.
 *
 * ══ GAGAL-LUNAK, DAN UMUR CACHE TETAP JARINGNYA ═════════════════════════
 * Tabel belum dimigrasikan, platform tak terjangkau, atau klien tiruan di tes
 * tanpa model `cacheSignal`: `cacheSignalVersion` memulangkan `null` = "tidak
 * diketahui", dan pemanggil kembali ke perilaku lama (umur cache saja).
 * `bumpCacheSignal` yang gagal hanya dicatat: tulisannya sendiri sudah
 * berhasil dan tidak boleh dilaporkan gagal karena sinyal. Karena itu umur
 * cache setiap pemakai TIDAK dipendekkan menjadi nol: ia yang menjamin
 * perubahan lewat SQL tangan, atau saat sinyal tak terbaca, tetap sampai.
 *
 * ⚠ TANPA `server-only`: skrip (`seed-plans.ts`) dan pekerja ikut menulis dan
 * membaca. Kliennya selalu disuntik. Keadaan baca disimpan di `globalThis`,
 * pola `cache-bus.ts`: Next memuat modul yang sama di beberapa bundel, dan
 * semuanya cukup berbagi satu query.
 */
import { CACHE_SIGNAL_POLL_SECONDS, type CacheSignalName } from "@sai/core/cache-signals";

export { CACHE_SIGNAL_NAMES, CACHE_SIGNAL_POLL_SECONDS, type CacheSignalName } from "@sai/core/cache-signals";

const POLL_MS = CACHE_SIGNAL_POLL_SECONDS * 1000;

/** Bagian klien Prisma platform yang dipakai — tiruan di tes cukup memenuhi ini. */
export interface CacheSignalClient {
  cacheSignal: {
    findMany(args: { select: { name: true; version: true } }): Promise<{ name: string; version: number }[]>;
    upsert(args: {
      where: { name: string };
      create: { name: string; version: number };
      update: { version: { increment: number } };
    }): Promise<unknown>;
  };
}

/**
 * Klien apa pun yang disuntik pemanggil. Diperiksa saat berjalan, bukan lewat
 * tipe: pemanggil yang ada (`brand-assets`, `mail-settings`, …) mengetik
 * kliennya sesempit yang mereka pakai, dan klien tiruan di tes tidak punya
 * model ini. Tanpa model = sinyal tidak dipakai, bukan galat.
 */
function signalClient(client: unknown): CacheSignalClient | null {
  const model = (client as { cacheSignal?: Partial<CacheSignalClient["cacheSignal"]> } | null)?.cacheSignal;
  return model && typeof model.findMany === "function" && typeof model.upsert === "function"
    ? (client as CacheSignalClient)
    : null;
}

interface SignalState {
  /** Kapan `versions` terakhir dibaca (atau gagal dibaca). 0 = belum / dibuang. */
  at: number;
  /** `null` = baca terakhir gagal → versi tidak diketahui. */
  versions: Map<string, number> | null;
  inflight: Promise<Map<string, number> | null> | null;
  /** Naik setiap `bump` lokal: hasil baca yang dimulai sebelumnya tidak dipakai. */
  generation: number;
}

const GLOBAL_KEY = Symbol.for("sai.cache-signals");

function state(): SignalState {
  const g = globalThis as unknown as Record<symbol, SignalState | undefined>;
  let s = g[GLOBAL_KEY];
  if (!s) {
    s = { at: 0, versions: null, inflight: null, generation: 0 };
    g[GLOBAL_KEY] = s;
  }
  return s;
}

let lastErrorLog = 0;
function logOnce(message: string, error: unknown): void {
  // Satu baris per menit: platform yang mati tidak boleh membanjiri log.
  const now = Date.now();
  if (now - lastErrorLog < 60_000) return;
  lastErrorLog = now;
  console.warn(message, error);
}

async function readAll(db: CacheSignalClient): Promise<Map<string, number> | null> {
  try {
    const rows = await db.cacheSignal.findMany({ select: { name: true, version: true } });
    return new Map(rows.map((r) => [r.name, r.version]));
  } catch (error) {
    logOnce("[cache-signals] sinyal tak terbaca — cache memakai umurnya saja:", error);
    return null;
  }
}

/**
 * Versi sinyal `name` saat ini, atau `null` bila tidak diketahui (lihat kepala
 * berkas). Baris yang belum pernah ditulis = versi 0.
 */
export async function cacheSignalVersion(
  client: unknown,
  name: CacheSignalName,
  now: number = Date.now()
): Promise<number | null> {
  const db = signalClient(client);
  if (!db) return null;
  const s = state();
  if (s.at !== 0 && now - s.at < POLL_MS) return s.versions ? (s.versions.get(name) ?? 0) : null;

  if (!s.inflight) {
    const generation = s.generation;
    s.inflight = readAll(db).then((versions) => {
      if (s.generation === generation) {
        s.versions = versions;
        s.at = now;
      }
      s.inflight = null;
      return versions;
    });
  }
  const versions = await s.inflight;
  return versions ? (versions.get(name) ?? 0) : null;
}

/**
 * Umumkan bahwa isi `name` berubah. Dipanggil SESUDAH tulisannya berhasil.
 * Tidak pernah melempar: tulisan yang sudah tersimpan tidak boleh dilaporkan
 * gagal karena sinyalnya; umur cache yang menyusul.
 */
export async function bumpCacheSignal(client: unknown, name: CacheSignalName): Promise<void> {
  const s = state();
  // Proses ini sendiri melihat perubahannya pada baca berikutnya.
  s.at = 0;
  s.generation += 1;
  const db = signalClient(client);
  if (!db) return;
  try {
    await db.cacheSignal.upsert({
      where: { name },
      create: { name, version: 1 },
      update: { version: { increment: 1 } },
    });
  } catch (error) {
    console.error(`[cache-signals] sinyal "${name}" tidak naik — proses lain menyusul lewat umur cache:`, error);
  }
  // Baca sesudah tulisan sinyal, bukan hasil baca yang dimulai di tengahnya.
  s.at = 0;
  s.generation += 1;
}

/**
 * Apakah isi cache yang diisi pada versi `cached` masih boleh dipakai bila
 * versi sekarang `current`? Versi yang tidak diketahui tidak membatalkan apa
 * pun; umur cache yang memutuskan.
 */
export function signalAllows(cached: number | null, current: number | null): boolean {
  return current === null || cached === current;
}

/** Hanya untuk tes: lupakan hasil baca sinyal. */
export function resetCacheSignalsForTests(): void {
  const s = state();
  s.at = 0;
  s.versions = null;
  s.inflight = null;
  s.generation += 1;
}
