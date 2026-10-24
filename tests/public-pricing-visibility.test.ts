/**
 * HARGA PUBLIK BISA DISEMBUNYIKAN (alur demo-first, migration platform 0013) —
 * dan paket bisa ditampilkan/disembunyikan dari konsol `/plans`.
 *
 * Yang dijaga di sini, empat janji yang kalau meleset tidak berbunyi:
 *
 *   1. **Bawaannya TAMPIL.** Kolom `null`, baris tidak ada, atau platform tak
 *      terbaca → harga tetap tampil (perilaku sebelum kolomnya ada). Kehilangan
 *      informasi tidak boleh diam-diam mencabut halaman harga.
 *   2. **Simpan dari konsol tercatat dengan nilai LAMA dan BARU** — dan
 *      diteruskan ke penulis, bukan hanya ke jejak.
 *   3. **Sakelar paket** hanya menulis bila berubah, menolak memajang paket
 *      gratis non-rundingan, menaikkan sinyal katalog, dan tercatat beserta
 *      alasannya.
 *   4. **`db:seed:plans` tidak menimpa `is_public`** paket yang sudah ada —
 *      kalau tidak, setiap rilis membatalkan keputusan operator.
 *
 * Perenderan halaman publik saat harga disembunyikan diuji di
 * `tests/public-landing.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { publicPricingVisibleFrom } from "@sai/core/site-settings-core";
import { quoteContactHref } from "@/lib/landing-ask";
import { catalogFlagSync } from "../scripts/seed-plans-flags";
import { setPlanPublic, type PlanVisibilityDb } from "@op/lib/operator/plan-visibility";

/* ── tiruan untuk server action konsol ─────────────────────────────────── */

