/**
 * Token API — bentuk, pencocokan, dan penolakannya (issue #389, F-10).
 *
 * Yang dijaga di sini adalah sifat-sifat yang kalau hilang tidak menghasilkan
 * satu pun galat: token yang tetap diterima sesudah dicabut, rahasia yang bocor
 * lewat selisih waktu, atau bentuk salah yang tetap menghasilkan kueri ke basis
 * data kendali pada setiap permintaan sampah.
 */
import { describe, expect, it } from "vitest";

import {
  TOKEN_PREFIX,
  bearerFrom,
  hashSecret,
  issueToken,
  parseToken,
  secretMatches,
  shouldWriteLastUsed,
} from "@/lib/api-token";
import { DEFAULT_LIMIT, MAX_LIMIT, listMeta, parseListQuery } from "@/lib/api-v1";

describe("penerbitan", () => {
  it("bentuknya `sai_<id>_<rahasia>`", () => {
    const { token } = issueToken(7);
    expect(token.startsWith(`${TOKEN_PREFIX}_7_`)).toBe(true);
  });

  it("awalannya bisa dikenali pemindai rahasia", () => {
    // Gunanya bukan kosmetik: token yang tidak berpola tidak akan pernah
    // tertangkap saat seseorang menempelkannya ke repo publik.
    expect(issueToken(1).token).toMatch(/^sai_/);
  });

  it("dua penerbitan tidak pernah menghasilkan rahasia yang sama", () => {
    const a = issueToken(1);
    const b = issueToken(1);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("yang dipulangkan untuk disimpan adalah HASH, bukan tokennya", () => {
    const { token, hash } = issueToken(3);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain(hash);
  });

  it("id yang tidak sah ditolak — token tanpa id tidak bisa dicari", () => {
    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(() => issueToken(id)).toThrow();
    }
  });
});

describe("pembacaan", () => {
  it("token terbitan sendiri terbaca kembali", () => {
    const { token } = issueToken(42);
    const parsed = parseToken(token);
    expect(parsed?.id).toBe(42);
    expect(parsed?.secret).toBeTruthy();
  });

  it("rahasia yang MEMUAT garis bawah tetap terbaca", () => {
    /*
     * Alfabet base64url memuat `_`, dan `_` adalah pemisah tokennya sendiri.
     * Versi pertama modul ini memakai `split("_")` + "tepat tiga bagian" —
     * yang menolak kira-kira separuh token SAH, sebagai "bentuk salah" yang
     * tidak bisa dibedakan dari token palsu oleh siapa pun yang membaca lognya.
     */
    const parsed = parseToken("sai_7_abc_def-ghi_jklmnopqrstuvwxyz0123456789AB");
    expect(parsed?.id).toBe(7);
    expect(parsed?.secret).toBe("abc_def-ghi_jklmnopqrstuvwxyz0123456789AB");
  });

  it("seratus token terbitan berturut-turut semuanya terbaca kembali", () => {
    // Sifat yang hanya terlihat kalau diulang: satu contoh bisa kebetulan tidak
    // memuat `_` sama sekali.
    for (let i = 0; i < 100; i++) {
      const { token } = issueToken(i + 1);
      expect(parseToken(token), token).not.toBeNull();
    }
  });

  it("bentuk yang salah → null, TANPA menyentuh basis data", () => {
    /*
     * Inilah gunanya memisahkan pembacaan dari pencocokan: sebuah header
     * `Authorization` berisi teks sembarang tidak boleh menghasilkan satu kueri
     * pun. Tanpa pemisahan itu, membanjiri endpoint dengan sampah menjadi cara
     * membebani basis data KENDALI — yang dipakai setiap autentikasi di seluruh
     * aplikasi.
     */
    for (const buruk of [
      "",
      "sai",
      "sai_7",
      "sai_7_x",                       // rahasia terlalu pendek
      "bukan_7_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sai_0_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",   // id nol
      "sai_-1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",  // id negatif
      "sai_7_" + "a".repeat(200),      // rahasia terlalu panjang
    ]) {
      expect(parseToken(buruk), buruk).toBeNull();
    }
  });
});

describe("header Authorization", () => {
  it("skema Bearer dibaca tanpa peka huruf besar-kecil", () => {
    // Klien HTTP di alam bebas menuliskannya `bearer`, `Bearer`, dan `BEARER`;
    // menolak dua di antaranya adalah penolakan tanpa alasan keamanan apa pun.
    for (const skema of ["Bearer", "bearer", "BEARER"]) {
      expect(bearerFrom(`${skema} sai_1_abc`)).toBe("sai_1_abc");
    }
  });

  it("spasi berlebih dimaafkan", () => {
    expect(bearerFrom("  Bearer   sai_1_abc  ")).toBe("sai_1_abc");
  });

  it("skema lain dan header kosong → null", () => {
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom("sai_1_abc")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom("")).toBeNull();
  });
});

