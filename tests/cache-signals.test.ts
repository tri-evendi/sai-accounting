/**
 * SINYAL INVALIDASI CACHE LINTAS PROSES — tulisan konsol sampai ke
 * `app-customer` dalam `CACHE_SIGNAL_POLL_SECONDS`, bukan sesudah umur cache.
 *
 * Yang dibuktikan:
 *   1. mekanismenya (`@sai/platform/cache-signals`): satu query per selang per
 *      proses, permintaan bersamaan berbagi satu query, gagal-lunak, dan
 *      penulis melihat tulisannya sendiri seketika;
 *   2. jalur invalidasi sungguhan, dengan "proses lain" yang hanya menaikkan
 *      baris sinyal di basis data bersama (seperti konsol): pengumuman status,
 *      logo, pengaturan situs, dan isi halaman depan berubah sesudah satu
 *      selang baca, padahal umur cache-nya jauh lebih panjang;
 *   3. migration 0009 di PostgreSQL sungguhan (PGlite) dan bentuk SQL kenaikan;
 *   4. penjaga sumber: setiap nama sinyal punya penulis DAN pembaca. Sinyal
 *      yang hanya dibaca tidak pernah naik; sinyal yang hanya dinaikkan tidak
 *      membuang apa pun. Keduanya lulus diam-diam tanpa penjaga ini.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

import {
  CACHE_SIGNAL_NAMES,
  CACHE_SIGNAL_NAME_PATTERN,
  CACHE_SIGNAL_POLL_SECONDS,
} from "@sai/core/cache-signals";
import {
  bumpCacheSignal,
  cacheSignalVersion,
  resetCacheSignalsForTests,
  signalAllows,
} from "@sai/platform/cache-signals";
import { cachedStatusNoticeRecords, invalidateStatusNoticeCache } from "@sai/platform/status-notices-store";
import { cachedBrandMark, invalidateBrandMarkCache } from "@sai/platform/brand-assets";
import { berkasSumber, tanpaKomentar } from "./akar-sumber";

const POLL_MS = CACHE_SIGNAL_POLL_SECONDS * 1000;

/** Basis data platform BERSAMA: baris sinyal yang dibaca setiap proses. */
function sharedSignals() {
  const rows = new Map<string, number>();
  const calls = { findMany: 0, upsert: 0 };
  const cacheSignal = {
    findMany: vi.fn(async () => {
      calls.findMany += 1;
      return [...rows].map(([name, version]) => ({ name, version }));
    }),
    upsert: vi.fn(async (args: { where: { name: string } }) => {
      calls.upsert += 1;
      rows.set(args.where.name, (rows.get(args.where.name) ?? 0) + 1);
      return {};
    }),
  };
  /** Tulisan dari PROSES LAIN: hanya barisnya yang naik, keadaan lokal tidak disentuh. */
  const bumpElsewhere = (name: string) => rows.set(name, (rows.get(name) ?? 0) + 1);
  return { rows, calls, cacheSignal, bumpElsewhere };
}

beforeEach(() => {
  resetCacheSignalsForTests();
});

