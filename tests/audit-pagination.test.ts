/**
 * Paginasi jejak audit — issue #60, ditulis ulang di #370.
 *
 * ══ APA YANG BERUBAH, DAN KENAPA TESNYA IKUT BERUBAH ═══════════════════════
 * Regresi asli #60: hanya 5000 baris TERAKHIR berkas JSONL yang dibaca,
 * sehingga `totalCount` salah dan entri di atasnya tak terjangkau. Tes lama
 * menguncinya lewat `paginateAuditLines`, sebuah paginator MURNI atas array
 * baris — satu-satunya bentuk yang mungkin ketika jejaknya berupa berkas.
 *
 * Sejak #370 jejaknya adalah tabel, dan paginasinya dikerjakan basis data
 * (`skip`/`take` + `count`). Regresi itu karena itu tidak lagi bisa lahir dari
 * sebuah salah-potong di kode: tidak ada lagi array yang dipotong. Yang masih
 * BISA lahir adalah dua hal lain, dan keduanya yang dijaga di sini:
 *
 *   1. parameter halaman yang tidak disanitasi — `?page=abc` kini bukan lagi
 *      "daftar tampak kosong" melainkan NaN yang lolos ke `skip`/`take` Prisma,
 *      yaitu galat kueri;
 *   2. seseorang mengembalikan pembacaan seluruh berkas "sementara".
 *
 * Butir 2 dijaga sebagai sapuan sumber — idiom yang sama dengan
 * `tests/audit-details.test.ts` dan `tests/no-public-uploads.test.ts`: yang
 * dijaga adalah sifat yang hilang tanpa gejala.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeAuditPaging } from "@/lib/audit";

const src = readFileSync(join(__dirname, "..", "src", "lib", "audit.ts"), "utf8");
/** Tanpa komentar: berkas itu MENJELASKAN bentuk lamanya panjang lebar. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("normalizeAuditPaging", () => {
  it("bawaan: halaman 1, 20 baris", () => {
    expect(normalizeAuditPaging({})).toEqual({ page: 1, perPage: 20 });
  });

  it("nilai yang tak bisa diurai jatuh ke bawaan, BUKAN ke NaN", () => {
    // NaN yang lolos ke skip/take Prisma adalah galat kueri — halaman Audit
    // yang gagal total, bukan halaman kosong.
    expect(normalizeAuditPaging({ page: Number.NaN })).toEqual({ page: 1, perPage: 20 });
    expect(normalizeAuditPaging({ perPage: Number.NaN })).toEqual({ page: 1, perPage: 20 });
    expect(normalizeAuditPaging({ page: Number.POSITIVE_INFINITY })).toEqual({
      page: 1,
      perPage: 20,
    });
  });

  it("halaman di bawah 1 dinaikkan ke 1 — `skip` negatif ditolak basis data", () => {
    expect(normalizeAuditPaging({ page: 0 }).page).toBe(1);
    expect(normalizeAuditPaging({ page: -7 }).page).toBe(1);
  });

  it("perPage dibatasi 1..50 — batas baris yang BENAR-BENAR diambil", () => {
    expect(normalizeAuditPaging({ perPage: 0 }).perPage).toBe(1);
    expect(normalizeAuditPaging({ perPage: 5000 }).perPage).toBe(50);
  });

  it("pecahan dibulatkan ke bawah: `skip`/`take` Prisma menuntut bilangan bulat", () => {
    expect(normalizeAuditPaging({ page: 2.9, perPage: 10.7 })).toEqual({ page: 2, perPage: 10 });
  });
});

describe("jalur baca jejak audit (#370)", () => {
  it("paginasi dikerjakan basis data, bukan dengan memotong array", () => {
    expect(code).toMatch(/skip:\s*\(page - 1\) \* perPage/);
    expect(code).toContain("take: perPage");
    expect(code).toContain("prisma.auditLog.count(");
  });

  it("terbaru dulu, dengan pemutus seri — baris tak boleh berpindah halaman", () => {
    expect(code).toMatch(/orderBy:\s*\[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  });

  it("tidak ada berkas yang dibaca lagi — itu seluruh sebab issue #370", () => {
    expect(code).not.toContain("readFile");
    expect(code).not.toContain("appendFile");
    expect(code).not.toContain("audit.jsonl");
  });

  it("perusahaan TIDAK disebut di `where` — kliennya sudah klien PT aktif", () => {
    // Kalau suatu hari baris ini gagal karena ada `companyId` di where, yang
    // sebenarnya terjadi adalah jejak audit pindah ke basis data bersama —
    // dan seluruh alasan #370 memilih basis data PT ikut gugur.
    expect(code).not.toMatch(/where:\s*\{[^}]*companyId/);
  });
});
