/**
 * MIGRATION PLATFORM 0008 di PostgreSQL SUNGGUHAN (PGlite, PostgreSQL 17 dalam
 * WASM) — data lama terjaga, halaman depan tampil sama, constraint menolak
 * yang harus ditolak.
 *
 * Kenapa bukan pemindaian teks seperti penjaga migration lain: yang
 * dijanjikan migration ini adalah PERILAKU — "kalimat yang tayang sesudah
 * deploy sama persis dengan sebelumnya" dan "boleh dijalankan ulang". Dua janji
 * itu hanya bisa dibuktikan dengan menjalankan SQL-nya.
 *
 * Cara membuktikannya:
 *   1. terapkan 0001–0007, isi `site_contents` dengan baris yang mewakili
 *      setiap bentuk yang mungkin ada di produksi (sah, berspasi tepi, kosong,
 *      bahasa asing, namespace lain, kunci yatim, kunci bersarang);
 *   2. hitung kamus yang dirender dengan cara LAMA (baris `site_contents` per
 *      bahasa → `applySiteContent`);
 *   3. terapkan 0008 (dua kali), lalu hitung dengan cara BARU (baris
 *      `published` → `applySiteContent`) — keduanya harus sama per bahasa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

import id from "@sai/core/i18n/dictionaries/id.json";
import en from "@sai/core/i18n/dictionaries/en.json";
import zh from "@sai/core/i18n/dictionaries/zh.json";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import { LOCALES, type Locale } from "@sai/core/i18n/config";
import { applySiteContent } from "@sai/core/site-content";

const DIR = join(process.cwd(), "prisma/postgresql/platform");
const TARGET = "0008_site_content_publishing";
const dictionaries = { id, en, zh } as unknown as Record<Locale, Dictionary>;

const migrations = readdirSync(DIR).sort();
const sqlOf = (name: string) => readFileSync(join(DIR, name, "migration.sql"), "utf8");

let db: PGlite;

/** Baris lama yang mewakili setiap bentuk yang mungkin ada di `site_contents`. */
const LEGACY: [locale: string, key: string, value: string][] = [
  ["id", "landing.heroHeading", "Judul lama dari konsol"],
  ["en", "landing.heroHeading", "Old heading from the console"],
  ["zh", "landing.heroHeading", "控制台旧标题"],
  ["id", "landing.heroBody", "  berspasi di tepi  "],
  ["id", "landing.footerTagline", "   "],
  ["en", "landing.footerTagline", ""],
  ["id", "landing.faqTrialA", "Ada {days} hari. ".repeat(200).trim()],
  ["jp", "landing.heroHeading", "bahasa asing"],
  ["id", "errors.notFound", "namespace lain"],
  ["id", "landing.kunciYangSudahDicabut", "kunci yatim"],
  ["id", "landing.hero.heading", "kunci bersarang"],
];

async function renderedOld(locale: Locale) {
  const { rows } = await db.query<{ content_key: string; value: string }>(
    `SELECT content_key, value FROM site_contents WHERE locale = $1`,
    [locale]
  );
  return applySiteContent(dictionaries[locale], Object.fromEntries(rows.map((r) => [r.content_key, r.value])))
    .landing;
}

async function renderedNew(locale: Locale) {
  const { rows } = await db.query<{ content_key: string; value: string }>(
    `SELECT content_key, value FROM site_content_entries WHERE locale = $1 AND status = 'published'`,
    [locale]
  );
  return applySiteContent(dictionaries[locale], Object.fromEntries(rows.map((r) => [r.content_key, r.value])))
    .landing;
}

async function rejects(sql: string): Promise<boolean> {
  try {
    await db.exec(`SAVEPOINT s; ${sql}`);
    await db.exec("RELEASE SAVEPOINT s");
    return false;
  } catch {
    await db.exec("ROLLBACK TO SAVEPOINT s; RELEASE SAVEPOINT s");
    return true;
  }
}

const before: Partial<Record<Locale, unknown>> = {};

