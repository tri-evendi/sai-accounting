/**
 * PEMILIK / SEKUTU — validasi, pembagian laba per porsi (pembulatan), templat.
 */
import { describe, expect, it } from "vitest";

import {
  allocateByShare,
  bpToPercent,
  nextChildCode,
  percentToBp,
  validatePartners,
} from "@/lib/partners";
import { coaTemplateFor, equityTemplateFor } from "@/lib/coa-template";
import { BUSINESS_MODULES } from "@/lib/business-modules";
import { COA_TEMPLATE } from "@/lib/accounting";

describe("validatePartners", () => {
  it("PT tidak memakai daftar sekutu", () => {
    expect(validatePartners("pt", [])).toEqual([]);
    expect(validatePartners("pt_perorangan", [])).toEqual([]);
  });

  it("CV: sekutu aktif DAN komanditer, porsi tepat 100%", () => {
    expect(
      validatePartners("cv", [
        { name: "A", role: "aktif", shareBp: 6000 },
        { name: "B", role: "komanditer", shareBp: 4000 },
      ])
    ).toEqual([]);
    expect(
      validatePartners("cv", [
        { name: "A", role: "aktif", shareBp: 6000 },
        { name: "B", role: "aktif", shareBp: 4000 },
      ])
    ).toContain("cvNeedsLimited");
    expect(
      validatePartners("cv", [
        { name: "A", role: "aktif", shareBp: 6000 },
        { name: "B", role: "komanditer", shareBp: 3999 },
      ])
    ).toContain("partnerSharesNot100");
  });

  it("Firma: dua sekutu atau lebih, tanpa peran; nama unik & terisi", () => {
    expect(validatePartners("firma", [{ name: "A", shareBp: 10000 }])).toContain("partnersMinTwo");
    expect(
      validatePartners("firma", [
        { name: "A", shareBp: 5000 },
        { name: "a ", shareBp: 5000 },
      ])
    ).toContain("partnerNameDuplicate");
    expect(
      validatePartners("firma", [
        { name: "A", role: "aktif", shareBp: 5000 },
        { name: "B", shareBp: 5000 },
      ])
    ).toContain("partnerRoleNotAllowed");
    expect(validatePartners("firma", [{ name: "", shareBp: 5000 }, { name: "B", shareBp: 5000 }])).toContain(
      "partnerNameRequired"
    );
  });

  it("perorangan: tepat satu pemilik", () => {
    expect(validatePartners("perorangan", [{ name: "Sari", shareBp: 10000 }])).toEqual([]);
    expect(validatePartners("perorangan", [])).toEqual(["partnersRequired"]);
    expect(
      validatePartners("perorangan", [
        { name: "A", shareBp: 5000 },
        { name: "B", shareBp: 5000 },
      ])
    ).toContain("soleOwnerExactlyOne");
  });

  it("persen ⇄ basis poin", () => {
    expect(percentToBp(33.33)).toBe(3333);
    expect(percentToBp(16.67)).toBe(1667);
    expect(bpToPercent(3333)).toBe(33.33);
  });
});

describe("allocateByShare — pembulatan DETERMINISTIK", () => {
  const tiga = [
    { key: 1, shareBp: 3333, sortOrder: 0 },
    { key: 2, shareBp: 3333, sortOrder: 1 },
    { key: 3, shareBp: 3334, sortOrder: 2 },
  ];

  it("jumlahnya SELALU tepat; sisa ke porsi terbesar", () => {
    const r = allocateByShare(100_00, tiga);
    expect(r.reduce((s, x) => s + x.cents, 0)).toBe(100_00);
    /* trunc: 3333, 3333, 3334 → sisa 0; porsi pas */
    expect(r.map((x) => x.cents)).toEqual([3333, 3333, 3334]);
    const ganjil = allocateByShare(1_00, tiga); // 33,33 + 33,33 + 33,34 = 100 → sisa 0
    expect(ganjil.reduce((s, x) => s + x.cents, 0)).toBe(1_00);
    const sen = allocateByShare(10, tiga); // trunc 3,3,3 = 9 → sisa 1 ke key 3 (3334)
    expect(sen.map((x) => x.cents)).toEqual([3, 3, 4]);
  });

  it("seri porsi terbesar → yang terdaftar paling awal (sortOrder)", () => {
    const seri = [
      { key: 7, shareBp: 5000, sortOrder: 1 },
      { key: 9, shareBp: 5000, sortOrder: 0 },
    ];
    expect(allocateByShare(1, seri)).toEqual([
      { key: 7, cents: 0 },
      { key: 9, cents: 1 },
    ]);
  });

  it("rugi simetris (dipotong ke arah nol), sisa bertanda sama", () => {
    const r = allocateByShare(-10, tiga);
    expect(r.map((x) => x.cents)).toEqual([-3, -3, -4]);
    expect(Object.is(allocateByShare(-1, tiga)[0]!.cents, -0)).toBe(false);
  });

  it("menolak porsi yang tidak 100% dan jumlah pecahan sen", () => {
    expect(() => allocateByShare(100, [{ key: 1, shareBp: 9999, sortOrder: 0 }])).toThrow(/10000/);
    expect(() => allocateByShare(1.5, tiga)).toThrow(/sen bulat/);
  });
});

