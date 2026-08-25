/**
 * Dua keluhan pengguna, 24 Agustus 2026 — dan penjaga yang menahannya kembali.
 *
 * Keduanya ditemukan dari PRODUKSI, bukan dibayangkan, dan keduanya satu kelas:
 * sesuatu gagal, dan yang dilihat pengguna adalah **tidak terjadi apa-apa**.
 *
 *   1. "barang tidak bisa disimpan" — nama kembar melempar P2002 tanpa
 *      penangkap. Next menjawab 500, dan formulir jatuh ke kalimat umum
 *      "Barang gagal disimpan" tanpa satu kata pun tentang NAMANYA.
 *   2. "ganti bahasa tidak jalan" — tab yang terbuka sejak sebelum sebuah
 *      deploy memegang id server action yang server barunya tak kenali. Sepuluh
 *      kegagalan tercatat dalam dua kelompok; pengguna menekan berulang kali
 *      karena tidak ada satu pun tanda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

const src = (...parts: string[]) => readFileSync(join(__dirname, "..", "src", ...parts), "utf8");

describe("nama barang kembar dijawab, bukan diruntuhkan", () => {
  const route = src("app", "api", "inventory", "route.ts");

  it("P2002 DITANGKAP — tidak lagi menjadi 500 yang tak menjelaskan apa pun", () => {
    expect(route).toMatch(/isUniqueViolation/);
    expect(route).toMatch(/status: 409/);
  });

  it("jawabannya galat PER ISIAN pada `name`, supaya kotaknya tersorot", () => {
    /* `applyServerFieldErrors` di formulirnya hanya menyorot isian bila
       galatnya datang sebagai `details.fieldErrors.<nama isian>`. Pesan biasa
       akan kembali menjadi kalimat umum — persis yang dikeluhkan. */
    expect(route).toMatch(/fieldErrors:\s*\{\s*\n\s*name:/);
  });

  it("barang NONAKTIF punya kalimatnya sendiri", () => {
    /* Barang nonaktif tidak muncul di daftar mana pun (DATABASE.md §1.3), jadi
       "nama sudah dipakai" terdengar seperti aplikasi yang berbohong. */
    expect(route).toMatch(/itemNameTakenInactive/);
    expect(route).toMatch(/isActive/);
  });

  it("kalimatnya ada di ketiga bahasa, dan yang nonaktif menyebut sebabnya", () => {
    for (const dict of [id, en, zh]) {
      expect(dict.inventory.itemNameTaken.length).toBeGreaterThan(10);
      expect(dict.inventory.itemNameTakenInactive.length).toBeGreaterThan(10);
    }
    expect(id.inventory.itemNameTakenInactive).toMatch(/NONAKTIF/);
  });
});

describe("ganti bahasa selamat dari tab lama sesudah deploy", () => {
  const toggle = src("components", "ui", "locale-toggle.tsx");
  const menu = src("components", "layout", "user-menu.tsx");
  const fallback = src("lib", "i18n", "locale-cookie.ts");

  it("KEDUA sakelar bahasa punya jaring pengamannya", () => {
    /* Dua tempat, dan keduanya harus dijaga: satu di layar pra-aplikasi
       (halaman masuk), satu di menu akun. Memperbaiki salah satu saja berarti
       keluhan yang sama kembali dari layar yang lain. */
    for (const source of [toggle, menu]) {
      expect(source).toMatch(/fallbackSwitchLocale/);
      expect(source).toMatch(/catch/);
    }
  });

  it("jaringnya menulis cookie SENDIRI lalu memuat ulang penuh", () => {
    // Muat ulang itulah yang menyembuhkan penyebabnya: bundel lama diganti.
    expect(fallback).toMatch(/document\.cookie/);
    expect(fallback).toMatch(/location\.reload/);
  });

  it("nilai bahasa tetap divalidasi di jalur pengaman", () => {
    // Cookie boleh ditulis klien, tapi isinya tidak boleh sembarang.
    expect(fallback).toMatch(/isLocale/);
  });

  it("tema TIDAK ikut memuat ulang — layarnya sudah berpindah sendiri", () => {
    /* Perbedaan yang disengaja: kamus dipilih di SERVER (jadi bahasa menuntut
       render ulang), sementara tema sudah diterapkan di klien sebelum
       cookienya ditulis. Memuat ulang di sana hanya akan membuang isian
       formulir tanpa alasan. */
    const theme = src("lib", "theme", "client.tsx");
    expect(theme).toMatch(/persistTheme\(next\)\.catch/);
    expect(theme).not.toMatch(/location\.reload/);
  });
});
