/**
 * KUNCI BUKU — penjaga untuk otentikasi ulang sebelum masuk buku sebuah PT.
 *
 * Yang diuji di sini adalah bagian yang MENENTUKAN apakah fiturnya bernilai:
 * bukan "apakah cookienya terbaca", melainkan apakah cookie yang DIPALSUKAN,
 * DICURI dari akun lain, atau SUDAH KEDALUWARSA benar-benar ditolak. Kunci yang
 * bisa dikarang lebih buruk daripada tidak ada kunci — ia terlihat seperti
 * perlindungan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  encodeUnlockCookie,
  isCompanyUnlocked,
  UMUR_KUNCI_MS,
  withCompanyUnlocked,
} from "@/lib/company-unlock";

const USER = "7";
const LAIN = "8";
const PT_A = 101;
const PT_B = 202;
const SEKARANG = 1_760_000_000_000;

describe("kunci buku — yang sah diterima", () => {
  it("cookie yang baru dibuat membuka PT-nya sendiri", () => {
    const c = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    expect(isCompanyUnlocked(c, USER, PT_A, SEKARANG)).toBe(true);
  });

  it("membuka satu PT tidak membuka PT lain", () => {
    const c = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    expect(isCompanyUnlocked(c, USER, PT_B, SEKARANG)).toBe(false);
  });

  it("PT kedua ditambahkan tanpa menutup yang pertama", () => {
    const satu = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    const dua = withCompanyUnlocked(satu, USER, PT_B, SEKARANG + 1000);
    expect(isCompanyUnlocked(dua, USER, PT_A, SEKARANG + 1000)).toBe(true);
    expect(isCompanyUnlocked(dua, USER, PT_B, SEKARANG + 1000)).toBe(true);
  });
});

describe("kunci buku — yang tidak sah ditolak", () => {
  it("tanda tangan yang diutak-atik ditolak", () => {
    const c = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    const [payload] = c.split(".");
    expect(isCompanyUnlocked(`${payload}.tandatanganpalsu`, USER, PT_A, SEKARANG)).toBe(false);
  });

  it("isi yang diutak-atik ditolak — tanda tangan lama tidak lagi cocok", () => {
    /* Serangan yang paling wajar dicoba: ganti id PT di dalam payload dan
       pertahankan tanda tangannya. */
    const c = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    const tandaTangan = c.slice(c.lastIndexOf(".") + 1);
    const palsu = Buffer.from(
      JSON.stringify({ u: USER, c: [[PT_B, SEKARANG + UMUR_KUNCI_MS]] }),
      "utf8"
    ).toString("base64url");
    expect(isCompanyUnlocked(`${palsu}.${tandaTangan}`, USER, PT_B, SEKARANG)).toBe(false);
  });

  it("cookie milik pengguna LAIN ditolak, walau tanda tangannya sah", () => {
    /* Inilah alasan `users.id` ikut ditandatangani: tanpa itu, cookie yang
       tertinggal setelah berganti akun di peramban yang sama tetap berlaku. */
    const c = encodeUnlockCookie({ u: LAIN, c: [[PT_A, SEKARANG + UMUR_KUNCI_MS]] });
    expect(isCompanyUnlocked(c, USER, PT_A, SEKARANG)).toBe(false);
  });

  it("entri yang kedaluwarsa ditolak", () => {
    const c = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    expect(isCompanyUnlocked(c, USER, PT_A, SEKARANG + UMUR_KUNCI_MS + 1)).toBe(false);
  });

  it("kedaluwarsa berlaku PER PT — membuka yang kedua tidak memperpanjang yang pertama", () => {
    const satu = withCompanyUnlocked(undefined, USER, PT_A, SEKARANG);
    /* PT B dibuka satu jam sebelum kunci PT A habis. */
    const jamTerakhir = SEKARANG + UMUR_KUNCI_MS - 60 * 60 * 1000;
    const dua = withCompanyUnlocked(satu, USER, PT_B, jamTerakhir);

    /* Satu detik sesudah kunci PT A habis: A tertutup, B masih terbuka. */
    const sesudah = SEKARANG + UMUR_KUNCI_MS + 1;
    expect(isCompanyUnlocked(dua, USER, PT_A, sesudah)).toBe(false);
    expect(isCompanyUnlocked(dua, USER, PT_B, sesudah)).toBe(true);
  });

  it("cookie kosong, rusak, atau tanpa titik ditolak — tanpa melempar", () => {
    for (const buruk of [undefined, "", "bukan-cookie", "a.b", ".", "..", "eyJ9.x"]) {
      expect(isCompanyUnlocked(buruk, USER, PT_A, SEKARANG)).toBe(false);
    }
  });
});

describe("kunci buku — rahasianya wajib", () => {
  it("tanpa AUTH_SECRET, penandatanganan MELEMPAR alih-alih memakai nilai bawaan", async () => {
    const semula = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      expect(() => withCompanyUnlocked(undefined, USER, PT_A, SEKARANG)).toThrow(/AUTH_SECRET/);
    } finally {
      process.env.AUTH_SECRET = semula;
    }
  });
});

/**
 * ══ HALAMAN BERPENJAGA-SENDIRI ═════════════════════════════════════════════
 *
 * Gerbang kunci berdiri di `gateAfterCompany()`, jadi setiap halaman yang
 * memanggil `requirePagePermission` mendapatkannya gratis. Yang TIDAK gratis
 * adalah halaman yang memasang konteks perusahaannya sendiri — dan lubang itu
 * sudah pernah terbuka sungguhan: beranda dasbor terbuka untuk SEMUA peran,
 * jadi ia tidak punya satu izin untuk dideklarasikan, dan sampai perbaikan ini
 * ia satu-satunya pintu yang tidak menuntut bukti kehadiran. Pintu PERTAMA
 * sesudah masuk, dan satu-satunya yang memajang saldo, piutang, dan stok
 * sekaligus.
 *
 * Tes ini membuat kelalaian yang sama mustahil sunyi: halaman yang memanggil
 * `enterCompanyFromRoute` sendiri WAJIB juga memanggil `requireUnlockedCompany`.
 */
const HALAMAN_BERPENJAGA_SENDIRI = [
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/page.tsx",
];

describe("kunci buku — halaman berpenjaga-sendiri tidak boleh melewatkannya", () => {
  it.each(HALAMAN_BERPENJAGA_SENDIRI)("%s memanggil requireUnlockedCompany", (rel) => {
    const src = readFileSync(join(__dirname, "..", rel), "utf8");
    /* Penjaga bagi penjaga: kalau halamannya berhenti memasang konteksnya
       sendiri (mis. pindah ke `requirePagePermission`), daftar di atas yang
       harus disunting — bukan tesnya yang dilonggarkan. */
    expect(src, `${rel} tidak lagi memasang konteksnya sendiri — perbarui daftarnya`).toContain(
      "enterCompanyFromRoute("
    );
    expect(src).toContain("requireUnlockedCompany(");
  });
});
