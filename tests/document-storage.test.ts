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
  legacyPublicName,
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

describe("legacyPublicName", () => {
  it("membaca nama di balik bentuk lama `/uploads/<nama>`", () => {
    expect(legacyPublicName("/uploads/Kontrak_1755000000000.pdf")).toBe(
      "Kontrak_1755000000000.pdf"
    );
  });

  it("menolak nama yang memuat jalur — sebuah `..` di sini adalah pembacaan di luar direktori", () => {
    expect(legacyPublicName("/uploads/../../.env")).toBeNull();
    expect(legacyPublicName("/uploads/sub/berkas.pdf")).toBeNull();
  });

  it("bukan bentuk lama → null", () => {
    expect(legacyPublicName("12/berkas.pdf")).toBeNull();
    expect(legacyPublicName("https://contoh.test/berkas.pdf")).toBeNull();
  });
});

describe("resolveDocumentPath", () => {
  const uuid = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";

  it("kunci penyimpanan mendarat DI DALAM akar dokumen", () => {
    const resolved = resolveDocumentPath(`12/${uuid}.pdf`);
    expect(resolved).toBe(path.join(DOCUMENTS_ROOT, "12", `${uuid}.pdf`));
    expect(resolved!.startsWith(DOCUMENTS_ROOT + path.sep)).toBe(true);
  });

  it("baris lama tetap terbaca sampai dipindahkan", () => {
    expect(resolveDocumentPath("/uploads/B-L_1750000000000.pdf")).toContain(
      path.join("public", "uploads")
    );
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
