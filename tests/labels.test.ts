/**
 * Kamus istilah (issue #1 & #21) — bagian murni yang bisa diuji tanpa DOM.
 *
 * Yang dijaga di sini adalah janji "satu sumber kebenaran": tooltip, halaman
 * Kamus Istilah, dan tautan "Pelajari ini" semuanya membaca `TERMS`, jadi entri
 * yang cacat (kunci tak konsisten, definisi kosong, kategori asing) akan tampak
 * salah di ketiga tempat sekaligus.
 */
import { describe, expect, it } from "vitest";
import {
  GLOSSARY_PATH,
  TERMS,
  TERM_CATEGORIES,
  TERM_LIST,
  getTerm,
  glossaryHref,
  labelOf,
  searchTerms,
  termAnchorId,
  termOf,
  termsByCategory,
} from "@/lib/labels";
import { NAV_GROUPS, NAV_HOME } from "@/lib/nav";
import { QUICK_ACTIONS } from "@/lib/quick-actions";

describe("kelengkapan kamus", () => {
  it("berisi minimal 15 istilah akuntansi (syarat issue #1)", () => {
    expect(TERM_LIST.length).toBeGreaterThanOrEqual(15);
  });

  it("setiap entri punya kunci yang sama dengan kunci objeknya", () => {
    for (const [key, entry] of Object.entries(TERMS)) {
      expect(entry.key).toBe(key);
    }
  });

  it("setiap entri punya label, istilah formal, dan definisi yang berisi", () => {
    for (const entry of TERM_LIST) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.term.trim().length).toBeGreaterThan(0);
      // Definisi harus benar-benar menjelaskan, bukan sekadar mengulang label.
      expect(entry.definisi.trim().length).toBeGreaterThan(40);
      expect(entry.definisi.trim()).not.toBe(entry.label.trim());
    }
  });

  it("memakai kategori yang dikenal saja", () => {
    for (const entry of TERM_LIST) {
      expect(TERM_CATEGORIES).toContain(entry.kategori);
    }
  });

  it("tidak punya label ganda (agar tooltip tidak ambigu)", () => {
    const labels = TERM_LIST.map((e) => e.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("kunci memakai snake_case ASCII agar aman sebagai anchor URL", () => {
    for (const entry of TERM_LIST) {
      expect(entry.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("pencarian entri", () => {
  it("mengembalikan entri untuk kunci yang dikenal", () => {
    expect(getTerm("faktur")?.term).toContain("Faktur");
  });

  it("mengembalikan undefined untuk kunci asing, tanpa melempar", () => {
    expect(getTerm("entah_apa")).toBeUndefined();
  });

  it("labelOf/termOf jatuh kembali dengan aman", () => {
    expect(labelOf("piutang")).toBe(TERMS.piutang.label);
    expect(labelOf("entah_apa")).toBe("entah_apa");
    expect(termOf("piutang")).toBe(TERMS.piutang.term);
    expect(termOf("entah_apa")).toBe("entah_apa");
  });

  it("menautkan ke anchor entri di halaman kamus", () => {
    expect(termAnchorId("hpp")).toBe("istilah-hpp");
    expect(glossaryHref("hpp")).toBe(`${GLOSSARY_PATH}#istilah-hpp`);
  });
});

describe("searchTerms", () => {
  it("query kosong mengembalikan seluruh kamus", () => {
    expect(searchTerms("")).toHaveLength(TERM_LIST.length);
    expect(searchTerms("   ")).toHaveLength(TERM_LIST.length);
  });

  it("mencocokkan label bahasa tugas tanpa peduli huruf besar/kecil", () => {
    const hits = searchTerms("PELANGGAN BELUM BAYAR");
    expect(hits.map((h) => h.key)).toContain("piutang");
  });

  it("mencocokkan istilah formal dan alias Inggrisnya", () => {
    expect(searchTerms("account receivable").map((h) => h.key)).toContain("piutang");
    expect(searchTerms("cogs").map((h) => h.key)).toContain("hpp");
  });

  it("bisa dibatasi per kategori", () => {
    const hits = searchTerms("", "pajak");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kategori === "pajak")).toBe(true);
  });

  it("mengembalikan daftar kosong bila tidak ada yang cocok", () => {
    expect(searchTerms("zzzzz-tidak-ada")).toHaveLength(0);
  });
});

describe("termsByCategory", () => {
  it("mengelompokkan semua istilah tanpa ada yang hilang", () => {
    const groups = termsByCategory();
    const total = groups.reduce((sum, g) => sum + g.terms.length, 0);
    expect(total).toBe(TERM_LIST.length);
  });

  it("membuang kategori yang kosong setelah disaring", () => {
    const groups = termsByCategory(searchTerms("", "pajak"));
    expect(groups).toHaveLength(1);
    expect(groups[0].kategori).toBe("pajak");
  });
});

describe("kamus benar-benar dipakai permukaan lain (sumber tunggal)", () => {
  it("setiap termKey di menu menunjuk entri yang ada", () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.termKey)).filter(Boolean);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(getTerm(key as string)).toBeDefined();
    }
  });

  it("setiap termKey di Aksi Cepat menunjuk entri yang ada", () => {
    for (const action of QUICK_ACTIONS) {
      if (action.termKey) expect(getTerm(action.termKey)).toBeDefined();
    }
  });

  it("Kamus Istilah punya menunya sendiri di Pengaturan", () => {
    const hrefs = [NAV_HOME.href, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))];
    expect(hrefs).toContain(GLOSSARY_PATH);
  });
});
