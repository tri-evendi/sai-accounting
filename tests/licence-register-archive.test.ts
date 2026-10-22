/**
 * PENJAGA REGISTER LISENSI (migration platform 0006) — dua aturan yang tidak
 * boleh luntur diam-diam:
 *
 * 1. **Register adalah ARSIP, bukan kewenangan** (rancangan §8, 06-KEAMANAN
 *    §3.7). Kewenangan lisensi ada pada tanda tangan berkasnya, diverifikasi
 *    di mesin customer. Begitu satu baris kode di `app-customer` membaca tabel
 *    register untuk memutuskan apa pun, kewenangan itu berpindah ke baris yang
 *    bisa ditulis — tanpa satu galat pun. Maka: hanya modul store di
 *    `@sai/platform` yang menyentuh tabelnya, dan hanya konsol operator yang
 *    mengimpor store itu.
 *
 * 2. **Tidak ada kunci privat di luar laptop luring.** Satu-satunya penanda
 *    adalah `scripts/licence-issue.ts` (dan pembuat kuncinya,
 *    `scripts/licence-keygen.ts`). Konsol dan paket tidak boleh membaca PEM
 *    privat, membuat pasangan kunci, atau memanggil `sign` — sekalipun "hanya
 *    untuk menghemat satu langkah".
 *
 * Pemindai memakai `akarSumber()` (`src/` + `packages/*` + `apps/*`): pemindai
 * yang menyapu `src/` saja lulus dengan nol pelanggar begitu kodenya pindah.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";

const SUMBER = berkasSumber([".ts", ".tsx", ".mts", ".js", ".mjs"]);

/** Berkas `scripts/` — skrip juga kode yang berjalan di mesin produksi. */
function berkasSkrip(): { rel: string; isi: string }[] {
  const akar = join(AKAR_REPO, "scripts");
  const out: { rel: string; isi: string }[] = [];
  const telusuri = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) telusuri(p);
      else if (/\.(ts|mts|js|mjs)$/.test(d.name)) {
        out.push({ rel: relative(AKAR_REPO, p).split(sep).join("/"), isi: readFileSync(p, "utf8") });
      }
    }
  };
  if (existsSync(akar)) telusuri(akar);
  return out;
}

const STORE = "packages/platform/src/licence-register-store.ts";

describe("register lisensi = arsip, bukan kewenangan", () => {
  it("ada yang dipindai (pemindai kosong lulus dengan nol pelanggar)", () => {
    expect(SUMBER.some((f) => f.rel === STORE)).toBe(true);
    expect(SUMBER.some((f) => f.rel.startsWith("src/"))).toBe(true);
  });

  it("hanya store yang menyentuh tabel register", () => {
    const POLA = /\b(licenceRegisterEntry|licenceCustomer)\s*\.|licence_register_entries|licence_customers/;
    const pelanggar = [...SUMBER, ...berkasSkrip()]
      .filter((f) => f.rel !== STORE && POLA.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("hanya konsol operator yang mengimpor store register", () => {
    const pelanggar = [...SUMBER, ...berkasSkrip()]
      .filter((f) => /licence-register-store/.test(tanpaKomentar(f.isi)))
      .filter((f) => !f.rel.startsWith("apps/operator/") && f.rel !== STORE)
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("app-customer tidak mengimpor modul register sama sekali", () => {
    const pelanggar = SUMBER.filter((f) => f.rel.startsWith("src/"))
      .filter((f) => /licence-register/.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("skema menyatakan aturannya di tempat tabelnya didefinisikan", () => {
    const skema = readFileSync(join(AKAR_REPO, "packages/db/prisma/platform/schema.prisma"), "utf8");
    expect(skema).toContain("ARSIP, BUKAN KEWENANGAN");
    expect(skema).toContain("tests/licence-register-archive.test.ts");
  });
});

describe("tidak ada kunci privat lisensi di luar laptop luring", () => {
  /** Penanda & pembuat kunci — DIJALANKAN DI MESIN LURING, tidak pernah dari konsol. */
  const PENANDA_SAH = new Set(["scripts/licence-issue.ts", "scripts/licence-keygen.ts"]);

  const POLA: [string, RegExp][] = [
    ["createPrivateKey", /\bcreatePrivateKey\s*\(/],
    ["generateKeyPair", /\bgenerateKeyPair(Sync)?\s*\(/],
    ["PEM privat", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["sign dari node:crypto", /import\s*\{[^}]*\bsign\b[^}]*\}\s*from\s*["'](node:)?crypto["']/],
    ["crypto.sign / createSign", /\bcrypto\.sign\s*\(|\bcreateSign\s*\(/],
    ["env kunci privat lisensi", /LICENCE_(PRIVATE|SIGNING)_KEY/],
  ];

  it("kode aplikasi, konsol, paket, dan skrip lain tidak menandatangani lisensi", () => {
    const pelanggar: string[] = [];
    for (const f of [...SUMBER, ...berkasSkrip()]) {
      if (PENANDA_SAH.has(f.rel)) continue;
      const isi = tanpaKomentar(f.isi);
      for (const [nama, pola] of POLA) if (pola.test(isi)) pelanggar.push(`${f.rel}: ${nama}`);
    }
    expect(pelanggar).toEqual([]);
  });

  it("penanda sah memang masih di tempatnya — kalau pindah, daftar di atas basi", () => {
    for (const rel of PENANDA_SAH) expect(existsSync(join(AKAR_REPO, rel)), rel).toBe(true);
  });

  it("migration register tidak punya kolom untuk kunci", () => {
    const sql = readFileSync(
      join(AKAR_REPO, "prisma/postgresql/platform/0006_licence_register/migration.sql"),
      "utf8"
    );
    const kode = sql.replace(/--.*$/gm, "");
    expect(kode).not.toMatch(/private|signing_key|secret/i);
  });
});
