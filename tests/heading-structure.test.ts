/**
 * Struktur heading & label kotak cari (issue #355).
 *
 * ── Kenapa ini tidak akan pernah ketahuan sendiri ──────────────────────────
 * Melompati tingkat heading tidak menghasilkan galat, tidak menggeser satu
 * piksel pun, dan terlihat sempurna di layar. Yang kehilangan sesuatu hanyalah
 * pengguna pembaca layar yang menjelajah per-heading: struktur seksi yang
 * secara visual sudah jelas menjadi satu daftar rata tanpa tingkatan.
 *
 * Audit produksi 13 Agustus 2026 menemukannya di delapan rute sampel —
 * Pengaturan bahkan `1,3,3,3,3,3,3`. Penyisiran berkas kemudian menunjukkan
 * jumlah sebenarnya JAUH lebih besar: `CardTitle` dipaku `<h3>`, sedangkan
 * sebagian besar halaman meletakkan kartu langsung di bawah `PageHeader`
 * (`<h1>`). Sampel 20 halaman tidak pernah bisa menemukan itu; penyisiran bisa.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");
const read = (p: string) => readFileSync(p, "utf8");

/** Semua berkas .tsx di bawah src/, rekursif. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue;
      out.push(...tsxFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const FILES = tsxFiles(SRC);

describe("CardTitle bisa memilih tingkat headingnya", () => {
  it("primitifnya menerima `level` dan bawaannya tetap 3", () => {
    const src = read(join(SRC, "components", "ui", "card.tsx"));
    expect(src).toContain("level = 3");
    expect(src).toContain('`h${level}`');
  });

  /*
   * Bawaan 3 dipertahankan DENGAN SENGAJA: mengubahnya akan menggeser setiap
   * kartu di 45 berkas sekaligus, termasuk yang sudah benar bersarang di bawah
   * `<h2>` milik `DashboardSection`. Regresi arah itu juga tidak menghasilkan
   * galat apa pun — jadi arahnya dikunci di sini.
   */
  it("kartu di dalam DashboardSection TIDAK memakai level={2}", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = read(file);
      if (!src.includes("DashboardSection")) continue;
      if (src.includes("CardTitle level={2}")) offenders.push(file.replace(SRC, "src"));
    }
    // Di dalam DashboardSection urutannya sudah h1 → h2 → h3; menaikkannya ke
    // h2 membuat judul kartu bersaing dengan judul seksinya sendiri.
    expect(offenders).toEqual([]);
  });
});

describe("kartu tingkat atas tidak melompati h2", () => {
  /*
   * Sapuan, bukan daftar tangan: daftar delapan rute dari audit adalah SAMPEL,
   * dan yang berikutnya ditulis orang lain tidak akan ada di dalamnya.
   */
  it("setiap berkas ber-CardTitle tanpa h2 sendiri memakai level={2}", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = read(file);
      if (!src.includes("<CardTitle")) continue;
      if (file.endsWith(join("components", "ui", "card.tsx"))) continue;
      /*
       * Punya h2 sendiri → h3 di dalamnya memang benar. Tiga bentuknya, dan
       * ketiganya harus dikenali: `<h2>` telanjang, `DashboardSection` (yang
       * menggambar h2-nya sendiri), dan `Typography.Title level={2}` milik AntD
       * — yang dipakai kedua wisaya dan juga merender `<h2>`. Mengenali dua
       * yang pertama saja membuat tes ini menuntut perbaikan pada berkas yang
       * strukturnya sudah benar.
       */
      if (/<h2|DashboardSection|Typography\.Title\s+level=\{2\}/.test(src)) continue;
      if (/<CardTitle(?![^>]*level=)/.test(src)) {
        offenders.push(file.replace(SRC, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });

  /* Jaring pengaman: kalau pola pembacaan rusak, sapuan di atas lulus tanpa
     memeriksa apa pun. Angkanya ambang bawah, bukan sama-dengan. */
  it("sapuannya benar-benar memeriksa banyak berkas", () => {
    const withTitle = FILES.filter((f) => read(f).includes("<CardTitle"));
    expect(withTitle.length).toBeGreaterThanOrEqual(30);
  });
});

describe("kotak cari punya nama yang terbaca pembaca layar", () => {
  /*
   * `placeholder` LENYAP begitu isian mulai diketik, jadi ia bukan nama —
   * pengguna pembaca layar yang kembali ke isian itu mendengar "edit teks",
   * tanpa petunjuk apa pun tentang apa yang dicari.
   */
  it("setiap kotak cari membawa label atau aria-label", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = read(file);
      // Blok elemen yang memuat name="search" / name="q" / type="search".
      /* `[^]` bukan `.` + flag `s`: target tsc repo ini di bawah es2018, dan
         `dotAll` ditolak `tsc` walau berjalan mulus di runtime-nya. */
      for (const m of src.matchAll(/<(?:Text)?Input\b[^>]*?\/>/g)) {
        const tag = m[0];
        if (!/name="(search|q)"|type="search"/.test(tag)) continue;
        if (/aria-label=|aria-labelledby=|\blabel=/.test(tag)) continue;
        offenders.push(`${file.replace(SRC, "src")} :: ${tag.slice(0, 60).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
