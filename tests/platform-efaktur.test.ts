/**
 * e-Faktur tagihan platform: SATU pembangun untuk skrip CLI dan unduhan konsol.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { platformEfaktur } from "@/lib/billing/platform-efaktur";

describe("platformEfaktur", () => {
  it("hanya tagihan lunas; pembeli dari profil pajak, jatuh ke nama tenant", async () => {
    const findMany = vi.fn(async () => [
      { number: "INV-1", issueDate: new Date("2026-09-01"), amount: "249000", taxAmount: "27390", total: "276390", currency: "IDR", tenantId: 7 },
    ]);
    const r = await platformEfaktur(
      {
        platform: {
          platformInvoice: { findMany },
          tenantBillingProfile: { findMany: async () => [] },
        },
        control: { tenant: { findMany: async () => [{ id: 7, name: "PT Contoh" }] } },
      } as never,
      { from: "2026-09-01", to: null },
      { npwp: "0123456789012345", name: "PT SAI" }
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "paid", issueDate: { gte: new Date("2026-09-01") } } })
    );
    /* Tanpa NPWP pembeli tagihan ini TIDAK ikut berkas — dan dilaporkan. */
    expect(r.problems.map((p) => p.invoiceNo)).toEqual(["INV-1"]);
    expect(r.rowCount).toBe(0);
  });

  it("skrip CLI memakai fungsi yang sama, bukan salinan kuerinya", () => {
    const isi = readFileSync(join(process.cwd(), "scripts/efaktur-platform.ts"), "utf8");
    expect(isi).toMatch(/platformEfaktur\(/);
    expect(isi).not.toMatch(/platformInvoice\.findMany/);
  });
});
