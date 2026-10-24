/**
 * Tangkapan layar panduan `/docs` — penjaga TIGA ARAH (panduan bergambar, Okt 2026).
 *
 * Keputusan 5 issue #300 menolak tangkapan layar karena gambar yang dibuat
 * tangan menua diam-diam. Revisinya hanya aman bila tiga hal selalu benar, dan
 * ketiganya dijaga di sini — bukan diharapkan:
 *
 *  1. Setiap blok `gambar` di `lib/docs-content.ts` menunjuk berkas yang ADA
 *     di `public/docs/screenshots/` — tidak ada gambar patah di produksi.
 *  2. Setiap berkas di sana DIRUJUK halaman mana pun — tidak ada berkas yatim
 *     yang ikut ke setiap image Docker tanpa pernah dilihat siapa pun.
 *  3. Setiap berkas punya RESEP di `scripts/docs-screenshots.ts` (dan setiap
 *     resep punya berkas) — gambar yang tak bisa dibangkitkan ulang adalah
 *     tangkapan tangan yang menyamar.
 *
 * Plus bentuknya: WebP sungguhan berukuran `UKURAN_TANGKAPAN`, total tetap
 * masuk akal, dan teks alternatifnya berdiri sendiri sebagai kalimat.
 *
 * Skrip penangkapnya sendiri TIDAK dijalankan di sini (butuh aplikasi yang
 * berjalan) — yang dibaca hanya teks resepnya.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DOC_INDEX } from "@/lib/docs";
import { DOC_BLOCKS, UKURAN_TANGKAPAN, alamatTangkapan } from "@/lib/docs-content";

const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "public", "docs", "screenshots");
const SKRIP = readFileSync(join(ROOT, "scripts", "docs-screenshots.ts"), "utf8");
const PAKET = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function berkasDi(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nama) => {
    const p = join(dir, nama);
    return statSync(p).isDirectory() ? berkasDi(p) : [p];
  });
}

/** `<bagian>/<nama>` tanpa ekstensi — bentuk yang sama dengan `gambar.berkas`. */
const BERKAS = berkasDi(DIR).map((p) => relative(DIR, p).split("\\").join("/"));
const NAMA_BERKAS = BERKAS.filter((b) => b.endsWith(".webp")).map((b) => b.replace(/\.webp$/, ""));

const GAMBAR = DOC_INDEX.flatMap((halaman) =>
  DOC_BLOCKS[halaman.slug].flatMap((b) =>
    b.kind === "gambar" ? [{ halaman: halaman.slug, ...b }] : []
  )
);
const DIRUJUK = new Set(GAMBAR.map((g) => g.berkas));