describe("mekanisme sinyal", () => {
  it("satu query per selang baca, berapa pun jumlah pembacanya", async () => {
    const db = sharedSignals();
    const t0 = 1_000_000;
    expect(await cacheSignalVersion(db, "site-settings", t0)).toBe(0);
    expect(await cacheSignalVersion(db, "brand-mark", t0 + 10)).toBe(0);
    expect(await cacheSignalVersion(db, "site-content", t0 + POLL_MS - 1)).toBe(0);
    expect(db.calls.findMany).toBe(1);

    db.bumpElsewhere("site-content");
    expect(await cacheSignalVersion(db, "site-content", t0 + POLL_MS - 1), "masih di dalam selang").toBe(0);
    expect(await cacheSignalVersion(db, "site-content", t0 + POLL_MS), "selang habis → dibaca ulang").toBe(1);
    expect(db.calls.findMany).toBe(2);
  });

  it("permintaan yang datang bersamaan berbagi satu query", async () => {
    const db = sharedSignals();
    const versions = await Promise.all(
      Array.from({ length: 20 }, () => cacheSignalVersion(db, "status-notices", 5_000))
    );
    expect(versions.every((v) => v === 0)).toBe(true);
    expect(db.calls.findMany).toBe(1);
  });

  it("penulis melihat tulisannya sendiri seketika, tanpa menunggu selang", async () => {
    const db = sharedSignals();
    const now = 2_000_000;
    expect(await cacheSignalVersion(db, "site-settings", now)).toBe(0);
    await bumpCacheSignal(db, "site-settings");
    expect(db.rows.get("site-settings")).toBe(1);
    expect(await cacheSignalVersion(db, "site-settings", now + 1)).toBe(1);
  });

  it("klien tanpa model sinyal (tiruan tes, image lama) = versi tidak diketahui, bukan galat", async () => {
    expect(await cacheSignalVersion({}, "site-settings")).toBeNull();
    expect(await cacheSignalVersion(null, "site-settings")).toBeNull();
    await expect(bumpCacheSignal({}, "site-settings")).resolves.toBeUndefined();
  });

  it("tabel belum dimigrasikan / platform mati: `null`, dan kenaikan yang gagal tidak melempar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      cacheSignal: {
        findMany: async () => {
          throw new Error('relation "cache_signals" does not exist');
        },
        upsert: async () => {
          throw new Error("platform tak terjangkau");
        },
      },
    };
    expect(await cacheSignalVersion(broken, "site-content", 9_000_000)).toBeNull();
    await expect(bumpCacheSignal(broken, "site-content")).resolves.toBeUndefined();
    warn.mockRestore();
    error.mockRestore();
  });

  it("versi tidak diketahui tidak membatalkan cache; versi yang berbeda membatalkannya", () => {
    expect(signalAllows(3, null)).toBe(true);
    expect(signalAllows(3, 3)).toBe(true);
    expect(signalAllows(3, 4)).toBe(false);
    expect(signalAllows(null, 4)).toBe(false);
  });
});

