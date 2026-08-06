/**
 * Tema tampilan — keputusan murninya.
 *
 * Diuji di sini karena ketiganya dipakai ROOT LAYOUT di server, dan salahnya
 * tidak berbunyi sebagai galat melainkan sebagai layar yang salah warna:
 *
 *  • `parseTheme` menjaga cookie yang bisa diisi siapa saja (httpOnly: false)
 *    agar tidak pernah menjadi kelas CSS sembarang;
 *  • `themeClass` menentukan HTML pertama — salah di sini berarti kedipan
 *    terang sebelum hydrate, keluhan dark mode yang paling sering;
 *  • `colorScheme` menentukan warna kontrol BAWAAN peramban (pemilih tanggal
 *    wizard penyiapan, menu select) — bagian yang tidak kita gambar sendiri
 *    dan karena itu paling mudah tertinggal putih di halaman gelap.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { theme as antdTheme } from "antd";
import { describe, expect, it } from "vitest";
import {
  DARK_CLASS,
  DEFAULT_THEME,
  THEMES,
  colorScheme,
  isTheme,
  parseTheme,
  themeClass,
  themeScript,
} from "@/lib/theme/config";

describe("parseTheme", () => {
  it("menerima ketiga pilihan yang sah", () => {
    for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
  });

  it("apa pun di luar daftar jatuh ke bawaan, tanpa melempar", () => {
    // Cookie ini `httpOnly: false` — isinya bisa diubah dari konsol peramban.
    // Nilainya berakhir sebagai kelas pada <html>, jadi satu-satunya jawaban
    // yang aman untuk masukan asing adalah bawaan, bukan meneruskannya.
    for (const bogus of ["", "  ", "DARK", "solarized", "<script>", null, undefined, 7, {}]) {
      expect(parseTheme(bogus)).toBe(DEFAULT_THEME);
    }
  });

  it("bawaannya TERANG — light-first MASTER.md, bukan ikut sistem", () => {
    // Bila ini berubah jadi `system`, setiap pengguna ber-OS gelap membuka
    // aplikasi keuangan ini dalam mode yang belum ditinjau halaman demi
    // halaman — dipaksakan mesin, bukan dipilih orangnya.
    expect(DEFAULT_THEME).toBe("light");
    expect(parseTheme(undefined)).toBe("light");
  });
});

describe("isTheme", () => {
  it("menyempitkan hanya untuk nilai yang terdaftar", () => {
    expect(isTheme("system")).toBe(true);
    expect(isTheme("sistem")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("themeClass", () => {
  it("hanya `dark` yang membawa kelas", () => {
    expect(themeClass("dark")).toBe(DARK_CLASS);
    expect(themeClass("light")).toBe("");
  });

  it("`system` TIDAK dirender server — preferensi OS tak terlihat dari sana", () => {
    // Menebaknya berarti separuh pembaca mendapat kedipan ke tema yang salah.
    // Kelasnya dipasang skrip sebelum-cat, bukan oleh fungsi ini.
    expect(themeClass("system")).toBe("");
  });
});

describe("colorScheme", () => {
  it("pilihan eksplisit menghasilkan skema tunggal", () => {
    expect(colorScheme("light")).toBe("light");
    expect(colorScheme("dark")).toBe("dark");
  });

  it("`system` menyerahkan keputusannya kepada peramban", () => {
    expect(colorScheme("system")).toBe("light dark");
  });
});

describe("themeScript", () => {
  it("memasang kelas yang sama dengan yang dipakai CSS", () => {
    // Skrip dan `themeClass` harus menyebut kelas yang sama; kalau menyimpang,
    // pilihan "ikut sistem" diam-diam berhenti bekerja sementara light/dark
    // tetap benar — kegagalan yang hanya muncul pada sebagian pengguna.
    expect(themeScript()).toContain(`'${DARK_CLASS}'`);
    expect(themeScript()).toContain("prefers-color-scheme: dark");
  });

  it("satu baris tanpa tag penutup yang bisa memutus <script>", () => {
    expect(themeScript()).not.toContain("</");
    expect(themeScript()).not.toContain("\n");
  });
});

/* ------------------------------------------------------------------ */
/* Sisa `.dark` di globals.css — dua variabel, dan keduanya dihitung   */
/* ------------------------------------------------------------------ */

describe("blok `html.dark` di globals.css", () => {
  const css = readFileSync(
    join(__dirname, "..", "src", "app", "globals.css"),
    "utf8"
  );
  /** Ruang di dalam `rgba(...)` dibuang; AntD menuliskannya tanpa spasi. */
  const rapat = css.replace(/,\s+/g, ",");
  const gelap = antdTheme.getDesignToken({ algorithm: antdTheme.darkAlgorithm });

  /*
   * Issue #203 mencabut seluruh palet `.dark` dari `globals.css` — kecuali dua
   * variabel, karena pilihan tema "ikut sistem" tidak punya kanal lain sebelum
   * hydrate: preferensi OS tak terlihat dari server, jadi HTML pertama selalu
   * membawa token TERANG dan hanya skrip sebelum-cat yang bisa memperbaikinya,
   * dengan memasang sebuah kelas. Alasan lengkapnya di blok itu sendiri.
   *
   * Bahayanya: dua nilai warna yang ditulis tangan di CSS adalah dua nilai yang
   * bisa menyimpang dari palet AntD tanpa satu pun galat — dan yang menyimpang
   * hanya terlihat oleh pengguna "ikut sistem" ber-OS gelap, yaitu justru
   * kelompok yang paling jarang membuka laporan bug. Tes ini menghitung ulang
   * keduanya dari paket `antd` yang benar-benar terpasang setiap kali suite
   * berjalan, jadi versi AntD baru tidak bisa menggesernya diam-diam.
   */
  it("nilainya PERSIS token gelap Ant Design, bukan warna karangan", () => {
    expect(rapat).toContain(`--ant-color-bg-layout: ${gelap.colorBgLayout}`);
    expect(rapat).toContain(`--ant-color-text: ${gelap.colorText}`);
  });

  it("menempel pada kelas yang sama dengan yang dipasang `themeClass`", () => {
    // `html.dark`, bukan `.dark`: spesifisitasnya (0,1,1) harus mengalahkan
    // `.sai-tokens` (0,1,0) yang berdiri di elemen yang SAMA — kalau tidak,
    // blok token terang yang datang belakangan yang menang.
    expect(css).toContain(`html.${DARK_CLASS} {`);
  });

  it("tidak ada palet lama yang tertinggal", () => {
    // Token semantik era Tailwind (#203). Satu saja yang tersisa berarti ada
    // permukaan yang masih diwarnai dua lapisan sekaligus.
    for (const mati of [
      "--primary:",
      "--muted-foreground:",
      "--success-soft:",
      "--destructive-strong:",
      "--sidebar:",
    ]) {
      expect(css).not.toContain(mati);
    }
  });
});
