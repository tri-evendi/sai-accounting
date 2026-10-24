/**
 * BENTUK USAHA (24 Okt 2026) — kosakata, migration, bendera CLI, kamus.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_LEGAL_FORM,
  equityModelFor,
  isLegalForm,
  LEGAL_FORMS,
  LEGAL_FORM_LABEL_KEYS,
  LEGAL_FORM_PRINT_LABELS,
  legalFormFromCli,
  parseLegalForm,
  usesPartnerLedger,
  usesPartnerRoles,
} from "@sai/core/legal-form";
import { companyCreateSchema } from "@/lib/validations/company";
import { AKAR_REPO } from "./akar-sumber";

vi.mock("server-only", () => ({}));

const baca = (p: string) => readFileSync(join(AKAR_REPO, p), "utf8");

describe("kosakata bentuk usaha", () => {
  it("enam bentuk, bawaan PT; nilai asing jatuh ke PT", () => {
    expect(LEGAL_FORMS).toEqual(["pt", "pt_perorangan", "cv", "firma", "perorangan", "lainnya"]);
    expect(DEFAULT_LEGAL_FORM).toBe("pt");
    expect(parseLegalForm("cv")).toBe("cv");
    expect(parseLegalForm("koperasi")).toBe("pt");
    expect(parseLegalForm(undefined)).toBe("pt");
    expect(isLegalForm("firma")).toBe(true);
  });

  it("model ekuitas: PT/PT Perorangan/lainnya → Laba Ditahan; CV/Firma → sekutu; perorangan → pemilik", () => {
    expect(equityModelFor("pt")).toBe("retained_earnings");
    expect(equityModelFor("pt_perorangan")).toBe("retained_earnings");
    expect(equityModelFor("lainnya")).toBe("retained_earnings");
    expect(equityModelFor("cv")).toBe("partners");
    expect(equityModelFor("firma")).toBe("partners");
    expect(equityModelFor("perorangan")).toBe("sole_owner");
    expect(usesPartnerLedger("pt")).toBe(false);
    expect(usesPartnerRoles("cv")).toBe(true);
    expect(usesPartnerRoles("firma")).toBe(false);
  });

  it("label cetak = kamus id (satu kalimat, dua tempat)", () => {
    const id = JSON.parse(baca("packages/core/src/i18n/dictionaries/id.json"));
    for (const f of LEGAL_FORMS) {
      expect(LEGAL_FORM_LABEL_KEYS[f]).toBe(`legalForm.options.${f}`);
      expect(id.legalForm.options[f]).toBe(LEGAL_FORM_PRINT_LABELS[f]);
    }
  });

  it("istilah generik di kamus bentuk usaha: 'perusahaan', tidak pernah 'badan usaha'", () => {
    for (const lang of ["id", "en", "zh"]) {
      const d = JSON.parse(baca(`packages/core/src/i18n/dictionaries/${lang}.json`));
      expect(JSON.stringify(d.legalForm)).not.toMatch(/badan usaha/i);
    }
  });
});

describe("migration expand-only", () => {
  it("control 0014: kolom NOT NULL DEFAULT 'pt' + CHECK kosakata — baris lama menjadi PT", () => {
    const sql = baca("prisma/postgresql/control/0014_companies_legal_form/migration.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "legal_form" VARCHAR\(20\) NOT NULL DEFAULT 'pt'/);
    for (const f of LEGAL_FORMS) expect(sql).toContain(`'${f}'`);
    expect(baca("packages/db/prisma/control/schema.prisma")).toMatch(
      /legalForm String @default\("pt"\) @map\("legal_form"\)/
    );
  });

  it("company 0007: tabel baru company_partners dengan FK akun RESTRICT", () => {
    const sql = baca("prisma/postgresql/company/0007_company_partners/migration.sql");
    expect(sql).toContain('CREATE TABLE "company_partners"');
    expect(sql).toMatch(/capital_account_id_fkey[\s\S]*ON DELETE RESTRICT/);
    expect(sql).toMatch(/"share_bp" >= 0 AND "share_bp" <= 10000/);
  });
});

describe("pembuatan perusahaan memilih bentuk usaha", () => {
  it("skema: opsional dengan bawaan PT; nilai asing ditolak", () => {
    expect(companyCreateSchema.parse({ name: "CV A", slug: "cv-a" }).legalForm).toBe("pt");
    expect(companyCreateSchema.parse({ name: "CV A", slug: "cv-a", legalForm: "cv" }).legalForm).toBe("cv");
    expect(companyCreateSchema.safeParse({ name: "X", slug: "x-y", legalForm: "koperasi" }).success).toBe(false);
  });

  it("bendera CLI create-company: --bentuk-usaha (alias --legal-form), `ud`, tanda hubung; salah ketik BERHENTI", () => {
    expect(legalFormFromCli(undefined)).toBe("pt");
    expect(legalFormFromCli("cv")).toBe("cv");
    expect(legalFormFromCli("pt-perorangan")).toBe("pt_perorangan");
    expect(legalFormFromCli("UD")).toBe("perorangan");
    expect(legalFormFromCli("koperasi")).toBeNull();
    const src = baca("scripts/create-company.ts");
    expect(src).toContain('legalFormFromCli(args["bentuk-usaha"] ?? args["legal-form"])');
    expect(src).toMatch(/data: \{ slug, name, databaseName, tenantId, legalForm \}/);
    expect(src).toMatch(/if \(!legalForm\) \{[\s\S]*process\.exit\(1\)/);
  });

  it("muatan penyediaan: bentuk usaha ikut, nilai asing MELEMPAR, muatan lama menjadi PT", async () => {
    const { parseProvisionPayload } = await import("@/lib/company-provisioning-queue");
    const dasar = {
      slug: "cv-a",
      name: "CV A",
      createdByUserId: 3,
      actor: { userId: "3", username: "a", tenantRole: "owner", tenantSlug: "t" },
    };
    expect(parseProvisionPayload(dasar).legalForm).toBe("pt");
    expect(parseProvisionPayload({ ...dasar, legalForm: "firma" }).legalForm).toBe("firma");
    expect(() => parseProvisionPayload({ ...dasar, legalForm: "koperasi" })).toThrow(/legalForm/);
  });
});
