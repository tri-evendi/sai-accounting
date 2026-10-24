/**
 * Konsol operator — PENAWARAN MASUK (`lead_requests`, migration platform 0016).
 *
 * Dijaga: peralihan status yang sah saja, tulisan bersyarat (dua operator
 * serentak tidak saling menimpa), setiap aksi berhasil meninggalkan TEPAT satu
 * jejak operator tanpa data pribadi prospek, izin `tenant.billing` di server
 * action, baris "perlu ditangani" + lencana menu, dan halaman daftarnya.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { attentionItems } from "@op/lib/operator/attention";
import { addLeadNote, changeLeadStatus, type LeadRow, type LeadWriteDeps } from "@op/lib/operator/lead-writes";
import { formatLeadPhone, leadStatusVariant, leadWhatsappUrl } from "@op/lib/operator/lead-view";
import { operatorNav } from "@op/lib/operator/nav";
import { operatorCan } from "@op/lib/operator/roles";
import { translate, type Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";

const state = vi.hoisted(() => ({
  role: "owner",
  row: null as null | {
    id: number;
    reference: string;
    status: string;
    notes: string | null;
    anonymizedAt: Date | null;
  },
  audits: [] as Array<{ operator: string; action: string; details: Record<string, unknown> }>,
  counts: { baru: 2, dihubungi: 1, selesai: 0, spam: 0 } as Record<string, number> | null,
  listed: [] as Array<{ status?: string; q?: string }>,
}));

/* ── Klien palsu yang MENEGAKKAN tulisan bersyarat seperti basis data ── */
function fakeDeps(row: LeadRow | null): LeadWriteDeps & { current: () => LeadRow | null } {
  let cur = row ? { ...row } : null;
  return {
    current: () => cur,
    platform: {
      leadRequest: {
        findUnique: async () => (cur ? { ...cur } : null),
        updateMany: async ({ where, data }) => {
          if (!cur || cur.id !== where.id) return { count: 0 };
          if (where.status !== undefined && cur.status !== where.status) return { count: 0 };
          if ("notes" in where && cur.notes !== where.notes) return { count: 0 };
          cur = { ...cur, ...(data as Partial<LeadRow>) };
          return { count: 1 };
        },
      },
    },
    audit: async (e) => {
      state.audits.push(e);
    },
  };
}

const BARU: LeadRow = { id: 7, reference: "SAI-7K3M9Q", status: "baru", notes: null, anonymizedAt: null };

beforeEach(() => {
  state.audits = [];
  state.role = "owner";
});

describe("changeLeadStatus", () => {
  it("baru → dihubungi: tersimpan dengan penangan + waktu, satu jejak tanpa data pribadi", async () => {
    const deps = fakeDeps(BARU);
    const now = new Date("2026-10-25T05:00:00Z");
    const r = await changeLeadStatus(deps, { leadId: 7, to: "dihubungi", operator: "vyn" }, now);
    expect(r).toEqual({ outcome: "changed", from: "baru", to: "dihubungi", reference: "SAI-7K3M9Q" });
    expect(deps.current()).toMatchObject({ status: "dihubungi", handledBy: "vyn", handledAt: now });
    expect(state.audits).toEqual([
      {
        operator: "vyn",
        action: "operator.lead.status",
        details: { leadId: 7, reference: "SAI-7K3M9Q", from: "baru", to: "dihubungi" },
      },
    ]);
  });

  it("peralihan tidak sah (selesai → baru) DITOLAK tanpa tulisan & tanpa jejak", async () => {
    const deps = fakeDeps({ ...BARU, status: "selesai" });
    const r = await changeLeadStatus(deps, { leadId: 7, to: "baru", operator: "vyn" });
    expect(r).toEqual({ outcome: "invalid_transition", from: "selesai" });
    expect(deps.current()!.status).toBe("selesai");
    expect(state.audits).toHaveLength(0);
  });

  it("spam bisa dipulihkan ke baru; selesai bisa dibuka lagi", async () => {
    expect((await changeLeadStatus(fakeDeps({ ...BARU, status: "spam" }), { leadId: 7, to: "baru", operator: "a" })).outcome).toBe("changed");
    expect((await changeLeadStatus(fakeDeps({ ...BARU, status: "selesai" }), { leadId: 7, to: "dihubungi", operator: "a" })).outcome).toBe("changed");
  });

  it("tidak ada → not_found", async () => {
    expect(await changeLeadStatus(fakeDeps(null), { leadId: 9, to: "spam", operator: "a" })).toEqual({ outcome: "not_found" });
  });

  it("status berubah di antara baca dan tulis → conflict, tanpa jejak", async () => {
    const deps = fakeDeps(BARU);
    const asli = deps.platform.leadRequest.findUnique;
    deps.platform.leadRequest.findUnique = async (args) => {
      const r = await asli(args);
      /* operator lain menandai spam tepat sesudah kita membaca */
      await deps.platform.leadRequest.updateMany({ where: { id: 7 }, data: { status: "spam" } });
      return r;
    };
    expect(await changeLeadStatus(deps, { leadId: 7, to: "dihubungi", operator: "a" })).toEqual({ outcome: "conflict" });
    expect(state.audits).toHaveLength(0);
  });
});

