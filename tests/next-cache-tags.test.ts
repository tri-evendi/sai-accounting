/**
 * PENJAGA handler cache Next tahap 2 (`@sai/platform/next-cache-tags` lewat
 * `replica-mode`).
 *
 * Dua bagian:
 *
 *   1. KENARI terhadap Next yang terpasang. Handler dipasang lewat kait global
 *      `Symbol.for('@next/cache-handlers')` dan menulis ke peta tag
 *      `tags-manifest.external` — keduanya TIDAK terdokumentasi. Peningkatan
 *      Next yang mencabut salah satunya tidak akan menggagalkan build; ia
 *      membuat invalidasi antar-replika diam-diam berhenti. Tes ini yang merah.
 *
 *   2. PERILAKU dengan handler BAWAAN Next yang sungguhan (bukan tiruan): tag
 *      yang dibasikan replika lain sampai ke peta tag proses ini, dan peta itu
 *      yang dibaca `unstable_cache` (`IncrementalCache.get` → `areTagsExpired`).
 *
 * Yang tidak dibuktikan di sini: bahwa bundel Turbopack memakai SATU instans
 * `tags-manifest.external` dengan server Next. Konvensi `.external` Next
 * menjanjikannya (berkas itu tidak dibundel), tetapi buktinya butuh build +
 * dua replika — 02 §19.
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";
import {
  handleBusMessage,
  resetCacheBusForTests,
  startCacheBus,
  type BusRedis,
} from "@sai/platform/cache-bus";
import {
  NEXT_CACHE_HANDLERS_SYMBOL,
  NEXT_DEFAULT_CACHE_MAX_BYTES,
  NEXT_TAGS_LEDGER_KEY,
  createSharedTagCacheHandler,
  installNextCacheHandlers,
} from "@sai/platform/next-cache-tags";

const require = createRequire(join(AKAR_REPO, "package.json"));
const nextDist = (rel: string) => readFileSync(require.resolve(`next/dist/${rel}`), "utf8");

type TagsManifestModule = {
  tagsManifest: Map<string, { expired?: number; stale?: number }>;
  areTagsExpired: (tags: string[], timestamp: number) => boolean;
};
const manifest = require("next/dist/server/lib/incremental-cache/tags-manifest.external") as TagsManifestModule;
const { createDefaultCacheHandler } = require("next/dist/server/lib/cache-handlers/default") as {
  createDefaultCacheHandler: (max: number) => import("next/dist/server/lib/cache-handlers/types").CacheHandler;
};

describe("kenari: Next yang terpasang masih punya kait yang dipakai handler ini", () => {
  it("`initializeCacheHandlers` membaca DefaultCache/RemoteCache dari Symbol.for('@next/cache-handlers')", () => {
    const src = nextDist("server/use-cache/handlers.js");
    expect(src).toContain("Symbol.for('@next/cache-handlers')");
    expect(src).toMatch(/\.DefaultCache\b/);
    expect(src).toMatch(/\.RemoteCache\b/);
  });

  it("`unstable_cache` (IncrementalCache) menilai tag lewat peta `tags-manifest.external` yang sama", () => {
    const src = nextDist("server/lib/incremental-cache/index.js");
    expect(src).toContain("tags-manifest.external");
    expect(src).toContain("areTagsExpired");
  });

  it("handler bawaan menulis ke peta yang sama, dan ukuran bawaannya masih 50 MB", () => {
    expect(nextDist("server/lib/cache-handlers/default.js")).toContain("tags-manifest.external");
    expect(nextDist("server/config-shared.js")).toContain("cacheMaxMemorySize: 50 * 1024 * 1024");
    expect(NEXT_DEFAULT_CACHE_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it("revalidateTag memanggil `updateTags` setiap handler terpasang", () => {
    expect(nextDist("server/revalidation-utils.js")).toMatch(/handler\.updateTags/);
  });
});

class FakeRedis extends EventEmitter {
  status = "connecting";
  published: Array<[string, string]> = [];
  hash: Record<string, string> = {};
  async publish(channel: string, message: string) {
    this.published.push([channel, message]);
    return 1;
  }
  async subscribe() {
    return 1;
  }
  async hset(_key: string, fields: Record<string, string>) {
    Object.assign(this.hash, fields);
    return Object.keys(fields).length;
  }
  async pexpire() {
    return 1;
  }
  async hgetall() {
    return { ...this.hash };
  }
  goReady() {
    this.status = "ready";
    this.emit("ready");
  }
  goDown() {
    this.status = "reconnecting";
    this.emit("close");
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * `areTagsExpired` menuntut `expired <= Date.now()`, sementara handler bawaan
 * mencap `expired` dari `performance.timeOrigin + performance.now()` yang
 * dibulatkan — di mesin yang sibuk keduanya bisa berselisih satu-dua
 * milidetik. Tunggu sebentar sebelum menilai, seperti permintaan berikutnya.
 */