beforeAll(async () => {
  db = new PGlite();
  for (const name of migrations) {
    if (name === TARGET) break;
    await db.exec(sqlOf(name));
  }
  for (const [locale, key, value] of LEGACY) {
    await db.query(
      `INSERT INTO site_contents (locale, content_key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, 'vyn', CURRENT_TIMESTAMP)`,
      [locale, key, value]
    );
  }
  for (const locale of LOCALES) before[locale] = await renderedOld(locale);

  /* Dua kali: berkasnya harus bisa dijalankan ulang tanpa efek ganda. */
  await db.exec(sqlOf(TARGET));
  await db.exec(sqlOf(TARGET));
  await db.exec("BEGIN");
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("migration platform 0008: data lama terjaga", () => {
  it("0008 adalah migration platform terakhir yang dibuktikan di sini", () => {
    expect(migrations).toContain(TARGET);
  });

  it("halaman depan tampil SAMA PERSIS sebelum dan sesudah, di ketiga bahasa", async () => {
    for (const locale of LOCALES) {
      expect(await renderedNew(locale), locale).toEqual(before[locale]);
    }
    /* Dan penimpanya memang berlaku — perbandingan dua kamus bawaan akan
       lulus juga, jadi itu bukan bukti. */
    expect((await renderedNew("id")).heroHeading).toBe("Judul lama dari konsol");
    expect((await renderedNew("zh")).heroHeading).toBe("控制台旧标题");
  });

  it("menyalin setiap baris yang sah apa adanya (tanpa trim), dan hanya itu", async () => {
    const { rows } = await db.query<{ locale: string; content_key: string; value: string; updated_by: string }>(
      `SELECT locale, content_key, value, updated_by FROM site_content_entries ORDER BY locale, content_key`
    );
    expect(rows.map((r) => `${r.locale}:${r.content_key}`)).toEqual([
      "en:landing.heroHeading",
      "id:landing.faqTrialA",
      "id:landing.footerTagline",
      "id:landing.heroBody",
      "id:landing.heroHeading",
      "id:landing.kunciYangSudahDicabut",
      "zh:landing.heroHeading",
    ]);
    expect(rows.find((r) => r.content_key === "landing.heroBody")?.value).toBe("  berspasi di tepi  ");
    expect(rows.every((r) => r.updated_by === "vyn")).toBe(true);
  });

  it("tabel lama tidak disentuh (paruh expand)", async () => {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM site_contents`);
    expect(rows[0].n).toBe(LEGACY.length);
  });

  it("dijalankan ulang tidak menggandakan apa pun: satu penerbitan baseline + satu revisi per baris", async () => {
    const pubs = await db.query<{ kind: string; change_count: number; published_by: string }>(
      `SELECT kind, change_count, published_by FROM site_content_publications`
    );
    expect(pubs.rows).toEqual([{ kind: "baseline", change_count: 7, published_by: "migration" }]);
    const revs = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM site_content_revisions WHERE previous_value IS NULL`
    );
    expect(revs.rows[0].n).toBe(7);
  });
});

describe("migration platform 0008: constraint", () => {
  const entry = (status: string, value: string | null, key = "landing.heroSub", locale = "id") =>
    `INSERT INTO site_content_entries (locale, content_key, status, value, updated_by, updated_at)
     VALUES ('${locale}', '${key}', '${status}', ${value === null ? "NULL" : `'${value}'`}, 'x', CURRENT_TIMESTAMP)`;

  it("menerima draf kembali-ke-bawaan (NULL) dan nilai biasa", async () => {
    expect(await rejects(entry("draft", null, "landing.ctaHeading"))).toBe(false);
    expect(await rejects(entry("published", "teks", "landing.ctaBody"))).toBe(false);
  });

  it("menolak yang tayang tanpa nilai, nilai kosong, status/bahasa/kunci asing", async () => {
    expect(await rejects(entry("published", null))).toBe(true);
    expect(await rejects(entry("draft", ""))).toBe(true);
    expect(await rejects(entry("archived", "x"))).toBe(true);
    expect(await rejects(entry("draft", "x", "landing.heroSub", "jp"))).toBe(true);
    expect(await rejects(entry("draft", "x", "errors.notFound"))).toBe(true);
    expect(await rejects(entry("draft", "x", "landing.hero.heading"))).toBe(true);
    expect(await rejects(entry("draft", "x".repeat(4001)))).toBe(true);
  });

  it("paling banyak satu baris per kunci + bahasa + status", async () => {
    expect(await rejects(entry("published", "pertama", "landing.navPricing"))).toBe(false);
    expect(await rejects(entry("published", "kedua", "landing.navPricing"))).toBe(true);
    expect(await rejects(entry("draft", "draf", "landing.navPricing"))).toBe(false);
  });

  it("revisi wajib mengubah sesuatu dan wajib punya penerbitan", async () => {
    const { rows } = await db.query<{ id: number }>(`SELECT id FROM site_content_publications LIMIT 1`);
    const pub = rows[0].id;
    const rev = (prev: string, value: string, pubId = pub) =>
      `INSERT INTO site_content_revisions (publication_id, locale, content_key, previous_value, value, updated_at)
       VALUES (${pubId}, 'id', 'landing.navFaq', ${prev}, ${value}, CURRENT_TIMESTAMP)`;
    expect(await rejects(rev("'a'", "'a'"))).toBe(true);
    expect(await rejects(rev("NULL", "NULL"))).toBe(true);
    expect(await rejects(rev("'a'", "'b'", 999_999))).toBe(true);
    expect(await rejects(rev("'a'", "NULL"))).toBe(false);
  });

  it("token pratinjau: hanya hash heks 64 karakter, unik", async () => {
    const preview = (hash: string) =>
      `INSERT INTO site_content_previews (token_hash, expires_at, created_by, updated_at)
       VALUES ('${hash}', CURRENT_TIMESTAMP, 'x', CURRENT_TIMESTAMP)`;
    expect(await rejects(preview("a".repeat(64)))).toBe(false);
    expect(await rejects(preview("a".repeat(64)))).toBe(true);
    expect(await rejects(preview("token-mentah-bukan-hash".padEnd(64, "x")))).toBe(true);
  });
});