describe("addLeadNote", () => {
  it("catatan ditambahkan berstempel; jejak menyimpan PANJANG, bukan isinya", async () => {
    const deps = fakeDeps(BARU);
    const r = await addLeadNote(deps, { leadId: 7, text: "sudah ditelepon, minta demo", operator: "vyn" });
    expect(r).toEqual({ outcome: "added", reference: "SAI-7K3M9Q" });
    expect(deps.current()!.notes).toContain("· vyn] sudah ditelepon, minta demo");
    expect(state.audits[0]).toEqual({
      operator: "vyn",
      action: "operator.lead.note",
      details: { leadId: 7, reference: "SAI-7K3M9Q", length: "sudah ditelepon, minta demo".length },
    });
  });

  it("lead yang sudah dianonimkan tidak bisa dicatati", async () => {
    const deps = fakeDeps({ ...BARU, anonymizedAt: new Date() });
    expect(await addLeadNote(deps, { leadId: 7, text: "halo", operator: "a" })).toEqual({ outcome: "anonymized" });
    expect(state.audits).toHaveLength(0);
  });
});

/* ── Server action: izin `tenant.billing` ─────────────────────────────── */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("@sai/platform/i18n/server", () => ({
  getT: async () => (key: string, values?: Record<string, unknown>) => (values ? `${key}${JSON.stringify(values)}` : key),
}));
vi.mock("@op/lib/operator/guard", async () => {
  const { operatorCan: can } = await import("@op/lib/operator/roles");
  return {
    requireOperatorActionSession: async (perm: Parameters<typeof can>[1]) =>
      can(state.role, perm) ? { operator: { name: "vyn", role: state.role } } : null,
    requireOperatorPage: async () => ({ operator: { name: "vyn", role: state.role } }),
  };
});
vi.mock("@op/lib/operator/audit", () => ({
  writeOperatorAuditLog: async (e: { operator: string; action: string; details: Record<string, unknown> }) => {
    state.audits.push(e);
  },
}));
vi.mock("@sai/platform/platform-db", () => ({
  platformDb: {
    leadRequest: {
      findUnique: async () => (state.row ? { ...state.row } : null),
      updateMany: async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
        if (!state.row || (where.status && where.status !== state.row.status)) return { count: 0 };
        state.row = { ...state.row, ...data } as typeof state.row;
        return { count: 1 };
      },
    },
  },
}));

describe("server action — izin & jejak", () => {
  beforeEach(() => {
    state.row = { ...BARU };
  });

  it("peran penagihan (`tenant.billing`) dipegang owner & billing — bukan support/viewer", () => {
    expect(operatorCan("owner", "tenant.billing")).toBe(true);
    expect(operatorCan("billing", "tenant.billing")).toBe(true);
    expect(operatorCan("support", "tenant.billing")).toBe(false);
    expect(operatorCan("viewer", "tenant.billing")).toBe(false);
  });

  it("viewer/support DITOLAK — tanpa tulisan, tanpa jejak", async () => {
    const { operatorChangeLeadStatus, operatorAddLeadNote } = await import("@op/app/(operator)/leads/actions");
    for (const role of ["viewer", "support"]) {
      state.role = role;
      expect(await operatorChangeLeadStatus({ leadId: 7, to: "dihubungi" })).toEqual({
        ok: false,
        message: "operator.actions.denied",
      });
      expect((await operatorAddLeadNote({ leadId: 7, text: "halo" })).ok).toBe(false);
    }
    expect(state.row!.status).toBe("baru");
    expect(state.audits).toHaveLength(0);
  });

  it("billing: baru → dihubungi → selesai, masing-masing berjejak", async () => {
    const { operatorChangeLeadStatus } = await import("@op/app/(operator)/leads/actions");
    state.role = "billing";
    expect((await operatorChangeLeadStatus({ leadId: 7, to: "dihubungi" })).ok).toBe(true);
    expect((await operatorChangeLeadStatus({ leadId: 7, to: "selesai" })).ok).toBe(true);
    expect(state.row!.status).toBe("selesai");
    expect(state.audits.map((a) => a.details.to)).toEqual(["dihubungi", "selesai"]);
    /* kembali ke baru tidak sah */
    const r = await operatorChangeLeadStatus({ leadId: 7, to: "baru" });
    expect(r).toEqual({ ok: false, message: "operator.leads.errTransition" });
  });

  it("isian tak sah (status di luar kosakata) ditolak skema", async () => {
    const { operatorChangeLeadStatus } = await import("@op/app/(operator)/leads/actions");
    expect((await operatorChangeLeadStatus({ leadId: 7, to: "hilang" })).ok).toBe(false);
    expect((await operatorChangeLeadStatus({ leadId: "7", to: "spam" })).ok).toBe(false);
  });
});

