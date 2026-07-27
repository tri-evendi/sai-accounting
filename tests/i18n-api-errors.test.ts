/**
 * Pesan galat route API yang mengikuti bahasa — penjaga janji-janjinya (fase B).
 *
 * Fase A memindahkan pesan zod ke kamus; fase B memindahkan pesan yang ditulis
 * langsung oleh route handler. Keduanya rapuh dengan cara yang sama: satu
 * literal yang lolos bukan galat apa pun, hanya satu kalimat yang selamanya
 * berbahasa Indonesia (atau, lebih buruk, berbahasa Inggris di aplikasi
 * berbahasa Indonesia) — dan tak seorang pun melihatnya sampai pengguna
 * berbahasa Mandarin membuka layarnya. Karena itu penjaganya di sini, bukan di
 * mata reviewer.
 *
 * Tiga janji yang dijaga:
 *
 *  1. **Tidak ada kalimat mentah yang menjadi `error` pada jawaban API.**
 *     Setiap `error:` di `src/app/api` harus berisi hasil `t("…")`, prosa dari
 *     modul lain (`e.message`, `valid.error`), atau nilai yang dirakit — BUKAN
 *     literal teks.
 *
 *  2. **Saluran galat wizard ikut dijaga.** `stepError()` di dua route wizard
 *     membungkus `NextResponse.json({ error, step, … })`, jadi pesannya tidak
 *     pernah lewat sebuah `error:` yang bisa dilihat penjaga #1. Argumen
 *     pesannya harus kunci kamus, bukan kalimat.
 *
 *  3. **Setiap kunci yang dipakai route benar-benar ada di kamus.** `tsc` sudah
 *     menolak kunci salah ketik lewat tipe `DictionaryKey`; tes ini menangkap
 *     yang lolos dari tipe (kunci yang dirakit, atau `t()` yang diteruskan
 *     lewat parameter).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import id from "@/lib/i18n/dictionaries/id.json";

const API_DIR = join(__dirname, "..", "src", "app", "api");

/**
 * Buang komentar TANPA merusak string (sebuah `//` di dalam sebuah URL bukan
 * komentar). Mesin keadaan, bukan regex — sama seperti
 * `tests/i18n-validation.test.tsx`, dan justru komentarlah yang paling banyak
 * berisi kalimat berbahasa manusia di route ini.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === c) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Isi literal teks yang dimulai pada `start` (harus sebuah tanda kutip). */
function readLiteral(source: string, start: number): string {
  const quote = source[start];
  let text = "";
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      text += source[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (source[i] === quote) break;
    text += source[i];
    i++;
  }
  return text;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.isFile() && entry.name === "route.ts" ? [full] : [];
  });
}

const ROUTES = routeFiles(API_DIR)
  .sort()
  .map((path) => ({
    name: relative(API_DIR, path).split(sep).join("/"),
    code: stripComments(readFileSync(path, "utf8")),
  }));

/**
 * Literal yang BOLEH tetap menjadi `error:` sebuah jawaban API.
 *
 * Kosong hari ini, dan itu memang tujuannya: setiap pesan galat route sudah
 * berupa kunci kamus. Daftar ini ada untuk pengecualian yang sah dan berumur
 * panjang — misalnya sebuah token format berkas atau kode protokol yang
 * kebetulan menempati slot `error` — dan setiap entri WAJIB menyebut alasannya,
 * bukan sekadar meredakan tes yang merah.
 *
 * Bentuk entri: `"<berkas route>: <teks literal>"`, mis.
 * `"tax/efaktur/route.ts: DJP-CSV"`.
 */
const ERROR_LITERAL_ALLOWED: ReadonlySet<string> = new Set([]);

/** Setiap `error:` yang nilainya dimulai dengan literal teks. */
function rawErrorLiterals(code: string): string[] {
  const found: string[] = [];
  const re = /\berror:\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const at = m.index + m[0].length;
    const c = code[at];
    if (c === '"' || c === "'" || c === "`") found.push(readLiteral(code, at));
  }
  return found;
}

/**
 * Argumen PERTAMA setiap `new …Error(` di dalam route, bila berupa literal.
 *
 * Route boleh punya kelas galatnya sendiri (`MatchError`) yang pesannya
 * ditangkap lalu dijadikan `error` pada jawaban — persis kalimat untuk
 * pengguna, hanya lewat jalan memutar yang tak terlihat oleh penjaga `error:`.
 */
function thrownErrorMessages(code: string): string[] {
  const found: string[] = [];
  const re = /\bnew \w*Error\(\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const at = m.index + m[0].length;
    const c = code[at];
    if (c === '"' || c === "'" || c === "`") found.push(readLiteral(code, at));
  }
  return found;
}

/** Argumen KEDUA setiap panggilan `stepError(` yang berupa literal teks. */
function stepErrorMessages(code: string): string[] {
  const found: string[] = [];
  const re = /\bstepError\(\s*(?:"[^"]*"|'[^']*')\s*,\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const at = m.index + m[0].length;
    const c = code[at];
    if (c === '"' || c === "'" || c === "`") found.push(readLiteral(code, at));
  }
  return found;
}

/** Semua jalur-titik yang sah di kamus sumber. */
function dictionaryKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    dictionaryKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

