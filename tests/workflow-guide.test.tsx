/**
 * Panel Alur Kerja — render-invariant (issue: panduan "mulai dari mana").
 *
 * Diverifikasi tanpa browser via server-render ke string: tiap langkah tampil
 * bernomor urut, menjadi tautan ke halamannya, dan langkah opsional ditandai.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowGuide } from "@/components/dashboard/workflow-guide";
import { visibleWorkflows } from "@/lib/workflows";

const ALL = new Set(
  visibleWorkflows("bos", undefined).flatMap((w) => w.steps.map((s) => s.permission as string))
);

describe("WorkflowGuide", () => {
  const workflows = visibleWorkflows("bos", ALL);
  const html = renderToStaticMarkup(<WorkflowGuide workflows={workflows} />);

  it("tidak merender apa pun bila tak ada alur", () => {
    expect(renderToStaticMarkup(<WorkflowGuide workflows={[]} />)).toBe("");
  });

  it("menampilkan judul tiap alur", () => {
    expect(html).toContain("Alur Penjualan");
    expect(html).toContain("Alur Pembelian");
    expect(html).toContain("Tutup Buku Bulanan");
  });

  it("menomori langkah 1..n dan menautkannya ke halaman tujuan", () => {
    // Langkah pertama Alur Penjualan (Kontrak) bernomor 1 dan menaut ke formnya.
    expect(html).toContain('href="/contracts/new"');
    expect(html).toContain('href="/sales/new"');
    expect(html).toContain('href="/finance/new?arah=masuk"');
    // Nomor urut tampil.
    expect(html).toMatch(/>1<\/span>/);
    expect(html).toMatch(/>2<\/span>/);
  });

  it("menandai langkah opsional (Kontrak)", () => {
    expect(html.toLowerCase()).toContain("opsional");
  });

  it("menomori ulang saat langkah awal tersaring keluar", () => {
    // Tanpa izin membuat kontrak, langkah pertama Penjualan hilang → 'Catat
    // Penjualan' kini jadi langkah 1, bukan 2, dan tag opsional ikut hilang.
    const noContract = new Set([...ALL].filter((p) => p !== "contract.write"));
    const wf = visibleWorkflows("bos", noContract);
    const h = renderToStaticMarkup(<WorkflowGuide workflows={wf} />);
    expect(h).not.toContain('href="/contracts/new"');
    expect(h).toContain('href="/sales/new"');
    expect(h).toMatch(/>1<\/span>/);
  });
});
