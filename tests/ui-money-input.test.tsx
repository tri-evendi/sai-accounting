/**
 * Render MoneyInput (issue #53; ditulis ulang di atas AntD pada issue #186) —
 * memastikan nilai number diformat ke id-ID di layar, dan atribut isian
 * keuangan MASTER.md terpasang (rata kanan, tabular-nums, papan tik numerik).
 * Logika konversinya sendiri diuji sebagai fungsi murni di `money-input.test.ts`.
 *
 * Cakupannya sama dengan versi sebelum #186; yang berubah hanya BENTUK
 * buktinya. Rata kanan & tabular-nums dulu berupa kelas Tailwind
 * (`text-right tabular-nums`) dan kini berupa gaya sebaris di atas `Input`
 * AntD — dua sifat yang AntD tidak berikan sendiri, jadi justru itu yang harus
 * dikunci. Ditambah dua hal yang dulu tidak diuji: isian yang ditolak validasi
 * benar-benar bergaya error AntD, dan komponennya tetap merender satu `<input>`
 * telanjang (syarat `FormControl`, yang meneruskan `id`/`aria-*` ke anak
 * tunggalnya).
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
    expect(html).toContain("text-align:right");
    expect(html).toContain("font-variant-numeric:tabular-nums");
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
    expect(html).not.toMatch(/value="0"/);
  });

  it("menandai invalid dengan aria-invalid DAN gaya error AntD", () => {
    const html = renderToStaticMarkup(
      <MoneyInput value={100} onChange={() => {}} invalid />
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("ant-input-status-error");
  });

  it("aria-invalid yang disuntik FormControl ikut menyalakan gaya error", () => {
    // Pola `Form` shadcn menyuntik `aria-invalid`, bukan prop `invalid`.
    // Sebelum #186 isian yang ditolak validasi diumumkan ke pembaca layar tapi
    // garisnya tetap netral — error yang hanya terdengar, tidak terlihat.
    const html = renderToStaticMarkup(
      <MoneyInput value={100} onChange={() => {}} aria-invalid />
    );
    expect(html).toContain("ant-input-status-error");
  });

  it("merender satu <input> telanjang — syarat FormControl", () => {
    const html = renderToStaticMarkup(
      <MoneyInput value={100} onChange={() => {}} id="amount" />
    );
    expect(html.startsWith("<input")).toBe(true);
    expect(html).toContain('id="amount"');
  });
});
