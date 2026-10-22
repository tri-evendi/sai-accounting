/**
 * STATUS KONTRAK — kosakata, label, dan perpindahan
 * (keputusan pemilik 23 Okt 2026: `completed` status keempat yang sah).
 *
 * Yang dijaga: (1) kosakata empat nilai dan faktur TETAP tiga; (2) setiap
 * status punya label di ketiga bahasa dan varian badge; (3) `completed` hanya
 * dicapai dari `signed`. CHECK constraint-nya dijaga
 * `tests/contract-status-check.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TRANSITIONS,
  INVOICE_STATUSES,
  STATUS_FILTER_LABELS,
  canTransitionContractStatus,
} from "@sai/core/constants";
import { contractStatusLabels } from "@/lib/i18n/labels";
import { contractSchema } from "@/lib/validations/contract";
import { invoiceSchema } from "@/lib/validations/invoice";
import { contractStageStatus } from "@/lib/document-chain";
import id from "@sai/core/i18n/dictionaries/id.json";
import en from "@sai/core/i18n/dictionaries/en.json";
import zh from "@sai/core/i18n/dictionaries/zh.json";
import type { Dictionary } from "@sai/core/i18n/dictionary";

const ROOT = join(__dirname, "..");

describe("kosakata status", () => {
  it("kontrak: empat nilai, `completed` di BELAKANG; faktur tetap tiga", () => {
    expect([...CONTRACT_STATUSES]).toEqual(["signed", "pending", "canceled", "completed"]);
    expect([...INVOICE_STATUSES]).toEqual(["signed", "pending", "canceled"]);
  });

  it("zod kontrak menerima `completed`; zod faktur menolaknya", () => {
    const base = {
      contractNo: "K/1",
      date: "2026-01-01",
      buyer: "PT X",
      currency: "IDR",
      items: [{ itemName: "Lada", bags: 1, kgPerBag: 1, pricePerKg: 1 }],
    };
    expect(contractSchema.safeParse({ ...base, status: "completed" }).success).toBe(true);
    expect(contractSchema.safeParse({ ...base, status: "selesai" }).success).toBe(false);
    const faktur = {
      invoiceNo: "F/1",
      date: "2026-01-01",
      currency: "IDR",
      items: [{ itemName: "Lada", quantity: 1, price: 1 }],
    };
    expect(invoiceSchema.safeParse({ ...faktur, status: "pending" }).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...faktur, status: "completed" }).success).toBe(false);
  });
});

describe("label & tampilan", () => {
  it("setiap status punya label di ketiga bahasa, dan saringan ikut", () => {
    for (const dict of [id, en, zh] as unknown as Dictionary[]) {
      const labels = contractStatusLabels(dict);
      for (const s of CONTRACT_STATUSES) expect(labels[s], s).toBeTruthy();
    }
    expect(CONTRACT_STATUS_LABELS.completed).toBe("Selesai");
    expect(STATUS_FILTER_LABELS.completed).toBe("Selesai");
    expect((en as unknown as Dictionary).status.contract.completed).toBe("Completed");
  });

  it("badge `completed` netral — selesai bukan lunas, tidak hijau", () => {
    const badge = readFileSync(join(ROOT, "src/components/shared/status-badge.tsx"), "utf8");
    expect(badge).toMatch(/completed: "default"/);
  });

  it("rantai dokumen membaca `completed` sebagai tahap selesai", () => {
    expect(contractStageStatus("completed")).toBe("selesai");
    expect(contractStageStatus("signed")).toBe("selesai");
    expect(contractStageStatus("pending")).toBe("sebagian");
  });
});

describe("perpindahan status", () => {
  it("`completed` hanya dari `signed` (atau dirinya)", () => {
    expect(canTransitionContractStatus("signed", "completed")).toBe(true);
    expect(canTransitionContractStatus("completed", "completed")).toBe(true);
    expect(canTransitionContractStatus("pending", "completed")).toBe(false);
    expect(canTransitionContractStatus("canceled", "completed")).toBe(false);
    expect(canTransitionContractStatus(null, "completed")).toBe(false);
  });

  it("kontrak selesai bisa dibuka kembali ke `signed` atau dibatalkan", () => {
    expect(canTransitionContractStatus("completed", "signed")).toBe(true);
    expect(canTransitionContractStatus("completed", "canceled")).toBe(true);
    expect(canTransitionContractStatus("completed", "pending")).toBe(false);
  });

  it("tiga status lama tetap bebas seperti sebelumnya", () => {
    for (const from of INVOICE_STATUSES) {
      for (const to of INVOICE_STATUSES) expect(canTransitionContractStatus(from, to), `${from}→${to}`).toBe(true);
    }
  });

  it("status warisan di luar kosakata diperlakukan seperti `pending`", () => {
    expect(canTransitionContractStatus("cancelled", "canceled")).toBe(true);
    expect(canTransitionContractStatus("cancelled", "completed")).toBe(false);
  });

  it("peta perpindahan lengkap untuk setiap status", () => {
    for (const s of CONTRACT_STATUSES) expect(CONTRACT_STATUS_TRANSITIONS[s]).toContain(s);
  });

  it("kedua route kontrak menegakkan perpindahan, bukan hanya formulirnya", () => {
    for (const f of ["src/app/api/contracts/route.ts", "src/app/api/contracts/[id]/route.ts"]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toContain("canTransitionContractStatus(");
    }
  });
});
