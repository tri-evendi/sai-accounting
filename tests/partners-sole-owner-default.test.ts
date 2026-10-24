/**
 * Usaha perorangan: nama pemilik boleh dikosongkan di wisaya (teks bantuannya
 * menjanjikan "tertulis Pemilik"). Wisaya dan server memakai aturan yang sama,
 * jadi daftar kosong tidak boleh ditolak di peramban.
 */
import { describe, expect, it } from "vitest";
import { validatePartners, withSoleOwnerDefault } from "@/lib/partners";

describe("pemilik usaha perorangan yang dikosongkan", () => {
  it("diisi Pemilik 100% dan lolos validasi", () => {
    const drafts = withSoleOwnerDefault("perorangan", []);
    expect(drafts).toEqual([{ name: "Pemilik", role: null, shareBp: 10000 }]);
    expect(validatePartners("perorangan", drafts)).toEqual([]);
  });
  it("CV tanpa sekutu tetap ditolak", () => {
    expect(validatePartners("cv", withSoleOwnerDefault("cv", []))).toContain("partnersRequired");
  });
  it("nama yang diisi tidak ditimpa", () => {
    expect(withSoleOwnerDefault("perorangan", [{ name: "Budi", role: null, shareBp: 10000 }])[0].name).toBe("Budi");
  });
});