describe("jalur invalidasi: tulisan dari proses lain sampai dalam satu selang baca", () => {
  afterEach(() => {
    invalidateStatusNoticeCache();
    invalidateBrandMarkCache();
  });

  it("pengumuman status: umur cache 60 detik, tetapi berubah sesudah 5 detik", async () => {
    const db = sharedSignals();
    let rows = [{ id: 1, phase: "investigating" }];
    const platform = {
      cacheSignal: db.cacheSignal,
      statusNotice: { findMany: vi.fn(async () => rows) },
    } as never;

    const t0 = new Date(10_000_000);
    expect(await cachedStatusNoticeRecords({ platform }, t0)).toEqual([{ id: 1, phase: "investigating" }]);

    // Konsol (proses lain) menulis lalu menaikkan sinyalnya.
    rows = [{ id: 1, phase: "resolved" }];
    db.bumpElsewhere("status-notices");

    const masihDiSelang = new Date(t0.getTime() + POLL_MS - 1);
    expect(await cachedStatusNoticeRecords({ platform }, masihDiSelang)).toEqual([{ id: 1, phase: "investigating" }]);
    const sesudahSelang = new Date(t0.getTime() + POLL_MS);
    expect(await cachedStatusNoticeRecords({ platform }, sesudahSelang)).toEqual([{ id: 1, phase: "resolved" }]);
    expect(POLL_MS).toBeLessThan(60_000);
  });

  it("tanpa tulisan, cache tetap dipakai (sinyal tidak menambah baca data)", async () => {
    const db = sharedSignals();
    const findMany = vi.fn(async () => []);
    const platform = { cacheSignal: db.cacheSignal, statusNotice: { findMany } } as never;
    const t0 = 20_000_000;
    for (let i = 0; i < 5; i++) await cachedStatusNoticeRecords({ platform }, new Date(t0 + i * POLL_MS));
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("logo: logo yang diganti di konsol dipakai proses lain sesudah satu selang", async () => {
    const db = sharedSignals();
    let sha256 = "a".repeat(64);
    const platform = {
      cacheSignal: db.cacheSignal,
      brandAsset: {
        findFirst: vi.fn(async () => ({
          sha256,
          mimeType: "image/png",
          width: 256,
          height: 256,
          createdBy: "op",
          createdAt: new Date(0),
        })),
      },
    } as never;
    const t0 = 30_000_000;
    expect((await cachedBrandMark({ platform }, t0))?.sha256).toBe("a".repeat(64));
    sha256 = "b".repeat(64);
    db.bumpElsewhere("brand-mark");
    expect((await cachedBrandMark({ platform }, t0 + 1))?.sha256).toBe("a".repeat(64));
    expect((await cachedBrandMark({ platform }, t0 + POLL_MS))?.sha256).toBe("b".repeat(64));
  });
});

/* ── Pengaturan situs & isi halaman depan: `unstable_cache` dengan versi di kuncinya ── */

const fake = vi.hoisted(() => ({
  signals: new Map<string, number>(),
  settings: { selfServeSignupOpen: false as boolean | null, ppnEnabled: true as boolean | null },
  published: [] as { key: string; value: string | null }[],
  settingsReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  /* Tiruan `unstable_cache` yang SUNGGUH menyimpan per argumen dan tidak
     pernah kedaluwarsa sendiri — jadi satu-satunya yang bisa membuat baca
     ulang adalah argumen (versi sinyal) yang berubah. */
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
    const memo = new Map<string, Promise<unknown>>();
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key);
    };
  },
}));
vi.mock("@sai/platform/platform-db", () => ({
  platformDb: {
    cacheSignal: {
      findMany: async () => [...fake.signals].map(([name, version]) => ({ name, version })),
      upsert: async (args: { where: { name: string } }) => {
        fake.signals.set(args.where.name, (fake.signals.get(args.where.name) ?? 0) + 1);
      },
    },
    siteSetting: {
      findUnique: async () => {
        fake.settingsReads += 1;
        return {
          contactWhatsapp: null,
          contactEmail: null,
          manualPaymentInstructions: null,
          selfServeSignupOpen: fake.settings.selfServeSignupOpen,
          ppnEnabled: fake.settings.ppnEnabled,
          updatedBy: "op",
          updatedAt: new Date(0),
        };
      },
    },
    siteContentEntry: {
      findMany: async () => fake.published,
    },
  },
}));

describe("pengaturan situs & isi halaman depan di `app-customer`", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(50_000_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gerbang pendaftaran yang dibuka konsol terbuka di halaman publik sesudah satu selang", async () => {
    const { resolveSelfServeSignupOpen, resolvePpnEnabled } = await import("@sai/platform/site-settings");
    fake.settings = { selfServeSignupOpen: false, ppnEnabled: true };
    expect(await resolveSelfServeSignupOpen()).toBe(false);
    expect(await resolvePpnEnabled()).toBe(true);

    // Konsol: barisnya berubah, sinyalnya naik — di proses lain.
    fake.settings = { selfServeSignupOpen: true, ppnEnabled: false };
    fake.signals.set("site-settings", (fake.signals.get("site-settings") ?? 0) + 1);

    expect(await resolveSelfServeSignupOpen(), "masih di dalam selang").toBe(false);
    vi.advanceTimersByTime(POLL_MS);
    expect(await resolveSelfServeSignupOpen()).toBe(true);
    expect(await resolvePpnEnabled()).toBe(false);
  });

  it("tanpa tulisan, baris pengaturan tidak dibaca ulang meski selang berlalu", async () => {
    const { siteSettings } = await import("@sai/platform/site-settings");
    await siteSettings();
    const reads = fake.settingsReads;
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(POLL_MS);
      await siteSettings();
    }
    expect(fake.settingsReads).toBe(reads);
  });

  it("isi yang diterbitkan konsol tampil sesudah satu selang", async () => {
    const { publishedSiteContent } = await import("@sai/platform/site-content-store");
    fake.published = [{ key: "landing.heroHeading", value: "Lama" }];
    expect(await publishedSiteContent("id")).toEqual({ "landing.heroHeading": "Lama" });

    fake.published = [{ key: "landing.heroHeading", value: "Baru" }];
    fake.signals.set("site-content", (fake.signals.get("site-content") ?? 0) + 1);
    vi.advanceTimersByTime(POLL_MS);
    expect(await publishedSiteContent("id")).toEqual({ "landing.heroHeading": "Baru" });
  });
});

