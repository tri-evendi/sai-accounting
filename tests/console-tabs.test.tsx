/**
 * TAB HALAMAN KONSOL — alamatnya, tampilannya, dan janji "hanya tab aktif
 * yang dibaca".
 *
 *   1. Tab aktif hidup di URL; nilai tak dikenal / tidak ada → tab bawaan.
 *   2. Tautan tab mempertahankan parameter lain (pencarian) dan menulis tab
 *      bawaan TANPA parameter (alamat kanonik tetap satu).
 *   3. `/tenants` memakai `?status=` yang sudah ada — tautan lama tetap benar.
 *   4. Rincian tenant hanya menjalankan kueri tab aktif.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consoleTabHref, resolveConsoleTab } from "@op/lib/operator/console-tabs";
import { ConsoleTabs } from "@op/components/operator/console-tabs";

const IDS = ["summary", "billing", "companies", "audit"] as const;

describe("resolveConsoleTab", () => {
  it("nilai dikenal dipakai apa adanya", () => {
    expect(resolveConsoleTab("billing", IDS, "summary")).toBe("billing");
  });

  it("tidak ada / tak dikenal / kosong → tab bawaan, bukan galat", () => {
    expect(resolveConsoleTab(undefined, IDS, "summary")).toBe("summary");
    expect(resolveConsoleTab("", IDS, "summary")).toBe("summary");
    expect(resolveConsoleTab("tagihan-lama", IDS, "summary")).toBe("summary");
  });

  it("parameter berulang (`?tab=a&tab=b`) → yang pertama", () => {
    expect(resolveConsoleTab(["audit", "billing"], IDS, "summary")).toBe("audit");
  });
});

describe("consoleTabHref", () => {
  it("tab bawaan tanpa parameter; tab lain `?tab=`", () => {
    expect(consoleTabHref("/settings", "signup", { defaultId: "signup" })).toBe("/settings");
    expect(consoleTabHref("/settings", "pricing", { defaultId: "signup" })).toBe("/settings?tab=pricing");
  });

  it("parameter lain dipertahankan; yang kosong dibuang", () => {
    expect(
      consoleTabHref("/tenants", "past_due", {
        defaultId: "all",
        param: "status",
        keep: { q: "mitra a", empty: "" },
      })
    ).toBe("/tenants?q=mitra+a&status=past_due");
    expect(consoleTabHref("/tenants", "all", { defaultId: "all", param: "status", keep: { q: "x" } })).toBe(
      "/tenants?q=x"
    );
  });

  it("parameter tab lama di `keep` tidak menggandakan dirinya", () => {
    expect(
      consoleTabHref("/tenants", "trialing", { defaultId: "all", param: "status", keep: { status: "active" } })
    ).toBe("/tenants?status=trialing");
  });
});

describe("<ConsoleTabs>", () => {
  const html = renderToStaticMarkup(
    <ConsoleTabs
      label="Bagian"
      basePath="/tenants/7"
      active="billing"
      defaultId="summary"
      tabs={[
        { id: "summary", label: "Ringkasan" },
        { id: "billing", label: "Langganan", count: 2, attention: true },
        { id: "audit", label: "Jejak", count: 0 },
      ]}
    />
  );

  it("navigasi berlabel; tab aktif `aria-current=page`, hanya satu", () => {
    expect(html).toContain('aria-label="Bagian"');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    const aktif = html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0] ?? "";
    expect(aktif).toContain('href="/tenants/7?tab=billing"');
    expect(html).toContain('href="/tenants/7"');
  });

  it("lencana angka hanya bila > 0", () => {
    expect(html).toContain(">2<");
    expect(html).not.toMatch(/Jejak<span/);
  });

  it("bergulir mendatar, tidak membungkus", () => {
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain("white-space:nowrap");
  });
});

/* ── Rincian tenant: hanya kueri tab aktif ─────────────────────────────── */

