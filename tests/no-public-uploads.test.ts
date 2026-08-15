/**
 * PENJAGA #367 — tidak ada satu pun jalur tulis yang menaruh berkas di `public/`.
 *
 * Aturan ini tidak bisa dijaga oleh review. Kebocorannya tidak terlihat saat
 * kodenya ditulis: berkas di `public/` disajikan sebagai berkas STATIS, yang
 * tidak melewati `requireApiPermission` mana pun, jadi yang membedakan dokumen
 * satu tenant dari tenant lain tinggal ketidaktahuan akan namanya. Ia baru
 * terlihat berbulan-bulan kemudian, di data orang lain.
 *
 * Karena itu bentuk penjaganya sapuan sumber, sama seperti
 * `tests/authz-coverage.test.ts` dan `tests/anchor-button-nesting.test.ts`:
 * yang dijaga bukan satu berkas melainkan SIFAT seluruh direktori.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/** Berkas yang BOLEH menyebut `public/uploads` — dan alasannya. */
const ALLOWED = new Set([
  // Satu-satunya tempat yang mengenal direktori lama, dan hanya untuk MEMBACA
  // baris yang belum dipindahkan `bun run migrate:documents`.
  path.join(SRC, "lib", "document-storage.ts"),
]);

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

/**
 * Menyusun jalur ke dalam `public/`. Dicocokkan sebagai POTONGAN JALUR, bukan
 * kata "public" telanjang — `publicAppUrl`, `robots: { index: true }`, dan
 * kata "publik" di komentar bukan urusan aturan ini.
 */
const PUBLIC_PATH = /["'`]public["'`]\s*,\s*["'`]uploads["'`]|public\/uploads/;

/**
 * Buang komentar sebelum mencocokkan. Tanpa langkah ini penjaga ini menuduh
 * setiap berkas yang MENJELASKAN aturannya — termasuk berkas yang justru
 * menegakkannya. Yang dijaga adalah KODE; prosa yang menyebut `public/uploads`
 * bukan berkas yang ditulis ke sana.
 *
 * Ditulis sebagai mesin keadaan, bukan `replace(/\/\/.*$/gm, "")`: sebuah
 * `"https://…"` di dalam string akan memotong sisa barisnya, dan baris yang
 * terpotong adalah kode yang lolos tanpa diperiksa.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  type State = "code" | "line" | "block" | '"' | "'" | "`";
  let state: State = "code";

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") state = c;
      out += c;
      i++;
      continue;
    }

    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; }
      i++;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; i += 2; continue; }
      if (c === "\n") out += c; // jaga nomor baris tetap sepadan
      i++;
      continue;
    }

    // Di dalam string: salin apa adanya, hormati escape.
    if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
    if (c === state) state = "code";
    out += c;
    i++;
  }

  return out;
}

/** Penulisan berkas apa pun. Yang dicari: penulisan YANG jalurnya di `public/`. */
const WRITES = /\b(writeFile|createWriteStream|appendFile|copyFile|rename|mkdir)\b/;

describe("tidak ada berkas yang ditulis ke public/ (#367)", () => {
  it("hanya document-storage.ts yang boleh menyebut public/uploads", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      if (ALLOWED.has(file)) continue;
      const source = stripComments(await readFile(file, "utf8"));
      if (PUBLIC_PATH.test(source)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(
      offenders,
      "Berkas dokumen tinggal di `data/documents/<companyId>/` dan hanya keluar " +
        "lewat `/api/documents/[id]/file` yang menuntut izin. Apa pun di `public/` " +
        "disajikan sebagai berkas statis TANPA penjaga — lihat lib/document-storage.ts."
    ).toEqual([]);
  });

  it("jalur unggah menulis lewat kunci penyimpanan, bukan nama dari pengguna", async () => {
    const upload = await readFile(path.join(SRC, "app", "api", "upload", "route.ts"), "utf8");

    // Kunci penyimpanan = satu-satunya sumber nama berkas di disk.
    expect(upload).toContain("newStorageKey");
    // Bentuk lama: nama asli pengguna + stempel waktu, langsung jadi nama berkas.
    expect(upload).not.toContain("Date.now()");
    expect(WRITES.test(upload)).toBe(true);
  });
});
