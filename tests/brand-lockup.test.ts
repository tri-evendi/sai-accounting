/**
 * Penjaga LOCKUP MEREK — lambang + nama, satu susunan untuk seluruh app.
 *
 * ══ KEADAAN YANG TES INI LAHIR UNTUK MENUTUP ═══════════════════════════════
 * Perombakan sebelumnya menutup "satu produk, TIGA LAMBANG". Yang tersisa, dan
 * baru terukur sesudahnya: **satu lambang, ENAM LOCKUP**. Nama produk di
 * sebelah lambangnya dirender 16px di empat chrome dan 14px di dua lainnya,
 * dengan celah 8px di lima dan 12px di satu, dan bobotnya ditulis sebagai token
 * di lima tempat dan sebagai angka `600` di satu.
 *
 * Tidak satu pun dari itu pernah diputuskan — keenamnya hanya tidak pernah
 * dilihat berdampingan. Dan karena tidak ada yang gagal, tidak ada yang
 * memperbaikinya.
 *
 * Yang dijaga di sini: **`<BrandMark` hanya boleh dirender oleh `BrandLockup`**
 * — kecuali empat tempat yang memang bukan lockup, masing-masing dengan
 * alasannya di bawah. Daftar-izin yang pendek dan beralasan, bukan pengecualian
 * yang tumbuh diam-diam.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function berkasSumber(dir: string): string[] {
  const out: string[] = [];
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) out.push(...berkasSumber(jalur));
    else if (nama.endsWith(".tsx")) out.push(jalur);
  }
  return out;
}

/**
 * Yang BOLEH merender `BrandMark` langsung.
 *
 * Masing-masing bukan lockup "lambang + nama pada satu baris", dan itulah
 * satu-satunya alasan yang diterima di daftar ini.
 */
const DIIZINKAN: ReadonlyArray<{ berkas: string; alasan: string }> = [
  {
    berkas: "src/components/ui/brand-lockup.tsx",
    alasan: "Ia lockup-nya sendiri.",
  },
  {
    berkas: "src/components/ui/brand-mark.tsx",
    alasan: "Definisinya.",
  },
  {
    berkas: "src/components/auth/auth-shell.tsx",
    alasan:
      "Layar masuk memuat DUA susunan: lockup kecil di panel kiri (sudah memakai " +
      "`BrandLockup`) dan susunan TEGAK di tengah kartu — lambang di dalam kotak " +
      "berbayang, lalu `<h1>` halaman di bawahnya. Yang kedua bukan lockup sebaris: " +
      "namanya adalah judul halaman, dan menariknya ke dalam komponen merek berarti " +
      "komponen merek memutuskan tingkat heading sebuah halaman.",
  },
  {
    berkas: "src/components/landing/landing-app-frame.tsx",
    alasan:
      "Bilah atas GAMBAR PRODUK: lambang di sebelahnya bukan nama produk melainkan " +
      "nama PT contoh yang sedang dibuka. Memakai lockup di sana akan memajang nama " +
      "produk di tempat yang seharusnya memperlihatkan nama perusahaan.",
  },
];

const berkas = berkasSumber(SRC);

describe("lambang hanya dirender lewat lockup", () => {
  it("sapuannya benar-benar membaca banyak berkas", () => {
    /* Tanpa baris ini, sebuah sapuan yang salah jalur akan memulangkan daftar
       kosong dan tesnya hijau tanpa memeriksa apa pun. */
    expect(berkas.length).toBeGreaterThan(100);
  });

  it("tidak ada chrome yang menyusun lockup-nya sendiri", () => {
    const izin = new Set(DIIZINKAN.map((d) => d.berkas));
    const pelanggar: string[] = [];
    for (const jalur of berkas) {
      const relatif = jalur.replace(`${ROOT}/`, "");
      if (izin.has(relatif)) continue;
      if (readFileSync(jalur, "utf8").includes("<BrandMark")) pelanggar.push(relatif);
    }
    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Berkas berikut merender `<BrandMark` langsung:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nPakai `<BrandLockup>` (components/ui/brand-lockup.tsx) supaya nama " +
            "produk tidak kembali tampil dalam dua ukuran. Kalau susunannya memang " +
            "BUKAN lockup sebaris, tambahkan berkasnya ke DIIZINKAN beserta alasannya."
    ).toEqual([]);
  });

  it("daftar-izinnya tidak basi — setiap entri masih merender lambang", () => {
    /* Arah kedua, supaya daftar ini tidak menjadi tempat sampah: entri yang
       berkasnya sudah tidak memakai `BrandMark` harus dicabut. */
    for (const { berkas: relatif } of DIIZINKAN) {
      const src = readFileSync(join(ROOT, relatif), "utf8");
      expect(src, `${relatif} tidak lagi merender BrandMark`).toContain("BrandMark");
    }
  });

  it("daftar-izinnya tetap pendek — kalau memanjang, modelnya yang salah", () => {
    expect(DIIZINKAN.length).toBeLessThanOrEqual(5);
  });
});

describe("lockup memikul satu tipografi", () => {
  const src = readFileSync(join(SRC, "components", "ui", "brand-lockup.tsx"), "utf8");

  it("nama produk memakai satu ukuran dan satu bobot, dari token", () => {
    expect(src).toContain("var(--ant-font-size-lg)");
    expect(src).toContain("var(--ant-font-weight-strong)");
    /* Angka bobot harfiah adalah bentuk yang sudah ketahuan menyimpang sekali
       (chrome /docs menulis `600`). */
    expect(src).not.toMatch(/fontWeight:\s*\d/);
  });

  it("tetap komponen BERSAMA — empat pemanggilnya client, dua server", () => {
    expect(src.startsWith('"use client"')).toBe(false);
    /* Diperiksa lewat IMPOR, bukan sebutan `useToken`: berkas itu MENJELASKAN
       di komentar kepalanya kenapa ia tidak memakai hook, dan penjaga yang
       menghitung sebutan akan memerahkan berkas yang justru sedang patuh —
       pelajaran yang sama yang sudah dibayar `tests/heading-structure`. */
    expect(src).not.toMatch(/^import .* from "antd"/m);
  });
});

describe("kaki pendaratan menandatangani dengan lambangnya", () => {
  it("kolom identitas memakai lockup, bukan nama telanjang", () => {
    /* Sampai perombakan ini kaki halaman adalah satu-satunya tempat di seluruh
       pendaratan yang menyebut nama produk TANPA lambangnya — sementara bilah
       atas, gambar produk, dan tombol WhatsApp semuanya membawanya. */
    const src = readFileSync(
      join(SRC, "components", "landing", "landing-footer.tsx"),
      "utf8"
    );
    expect(src).toContain("<BrandLockup");
  });
});