const SOURCE_KEYS = new Set(dictionaryKeys(id));

describe("route API tidak boleh memuat kalimat galat mentah", () => {
  it("menemukan berkas route untuk diperiksa", () => {
    // Kalau pembacaannya rusak, seluruh penjaga di bawah menjadi hampa.
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  it("setiap `error:` berisi kunci kamus, bukan kalimat", () => {
    const offenders = ROUTES.flatMap(({ name, code }) =>
      rawErrorLiterals(code)
        .map((text) => `${name}: ${text}`)
        .filter((entry) => !ERROR_LITERAL_ALLOWED.has(entry))
    );

    expect(
      offenders,
      "Pesan berikut masih ditulis sebagai kalimat di dalam route API. Ganti " +
        'dengan `const { t } = await getRequestI18n();` lalu `error: t("errors.…")`, ' +
        "dan tambahkan kuncinya ke KETIGA kamus (id/en/zh) pada posisi yang sama. " +
        "Bila memang bukan kalimat untuk pengguna, daftarkan di " +
        "ERROR_LITERAL_ALLOWED beserta alasannya."
    ).toEqual([]);
  });

  it("pesan `stepError()` di wizard juga berupa kunci kamus", () => {
    // `stepError` membungkus NextResponse.json, jadi pesannya tak pernah lewat
    // sebuah `error:` yang terlihat oleh penjaga di atas.
    const calls = ROUTES.flatMap(({ name, code }) =>
      stepErrorMessages(code).map((text) => `${name}: ${text}`)
    );
    expect(calls.length, "penjaga stepError tidak menemukan satu panggilan pun").toBeGreaterThan(10);

    const offenders = calls.filter((entry) => !/: (errors|validation)\./.test(entry));
    expect(
      offenders,
      "Pesan wizard berikut masih kalimat. Pakai kunci kamus " +
        '(`stepError(step, "errors.…")`); untuk prosa dari modul lain pakai ' +
        "`{ text: … }`, yang bukan literal dan karena itu tidak terlihat di sini."
    ).toEqual([]);
  });

  it("galat yang dilempar route juga membawa kunci, bukan kalimat", () => {
    const offenders = ROUTES.flatMap(({ name, code }) =>
      thrownErrorMessages(code)
        // Sebuah kalimat SELALU punya spasi; kunci kamus dan token enum
        // (`new ApprovalTransitionError("hilang", …)`) TIDAK PERNAH punya.
        // Definisi operasional yang sama dengan tests/i18n-validation.test.tsx,
        // jadi tak perlu daftar putih yang gampang basi.
        .filter((text) => /\s/.test(text))
        .map((text) => `${name}: ${text}`)
    );
    expect(
      offenders,
      "Galat berikut dilempar dengan kalimat sebagai pesannya. Bila pesannya " +
        "sampai ke pengguna (ditangkap lalu menjadi `error` pada jawaban), " +
        "simpan KUNCI kamus di kelas galatnya dan terjemahkan di `catch` — " +
        "lihat `MatchError` di reconciliation/[id]/match/route.ts."
    ).toEqual([]);
  });
});

describe("kunci kamus yang dipakai route API", () => {
  /** Setiap `t("…")` di dalam route, plus argumen kunci `stepError`. */
  const used = ROUTES.flatMap(({ name, code }) => {
    const keys = [...code.matchAll(/\bt\(\s*"([\w.]+)"/g)].map((m) => m[1]);
    return [...keys, ...stepErrorMessages(code)].map((key) => ({ name, key }));
  });

  it("route API memang sudah memakai kamus", () => {
    expect(used.length).toBeGreaterThan(150);
  });

  it("setiap kunci ada di id.json", () => {
    const missing = used
      .filter(({ key }) => !SOURCE_KEYS.has(key))
      .map(({ name, key }) => `${name}: ${key}`);
    expect(
      missing,
      "Kunci berikut dipakai route API tetapi tidak ada di id.json. " +
        "Tambahkan ke KETIGA kamus pada posisi yang sama — tests/i18n.test.ts " +
        "menjaga paritas kunci dan urutannya."
    ).toEqual([]);
  });

  it("tidak ada dua kunci `errors.*` yang teksnya sama persis", () => {
    // Inilah penyakit yang fase B obati: SATU keadaan yang dikarang ulang di
    // beberapa route ("Invalid input" / "Input tidak valid." / "Input tidak
    // valid" / "Isian tidak sah." adalah kalimat yang sama, ditulis empat kali).
    // Dua kunci berteks identik berarti konsolidasinya sudah bocor lagi.
    const byText = new Map<string, string[]>();
    for (const [key, text] of Object.entries(id.errors as Record<string, string>)) {
      byText.set(text, [...(byText.get(text) ?? []), `errors.${key}`]);
    }
    const twins = [...byText.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([text, keys]) => `${keys.join(" = ")} → ${JSON.stringify(text)}`);
    expect(
      twins,
      "Kunci berikut berteks sama persis. Pakai SATU kunci di kedua tempat, " +
        "atau bedakan kalimatnya — dua kunci kembar akan menyimpang saat salah " +
        "satunya disunting."
    ).toEqual([]);
  });
});
