/**
 * Koordinasi sekilas tahap 2 di atas `cache-redis` (09 §3.4): pembatas laju
 * bersama dan sewa penyimpanan bersama. Keduanya punya jalan pulang tanpa
 * Redis, dan jalan pulang itu yang paling penting dijaga — Redis mati tidak
 * boleh berarti pengguna terkunci atau aplikasi menolak start.
 */
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCacheBusForTests, startCacheBus, type BusRedis } from "@sai/platform/cache-bus";
import { checkSharedRateLimit } from "@sai/platform/rate-limit-shared";
import {
  SharedStorageMismatchError,
  assertSharedStorage,
  leaseStorage,
  storageId,
} from "@sai/platform/replica-storage";

/** Redis tiruan dengan semantik INCR/PEXPIRE/SET NX secukupnya. */
class FakeRedis extends EventEmitter {
  status = "connecting";
  kv = new Map<string, { value: string; expiresAt: number | null }>();
  failEval = false;
  async publish() {
    return 1;
  }
  async subscribe() {
    return 1;
  }
  private live(key: string) {
    const e = this.kv.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) this.kv.delete(key);
    return this.kv.get(key);
  }
  async eval(_script: string, _n: number, key: string, windowMs: string) {
    if (this.failEval) throw new Error("Command timed out");
    const e = this.live(key);
    const count = (e ? Number(e.value) : 0) + 1;
    const expiresAt = e?.expiresAt ?? Date.now() + Number(windowMs);
    this.kv.set(key, { value: String(count), expiresAt });
    return [count, expiresAt - Date.now()];
  }
  async set(key: string, value: string, _px: string, ms: number, nx?: string) {
    if (nx === "NX" && this.live(key)) return null;
    this.kv.set(key, { value, expiresAt: Date.now() + ms });
    return "OK";
  }
  async get(key: string) {
    return this.live(key)?.value ?? null;
  }
  async pexpire(key: string, ms: number) {
    const e = this.live(key);
    if (e) e.expiresAt = Date.now() + ms;
    return e ? 1 : 0;
  }
  goReady() {
    this.status = "ready";
    this.emit("ready");
  }
}

const saved = process.env.CACHE_REDIS_URL;
let command: FakeRedis;

async function startWithFake() {
  process.env.CACHE_REDIS_URL = "redis://cache-redis-uji:6379/0";
  command = new FakeRedis();
  const subscriber = new FakeRedis();
  const clients = { command, subscriber };
  await startCacheBus({ createClient: async (_u, role) => clients[role] as unknown as BusRedis });
  command.goReady();
  subscriber.goReady();
}

afterEach(() => {
  if (saved === undefined) delete process.env.CACHE_REDIS_URL;
  else process.env.CACHE_REDIS_URL = saved;
  resetCacheBusForTests();
});

describe("pembatas laju bersama", () => {
  beforeEach(startWithFake);

  it("kuota DIBAGI: penghitungnya di Redis, bukan di memori replika", async () => {
    const key = `uji:${Math.random()}`;
    const opts = { windowMs: 60_000, maxAttempts: 2 };
    expect(await checkSharedRateLimit(key, opts)).toEqual({ allowed: true, remaining: 1 });
    expect(await checkSharedRateLimit(key, opts)).toEqual({ allowed: true, remaining: 0 });
    const denied = await checkSharedRateLimit(key, opts);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect([...command.kv.keys()].some((k) => k.endsWith(key))).toBe(true);
  });

  it("Redis tak menjawab → penghitung memori (berbatas), bukan menolak dan bukan bebas", async () => {
    command.failEval = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = `uji-gagal:${Math.random()}`;
    const opts = { windowMs: 60_000, maxAttempts: 1 };
    expect((await checkSharedRateLimit(key, opts)).allowed).toBe(true);
    expect((await checkSharedRateLimit(key, opts)).allowed).toBe(false);
    warn.mockRestore();
  });
});

describe("penjaga penyimpanan bersama", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sai-replika-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("sidik dibuat sekali dan stabil", async () => {
    const root = { name: "documents", dir: join(dir, "documents") };
    const a = await storageId(root);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(await storageId(root)).toBe(a);
    expect(readFileSync(join(root.dir, ".storage-id"), "utf8").trim()).toBe(a);
  });

  it("volume hanya-baca tanpa sidik: dilewati, tidak dibuat", async () => {
    expect(await storageId({ name: "hasil", dir: join(dir, "hasil"), readOnly: true })).toBeNull();
  });

  it("dua replika atas volume YANG SAMA: keduanya lolos", async () => {
    await startWithFake();
    const root = { name: "documents", dir };
    await assertSharedStorage([root], { waitMs: 0 });
    await assertSharedStorage([root], { waitMs: 0 });
  });

  it("replika atas volume BERBEDA (host lain tanpa penyimpanan bersama): MENOLAK START", async () => {
    await startWithFake();
    const hostA = { name: "documents", dir: join(dir, "a") };
    const hostB = { name: "documents", dir: join(dir, "b") };
    await assertSharedStorage([hostA], { waitMs: 0 });
    await expect(assertSharedStorage([hostB], { waitMs: 0 })).rejects.toBeInstanceOf(SharedStorageMismatchError);
  });

  it("sewa host lama yang mati kedaluwarsa sendiri — host baru boleh start", async () => {
    await startWithFake();
    const redis = command as unknown as BusRedis;
    expect(await leaseStorage(redis, "documents", "host-lama")).toEqual({ ok: true });
    command.kv.get("sai:storage:documents")!.expiresAt = Date.now() - 1;
    expect(await leaseStorage(redis, "documents", "host-baru")).toEqual({ ok: true });
  });

  it("Redis tak terjangkau saat start: PERINGATAN, bukan penolakan", async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-redis-uji:6379/0";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(assertSharedStorage([{ name: "documents", dir }], { waitMs: 0 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
