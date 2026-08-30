/**
 * GAMBAR mekanisme dokumentasi — dibuktikan BENAR-BENAR bisa dirender.
 *
 * ══ Kenapa tes ini ada ═════════════════════════════════════════════════════
 * Halaman `/docs/[...slug]` dirender DINAMIS (`ƒ` di keluaran build), jadi
 * `bun run build` tidak pernah menjalankan komponen gambarnya. Sebuah gambar
 * yang melempar saat render — kunci yang hilang, larik yang salah bentuk,
 * nilai yang tak ditangani — akan lolos seluruh gerbang dan baru terlihat
 * sebagai halaman bantuan yang rusak di produksi. Persis permukaan yang paling
 * jarang dibuka orang, jadi paling lama tak dilaporkan.
 *
 * Yang dijaga di sini sengaja RENDAH dan kokoh: setiap nama di `NamaDiagram`
 * punya gambar, gambarnya merender tanpa melempar, dan isinya benar-benar
 * keluar sebagai teks. Yang TIDAK dijaga adalah rupanya — itu pekerjaan mata,
 * dan tes yang mengunci tata letak hanya akan merah setiap kali kalimatnya
 * diperbaiki.
 *
 * ⚠ Teks di dalam gambar diperiksa sebagai TEKS, bukan sebagai gambar dengan
 * `alt`: bentuknya HTML biasa justru supaya pembaca layar membacanya (lihat
 * kepala `docs-figures.tsx`). Kalau suatu saat ia berubah menjadi SVG atau
 * `<img>`, tes ini yang merah lebih dulu.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DocFigure, type NamaDiagram } from "@/components/docs/docs-figures";
import { DOC_BLOCKS } from "@/lib/docs-content";

const SEMUA: NamaDiagram[] = [
  "alur-jurnal",
  "alur-persetujuan",
  "buku-per-pt",
  "alur-komoditas",
  "alur-distribusi",
  "alur-jasa",
  "alur-manufaktur",
];

/** Nama yang benar-benar dipakai sebuah halaman dokumen. */
const DIPAKAI = new Set(
  Object.values(DOC_BLOCKS)
    .flat()
    .filter((b): b is Extract<typeof b, { kind: "diagram" }> => b.kind === "diagram")
    .map((b) => b.nama)
);

describe("gambar dokumentasi", () => {
  it.each(SEMUA)("%s merender tanpa melempar dan mengeluarkan teks", (nama) => {
    const html = renderToStaticMarkup(<DocFigure nama={nama} keterangan="keterangan uji" />);
    expect(html.length).toBeGreaterThan(80);
    // Teks yang bisa dibaca, bukan sekadar kotak kosong.
    expect(html.replace(/<[^>]*>/g, "").trim().length).toBeGreaterThan(40);
  });

  it("tidak ada gambar yatim — semuanya dipakai halaman dokumen", () => {
    // Gambar yang tak dipernah dirujuk adalah kode mati yang tetap ikut ke
    // bundel; penjaga dua arah, seperti daftar pengecualian `docs.test.ts`.
    const yatim = SEMUA.filter((n) => !DIPAKAI.has(n));
    expect(yatim).toEqual([]);
  });

  it("tidak ada halaman yang menunjuk gambar yang tak ada", () => {
    const asing = [...DIPAKAI].filter((n) => !(SEMUA as string[]).includes(n));
    expect(asing).toEqual([]);
  });

  it("alur tiap jenis usaha menyebut tahap bernomor, urut", () => {
    // Urutan adalah SATU-SATUNYA hal yang gambar ini janjikan. Kalau nomornya
    // kacau, yang tergambar bukan alur melainkan kumpulan kotak.
    for (const nama of ["alur-komoditas", "alur-distribusi", "alur-jasa", "alur-manufaktur"] as const) {
      const teks = renderToStaticMarkup(<DocFigure nama={nama} keterangan="keterangan uji" />).replace(/<[^>]*>/g, " ");
      const nomor = [...teks.matchAll(/(\d+)\s*·/g)].map((m) => Number(m[1]));
      expect(nomor.length, `${nama} tak punya tahap bernomor`).toBeGreaterThan(2);
      expect(nomor, `${nama} nomornya tidak urut`).toEqual(
        Array.from({ length: nomor.length }, (_, i) => i + 1)
      );
    }
  });
});