const spies = {
  health: vi.fn(async () => []),
  users: vi.fn(async () => ({ users: [], invitations: [] })),
  trail: vi.fn(async () => ({ entries: [], total: 0 })),
  plans: vi.fn(async () => []),
  activation: vi.fn(async () => []),
};

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@op/lib/operator/guard", () => ({
  requireOperatorPage: async () => ({ operator: { name: "vyn", role: "owner" } }),
}));
vi.mock("@sai/platform/i18n/server", () => ({ getT: async () => (k: string) => k }));
vi.mock("@sai/core/control-db", () => ({ controlDb: {} }));
vi.mock("@sai/platform/tenant-audit", () => ({ readTenantAuditFeed: () => spies.trail() }));
vi.mock("@op/lib/operator/user-support", () => ({ tenantUsersForOperator: () => spies.users() }));
vi.mock("@op/app/(operator)/tenants/[id]/user-actions", () => ({
  operatorResendInvitation: async () => ({}),
  operatorRevokeUserSessions: async () => ({}),
  operatorSendPasswordReset: async () => ({}),
}));
vi.mock("@op/app/(operator)/tenants/actions", () => ({ operatorMarkActivationHandled: async () => ({}) }));
vi.mock("@op/lib/operator/store", () => ({
  tenantStatusVariant: () => "default",
  tenantHealthForOperator: () => spies.health(),
  listPlansForOperator: () => spies.plans(),
  activationRequestsForOperator: () => spies.activation(),
  tenantDetailForOperator: async () => ({
    tenant: {
      id: 7,
      name: "PT Uji",
      slug: "pt-uji",
      status: "active",
      isDemo: false,
      planKey: "pro",
      createdAt: new Date("2026-01-01"),
      maxCompanies: 3,
      maxUsers: 15,
      referredByPartner: null,
      trialEndsAt: null,
    },
    usage: { companies: 1, users: 2 },
    companies: [],
    billing: { subscription: null, invoices: [], profile: null },
    deletionRequest: null,
  }),
}));

const { default: TenantDetailPage } = await import("@op/app/(operator)/tenants/[id]/page");

async function open(tab?: string) {
  await TenantDetailPage({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve(tab === undefined ? {} : { tab }),
  });
}

describe("rincian tenant — hanya kueri tab AKTIF yang dijalankan", () => {
  beforeEach(() => {
    for (const s of Object.values(spies)) s.mockClear();
  });

  it("bawaan (Ringkasan): kesehatan saja — tanpa pengguna, jejak, katalog", async () => {
    await open();
    expect(spies.health).toHaveBeenCalledTimes(1);
    expect(spies.users).not.toHaveBeenCalled();
    expect(spies.trail).not.toHaveBeenCalled();
    expect(spies.plans).not.toHaveBeenCalled();
  });

  it("Langganan & tagihan: katalog paket, tanpa kesehatan/pengguna/jejak", async () => {
    await open("billing");
    expect(spies.plans).toHaveBeenCalledTimes(1);
    expect(spies.health).not.toHaveBeenCalled();
    expect(spies.users).not.toHaveBeenCalled();
    expect(spies.trail).not.toHaveBeenCalled();
  });

  it("Perusahaan: pengguna saja; Jejak audit: jejak saja", async () => {
    await open("companies");
    expect(spies.users).toHaveBeenCalledTimes(1);
    expect(spies.health).not.toHaveBeenCalled();
    expect(spies.trail).not.toHaveBeenCalled();
    for (const s of Object.values(spies)) s.mockClear();
    await open("audit");
    expect(spies.trail).toHaveBeenCalledTimes(1);
    expect(spies.users).not.toHaveBeenCalled();
    expect(spies.health).not.toHaveBeenCalled();
  });

  it("permintaan aktivasi SELALU dibaca — ia lencana tab Langganan", async () => {
    await open("audit");
    expect(spies.activation).toHaveBeenCalledTimes(1);
  });

  it("tab tak dikenal → Ringkasan", async () => {
    await open("tidak-ada");
    expect(spies.health).toHaveBeenCalledTimes(1);
  });
});
