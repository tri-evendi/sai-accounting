/**
 * BUS INVALIDASI CACHE ANTAR-REPLIKA — tahap 2 (09 §3.4, §9). OPT-IN.
 *
 * ══ MASALAH YANG DITUTUP ═════════════════════════════════════════════════
 * Belasan cache tingkat modul memegang data kendali yang BISA BERUBAH —
 * matriks izin efektif, override pengguna, modul aktif, registry perusahaan,
 * pengaturan surel. Masing-masing punya fungsi `invalidate*()` yang dipanggil
 * penulisnya, dan fungsi itu hanya mengosongkan cache PROSES PENULIS.
 *
 * Dengan satu replika itu benar. Dengan dua, replika yang tidak menerima
 * permintaan tulis tetap memakai nilai lama sampai TTL-nya habis — dan untuk
 * otorisasi itu berarti izin yang baru dicabut masih berlaku di replika 2
 * selama satu TTL, tanpa satu galat pun. Itulah risiko kebenaran tahap 2.
 *
 * ══ BENTUKNYA ════════════════════════════════════════════════════════════
 * Setiap cache MENDAFTAR di sini (`registerSharedCache`) dengan fungsi
 * pengosongnya. Penulis tetap mengosongkan cache lokalnya seperti dulu, lalu
 * memanggil `publish(key)`; replika lain menerima pesannya lewat pub/sub
 * `cache-redis` dan menjalankan pengosong yang sama.
 *
 * ══ TANPA `CACHE_REDIS_URL`: PERILAKU HARI INI, PERSIS ═══════════════════
 * Bus hanya hidup bila proses server memanggil `startCacheBus()` (dari hook
 * `register` Next) DAN `CACHE_REDIS_URL` disetel. Selain itu `publish()` tidak
 * melakukan apa-apa, `usable()` selalu `true`, dan `ioredis` TIDAK PERNAH
 * dimuat — impornya dinamis, di dalam `startCacheBus`. Dijaga
 * `tests/cache-bus.test.ts`.
 *
 * Skrip & pekerja (`workers/`, `scripts/`) tidak memanggil `startCacheBus`:
 * koneksi pub/sub menahan proses tetap hidup, dan skrip yang tidak pernah
 * keluar lebih buruk daripada cache yang basi satu TTL — keadaan yang sudah
 * berlaku sejak sebelum tahap 2, sebab proses itu memang tidak pernah bisa
 * mengosongkan cache aplikasi.
 *
 * ══ REDIS MATI = LEBIH LAMBAT, TIDAK PERNAH BASI ═════════════════════════
 * Aturan 09 §3.4. Selama bus hidup tetapi langganannya putus (atau koneksi
 * perintahnya tidak siap), `usable()` menjawab `false` dan setiap cache yang
 * terdaftar DILEWATI — pembacaan langsung ke basis data. Begitu langganan
 * pulih, SEMUA cache terdaftar dikosongkan lebih dulu (pesan yang terlewat
 * selama putus tidak bisa diputar ulang), baru `usable()` kembali `true`.
 * Tidak ada yang disimpan di Redis yang tidak boleh hilang: isinya hanya pesan.
 *
 * ⚠ Satu celah yang TIDAK ditutup, dan TTL tetap penjaganya: partisi sebagian
 * — Redis terjangkau dari replika 2 tetapi tidak dari replika 1 tepat saat
 * replika 1 menulis. Replika 1 sendiri melewati cache-nya (tidak koheren),
 * tetapi pesannya tidak sampai ke replika 2. Karena itu TTL setiap cache
 * TIDAK diperpanjang meski bus hidup.
 *
 * ⚠ TANPA `import "server-only"`, sama seperti `runtime-samples.ts`: berkas ini
 * dimuat dari hook `register` Next, yang tidak dijamin berada di kondisi
 * `react-server` (kejadian 21 Okt, `tests/worker-server-only.test.ts`).
 *
 * ⚠ Keadaannya di `globalThis`, bukan di variabel modul: Next memuat modul yang
 * sama dalam beberapa bundel (hook `register`, lapisan RSC, lapisan SSR). Bus
 * yang dinyalakan di satu salinan harus terlihat — dan bisa mengosongkan
 * cache — di salinan lain.
 */
import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

/** Kanal pub/sub tunggal. Versi di namanya: format pesan berubah = kanal baru. */
export const CACHE_BUS_CHANNEL = "sai:cache-bus:v1";

/** Topik pesan cache terdaftar; topik lain dipakai lapis di atasnya (tag Next). */
const CACHE_TOPIC = "cache";

type Clear = (key?: string) => void;
type Listener = (payload: unknown) => void;
/** `lostAt` = kapan langganan putus; `null` pada sambungan pertama sejak start. */
type ResyncHook = (lostAt: number | null) => void | Promise<void>;

export type CacheBusState = "off" | "connecting" | "coherent" | "degraded";

/** Bagian klien Redis yang dipakai — supaya tes bisa menyuntik tiruan. */
export type BusRedis = Pick<
  Redis,
  "status" | "publish" | "subscribe" | "on" | "eval" | "hset" | "hgetall" | "pexpire" | "set" | "get" | "quit"
