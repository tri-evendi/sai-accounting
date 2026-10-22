/**
 * PENJAGA REGISTER & PENANDA LISENSI (migration platform 0006 & 0007) — dua
 * aturan yang tidak boleh luntur diam-diam:
 *
 * 1. **Register adalah ARSIP, bukan kewenangan** (rancangan §8, 06-KEAMANAN
 *    §3.7). Kewenangan lisensi ada pada tanda tangan berkasnya, diverifikasi
 *    di mesin customer. Begitu satu baris kode di `app-customer` membaca tabel
 *    register untuk memutuskan apa pun, kewenangan itu berpindah ke baris yang
 *    bisa ditulis — tanpa satu galat pun. Maka: hanya modul store di
 *    `@sai/platform` yang menyentuh tabelnya, dan hanya konsol operator (plus
 *    store kunci penanda, yang berakhir di pemeriksa unggahan yang sama) yang
 *    mengimpor store itu.
 *
 * 2. **Kunci privat hanya hidup di SATU modul, dan di luar laptop hanya
 *    TERSEGEL.** Sampai 22 Okt 2026 aturannya "tidak ada kunci privat di luar
 *    laptop luring" — konsol tidak pernah menandatangani. Pemilik membalik
 *    keputusan itu (06-KEAMANAN §3.7): konsol kini boleh membuat kunci dan
 *    menandatangani, dengan kunci privat tersegel (scrypt + AES-256-GCM) dan
 *    frasa sandi yang diketik setiap kali. Penjaga lamanya TIDAK dihapus,
 *    melainkan diganti invarian model baru:
 *      • `@sai/platform/licence-signing` satu-satunya pemegang kunci privat
 *        (buat, baca, ekspor, segel, buka, tanda tangan);
 *      • modul itu diimpor hanya oleh store kuncinya + dua skrip luring; store
 *        kunci hanya oleh `/licences` konsol; membuat kunci & menandatangani
 *        hanya dipanggil dari server action-nya, di balik izin `licence.sign`;
 *      • `app-customer` dan kulit klien konsol tidak menyentuhnya sama sekali;
 *      • kolom `private_*` di migration mana pun hanya ciphertext/iv/tag, tanpa
 *        kolom atau env frasa sandi; tanpa `console.*` dan tanpa frasa sandi di
 *        jejak audit.
 *    Risiko sisa yang TIDAK bisa dijaga tes: RCE pada `app-operator` bisa
 *    menangkap frasa sandi saat diketik.
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
      .filter(
        (f) =>
          !f.rel.startsWith("apps/operator/") &&
          f.rel !== STORE &&
          f.rel !== "packages/platform/src/licence-signing-key-store.ts"
      )
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

describe("kunci privat lisensi hanya hidup di modul penanda — dan hanya tersegel di luar laptop", () => {
  /**
   * SATU modul memegang kunci privat: membuat pasangan, menyegel, membuka,
   * menandatangani. Dua jalur memakainya — konsol (lewat store kuncinya) dan
   * skrip luring — supaya keduanya menghasilkan byte yang sama.
   */
  const MODUL_PENANDA = "packages/platform/src/licence-signing.ts";
  const STORE_KUNCI = "packages/platform/src/licence-signing-key-store.ts";
  const ACTION_KONSOL = "apps/operator/src/app/(operator)/licences/actions.ts";
  const HALAMAN_KONSOL = "apps/operator/src/app/(operator)/licences/page.tsx";
  const SKRIP_LURING = ["scripts/licence-keygen.ts", "scripts/licence-issue.ts"];

  const SEMUA = () => [...SUMBER, ...berkasSkrip()];

  const POLA: [string, RegExp][] = [
    ["createPrivateKey", /\bcreatePrivateKey\s*\(/],
    ["generateKeyPair", /\bgenerateKeyPair(Sync)?\s*\(/],
    ["PEM privat", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["sign dari node:crypto", /import\s*\{[^}]*\bsign\b[^}]*\}\s*from\s*["'](node:)?crypto["']/],
    ["crypto.sign / createSign", /\bcrypto\.sign\s*\(|\bcreateSign\s*\(/],
    ["ekspor PKCS#8", /type:\s*["']pkcs8["']/],
  ];

  it("hanya modul penanda yang membuat, membaca, mengekspor, atau memakai kunci privat", () => {
    const pelanggar: string[] = [];
    for (const f of SEMUA()) {
      if (f.rel === MODUL_PENANDA) continue;
      const isi = tanpaKomentar(f.isi);
      for (const [nama, pola] of POLA) if (pola.test(isi)) pelanggar.push(`${f.rel}: ${nama}`);
    }
    expect(pelanggar).toEqual([]);
  });

  it("modul penanda memang memegang semuanya — kalau pindah, penjaga ini basi", () => {
    const isi = readFileSync(join(AKAR_REPO, MODUL_PENANDA), "utf8");
    for (const p of ["createPrivateKey(", "generateKeyPairSync(", "aes-256-gcm", "scrypt(", "setAAD("]) {
      expect(isi, p).toContain(p);
    }
  });

  it("modul penanda diimpor HANYA oleh store kuncinya dan dua skrip luring", () => {
    const boleh = new Set([STORE_KUNCI, ...SKRIP_LURING]);
    const pelanggar = SEMUA()
      .filter((f) => f.rel !== MODUL_PENANDA && /licence-signing["']/.test(tanpaKomentar(f.isi)))
      .filter((f) => !boleh.has(f.rel))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
    for (const rel of boleh) expect(existsSync(join(AKAR_REPO, rel)), rel).toBe(true);
  });

  it("store kunci diimpor HANYA oleh action & halaman `/licences` konsol", () => {
    const boleh = new Set([ACTION_KONSOL, HALAMAN_KONSOL]);
    const pelanggar = SEMUA()
      .filter((f) => f.rel !== STORE_KUNCI && /licence-signing-key-store/.test(tanpaKomentar(f.isi)))
      .filter((f) => !boleh.has(f.rel))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("membuat kunci & menandatangani hanya terjadi di SERVER ACTION konsol", () => {
    const AKSI = /\b(generateConsoleSigningKey|issueLicenceWithConsoleKey)\b/;
    const pemanggil = SEMUA()
      .filter((f) => f.rel !== STORE_KUNCI && AKSI.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel);
    expect(pemanggil).toEqual([ACTION_KONSOL]);
    const action = readFileSync(join(AKAR_REPO, ACTION_KONSOL), "utf8");
    expect(action.trimStart().startsWith('"use server"')).toBe(true);
    /* Izin tersendiri, bukan `licence.register` milik peran penagihan. */
    expect(action).toMatch(/requireOperatorActionSession\("licence\.sign"\)/);
  });

  it("ekspor/baca PEM privat mentah hanya dipanggil skrip luring", () => {
    const POLA_LURING = /\b(exportPrivateKeyPemForOfflineFile|readPrivateKeyPemFromOfflineFile)\b/;
    const pemanggil = SEMUA()
      .filter((f) => f.rel !== MODUL_PENANDA && POLA_LURING.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel)
      .sort();
    expect(pemanggil).toEqual([...SKRIP_LURING].sort());
  });

  it("app-customer & kulit klien konsol tidak menyentuh modul penanda sama sekali", () => {
    const pelanggar = SUMBER.filter(
      (f) =>
        f.rel.startsWith("src/") ||
        (f.rel.startsWith("apps/operator/") && /^\s*["']use client["']/.test(f.isi))
    )
      .filter((f) => /licence-signing/.test(tanpaKomentar(f.isi)))
      /* Kulit klien boleh mengimpor TIPE jawaban action-nya — bukan modulnya. */
      .filter((f) => /@sai\/platform\/licence-signing/.test(f.isi))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("hanya store kunci yang menyentuh tabel kunci", () => {
    const POLA_TABEL = /\blicenceSigningKey\s*\.|(?<!\w)licence_signing_keys\b/;
    const pelanggar = SEMUA()
      .filter((f) => f.rel !== STORE_KUNCI && POLA_TABEL.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("frasa sandi & kunci privat tidak pernah dicatat: tanpa console.* di penanda, store, dan action", () => {
    for (const rel of [MODUL_PENANDA, STORE_KUNCI, ACTION_KONSOL]) {
      expect(tanpaKomentar(readFileSync(join(AKAR_REPO, rel), "utf8")), rel).not.toMatch(/\bconsole\./);
    }
  });

  it("jejak audit action konsol tidak pernah memuat frasa sandi", () => {
    const isi = tanpaKomentar(readFileSync(join(AKAR_REPO, ACTION_KONSOL), "utf8"));
    const blok: string[] = [];
    for (let i = isi.indexOf("details:"); i >= 0; i = isi.indexOf("details:", i + 1)) {
      const awal = isi.indexOf("{", i);
      let dalam = 0;
      let j = awal;
      for (; j < isi.length; j++) {
        if (isi[j] === "{") dalam++;
        else if (isi[j] === "}" && --dalam === 0) break;
      }
      blok.push(isi.slice(awal, j + 1));
    }
    expect(blok.length).toBeGreaterThan(5);
    for (const b of blok) expect(b).not.toMatch(/passphrase|privateKey|ciphertext/i);
  });

  it("tidak ada env untuk kunci privat lisensi — di mana pun", () => {
    const pelanggar = SEMUA()
      .filter((f) => /LICENCE_(PRIVATE|SIGNING)_KEY|LICENCE_PASSPHRASE\b/.test(tanpaKomentar(f.isi)))
      .map((f) => f.rel);
    expect(pelanggar).toEqual([]);
  });

  it("migration register tidak punya kolom untuk kunci", () => {
    const sql = readFileSync(
      join(AKAR_REPO, "prisma/postgresql/platform/0006_licence_register/migration.sql"),
      "utf8"
    );
    const kode = sql.replace(/--.*$/gm, "");
    expect(kode).not.toMatch(/private|signing_key|secret/i);
  });

  it("kunci privat di basis data HANYA tersegel: kolom `private_*` = ciphertext/iv/tag, tanpa kolom frasa sandi", () => {
    const akar = join(AKAR_REPO, "prisma/postgresql");
    const pelanggar: string[] = [];
    for (const jenis of readdirSync(akar)) {
      const dir = join(akar, jenis);
      for (const m of readdirSync(dir)) {
        const jalur = join(dir, m, "migration.sql");
        if (!existsSync(jalur)) continue;
        const kode = readFileSync(jalur, "utf8").replace(/--.*$/gm, "");
        for (const [, kolom] of kode.matchAll(/"([a-z_]*(private|passphrase)[a-z_]*)"/g)) {
          if (!/^private_key_(ciphertext|iv|tag)$/.test(kolom!)) pelanggar.push(`${jenis}/${m}: ${kolom}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
    const sql = readFileSync(
      join(AKAR_REPO, "prisma/postgresql/platform/0007_licence_signing_keys/migration.sql"),
      "utf8"
    );
    expect(sql).toContain('"private_key_ciphertext"');
    expect(sql).toMatch(/UNIQUE INDEX "licence_signing_keys_active_key"[^;]*WHERE "is_active"/);
  });
});
