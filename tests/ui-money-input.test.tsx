/**
 * Render MoneyInput (issue #53) — memastikan nilai number diformat ke id-ID di
 * layar, dan atribut isian keuangan MASTER.md terpasang (rata kanan,
 * tabular-nums, papan tik numerik). Logika konversinya sendiri diuji sebagai
 * fungsi murni di `money-input.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyInput } from "@/components/ui/money-input";

describe("MoneyInput", () => {
  it("menampilkan nilai terformat id-ID, rata kanan, tabular-nums, numerik", () => {
    const html = renderToStaticMarkup(
      <MoneyInput value={1234567} onChange={() => {}} decimals={0} />
    );
    expect(html).toContain("1.234.567");
    expect(html).toContain("text-right");
    expect(html).toContain("tabular-nums");
    expect(html).toContain('inputMode="numeric"');
  });

  it("valas: papan tik desimal, nilai berkoma", () => {
    const html = renderToStaticMarkup(
      <MoneyInput value={1234.5} onChange={() => {}} decimals={2} />
    );
    expect(html).toContain("1.234,5");
    expect(html).toContain('inputMode="decimal"');
  });

  it("kosong untuk undefined — 'belum diisi', bukan '0'", () => {
    const html = renderToStaticMarkup(<MoneyInput value={undefined} onChange={() => {}} />);
    expect(html).toMatch(/value=""/);
  });

  it("menandai invalid dengan aria-invalid", () => {
    const html = renderToStaticMarkup(
      <MoneyInput value={100} onChange={() => {}} invalid />
    );
    expect(html).toContain('aria-invalid="true"');
  });
});
