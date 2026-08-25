/**
 * PENJAGA #489 — alamat berkas dokumen SELALU membawa perusahaannya di jalur.
 *
 * Kenapa ini butuh penjaga sapuan sumber, bukan sekadar satu tes unit atas
 * `documentFileHref`: kesalahannya tidak terlihat saat kodenya ditulis. Sebuah
 * `href="/api/documents/12/file"` yang ditulis tangan lolos `tsc`, lolos lint,
 * dan tampak benar di review — lalu gagal HANYA di peramban, sebagai pratinjau
 * kosong tanpa pesan galat apa pun. Persis begitulah #489 lahir dan bertahan.
 *
 * Sebabnya mesin, bukan gaya: berkas dokumen diambil `<iframe src>`,
 * `<img src>`, dan `<a href download>` — tiga hal yang tidak melewati
 * `apiFetch()` dan karena itu tidak bisa membawa sepasang header
 * `x-tenant-slug`/`x-company-slug`. Tanpa perusahaan di jalurnya, penjaga
 * menjawab 409 sebelum izin sempat diperiksa (lihat `lib/company-scope.ts`).
 *
 * Bentuknya mengikuti `tests/no-public-uploads.test.ts`: yang dijaga bukan satu
 * berkas melainkan SIFAT seluruh direktori.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/** Alamat LAMA yang tidak bertenant — bentuk yang tidak boleh lahir kembali. */
const LEGACY_HREF = /["'`]\/api\/documents\//;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(full)));
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Ada tidaknya sebuah jalur di disk — route Next adalah direktori + berkas. */
async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

describe("berkas dokumen hanya keluar lewat route bertenant (#489)", () => {
  it("route-nya hidup di /api/t/[tenantSlug]/[companySlug]/…", async () => {
    const scoped = path.join(
      SRC,
      "app",
      "api",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      "documents",
      "[id]",
      "file",
      "route.ts"
    );
    expect(await exists(scoped), `route bertenant tidak ada di ${scoped}`).toBe(true);
  });

  it("route LAMA yang tidak bertenant sudah tidak ada — bukan disisakan sebagai alias", async () => {
    /*
     * Alias terasa ramah dan justru berbahaya: ia membuat alamat yang dijawab
     * 409 tetap bisa ditulis, dan yang menulisnya tidak akan tahu sampai ada
     * pengguna yang melapor. Yang dihapus harus benar-benar hilang.
     */
    const legacy = path.join(SRC, "app", "api", "documents");
    expect(await exists(legacy), "src/app/api/documents masih ada").toBe(false);
  });

  it("tidak ada satu pun sumber yang menunjuk /api/documents/", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      const source = await readFile(file, "utf8");
      // Komentar sengaja IKUT diperiksa di sini: prosa yang menyebut alamat
      // lama sebagai alamat yang berlaku adalah petunjuk yang menyesatkan
      // penulis berikutnya. Yang menyebutnya sebagai SEJARAH menuliskannya
      // tanpa tanda kutip, dan karena itu tidak tertangkap pola ini.
      if (LEGACY_HREF.test(source)) offenders.push(path.relative(process.cwd(), file));
    }

    expect(
      offenders,
      "Alamat berkas dokumen wajib disusun `documentFileHref(tenantSlug, companySlug, id)`. " +
        "`/api/documents/…` tidak membawa perusahaan, dan `<iframe>`/`<a download>` " +
        "tidak bisa menambahkan headernya — permintaannya dijawab 409 (#489)."
    ).toEqual([]);
  });
});
