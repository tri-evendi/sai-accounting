/**
 * PENJAGA bus invalidasi cache tahap 2 (`@sai/platform/cache-bus`).
 *
 * Dua janji yang dijaga di sini, dan keduanya janji kepada produksi yang
 * BELUM memakai replika:
 *
 *   (a) Tanpa `CACHE_REDIS_URL` perilakunya identik dengan sebelum bus ada —
 *       `ioredis` tidak pernah dimuat, `publish` tidak berbuat apa pun,
 *       cache selalu boleh dibaca, pembatas laju = penghitung memori.
 *   (b) Dengan bus menyala, invalidasi dari replika LAIN sampai — terutama
 *       otorisasi: izin yang dicabut di replika 1 tidak boleh tetap berlaku di
 *       replika 2 selama satu TTL. Dan selama bus putus, cache DILEWATI
 *       (lebih lambat, tidak pernah basi).
 *
 * Replika kedua di sini disimulasikan sebagai pesan ber-`origin` lain yang
 * masuk ke `handleBusMessage` — jalur yang sama yang dipakai pendengar pub/sub.
 * Yang TIDAK dibuktikan tes ini: dua proses sungguhan lewat Redis sungguhan
 * (lihat 02 §19 — gladi di satu VM, bukti sebenarnya butuh host kedua).
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ioredis = vi.hoisted(() => ({ loaded: false }));
vi.mock("ioredis", () => {
  ioredis.loaded = true;
  return { Redis: class {}, default: class {} };
});

const db = vi.hoisted(() => ({
  overrides: [] as Array<{ role: string; permission: string; allowed: boolean }>,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rolePermissionOverride: { findMany: async () => db.overrides },
    userPermissionOverride: { findMany: async () => [] },
    companySetting: { findFirst: async () => ({ enabledModules: null }) },
  },
}));

import {
  CACHE_BUS_CHANNEL,
  cacheBusState,
  handleBusMessage,
  publishBus,
  registerSharedCache,
  resetCacheBusForTests,
  startCacheBus,
  type BusRedis,
} from "@sai/platform/cache-bus";
import { checkSharedRateLimit } from "@sai/platform/rate-limit-shared";
import { startReplicaMode } from "@sai/platform/replica-mode";
import { ROLES } from "@sai/core/constants";
import { canEffective, invalidateEffectiveMatrix } from "@/lib/authz-effective";
import { TEST_COMPANY } from "./setup-company-context";
import { berkasSumber, tanpaKomentar } from "./akar-sumber";

/** Klien Redis tiruan: cukup untuk status, event, publish, dan subscribe. */
class FakeRedis extends EventEmitter {
  status = "connecting";
  published: Array<[string, string]> = [];
  async publish(channel: string, message: string) {
    this.published.push([channel, message]);
    return 1;
  }
  async subscribe() {
    return 1;
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

const FINANCE = { id: "2", role: ROLES.FINANCE_MANAGER };
const DENY_INVOICE_WRITE = [{ role: ROLES.FINANCE_MANAGER, permission: "invoice.write", allowed: false }];

function messageFromOtherReplica(name: string, key?: string): string {
  return JSON.stringify({ o: "replika-lain", t: "cache", p: { name, key } });
}

/** Tunggu rantai `.then` di pendengar `ready`. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const savedUrl = process.env.CACHE_REDIS_URL;

beforeEach(async () => {
  db.overrides = [];
  await invalidateEffectiveMatrix();
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env.CACHE_REDIS_URL;
  else process.env.CACHE_REDIS_URL = savedUrl;
  resetCacheBusForTests();
});

describe("(a) tanpa CACHE_REDIS_URL: perilaku hari ini, persis", () => {
  beforeEach(() => {
    delete process.env.CACHE_REDIS_URL;
  });

  it("bus tidak menyala, cache selalu boleh dibaca, publish tidak berbuat apa pun", async () => {
    expect(await startCacheBus()).toBe(false);
    expect(await startReplicaMode({ app: "uji", storageRoots: [] })).toBe(false);
    expect(cacheBusState()).toBe("off");

    const clear = vi.fn();
    const shared = registerSharedCache("uji-a", clear);
    expect(shared.usable()).toBe(true);
    shared.publish(1);
    publishBus("topik", { x: 1 });
    expect(clear).not.toHaveBeenCalled();
  });

  it("pembatas laju = penghitung memori yang sama (kuota, sisa, penolakan)", async () => {
    const key = `uji-a:${Math.random()}`;
    const opts = { windowMs: 60_000, maxAttempts: 2 };
    expect(await checkSharedRateLimit(key, opts)).toEqual({ allowed: true, remaining: 1 });
    expect(await checkSharedRateLimit(key, opts)).toEqual({ allowed: true, remaining: 0 });
    const third = await checkSharedRateLimit(key, opts);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("izin efektif tetap ber-cache 60 dtk seperti sebelum tahap 2", async () => {
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);
    db.overrides = DENY_INVOICE_WRITE;
    // Tanpa invalidasi: cache lama masih menjawab — perilaku satu-replika hari ini.
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);
  });

  it("ioredis TIDAK PERNAH dimuat di seluruh jalur di atas", () => {
    expect(ioredis.loaded).toBe(false);
  });

  it("secara statis: `ioredis` hanya diimpor sebagai TIPE, dan dimuat dinamis di satu tempat", () => {
    const staticImports: string[] = [];
    const dynamicImports: string[] = [];
    for (const f of berkasSumber([".ts", ".tsx"])) {
      const code = tanpaKomentar(f.isi);
      if (/^import\s+(?!type\b)[^;]*from\s+"ioredis"/m.test(code)) staticImports.push(f.rel);
      if (/import\("ioredis"\)/.test(code)) dynamicImports.push(f.rel);
    }
    expect(staticImports).toEqual([]);
    expect(dynamicImports).toEqual(["packages/platform/src/cache-bus.ts"]);
  });

  it("hook `register` kedua aplikasi memuat mode replika HANYA di balik CACHE_REDIS_URL", () => {
    for (const rel of ["src/instrumentation.ts", "apps/operator/src/instrumentation.ts"]) {
      const f = berkasSumber([".ts"]).find((x) => x.rel === rel);
      expect(f, rel).toBeDefined();
      const code = tanpaKomentar(f!.isi);
      expect(code, rel).not.toMatch(/^import[^;]*replica-mode/m);
      const guard = code.indexOf("CACHE_REDIS_URL");
      const load = code.indexOf('import("@sai/platform/replica-mode")');
      expect(guard, rel).toBeGreaterThan(-1);
      expect(load, rel).toBeGreaterThan(guard);
    }
  });
});

describe("(b) bus menyala: invalidasi sampai ke replika lain", () => {
  let command: FakeRedis;
  let subscriber: FakeRedis;

  beforeEach(async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-redis-uji:6379/0";
    command = new FakeRedis();
    subscriber = new FakeRedis();
    const clients = { command, subscriber };
    await startCacheBus({ createClient: async (_url, role) => clients[role] as unknown as BusRedis });
  });

  async function connect() {
    command.goReady();
    subscriber.goReady();
    await flush();
    await flush();
  }

  it("sebelum tersambung cache dilewati; sesudahnya semua cache dikosongkan DULU, baru koheren", async () => {
    const clear = vi.fn();
    const shared = registerSharedCache("uji-b", clear);
    expect(shared.usable()).toBe(false);
    await connect();
    expect(cacheBusState()).toBe("coherent");
    expect(clear).toHaveBeenCalledWith(undefined);
    expect(shared.usable()).toBe(true);
  });

  it("publish mengirim nama + kunci ke kanal; pesan sendiri diabaikan, pesan replika lain diterapkan", async () => {
    await connect();
    const clear = vi.fn();
    const shared = registerSharedCache("uji-c", clear);
    clear.mockClear();

    shared.publish(42);
    expect(command.published).toHaveLength(1);
    const [channel, raw] = command.published[0];
    expect(channel).toBe(CACHE_BUS_CHANNEL);
    expect(JSON.parse(raw).p).toEqual({ name: "uji-c", key: "42" });

    handleBusMessage(raw); // gema pesan sendiri
    expect(clear).not.toHaveBeenCalled();

    handleBusMessage(messageFromOtherReplica("uji-c", "42"));
    expect(clear).toHaveBeenCalledWith("42");
  });

  it("izin yang dicabut di replika lain berhenti berlaku di sini SEKETIKA, bukan sesudah TTL", async () => {
    await connect();
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);

    // Replika 1 menulis override dan mengosongkan cache-NYA sendiri…
    db.overrides = DENY_INVOICE_WRITE;
    // …di replika ini cache masih memegang matriks lama:
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);

    // …sampai pesannya tiba.
    handleBusMessage(messageFromOtherReplica("authz", String(TEST_COMPANY.companyId)));
    expect(await canEffective(FINANCE, "invoice.write")).toBe(false);
  });

  it("pesan untuk perusahaan LAIN tidak membuang cache perusahaan ini", async () => {
    await connect();
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);
    db.overrides = DENY_INVOICE_WRITE;
    handleBusMessage(messageFromOtherReplica("authz", String(TEST_COMPANY.companyId + 1)));
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);
  });

  it("invalidasi lokal MENGUMUMKAN id perusahaannya", async () => {
    await connect();
    await invalidateEffectiveMatrix();
    const pesan = command.published.map(([, raw]) => JSON.parse(raw).p);
    expect(pesan).toContainEqual({ name: "authz", key: String(TEST_COMPANY.companyId) });
  });

  it("langganan putus → cache DILEWATI (lebih lambat, tidak basi); pulih → dikosongkan lalu dipakai lagi", async () => {
    await connect();
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);

    subscriber.goDown();
    expect(cacheBusState()).not.toBe("coherent");
    // Pesan pencabutan TERLEWAT selama putus — tapi pembacaan langsung ke DB:
    db.overrides = DENY_INVOICE_WRITE;
    expect(await canEffective(FINANCE, "invoice.write")).toBe(false);

    subscriber.goReady();
    await flush();
    await flush();
    expect(cacheBusState()).toBe("coherent");
    expect(await canEffective(FINANCE, "invoice.write")).toBe(false);
  });

  it("pesan rusak tidak melempar dan tidak mengosongkan apa pun", async () => {
    await connect();
    const clear = vi.fn();
    registerSharedCache("uji-d", clear);
    clear.mockClear();
    handleBusMessage("bukan json");
    handleBusMessage(JSON.stringify({ o: "x", t: "cache", p: { name: 7 } }));
    expect(clear).not.toHaveBeenCalled();
  });
});