/* ── Ringkasan & menu ─────────────────────────────────────────────────── */

describe("baris 'perlu ditangani' & lencana menu", () => {
  const control = {
    byStatus: {},
    trialsEndingSoon: 0,
    trialsExpired: 0,
    lastRun: { finishedAt: new Date(), status: "ok", errorCount: 0 },
  };

  it("lead baru > 0 → satu baris ke /leads; 0 → tanpa baris", () => {
    const ada = attentionItems({ control, platform: { overdueInvoices: 0, newLeads: 3 } });
    expect(ada).toEqual([{ key: "leadsNew", count: 3, tone: "warning", href: "/leads" }]);
    expect(attentionItems({ control, platform: { overdueInvoices: 0, newLeads: 0 } })).toEqual([]);
    expect(attentionItems({ control, platform: null })).toEqual([]);
  });

  it("di bawah permintaan aktivasi, di atas tagihan lewat jatuh tempo", () => {
    const keys = attentionItems({
      control,
      platform: { overdueInvoices: 1, openActivationRequests: 1, newLeads: 1 },
    }).map((i) => i.key);
    expect(keys).toEqual(["activationRequests", "leadsNew", "invoicesOverdue"]);
  });

  it("menu: 'Penawaran masuk' di kelompok penjualan, berlencana bila ada yang baru", () => {
    const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
      translate(id as Dictionary, key, values);
    const item = operatorNav(t, { newLeads: 4 }).find((i) => i.href === "/leads")!;
    expect(item.group).toBe("Penjualan & tagihan");
    expect(item.label).toBe("Penawaran masuk");
    expect(item.badge).toBe(4);
    expect(item.badgeLabel).toBe("4 penawaran baru");
    expect(operatorNav(t, { newLeads: null }).find((i) => i.href === "/leads")!.badge).toBeUndefined();
  });
});

describe("penyajian", () => {
  it("nomor tersimpan → bentuk yang enak dibaca", () => {
    expect(formatLeadPhone("6281234567890")).toBe("+62 812-3456-7890");
    expect(formatLeadPhone("6591234567")).toBe("+6591234567");
  });

  it("tautan WhatsApp ke prospek membawa sapaan ter-encode", () => {
    expect(leadWhatsappUrl("6281234567890", "Halo Budi & tim")).toBe(
      "https://wa.me/6281234567890?text=Halo%20Budi%20%26%20tim"
    );
  });

  it("lencana status selalu berteks; warna per status", () => {
    expect(leadStatusVariant("baru")).toBe("warning");
    expect(leadStatusVariant("spam")).toBe("danger");
    expect(leadStatusVariant("x")).toBe("outline");
  });
});

/* ── Halaman daftar ───────────────────────────────────────────────────── */

vi.mock("@op/lib/operator/leads", () => ({
  leadStatusCounts: async () => state.counts,
  listLeadsForOperator: async (f: { status?: string; q?: string }) => {
    state.listed.push(f);
    return state.counts === null
      ? null
      : [
          {
            id: 7,
            reference: "SAI-7K3M9Q",
            kind: "demo",
            name: "Budi",
            company: "PT Contoh",
            phone: "6281234567890",
            email: "budi@contoh.co.id",
            legalForm: null,
            companyCount: null,
            message: null,
            consentAt: new Date(),
            source: "contact_page",
            locale: "id",
            status: "baru",
            handledBy: null,
            handledAt: null,
            notes: null,
            anonymizedAt: null,
            createdAt: new Date("2026-10-25T05:00:00Z"),
          },
        ];
  },
}));

describe("halaman /leads", () => {
  async function open(params: Record<string, string> = {}) {
    const { default: Page } = await import("@op/app/(operator)/leads/page");
    return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
  }

  beforeEach(() => {
    state.listed = [];
    state.counts = { baru: 2, dihubungi: 1, selesai: 0, spam: 0 };
  });

  it("bawaan tab Baru; tab berjumlah; baris menaut ke rincian", async () => {
    const html = await open();
    expect(state.listed[0]).toEqual({ status: "baru", q: "" });
    expect(html).toContain('href="/leads/7"');
    expect(html).toContain("SAI-7K3M9Q");
    expect(html).toContain("+62 812-3456-7890");
    expect(html).toContain('href="/leads?tab=dihubungi"');
    expect(html).toContain("operator.leads.heading (3)");
  });

  it("?tab=all → tanpa saringan status; pencarian dibawa", async () => {
    await open({ tab: "all", q: "contoh" });
    expect(state.listed[0]).toEqual({ status: undefined, q: "contoh" });
  });

  it("platform tak terjangkau → kalimat, bukan 500", async () => {
    state.counts = null;
    expect(await open()).toContain("operator.leads.unavailable");
  });
});