const audit = vi.fn();
const saveSiteSettings = vi.fn();
const state = {
  session: { operator: { name: "vyn", role: "owner" } } as { operator: { name: string; role: string } } | null,
  row: null as Record<string, unknown> | null | "unreachable",
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@sai/platform/i18n/server", () => ({ getT: async () => (k: string) => k }));
vi.mock("@op/lib/operator/audit", () => ({ writeOperatorAuditLog: (e: unknown) => audit(e) }));
vi.mock("@op/lib/operator/guard", () => ({
  requireOperatorActionSession: async () => state.session,
}));
vi.mock("@sai/platform/site-settings", () => ({
  saveSiteSettings: (input: unknown) => saveSiteSettings(input),
  saveTrialRetention: async () => {},
  resetSiteSettings: async () => {},
  siteSettingsForOperator: async () => state.row,
}));

/* Klien platform tiruan untuk server action `/plans` — hanya model `plan`;
   tanpa `cacheSignal`, jadi `bumpCacheSignal` melewatinya (lihat kepalanya). */
const planUpdate = vi.fn(async () => ({}));
const planRow = { key: "starter", isPublic: true, priceMonthly: "249000.00", contactOnly: false };
vi.mock("@sai/platform/platform-db", () => ({
  platformDb: { plan: { findUnique: async () => planRow, update: planUpdate } },
}));

const { operatorSaveSiteSettings } = await import("@op/app/(operator)/settings/actions");
const { operatorSetPlanPublic } = await import("@op/app/(operator)/plans/actions");

const FORM = {
  contactWhatsapp: "628123456789",
  contactEmail: "sales@contoh.id",
  manualPaymentInstructions: "",
  selfServeSignup: "env" as const,
  ppn: "env" as const,
  publicPricing: "on" as const,
};

beforeEach(() => {
  audit.mockReset();
  saveSiteSettings.mockReset();
  planUpdate.mockClear();
  state.session = { operator: { name: "vyn", role: "owner" } };
  state.row = null;
});

describe("publicPricingVisibleFrom — bawaan TAMPIL", () => {
  it("baris tidak ada / platform tak terbaca (null) → tampil", () => {
    expect(publicPricingVisibleFrom(null)).toBe(true);
  });

  it("kolom null / belum ada (baris sebelum migration 0013) → tampil", () => {
    expect(publicPricingVisibleFrom({ publicPricingVisible: null })).toBe(true);
    expect(publicPricingVisibleFrom({})).toBe(true);
  });

  it("hanya `false` yang menyembunyikan", () => {
    expect(publicPricingVisibleFrom({ publicPricingVisible: true })).toBe(true);
    expect(publicPricingVisibleFrom({ publicPricingVisible: false })).toBe(false);
  });
});

describe("quoteContactHref — tujuan 'Minta penawaran' saat harga disembunyikan", () => {
  it("pendaftaran tertutup → /register (yang saat itu halaman kontak)", () => {
    expect(quoteContactHref(false)).toBe("/register");
  });

  it("pendaftaran terbuka → layar penawaran /register?quote=1, bukan formulir daftar", () => {
    expect(quoteContactHref(true)).toBe("/register?quote=1");
  });
});

describe("operatorSaveSiteSettings — harga publik tersimpan & tercatat", () => {
  it("menyembunyikan: penulis menerima false, jejak memuat dari-null-ke-false", async () => {
    const res = await operatorSaveSiteSettings({ ...FORM, publicPricing: "off" });
    expect(res.ok).toBe(true);
    expect(saveSiteSettings).toHaveBeenCalledWith(
      expect.objectContaining({ publicPricingVisible: false, actor: "vyn" })
    );
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = audit.mock.calls[0][0] as { action: string; details: Record<string, unknown> };
    expect(entry.action).toBe("operator.settings.update");
    expect(entry.details.publicPricingFrom).toBeNull();
    expect(entry.details.publicPricingTo).toBe(false);
  });

  it("menampilkan lagi: nilai lama dari baris ikut tercatat", async () => {
    state.row = { publicPricingVisible: false, contactWhatsapp: null, contactEmail: null };
    await operatorSaveSiteSettings(FORM);
    const entry = audit.mock.calls[0][0] as { details: Record<string, unknown> };
    expect(entry.details.publicPricingFrom).toBe(false);
    expect(entry.details.publicPricingTo).toBe(true);
    expect(saveSiteSettings).toHaveBeenCalledWith(expect.objectContaining({ publicPricingVisible: true }));
  });

  it("nilai di luar on/off ditolak — tidak ada tulisan, tidak ada jejak", async () => {
    const res = await operatorSaveSiteSettings({ ...FORM, publicPricing: "env" });
    expect(res.ok).toBe(false);
    expect(saveSiteSettings).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("tanpa sesi berizin: ditolak sebelum apa pun ditulis", async () => {
    state.session = null;
    const res = await operatorSaveSiteSettings({ ...FORM, publicPricing: "off" });
    expect(res.ok).toBe(false);
    expect(saveSiteSettings).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

/* ── sakelar paket ─────────────────────────────────────────────────────── */

function fakeDb(plan: { key: string; isPublic: boolean; priceMonthly: string; contactOnly: boolean } | null) {
  const update = vi.fn(async () => ({}));
  const upsert = vi.fn(async () => ({}));
  const db = {
    plan: { findUnique: vi.fn(async () => plan), update },
    cacheSignal: { findMany: async () => [], upsert },
  };
  return { db: db as unknown as PlanVisibilityDb, update, upsert };
}

describe("setPlanPublic — sakelar tampil/tersembunyi satu paket", () => {
  it("menyembunyikan paket publik: menulis, menaikkan sinyal katalog, melaporkan dari→ke", async () => {
    const { db, update, upsert } = fakeDb({ key: "pro", isPublic: true, priceMonthly: "599000.00", contactOnly: false });
    const res = await setPlanPublic(db, { planId: 2, isPublic: false });
    expect(res).toEqual({ outcome: "ok", key: "pro", from: true, to: false });
    expect(update).toHaveBeenCalledWith({ where: { id: 2 }, data: { isPublic: false } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: "plan-catalog" } }));
  });

  it("sudah dalam keadaan itu → tidak menulis apa pun", async () => {
    const { db, update } = fakeDb({ key: "pro", isPublic: true, priceMonthly: "599000.00", contactOnly: false });
    expect(await setPlanPublic(db, { planId: 2, isPublic: true })).toEqual({ outcome: "unchanged", key: "pro" });
    expect(update).not.toHaveBeenCalled();
  });

  it("paket gratis non-rundingan (`internal`) tidak bisa dipajang", async () => {
    const { db, update } = fakeDb({ key: "internal", isPublic: false, priceMonthly: "0.00", contactOnly: false });
    expect(await setPlanPublic(db, { planId: 1, isPublic: true })).toEqual({ outcome: "free_plan", key: "internal" });
    expect(update).not.toHaveBeenCalled();
  });

  it("paket rundingan berharga 0 (`enterprise`) BOLEH dipajang — kartunya tanpa nominal", async () => {
    const { db } = fakeDb({ key: "enterprise", isPublic: false, priceMonthly: "0.00", contactOnly: true });
    expect((await setPlanPublic(db, { planId: 5, isPublic: true })).outcome).toBe("ok");
  });

  it("paket tidak ada → not_found", async () => {
    const { db } = fakeDb(null);
    expect(await setPlanPublic(db, { planId: 99, isPublic: true })).toEqual({ outcome: "not_found" });
  });
});

describe("operatorSetPlanPublic — alasan wajib, izin, jejak", () => {
  const update = planUpdate;

  it("tanpa alasan ditolak — tidak ada tulisan", async () => {
    const res = await operatorSetPlanPublic({ planId: 3, isPublic: false, reason: "" });
    expect(res.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("dengan alasan: ditulis dan tercatat dengan nilai lama, baru, dan alasannya", async () => {
    const res = await operatorSetPlanPublic({ planId: 3, isPublic: false, reason: "harga per pelanggan" });
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { isPublic: false } });
    const entry = audit.mock.calls[0][0] as { action: string; details: Record<string, unknown> };
    expect(entry.action).toBe("operator.plans.visibility");
    expect(entry.details).toMatchObject({
      planKey: "starter",
      isPublicFrom: true,
      isPublicTo: false,
      reason: "harga per pelanggan",
    });
  });

  it("tanpa sesi berizin: ditolak", async () => {
    state.session = null;
    expect((await operatorSetPlanPublic({ planId: 3, isPublic: false, reason: "harga per pelanggan" })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

/* ── seed tidak menimpa is_public ──────────────────────────────────────── */

describe("db:seed:plans — `is_public` milik konsol sesudah paketnya dibuat", () => {
  it("paket yang disembunyikan operator TIDAK ditampilkan kembali oleh seed", () => {
    /* Seed bilang `isPublic: true`, operator menyembunyikannya; bendera lain
       sama → tidak ada yang ditulis sama sekali. */
    expect(
      catalogFlagSync(
        { contactOnly: false, isRecommended: true, trialDays: 30 },
        { isRecommended: true, trialDays: 30, ...{ isPublic: true } }
      )
    ).toBeNull();
  });

  it("bendera lain yang menyimpang tetap diselaraskan — tanpa `isPublic` di datanya", () => {
    const flags = catalogFlagSync(
      { contactOnly: false, isRecommended: false, trialDays: 14 },
      { isRecommended: true, trialDays: 30, ...{ isPublic: true } }
    );
    expect(flags).toEqual({ contactOnly: false, isRecommended: true, trialDays: 30 });
    expect(flags).not.toHaveProperty("isPublic");
  });

  it("seed-plans.ts memakai penyelaras ini dan tidak lagi menulis `isPublic: plan.isPublic`", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("scripts/seed-plans.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toContain("catalogFlagSync(existing, plan)");
    expect(src).not.toMatch(/isPublic:\s*plan\.isPublic/);
    /* Paket BARU tetap dibuat dengan `isPublic` dari seed (lewat `...plan`). */
    expect(src).toContain("platform.plan.create({ data: { ...plan } })");
  });
});
