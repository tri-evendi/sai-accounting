/**
 * Alur Kerja — penyaringan izin murni (tanpa DB/React).
 */
import { describe, it, expect } from "vitest";
import { WORKFLOWS, visibleWorkflows } from "@/lib/workflows";

const ALL = new Set(
  WORKFLOWS.flatMap((w) => w.steps.map((s) => s.permission as string))
);

describe("visibleWorkflows", () => {
  it("tanpa peran → tidak ada alur", () => {
    expect(visibleWorkflows(null, ALL)).toEqual([]);
    expect(visibleWorkflows(undefined, ALL)).toEqual([]);
  });

  it("dengan semua izin → semua alur, semua langkah utuh", () => {
    const wf = visibleWorkflows("managing_director", ALL);
    expect(wf.map((w) => w.id)).toEqual(["penjualan", "pembelian", "tutup_buku"]);
    for (const w of wf) {
      const original = WORKFLOWS.find((x) => x.id === w.id)!;
      expect(w.steps).toHaveLength(original.steps.length);
    }
  });

  it("membuang langkah yang izinnya tak dimiliki", () => {
    // Semua izin KECUALI cash.write → langkah 'Terima Pembayaran' & 'Bayar
    // Pemasok' hilang. Alur Penjualan masih ≥2 langkah (kontrak, faktur,
    // piutang) → tetap tampil; Alur Pembelian tinggal 2 (beli, pantau utang).
    const allowed = new Set([...ALL].filter((p) => p !== "cash.write"));
    const wf = visibleWorkflows("managing_director", allowed);
    const penjualan = wf.find((w) => w.id === "penjualan")!;
    expect(penjualan.steps.some((s) => s.href.includes("finance/new"))).toBe(false);
    expect(penjualan.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("membuang alur yang tersisa < 2 langkah", () => {
    // Hanya izin membuat kontrak → Alur Penjualan tinggal 1 langkah → dibuang.
    const wf = visibleWorkflows("managing_director", new Set(["contract.write"]));
    expect(wf).toEqual([]);
  });

  it("langkah opsional ditandai (Kontrak)", () => {
    const wf = visibleWorkflows("managing_director", ALL);
    const kontrak = wf
      .find((w) => w.id === "penjualan")!
      .steps.find((s) => s.href === "/contracts/new");
    expect(kontrak?.optional).toBe(true);
  });
});