>;

interface BusGlobal {
  /** Pengenal proses ini — pesan dari diri sendiri diabaikan. */
  origin: string;
  /** nama cache → pengosong. HIMPUNAN: setiap salinan bundel mendaftar sendiri. */
  registry: Map<string, Set<Clear>>;
  /** topik → pendengar (selain topik cache). */
  listeners: Map<string, Set<Listener>>;
  /** Dipanggil setiap kali langganan (kembali) tersambung, SESUDAH cache dikosongkan. */
  resyncHooks: Set<ResyncHook>;
  /** Kapan langganan terakhir PUTUS (`null` = belum pernah tersambung lalu putus). */
  lostAt: number | null;
  started: boolean;
  subscribed: boolean;
  command: BusRedis | null;
  subscriber: BusRedis | null;
}

const GLOBAL_KEY = Symbol.for("sai.cache-bus");

function bus(): BusGlobal {
  const g = globalThis as unknown as Record<symbol, BusGlobal | undefined>;
  let s = g[GLOBAL_KEY];
  if (!s) {
    s = {
      origin: randomUUID(),
      registry: new Map(),
      listeners: new Map(),
      resyncHooks: new Set(),
      lostAt: null,
      started: false,
      subscribed: false,
      command: null,
      subscriber: null,
    };
    g[GLOBAL_KEY] = s;
  }
  return s;
}

/** Keadaan bus untuk dicatat/dipajang — `off` = mode satu replika (bawaan). */
export function cacheBusState(): CacheBusState {
  const s = bus();
  if (!s.started) return "off";
  if (s.subscribed && s.command?.status === "ready") return "coherent";
  return s.subscriber?.status === "ready" || s.subscriber?.status === "connect" ? "connecting" : "degraded";
}

/** Bus hidup tetapi tidak koheren → cache harus dilewati. */
function coherent(): boolean {
  return cacheBusState() === "coherent";
}

export interface SharedCache {
  /**
   * Umumkan ke replika lain bahwa `key` basi (tanpa `key` = seluruh cache).
   * Pengosongan LOKAL tetap tugas pemanggil, seperti sebelum bus ada — supaya
   * jalur tanpa Redis tidak berubah satu baris pun. Tanpa bus: tidak apa-apa.
   */
  publish(key?: string | number): void;
  /**
   * Bolehkah cache lokal DIBACA sekarang? Tanpa bus selalu `true`. Dengan bus:
   * hanya selama langganan tersambung — selain itu baca ke sumbernya.
   */
  usable(): boolean;
}

/**
 * Daftarkan satu cache tingkat modul. `clear(key)` dipanggil untuk pesan dari
 * replika lain; `clear()` tanpa argumen saat langganan (kembali) tersambung.
 *
 * WAJIB untuk setiap cache tingkat modul yang memegang data kendali yang bisa
 * berubah — dijaga `tests/shared-cache-registry.test.ts`.
 */
export function registerSharedCache(name: string, clear: Clear): SharedCache {
  const s = bus();
  let clears = s.registry.get(name);
  if (!clears) {
    clears = new Set();
    s.registry.set(name, clears);
  }
  clears.add(clear);
  return {
    publish(key) {
      publishBus(CACHE_TOPIC, { name, key: key === undefined ? undefined : String(key) });
    },
    usable() {
      return !bus().started || coherent();
    },
  };
}

/** Kirim pesan ke replika lain. Tanpa bus / koneksi tidak siap: dibuang diam-diam. */
export function publishBus(topic: string, payload: unknown): void {
  const s = bus();
  const command = s.command;
  if (!s.started || !command || command.status !== "ready") return;
  const message = JSON.stringify({ o: s.origin, t: topic, p: payload });
  void command.publish(CACHE_BUS_CHANNEL, message).catch((error: unknown) => {
    console.error("[cache-bus] pesan invalidasi gagal terkirim — TTL yang menyusul:", error);
  });
}