const settle = () => new Promise((r) => setTimeout(r, 25));

describe("buku tag bersama di atas handler bawaan Next", () => {
  let command: FakeRedis;
  let subscriber: FakeRedis;
  const saved = process.env.CACHE_REDIS_URL;

  beforeEach(async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-redis-uji:6379/0";
    command = new FakeRedis();
    subscriber = new FakeRedis();
    const clients = { command, subscriber };
    await startCacheBus({ createClient: async (_u, role) => clients[role] as unknown as BusRedis });
    command.goReady();
    subscriber.goReady();
    await flush();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.CACHE_REDIS_URL;
    else process.env.CACHE_REDIS_URL = saved;
    resetCacheBusForTests();
  });

  it("tag yang dibasikan replika LAIN membasikan isi `unstable_cache` di proses ini", async () => {
    createSharedTagCacheHandler(createDefaultCacheHandler(NEXT_DEFAULT_CACHE_MAX_BYTES));
    const tag = `uji-tag-${Math.random()}`;
    const entryCreatedAt = Date.now() - 1_000;
    expect(manifest.areTagsExpired([tag], entryCreatedAt)).toBe(false);

    handleBusMessage(JSON.stringify({ o: "replika-lain", t: "next-tags", p: { tags: [tag] } }));
    await flush();
    await settle();

    expect(manifest.areTagsExpired([tag], entryCreatedAt)).toBe(true);
  });

  it("`updateTags` lokal: peta lokal + pesan bus + baris di buku tag", async () => {
    const handler = createSharedTagCacheHandler(createDefaultCacheHandler(NEXT_DEFAULT_CACHE_MAX_BYTES));
    const tag = `uji-tag-${Math.random()}`;
    const before = Date.now() - 1_000;
    await handler.updateTags([tag]);
    await settle();

    expect(manifest.areTagsExpired([tag], before)).toBe(true);
    const sent = command.published.map(([, raw]) => JSON.parse(raw));
    expect(sent).toContainEqual(expect.objectContaining({ t: "next-tags", p: { tags: [tag] } }));
    expect(JSON.parse(command.hash[tag]).at).toBeGreaterThanOrEqual(before);
    expect(NEXT_TAGS_LEDGER_KEY).toMatch(/^sai:/);
  });

  it("pesan yang TERLEWAT selama putus ditarik dari buku tag saat langganan pulih", async () => {
    createSharedTagCacheHandler(createDefaultCacheHandler(NEXT_DEFAULT_CACHE_MAX_BYTES));
    const tag = `uji-tag-${Math.random()}`;
    const entryCreatedAt = Date.now() - 1_000;

    subscriber.goDown();
    // Replika lain menulis buku tag selama langganan kita putus — pesannya hilang.
    command.hash[tag] = JSON.stringify({ at: Date.now() });
    expect(manifest.areTagsExpired([tag], entryCreatedAt)).toBe(false);

    subscriber.goReady();
    await flush();
    await settle();
    expect(manifest.areTagsExpired([tag], entryCreatedAt)).toBe(true);
  });

  it("dipasang di kait global sebagai `default` dan `remote`", async () => {
    const g = globalThis as unknown as Record<symbol, Record<string, unknown> | undefined>;
    const before = g[NEXT_CACHE_HANDLERS_SYMBOL];
    try {
      await installNextCacheHandlers();
      const installed = g[NEXT_CACHE_HANDLERS_SYMBOL]!;
      expect(installed.DefaultCache).toBeDefined();
      expect(installed.RemoteCache).toBe(installed.DefaultCache);
      expect(installed.FetchCache).toBeUndefined();
    } finally {
      g[NEXT_CACHE_HANDLERS_SYMBOL] = before;
    }
  });
});