/* ───────────────────────── Migration 0009 di PostgreSQL ───────────────────────── */

describe("migration platform 0009 (PGlite)", () => {
  const DIR = join(process.cwd(), "prisma/postgresql/platform");

  it("terpasang di atas 0001–0008, bisa diulang, dan menolak nama yang salah bentuk", async () => {
    const db = new PGlite();
    try {
      for (const name of readdirSync(DIR).sort()) {
        await db.exec(readFileSync(join(DIR, name, "migration.sql"), "utf8"));
      }
      await db.exec(readFileSync(join(DIR, "0009_cache_signals", "migration.sql"), "utf8"));

      /* Bentuk yang dikirim Prisma untuk `upsert` + `increment`. */
      const bump = (name: string) =>
        db.query(
          `INSERT INTO cache_signals (name, version, updated_at) VALUES ($1, 1, now())
           ON CONFLICT (name) DO UPDATE SET version = cache_signals.version + 1, updated_at = now()`,
          [name]
        );
      for (const name of CACHE_SIGNAL_NAMES) await bump(name);
      await bump("site-settings");
      const { rows } = await db.query<{ name: string; version: number }>(
        `SELECT name, version FROM cache_signals ORDER BY name`
      );
      expect(Object.fromEntries(rows.map((r) => [r.name, r.version]))["site-settings"]).toBe(2);
      expect(rows).toHaveLength(CACHE_SIGNAL_NAMES.length);

      await expect(bump("Site Settings")).rejects.toThrow(/cache_signals_name_check/);
    } finally {
      await db.close();
    }
    }, 120_000);

  it("setiap nama sinyal lolos CHECK basis data", () => {
    for (const name of CACHE_SIGNAL_NAMES) expect(name).toMatch(CACHE_SIGNAL_NAME_PATTERN);
    const sql = readFileSync(join(DIR, "0009_cache_signals", "migration.sql"), "utf8");
    expect(sql).toContain(`'${CACHE_SIGNAL_NAME_PATTERN.source}'`);
  });
});

/* ─────────────────────── Penjaga: penulis DAN pembaca ─────────────────────── */

describe("setiap sinyal punya penulis dan pembaca", () => {
  const sumber = [
    ...berkasSumber([".ts", ".tsx"]),
    ...readdirSync(join(process.cwd(), "scripts"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ rel: `scripts/${f}`, isi: readFileSync(join(process.cwd(), "scripts", f), "utf8") })),
  ]
    .filter((f) => !f.rel.includes(".test.") && !f.rel.endsWith("cache-signals.ts"))
    .map((f) => ({ rel: f.rel, isi: tanpaKomentar(f.isi) }));

  for (const name of CACHE_SIGNAL_NAMES) {
    it(`"${name}"`, () => {
      const penulis = sumber.filter((f) => f.isi.includes(`bumpCacheSignal(`) && f.isi.includes(`"${name}"`));
      const pembaca = sumber.filter((f) => new RegExp(`cacheSignalVersion\\([^)]*"${name}"`).test(f.isi));
      expect(penulis.map((f) => f.rel), `tidak ada yang menaikkan "${name}"`).not.toEqual([]);
      expect(pembaca.map((f) => f.rel), `tidak ada yang membaca "${name}"`).not.toEqual([]);
    });
  }

  it("tidak ada lagi `updateTag` yang berpura-pura menjangkau app-customer", () => {
    const pelanggar = sumber.filter((f) => /\bupdateTag\(/.test(f.isi)).map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });
});

describe("build tanpa basis data (CI)", () => {
  it("klien platform yang MELEMPAR saat diakses → versi tak diketahui, bukan galat", async () => {
    const { cacheSignalVersion } = await import("@sai/platform/cache-signals");
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("PLATFORM_DATABASE_URL is not set");
        },
      }
    );
    await expect(cacheSignalVersion(throwing, "brand-mark")).resolves.toBeNull();
  });
});