/** Dengarkan topik selain cache (mis. tag Next). Mengembalikan pelepas. */
export function onBusMessage(topic: string, listener: Listener): () => void {
  const s = bus();
  let set = s.listeners.get(topic);
  if (!set) {
    set = new Set();
    s.listeners.set(topic, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

/** Kait yang dijalankan setiap kali langganan (kembali) tersambung. */
export function onBusResync(hook: ResyncHook): void {
  bus().resyncHooks.add(hook);
}

/**
 * Klien perintah Redis yang SIAP, atau `null`. Untuk koordinasi sekilas
 * (pembatas laju, sewa penyimpanan, buku tag Next) — pemakainya wajib punya
 * jalan pulang tanpa Redis.
 */
export function sharedRedis(): BusRedis | null {
  const s = bus();
  if (!s.started || !s.command || s.command.status !== "ready") return null;
  return s.command;
}

/** Kapan langganan terakhir putus — untuk penarik buku tag. */
export function busLostAt(): number | null {
  return bus().lostAt;
}

/** Kosongkan setiap cache terdaftar — pesan selama putus tidak bisa diputar ulang. */
function clearAll(): void {
  for (const clears of bus().registry.values()) for (const clear of clears) safeClear(clear);
}

function safeClear(clear: Clear, key?: string): void {
  try {
    clear(key);
  } catch (error) {
    console.error("[cache-bus] pengosong cache melempar:", error);
  }
}

/** Terapkan satu pesan dari kanal. Diekspor untuk tes. */
export function handleBusMessage(raw: string): void {
  const s = bus();
  let message: { o?: string; t?: string; p?: unknown };
  try {
    message = JSON.parse(raw) as typeof message;
  } catch {
    return;
  }
  if (!message || message.o === s.origin || typeof message.t !== "string") return;

  if (message.t === CACHE_TOPIC) {
    const p = message.p as { name?: unknown; key?: unknown } | undefined;
    if (!p || typeof p.name !== "string") return;
    const key = typeof p.key === "string" ? p.key : undefined;
    for (const clear of s.registry.get(p.name) ?? []) safeClear(clear, key);
    return;
  }
  for (const listener of s.listeners.get(message.t) ?? []) {
    try {
      listener(message.p);
    } catch (error) {
      console.error(`[cache-bus] pendengar topik ${message.t} melempar:`, error);
    }
  }
}

async function resync(): Promise<void> {
  const s = bus();
  clearAll();
  for (const hook of s.resyncHooks) {
    try {
      await hook(s.lostAt);
    } catch (error) {
      console.error("[cache-bus] kait sinkron-ulang melempar:", error);
    }
  }
}

export interface StartCacheBusOptions {
  /** Pembuat klien — disuntik tes. Bawaan: `ioredis`, dimuat dinamis. */
  createClient?: (url: string, role: "command" | "subscriber") => Promise<BusRedis>;
}

async function createIoredisClient(url: string, role: "command" | "subscriber"): Promise<BusRedis> {
  const { Redis } = await import("ioredis");
  return new Redis(url, {
    connectionName: `sai-${role}`,
    /* Perintah ke Redis yang putus GAGAL SEKETIKA alih-alih mengantre: setiap
       pemakai punya jalan pulang tanpa Redis, dan antrean yang menunggu
       koneksi pulih berarti permintaan pengguna yang ikut menunggu. */
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: role === "command" ? 500 : undefined,
    retryStrategy: (times: number) => Math.min(times * 500, 5_000),
  }) as unknown as BusRedis;
}

/**
 * Nyalakan bus. Dipanggil SEKALI dari hook `register` aplikasi Next. Tanpa
 * `CACHE_REDIS_URL` tidak melakukan apa pun dan menjawab `false`.
 *
 * Tidak menunggu koneksi: aplikasi boleh start sementara Redis belum siap —
 * selama itu `usable()` `false` dan cache dilewati.
 */
export async function startCacheBus(options: StartCacheBusOptions = {}): Promise<boolean> {
  const url = process.env.CACHE_REDIS_URL;
  if (!url) return false;
  const s = bus();
  if (s.started) return true;
  s.started = true;

  const create = options.createClient ?? createIoredisClient;
  const command = await create(url, "command");
  const subscriber = await create(url, "subscriber");
  s.command = command;
  s.subscriber = subscriber;

  let lastError = 0;
  const logError = (role: string) => (error: unknown) => {
    // Satu baris per 30 detik — Redis yang mati tidak boleh membanjiri log.
    const now = Date.now();
    if (now - lastError < 30_000) return;
    lastError = now;
    console.error(`[cache-bus] koneksi ${role} ke cache-redis bermasalah — cache dilewati:`, error);
  };
  command.on("error", logError("perintah"));
  subscriber.on("error", logError("langganan"));

  subscriber.on("message", (channel: string, raw: string) => {
    if (channel === CACHE_BUS_CHANNEL) handleBusMessage(raw);
  });
  const lost = () => {
    if (s.subscribed) {
      s.lostAt = Date.now();
      console.warn("[cache-bus] langganan putus — cache lokal dilewati sampai pulih.");
    }
    s.subscribed = false;
  };
  subscriber.on("close", lost);
  subscriber.on("end", lost);
  subscriber.on("ready", () => {
    void subscriber
      .subscribe(CACHE_BUS_CHANNEL)
      .then(async () => {
        // Kosongkan DULU, baru nyatakan koheren — urutannya inti jaminan ini.
        await resync();
        s.subscribed = true;
        console.info("[cache-bus] tersambung ke cache-redis — invalidasi antar-replika aktif.");
      })
      .catch(logError("langganan"));
  });
  return true;
}

/**
 * Hanya untuk tes: matikan bus. Pendaftaran cache DIPERTAHANKAN — modul yang
 * mendaftar saat dimuat tidak dimuat ulang di antara tes.
 */
export function resetCacheBusForTests(): void {
  const s = bus();
  s.started = false;
  s.subscribed = false;
  s.command = null;
  s.subscriber = null;
  s.lostAt = null;
}
