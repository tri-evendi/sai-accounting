/**
 * Penyimpanan berkas dokumen (issue #367) — bentuk kunci, pembacaan baris lama,
 * dan penolakan jalur yang tidak dikenali.
 *
 * Modul yang diuji MURNI (jalur + nama, tanpa Prisma, tanpa sesi), jadi seluruh
 * aturannya bisa dikunci tanpa basis data — pola yang sama dengan
 * `tests/coa-import.test.ts`.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  DOCUMENTS_ROOT,
  companyDocumentsDir,
  contentTypeFor,
  documentFileHref,
  isStorageKey,
  newStorageKey,
  resolveDocumentPath,
} from "@/lib/document-storage";

describe("newStorageKey", () => {
  it("menyusun `<companyId>/<uuid><ext>` dan tidak pernah memuat nama asli", () => {
    const key = newStorageKey(7, ".pdf");
    expect(key.startsWith("7/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
    expect(isStorageKey(key)).toBe(true);
  });

  it("dua unggahan berturut-turut tidak pernah bertabrakan", () => {
    expect(newStorageKey(1, ".png")).not.toBe(newStorageKey(1, ".png"));
  });

  it("ekstensi dinormalkan ke huruf kecil", () => {
    expect(newStorageKey(3, ".PDF").endsWith(".pdf")).toBe(true);
  });

  it("menolak ekstensi di luar daftar unggah", () => {
    expect(() => newStorageKey(1, ".exe")).toThrow();
    expect(() => newStorageKey(1, ".svg")).toThrow();
  });

  it("menolak companyId yang tidak masuk akal — jalur tanpa perusahaan tidak boleh lahir", () => {
    expect(() => newStorageKey(0, ".pdf")).toThrow();
    expect(() => newStorageKey(-1, ".pdf")).toThrow();
    expect(() => newStorageKey(1.5, ".pdf")).toThrow();
  });
});

describe("isStorageKey", () => {
  const uuid = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";

  it("menerima hanya bentuk yang memang dihasilkan newStorageKey", () => {
    expect(isStorageKey(`12/${uuid}.pdf`)).toBe(true);
  });

  it("menolak nama yang bukan uuid — termasuk yang tampak wajar", () => {
    expect(isStorageKey("12/kontrak.pdf")).toBe(false);
    expect(isStorageKey(`${uuid}.pdf`)).toBe(false);
  });

  it("menolak jalur bertingkat dan lintas-direktori", () => {
    expect(isStorageKey(`12/13/${uuid}.pdf`)).toBe(false);
    expect(isStorageKey(`../${uuid}.pdf`)).toBe(false);
    expect(isStorageKey(`12/../../${uuid}.pdf`)).toBe(false);
  });
});

describe("resolveDocumentPath", () => {
  const uuid = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";

  it("kunci penyimpanan mendarat DI DALAM akar dokumen", () => {
    const resolved = resolveDocumentPath(`12/${uuid}.pdf`);
    expect(resolved).toBe(path.join(DOCUMENTS_ROOT, "12", `${uuid}.pdf`));
    expect(resolved!.startsWith(DOCUMENTS_ROOT + path.sep)).toBe(true);
  });

  it("bentuk LAMA `/uploads/<nama>` kini null — bukan lagi dibaca", () => {
    /*
     * Kelonggaran baca bentuk lama dicabut 2026-08-16, setelah dihitung: tabel
     * `documents` berisi 0 baris di keempat PT dan `public/uploads` berisi 0
     * berkas, jadi tak ada satu baris pun yang bisa memakainya.
     *
     * Tes ini tidak dihapus melainkan DIBALIK, dan itu disengaja: menghapusnya
     * akan membuat bentuk lama kembali "tidak diuji" — keadaan yang sama
     * dengan sebelum #367 — sehingga sebuah jalur baca yang kelak menerima
     * `/uploads/…` lagi tidak akan menabrak apa pun. Sekarang ia menabrak ini.
     */
    expect(resolveDocumentPath("/uploads/B-L_1750000000000.pdf")).toBeNull();
  });

  it("nilai yang tidak dikenali → null, TIDAK PERNAH tebakan", () => {
    // Baris rusak dijawab 404. Menebak jalur lain untuk nilai yang tidak
    // dikenali adalah persis cara sebuah pembaca berkas berubah jadi pembaca
    // seluruh disk.
    expect(resolveDocumentPath("../../etc/passwd")).toBeNull();
    expect(resolveDocumentPath("/etc/passwd")).toBeNull();
    expect(resolveDocumentPath("")).toBeNull();
    expect(resolveDocumentPath("12/kontrak.pdf")).toBeNull();
  });
});

describe("companyDocumentsDir", () => {
  it("satu direktori per perusahaan, di dalam akar dokumen", () => {
    expect(companyDocumentsDir(9)).toBe(path.join(DOCUMENTS_ROOT, "9"));
  });

  it("menolak id yang tidak sah — penghapusan tidak boleh menunjuk akarnya", () => {
    expect(() => companyDocumentsDir(0)).toThrow();
    expect(() => companyDocumentsDir(Number.NaN)).toThrow();
  });
});

describe("contentTypeFor", () => {
  it("memetakan ekstensi yang diizinkan", () => {
    expect(contentTypeFor("scan.PDF")).toBe("application/pdf");
    expect(contentTypeFor("foto.jpeg")).toBe("image/jpeg");
  });

  it("yang tak dikenal jadi unduhan biasa, bukan tipe yang ditebak", () => {
    expect(contentTypeFor("aneh.bin")).toBe("application/octet-stream");
  });
});

describe("documentFileHref", () => {
  it("satu rumus alamat, dipakai daftar maupun pratinjau", () => {
    expect(documentFileHref(41)).toBe("/api/documents/41/file");
  });
});