/** Nama resep di skrip: setiap `nama: "<bagian>/<nama>"`. */
const RESEP = [...SKRIP.matchAll(/nama:\s*"([a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]);

/** Lebar & tinggi dari kepala berkas WebP (VP8 / VP8L / VP8X). */
function ukuranWebp(buf: Buffer): { lebar: number; tinggi: number } | null {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const potongan = buf.toString("ascii", 12, 16);
  if (potongan === "VP8X") {
    return { lebar: 1 + buf.readUIntLE(24, 3), tinggi: 1 + buf.readUIntLE(27, 3) };
  }
  if (potongan === "VP8 ") {
    return { lebar: buf.readUInt16LE(26) & 0x3fff, tinggi: buf.readUInt16LE(28) & 0x3fff };
  }
  if (potongan === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { lebar: (b & 0x3fff) + 1, tinggi: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

describe("tangkapan layar panduan — tiga arah", () => {
  it("pemindainya menemukan sesuatu (penjaga yang memindai kekosongan selalu hijau)", () => {
    expect(GAMBAR.length).toBeGreaterThan(20);
    expect(NAMA_BERKAS.length).toBeGreaterThan(20);
    expect(RESEP.length).toBeGreaterThan(20);
  });

  it("setiap gambar yang dirujuk ADA di public/docs/screenshots", () => {
    const hilang = GAMBAR.filter((g) => !NAMA_BERKAS.includes(g.berkas)).map(
      (g) => `${g.halaman} → ${g.berkas}.webp`
    );
    expect(hilang, "Jalankan `bun run docs:screenshots -- <nama>` untuk membuatnya.").toEqual([]);
  });

  it("setiap berkas DIRUJUK halaman mana pun — tidak ada gambar yatim", () => {
    const yatim = NAMA_BERKAS.filter((b) => !DIRUJUK.has(b));
    expect(yatim, "Rujuk dari `lib/docs-content.ts` atau hapus resep & berkasnya.").toEqual([]);
  });

  it("hanya WebP yang tinggal di sana", () => {
    expect(BERKAS.filter((b) => !b.endsWith(".webp"))).toEqual([]);
  });

  it("setiap berkas punya resep di skrip, dan setiap resep punya berkas", () => {
    expect(new Set(RESEP).size, "nama resep ganda").toBe(RESEP.length);
    expect(NAMA_BERKAS.filter((b) => !RESEP.includes(b)), "berkas tanpa resep").toEqual([]);
    expect(RESEP.filter((r) => !NAMA_BERKAS.includes(r)), "resep tanpa berkas").toEqual([]);
  });

  it("alamat publiknya sama dengan tempat berkasnya", () => {
    for (const g of GAMBAR) {
      expect(existsSync(join(ROOT, "public", alamatTangkapan(g.berkas)))).toBe(true);
    }
  });
});

describe("tangkapan layar panduan — bentuk", () => {
  it("setiap berkas WebP sungguhan berukuran tetap", () => {
    const salah: string[] = [];
    for (const nama of NAMA_BERKAS) {
      const ukuran = ukuranWebp(readFileSync(join(DIR, `${nama}.webp`)));
      if (
        !ukuran ||
        ukuran.lebar !== UKURAN_TANGKAPAN.lebar ||
        ukuran.tinggi !== UKURAN_TANGKAPAN.tinggi
      ) {
        salah.push(`${nama}: ${ukuran ? `${ukuran.lebar}×${ukuran.tinggi}` : "bukan WebP"}`);
      }
    }
    expect(salah).toEqual([]);
  });

  it("ukurannya tetap masuk akal — per berkas < 300 KB, total < 15 MB", () => {
    let total = 0;
    for (const nama of NAMA_BERKAS) {
      const b = statSync(join(DIR, `${nama}.webp`)).size;
      expect(b, `${nama}.webp terlalu besar`).toBeLessThan(300 * 1024);
      total += b;
    }
    expect(total).toBeLessThan(15 * 1024 * 1024);
  });

  it("teks alternatif berdiri sendiri sebagai kalimat", () => {
    for (const g of GAMBAR) {
      expect(g.alt.length, `alt terlalu pendek: ${g.berkas}`).toBeGreaterThan(30);
      expect(g.alt.trim().endsWith("."), `alt bukan kalimat: ${g.berkas}`).toBe(true);
      if (g.keterangan) expect(g.keterangan.trim().endsWith("."), `keterangan: ${g.berkas}`).toBe(true);
    }
  });
});

describe("skrip penangkap bukan bagian gerbang", () => {
  it("`docs:screenshots` ada, dan `verify`/`test` tidak memanggilnya", () => {
    expect(PAKET.scripts["docs:screenshots"]).toContain("scripts/docs-screenshots.ts");
    for (const gerbang of ["verify", "test", "build"]) {
      expect(PAKET.scripts[gerbang] ?? "").not.toContain("docs:screenshots");
      expect(PAKET.scripts[gerbang] ?? "").not.toContain("docs-screenshots");
    }
  });

  it("ukuran di skrip sama dengan `UKURAN_TANGKAPAN`", () => {
    expect(SKRIP).toContain(`const LEBAR = ${UKURAN_TANGKAPAN.lebar};`);
    expect(SKRIP).toContain(`const TINGGI = ${UKURAN_TANGKAPAN.tinggi};`);
  });
});

describe("rujukan silang", () => {
  it("`lihat-juga` tidak menunjuk halamannya sendiri", () => {
    for (const halaman of DOC_INDEX) {
      for (const b of DOC_BLOCKS[halaman.slug]) {
        if (b.kind !== "lihat-juga") continue;
        expect(b.slug, `${halaman.slug} merujuk dirinya`).not.toContain(halaman.slug);
        expect(b.slug.length).toBeGreaterThan(0);
      }
    }
  });
});
