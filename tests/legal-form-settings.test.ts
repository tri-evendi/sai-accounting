/**
 * Pengaturan → Bentuk usaha: ganti bentuk usaha WAJIB didahului peringatan,
 * tercatat di jejak audit (dari/ke), dan TIDAK menyentuh jurnal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const state = vi.hoisted(() => ({ legalForm: "pt" as string }));
const setCompanyLegalForm = vi.hoisted(() => vi.fn(async (_id: number, f: string) => void (state.legalForm = f)));
const writeAuditLog = vi.hoisted(() => vi.fn());
const savePartners = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-guard", () => ({
  requireApiPermission: async (permission: string) =>
    permission === "company_setting.manage"
      ? { authorized: true, session: { user: { id: "5", name: "Pemilik", email: "p@x.id", role: "managing_director" } } }
      : { authorized: false, response: new Response(null, { status: 403 }) },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog }));
vi.mock("@sai/platform/i18n/server", () => ({
  getRequestI18n: async () => ({ dictionary: null, t: (key: string) => key }),
}));
vi.mock("@/lib/current-company", () => ({ currentCompanyId: async () => 7 }));
vi.mock("@/lib/legal-form-server", () => ({
  getCompanyLegalForm: async () => state.legalForm,
  setCompanyLegalForm,
}));
vi.mock("@/lib/partners-service", async () => {
  class PartnerSaveError extends Error {
    constructor(readonly issues: string[]) {
      super(issues.join(","));
    }
  }
  return { listPartners: async () => [], savePartners, PartnerSaveError };
});

const legal = await import("@/app/api/company-settings/legal-form/route");
const partners = await import("@/app/api/company-settings/partners/route");
const { PartnerSaveError } = await import("@/lib/partners-service");

const put = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  state.legalForm = "pt";
});

describe("PUT /api/company-settings/legal-form", () => {
  it("tanpa `acknowledged` ditolak — peringatan wajib dibaca dulu", async () => {
    const res = await legal.PUT(put("/api/company-settings/legal-form", { legalForm: "cv" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("legalForm.errors.ackRequired");
    expect(setCompanyLegalForm).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("dengan `acknowledged`: registry diubah, jejak audit dari/ke + journalsRewritten:false", async () => {
    const res = await legal.PUT(put("/api/company-settings/legal-form", { legalForm: "cv", acknowledged: true }));
    expect(res.status).toBe(200);
    expect(setCompanyLegalForm).toHaveBeenCalledWith(7, "cv");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.legal_form.update",
        entity: "company",
        entityId: 7,
        details: { from: "pt", to: "cv", journalsRewritten: false },
      })
    );
  });

  it("bentuk yang sama: tidak menulis apa pun", async () => {
    await legal.PUT(put("/api/company-settings/legal-form", { legalForm: "pt", acknowledged: true }));
    expect(setCompanyLegalForm).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("rute bentuk usaha & sekutu tidak menjangkau pintu posting — jurnal lama tak tersentuh", () => {
    for (const f of [
      "src/app/api/company-settings/legal-form/route.ts",
      "src/app/api/company-settings/partners/route.ts",
      "src/lib/partners-service.ts",
      "src/lib/legal-form-server.ts",
    ]) {
      const src = readFileSync(join(AKAR_REPO, f), "utf8");
      expect(src, f).not.toMatch(/postJournal|reverseJournal|journalLine\.(update|delete|create)|journal\.(update|delete)/);
    }
  });
});

describe("PUT /api/company-settings/partners", () => {
  it("aturan sekutu yang dilanggar → 400 dengan kalimat kamus", async () => {
    savePartners.mockRejectedValueOnce(new PartnerSaveError(["partnerSharesNot100"]));
    state.legalForm = "cv";
    const res = await partners.PUT(
      put("/api/company-settings/partners", {
        partners: [{ name: "A", role: "aktif", shareBp: 5000, isActive: true }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("legalForm.errors.partnerSharesNot100");
  });

  it("sekutu baru & yang diubah tercatat di jejak audit", async () => {
    state.legalForm = "firma";
    savePartners.mockResolvedValueOnce({
      created: [{ id: 3, name: "Cici", capitalCode: "311003", drawingCode: "312003" }],
      updated: [{ id: 1, before: { name: "A", shareBp: 10000, isActive: true }, after: { name: "A", shareBp: 5000, isActive: true } }],
    });
    const res = await partners.PUT(
      put("/api/company-settings/partners", {
        partners: [
          { id: 1, name: "A", shareBp: 5000, isActive: true },
          { name: "Cici", shareBp: 5000, isActive: true },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect(savePartners).toHaveBeenCalledWith("firma", expect.any(Array));
    const actions = writeAuditLog.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(["company_partner.create", "company_partner.update"]);
  });
});
