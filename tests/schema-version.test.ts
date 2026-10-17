import { describe, expect, it } from "vitest";

import { perluTindakan, vonisVersi } from "@/lib/schema-version";

const R = (terakhir: string | null, menggantung = 0) => ({ terapan: 3, menggantung, terakhir });

describe("vonis versi skema per basis data", () => {
  it.each([
    ["sama dengan yang diharapkan", R("0003_x"), "mutakhir"],
    ["lebih lama — db:migrate:all terlewat untuk buku ini", R("0002_x"), "tertinggal"],
    ["lebih baru — image lebih tua dari skemanya", R("0004_x"), "mendahului"],
    ["belum ada satu pun terapan", R(null), "tertinggal"],
    ["tak terbaca — BUKAN mutakhir", null, "tak_terbaca"],
  ] as const)("%s", (_n, ringkasan, status) => {
    expect(vonisVersi(ringkasan, "0003_x")).toBe(status);
  });

  it("migration menggantung mengalahkan versi yang cocok: rilis berikutnya macet di sini", () => {
    expect(vonisVersi(R("0003_x", 1), "0003_x")).toBe("menggantung");
  });

  it("urutan teks = urutan penerapan berkat awalan empat digit", () => {
    expect(vonisVersi(R("0009_z"), "0010_a")).toBe("tertinggal");
  });

  it("hanya `mutakhir` yang tidak menuntut tindakan", () => {
    expect(perluTindakan("mutakhir")).toBe(false);
    for (const s of ["tertinggal", "mendahului", "menggantung", "tak_terbaca"] as const) {
      expect(perluTindakan(s)).toBe(true);
    }
  });
});
