/**
 * PENJAGA #324 — pilihan kunci judul kolom ditulis SEKALI.
 *
 * == Yang sudah terjaga, dan yang tidak ====================================
 * #319 memaku label katalog ke kunci kamus; #298 memaku kunci kamus ke judul
 * kertas. Jadi selama kedua sisi menunjuk kunci yang SAMA, ketiga permukaan —
 * layar, dialog pilih-kolom, dan berkas cetak — bergerak bersama.
 *
 * Yang TIDAK terjaga sebelum #324: halaman yang berpindah ke kunci LAIN.
 * Mengganti `receivables.colDocumentValue` menjadi `common.total` — dua kunci
 * yang sama-sama sah, sama-sama ada di kamus — membuat layar dan dialog
 * berhenti sepakat, dan tidak ada satu pun tes yang merah. Bunyinya kebetulan
 * mirip; maknanya tidak.
 *
 * == Kenapa penjaganya berbentuk begini ====================================
 * Cacatnya ditutup dengan KONSTRUKSI: halaman tidak lagi menyatakan tabel
 * judulnya sendiri, ia menurunkannya dari katalog lewat `columnLabels()`. Tidak
 * ada kunci kedua, jadi tidak ada yang bisa menyimpang.
 *
 * Penjaga ini menjaga KONSTRUKSI ITU tetap berdiri — bukan mencocokkan dua
 * salinan. Sebuah tes yang mencocokkan dua salinan menerima keberadaan salinan
 * kedua; yang di bawah menolaknya.
 *
 * == Dibuktikan merah lebih dulu ===========================================
 * Kriteria #324 menuntutnya. Diuji dengan mengembalikan satu tabel `HEADERS`
 * tulisan tangan ke `reports/cash-bank/page.tsx`: berkas ini merah pada laporan
 * itu, dan hanya pada laporan itu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPORTS } from "@/lib/report-catalog";

const APP = join(
  __dirname,
  "..",
  "src",
  "app",
  "(app)",
  "(dashboard)",
  "t",
  "[tenantSlug]",
  "[companySlug]"
);

/** Halaman layar untuk tiap laporan berkolom yang sudah dikonversi. */
const HALAMAN: Record<string, string> = {
  "cash-bank": join(APP, "reports", "cash-bank", "page.tsx"),
  "stock-value": join(APP, "reports", "stock-value", "page.tsx"),
  receivables: join(APP, "receivables", "page.tsx"),
  payables: join(APP, "payables", "page.tsx"),
  "stock-movement": join(APP, "inventory", "movement", "page.tsx"),
};

describe("halaman menurunkan judulnya dari katalog", () => {
  it.each(Object.entries(HALAMAN))("%s", (reportId, path) => {
    const src = readFileSync(path, "utf8");

    /* Menurunkan — bukan menyalin. */
    expect(src, `${reportId}: tidak memanggil columnLabels()`).toMatch(
      new RegExp(`columnLabels<\\w+>\\("${reportId}"`)
    );

    /*
     * Dan TIDAK menyatakan tabelnya sendiri. Inilah asersi yang menjadi merah
     * bila seseorang mengembalikan tabel tulisan tangan — dengan kunci apa pun,
     * termasuk kunci yang kebetulan benar hari ini.
     */
    expect(src, `${reportId}: masih menyatakan HEADERS sendiri`).not.toMatch(
      /const HEADERS: Record<\w+, string> = \{/
    );
  });
});

describe("katalog memang memiliki kuncinya", () => {
  it.each(Object.keys(HALAMAN))("%s punya daftar kolom berkunci", (reportId) => {
    /* `columnLabels()` memulangkan objek KOSONG bila laporannya tak punya
       `columns` — kegagalan yang tampil sebagai judul kolom hilang, bukan
       sebagai galat. Jadi keberadaannya disebut di sini. */
    const definition = REPORTS.find((r) => r.id === reportId);
    expect(definition?.columns?.length ?? 0).toBeGreaterThan(0);
    for (const column of definition!.columns!) {
      expect(column.labelKey, `${reportId}.${column.id}`).toBeTruthy();
    }
  });
});

describe("aturan `kamus+IDR` tidak tersentuh (#298)", () => {
  it("judul KERTAS tetap milik statement-layout, bukan katalog", () => {
    /*
     * Lima judul memang WAJIB berbeda antara layar dan kertas — kertas menyebut
     * satuannya ("Nilai Akhir (IDR)"), layar tidak. #324 hanya menyentuh sisi
     * LAYAR; menyeret judul kertas ikut menurun dari katalog akan membawa
     * "(IDR)" ke layar yang tidak membutuhkannya.
     */
    const layout = readFileSync(
      join(__dirname, "..", "src", "lib", "statement-layout.ts"),
      "utf8"
    );
    expect(layout).toMatch(/STOCK_VALUE_HEADERS/);
    expect(layout).toMatch(/\(IDR\)/);

    /* Dan katalog TIDAK menyimpan judul kertas — ia menyimpan kunci kamus. */
    const catalog = readFileSync(join(__dirname, "..", "src", "lib", "report-catalog.ts"), "utf8");
    expect(catalog).not.toMatch(/labelKey: "[^"]*\(IDR\)"/);
  });
});
