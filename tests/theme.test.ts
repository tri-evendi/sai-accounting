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
