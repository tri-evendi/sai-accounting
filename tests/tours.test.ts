/**
 * Tur panduan (issue #21) — definisinya, bukan tampilannya.
 *
 * Mesin turnya menyentuh DOM/localStorage, tetapi ISI tur adalah data murni;
 * di sinilah dijaga bahwa ketiga halaman kunci punya tur, langkahnya berisi,
 * dan penanda "sudah dilihat" memakai kunci localStorage yang stabil.
 */
import { describe, expect, it } from "vitest";
import { TOURS, tourForPath, tourStorageKey } from "@/lib/tours";

describe("definisi tur", () => {
  it("tersedia untuk beranda, catat penjualan, dan pusat laporan", () => {
    expect(TOURS.map((t) => t.path)).toEqual(["/dashboard", "/invoices/new", "/reports"]);
  });

  it("id tur unik dan setiap tur punya langkah berisi", () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tour of TOURS) {
      expect(tour.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of tour.steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(30);
      }
    }
  });
});

describe("tourForPath", () => {
  it("mengembalikan tur halaman yang cocok persis", () => {
    expect(tourForPath("/dashboard")?.id).toBe("beranda");
    expect(tourForPath("/invoices/new")?.id).toBe("buat_penjualan");
  });

  it("mengembalikan null untuk halaman tanpa tur", () => {
    expect(tourForPath("/invoices")).toBeNull();
    expect(tourForPath("/entah")).toBeNull();
  });
});

describe("tourStorageKey", () => {
  it("memakai awalan yang sama untuk semua tur", () => {
    expect(tourStorageKey("beranda")).toBe("sai:tour-seen:beranda");
    for (const tour of TOURS) {
      expect(tourStorageKey(tour.id).startsWith("sai:tour-seen:")).toBe(true);
    }
  });
});