describe("pencocokan", () => {
  it("rahasia yang benar cocok", () => {
    const { token, hash } = issueToken(9);
    const secret = parseToken(token)!.secret;
    expect(secretMatches(secret, hash)).toBe(true);
  });

  it("rahasia yang salah tidak cocok", () => {
    const { hash } = issueToken(9);
    expect(secretMatches("rahasia-lain", hash)).toBe(false);
  });

  it("hash yang panjangnya aneh ditolak, bukan melempar", () => {
    // `timingSafeEqual` melempar bila panjangnya berbeda; baris basis data yang
    // rusak tidak boleh menjadi 500 pada jalur autentikasi.
    expect(secretMatches("apa pun", "")).toBe(false);
    expect(secretMatches("apa pun", "pendek")).toBe(false);
  });

  it("hash-nya deterministik", () => {
    expect(hashSecret("rahasia")).toBe(hashSecret("rahasia"));
    expect(hashSecret("rahasia")).not.toBe(hashSecret("rahasia2"));
  });
});

describe("penulisan `last_used_at` diredam", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("belum pernah dipakai → ditulis", () => {
    expect(shouldWriteLastUsed(null, now)).toBe(true);
  });

  it("baru saja ditulis → tidak ditulis lagi", () => {
    /*
     * Menulisnya pada SETIAP permintaan menjadikan satu integrasi yang menarik
     * data tiap detik sebagai satu UPDATE per detik ke basis data KENDALI —
     * tabel yang dipakai setiap autentikasi di seluruh aplikasi.
     */
    expect(shouldWriteLastUsed(new Date(now.getTime() - 5_000), now)).toBe(false);
  });

  it("lewat satu menit → ditulis lagi", () => {
    expect(shouldWriteLastUsed(new Date(now.getTime() - 61_000), now)).toBe(true);
  });
});

describe("bentuk daftar `/api/v1/…`", () => {
  it("nilai kueri yang salah DITOLAK, bukan diperbaiki diam-diam", () => {
    /*
     * Sebuah parameter yang salah ketik dan tetap "berhasil" menghasilkan
     * program yang tampak bekerja sambil menarik halaman yang salah selama
     * berbulan-bulan. Penolakan yang berisik adalah satu-satunya cara penulis
     * integrasi mengetahuinya pada menit pertama, bukan pada rekonsiliasi
     * pertama.
     */
    for (const q of ["limit=abc", "limit=0", "offset=-1", "updatedSince=kemarin"]) {
      const hasil = parseListQuery(new Request(`https://x.test/?${q}`));
      expect(hasil.ok, q).toBe(false);
    }
  });

  it("`limit` di atas maksimum ditolak, BUKAN dipotong", () => {
    // Penarik yang meminta 10.000 dan menerima 200 tanpa diberi tahu akan
    // menyimpulkan datanya memang cuma 200.
    const hasil = parseListQuery(new Request(`https://x.test/?limit=${MAX_LIMIT + 1}`));
    expect(hasil.ok).toBe(false);
  });

  it("tanpa parameter → bawaan yang kecil", () => {
    const hasil = parseListQuery(new Request("https://x.test/"));
    expect(hasil).toMatchObject({ ok: true, limit: DEFAULT_LIMIT, offset: 0, updatedSince: null });
  });

  it("`updatedSince` ISO terbaca — inilah yang membuat penarikan bertahap mungkin", () => {
    const hasil = parseListQuery(
      new Request("https://x.test/?updatedSince=2026-08-01T00:00:00.000Z")
    );
    expect(hasil.ok && hasil.updatedSince?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("`hasMore` dihitung server, bukan diserahkan ke penariknya", () => {
    // Tiga tempat untuk salah kalau setiap klien menghitungnya sendiri — dan
    // yang salah berhenti satu halaman terlalu awal, diam-diam.
    expect(listMeta({ total: 120, limit: 50, offset: 0 }).hasMore).toBe(true);
    expect(listMeta({ total: 120, limit: 50, offset: 100 }).hasMore).toBe(false);
    expect(listMeta({ total: 0, limit: 50, offset: 0 }).hasMore).toBe(false);
  });
});