describe("penomoran akun sekutu", () => {
  it("kode anak pertama yang belum dipakai; yang lama tidak dipakai ulang", () => {
    expect(nextChildCode("3110", [])).toBe("311001");
    expect(nextChildCode("3110", ["3110", "311001", "311003"])).toBe("311002");
  });
});

describe("templat bagan akun per bentuk usaha", () => {
  const codes = (rows: { code: string }[]) => rows.map((r) => r.code);

  it("PT & PT Perorangan: templat lama APA ADANYA (urutan pun sama)", () => {
    const lama = coaTemplateFor(BUSINESS_MODULES);
    expect(coaTemplateFor(BUSINESS_MODULES, { legalForm: "pt", partners: [] })).toEqual(lama);
    expect(coaTemplateFor(BUSINESS_MODULES, { legalForm: "pt_perorangan", partners: [] })).toEqual(lama);
    expect(codes(lama)).toEqual(expect.arrayContaining(["3101", "3102"]));
  });

  it("perorangan: Modal Pemilik + Prive Pemilik; TANPA Laba Ditahan; satu pemilik 100%", () => {
    const rows = coaTemplateFor(["core_accounting"], { legalForm: "perorangan", partners: [{ name: "Sari", shareBp: 10000 }] });
    const eq = rows.filter((r) => r.type === "equity");
    expect(eq.map((r) => [r.code, r.name])).toEqual([
      ["3101", "Modal Pemilik"],
      ["3103", "Prive Pemilik"],
    ]);
    const t = equityTemplateFor({ legalForm: "perorangan", partners: [{ name: "Sari", shareBp: 10000 }] });
    expect(t.partners).toEqual([
      expect.objectContaining({ name: "Sari", shareBp: 10000, capitalCode: "3101", drawingCode: "3103" }),
    ]);
  });

  it("CV/Firma: Modal & Prive per sekutu di bawah 3110/3120, penampung saldo awal 3101, TANPA Laba Ditahan", () => {
    const partners = [
      { name: "Andi", role: "aktif" as const, shareBp: 6000 },
      { name: "Budi", role: "komanditer" as const, shareBp: 4000 },
    ];
    const rows = coaTemplateFor(["core_accounting"], { legalForm: "cv", partners });
    const eq = rows.filter((r) => r.type === "equity");
    expect(eq.map((r) => `${r.code} ${r.name}${r.parent ? ` <${r.parent}` : ""}`)).toEqual([
      "3101 Modal Belum Dibagi",
      "3110 Modal Sekutu",
      "3120 Prive Sekutu",
      "311001 Modal Andi <3110",
      "312001 Prive Andi <3120",
      "311002 Modal Budi <3110",
      "312002 Prive Budi <3120",
    ]);
    expect(codes(rows)).not.toContain("3102");
    const t = equityTemplateFor({ legalForm: "cv", partners });
    expect(t.partners.map((p) => [p.name, p.role, p.capitalCode, p.drawingCode, p.sortOrder])).toEqual([
      ["Andi", "aktif", "311001", "312001", 0],
      ["Budi", "komanditer", "311002", "312002", 1],
    ]);
    /* Akun non-ekuitas tidak tersentuh bentuk usaha. */
    const nonEq = (r: { type: string }) => r.type !== "equity";
    expect(rows.filter(nonEq)).toEqual(coaTemplateFor(["core_accounting"]).filter(nonEq));
  });

  it("`null` = tanpa akun ekuitas (modul yang dinyalakan belakangan)", () => {
    const rows = coaTemplateFor(BUSINESS_MODULES, null);
    expect(rows.some((r) => r.type === "equity")).toBe(false);
    expect(rows.length).toBe(coaTemplateFor(BUSINESS_MODULES).length - COA_TEMPLATE.filter((r) => r.type === "equity").length);
  });
});

describe("label rincian per pemilik (padanan Go `ShareBpText`/`EquityPartnerLabel`)", async () => {
  const { shareBpText, equityPartnerLabel } = await import("@/lib/statement-layout");
  it("teks porsi id-ID", () => {
    expect([10000, 5000, 3333, 3330, 1667, 5, 0].map(shareBpText)).toEqual(["100", "50", "33,33", "33,3", "16,67", "0,05", "0"]);
  });
  it("label sekutu", () => {
    expect(equityPartnerLabel({ name: "Andi", role: "aktif", shareBp: 5000, isActive: true })).toBe("Andi (sekutu aktif, 50%)");
    expect(equityPartnerLabel({ name: "Sari", role: null, shareBp: 10000, isActive: false })).toBe("Sari (100%) — nonaktif");
  });
});
