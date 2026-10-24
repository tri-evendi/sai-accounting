/**
 * ISI HALAMAN DEPAN: draf → terbit → riwayat (migration platform 0008) —
 * perilaku store dan aturan murninya.
 *
 * Yang dijaga, dan kenapa masing-masing:
 *
 *  1. **Draf tidak pernah terlihat di jalur publik.** `publishedSiteContent`
 *     hanya membaca baris `published`; draf muncul HANYA lewat token pratinjau
 *     yang sah dan belum kedaluwarsa.
 *  2. **Urutan resolusi:** draf (pratinjau) > terbit > bawaan kamus; draf
 *     `null` menghapus penimpa terbitnya.
 *  3. **Terbit mencatat riwayat yang bisa dibalik:** setiap perubahan punya
 *     nilai sebelum/sesudah, dan "batalkan penerbitan" menghasilkan draf yang
 *     mengembalikan keadaan sebelumnya.
 *  4. **Tanpa dual-write:** paruh contract (platform 0010) mencabut
 *     `site_contents`; store tidak lagi menyentuh model `siteContent` — basis
 *     data tiruan di bawah sengaja tidak memilikinya, jadi tulisan yang
 *     tertinggal melempar di sini, bukan di produksi.
 *  5. **Aturan isian:** batas per isian cukup untuk setiap kalimat bawaan di
 *     ketiga bahasa, penanda `{…}` wajib sama, tag HTML ditolak.
 *
 * Basis datanya tiruan di memori yang meniru bagian API Prisma yang dipakai
 * store (`findMany`/`upsert`/`deleteMany`/…). Bentuk SQL-nya sendiri
 * (CHECK, UNIQUE, salinan data lama) dibuktikan di PostgreSQL sungguhan oleh
 * `tests/site-content-migration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import id from "@sai/core/i18n/dictionaries/id.json";
import en from "@sai/core/i18n/dictionaries/en.json";
import zh from "@sai/core/i18n/dictionaries/zh.json";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import type { Locale } from "@sai/core/i18n/config";
import {
  SITE_CONTENT_KEY_PATTERN,
  SITE_CONTENT_PUBLICATION_KINDS,
  SITE_CONTENT_STATUSES,
  SITE_CONTENT_VALUE_MAX,
  applySiteContent,
  contentFieldSpec,
  contentValueProblem,
  defaultsOf,
  draftIntent,
  isEditableInAll,
  lockedBehindLocales,
  resolveSiteContent,
  siteContentDefaults,
  type ContentCell,
} from "@sai/core/site-content";

/* ───────────────────────────── Basis data tiruan ───────────────────────────── */

type Row = Record<string, unknown> & { id: number };

const fake = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {};
  let seq = 0;
  const compound: Record<string, string[]> = {
    locale_key_status: ["locale", "key", "status"],
    locale_key: ["locale", "key"],
  };

  function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([field, cond]) => {
      if (field === "OR") return (cond as Record<string, unknown>[]).some((w) => matches(row, w));
      if (compound[field]) {
        return compound[field].every((f) => row[f] === (cond as Record<string, unknown>)[f]);
      }
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { in?: unknown[]; lt?: Date };
        if (c.in) return c.in.includes(row[field]);
        if (c.lt) return (row[field] as Date).getTime() < c.lt.getTime();
      }
      return row[field] === cond;
    });
  }

  function pick(row: Row, select: Record<string, unknown> | undefined, table: string): Record<string, unknown> {
    if (!select) return { ...row };
    const out: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(select)) {
      if (field === "revisions" && table === "siteContentPublication") {
        const sub = spec as { select: Record<string, unknown> };
        out.revisions = (tables.siteContentRevision ?? [])
          .filter((r) => r.publicationId === row.id)
          .map((r) => pick(r, sub.select, "siteContentRevision"));
      } else out[field] = row[field];
    }
    return out;
  }

  function model(table: string) {
    const rows = () => (tables[table] ??= []);
    return {
      findMany: async (args: { where?: Record<string, unknown>; select?: Record<string, unknown>; take?: number; orderBy?: unknown } = {}) => {
        let list = rows().filter((r) => matches(r, args.where));
        if (table === "siteContentPublication") list = [...list].sort((a, b) => b.id - a.id);
        if (args.take) list = list.slice(0, args.take);
        return list.map((r) => pick(r, args.select, table));
      },
      findUnique: async (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const row = rows().find((r) => matches(r, args.where));
        return row ? pick(row, args.select, table) : null;
      },
      upsert: async (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const row = rows().find((r) => matches(r, args.where));
        if (row) Object.assign(row, args.update, { updatedAt: new Date() });
        else rows().push({ id: ++seq, createdAt: new Date(), updatedAt: new Date(), ...args.create });
      },
      deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
        const before = rows().length;
        tables[table] = rows().filter((r) => !matches(r, args.where));
        return { count: before - tables[table].length };
      },
      create: async (args: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const row: Row = { id: ++seq, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        rows().push(row);
        return pick(row, args.select, table);
      },
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        for (const data of args.data) rows().push({ id: ++seq, createdAt: new Date(), updatedAt: new Date(), ...data });
        return { count: args.data.length };
      },
    };
  }

  const db: Record<string, unknown> = {
    siteContentEntry: model("siteContentEntry"),
    siteContentPublication: model("siteContentPublication"),
    siteContentRevision: model("siteContentRevision"),
    siteContentPreview: model("siteContentPreview"),
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return {
    db,
    tables,
    reset() {
      for (const k of Object.keys(tables)) delete tables[k];
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@sai/platform/platform-db", () => ({ platformDb: fake.db }));

import {
  createSiteContentPreview,
  discardSiteContentDrafts,
  draftsFromHistory,
  previewSiteContent,
  publishSiteContentDrafts,
  publishedSiteContent,
  purgeSiteContentKeys,
  saveSiteContentDrafts,
  siteContentPublications,
} from "@sai/platform/site-content-store";

const dictionaries = { id, en, zh } as unknown as Record<Locale, Dictionary>;
const editable = (key: string) => isEditableInAll(dictionaries, key);

const HERO = "landing.heroHeading";
const BODY = "landing.heroBody";

beforeEach(() => fake.reset());

/* ─────────────────────────────── Draf & terbit ─────────────────────────────── */

describe("draf tidak pernah terlihat di jalur publik", () => {
  it("menyimpan draf tidak mengubah yang tayang", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul draf" }], "rina");
    expect(await publishedSiteContent("id")).toEqual({});
    /* …dan kamus yang dirender halaman depan tetap bawaan. */
    const rendered = applySiteContent(id as Dictionary, await publishedSiteContent("id"));
    expect(rendered.landing.heroHeading).toBe((id as Dictionary).landing.heroHeading);
  });

  it("pratinjau memperlihatkan draf HANYA dengan token yang sah dan belum kedaluwarsa", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul draf" }], "rina");
    const { token } = await createSiteContentPreview("rina");

    expect(await previewSiteContent("id", token)).toEqual({ [HERO]: "Judul draf" });
    /* Token asing berbentuk sah, token salah bentuk: yang tayang saja. */
    expect(await previewSiteContent("id", "A".repeat(43))).toEqual({});
    expect(await previewSiteContent("id", "bukan-token")).toEqual({});

    /* Kedaluwarsa: yang tayang saja. */
    for (const row of fake.tables.siteContentPreview) row.expiresAt = new Date(Date.now() - 1000);
    expect(await previewSiteContent("id", token)).toEqual({});
  });

  it("token mentah tidak disimpan — hanya SHA-256-nya", async () => {
    const { token } = await createSiteContentPreview("rina");
    const stored = fake.tables.siteContentPreview[0];
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.tables.siteContentPreview)).not.toContain(token);
  });
});

describe("terbit, riwayat, dan kembali", () => {
  it("terbit memindahkan draf ke yang tayang dan mencatat revisi", async () => {
    await saveSiteContentDrafts(
      [
        { locale: "id", key: HERO, input: "Judul baru" },
        { locale: "en", key: HERO, input: "New heading" },
      ],
      "rina"
    );
    const result = await publishSiteContentDrafts({ actor: "vyn", note: "uji", isEditable: editable });

    expect(result.changes).toHaveLength(2);
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Judul baru" });
    expect(await publishedSiteContent("en")).toEqual({ [HERO]: "New heading" });
    expect(fake.tables.siteContentEntry.filter((r) => r.status === "draft")).toHaveLength(0);

    const [pub] = (await siteContentPublications())!;
    expect(pub).toMatchObject({ kind: "publish", note: "uji", changeCount: 2, publishedBy: "vyn" });
    expect(pub.revisions.map((r) => [r.locale, r.previousValue, r.value]).sort()).toEqual([
      ["en", null, "New heading"],
      ["id", null, "Judul baru"],
    ]);

    /* Paruh contract: tabel lama tidak ditulis lagi. */
    expect(fake.tables.siteContent).toBeUndefined();
  });

  it("isian kosong = kembali ke bawaan saat terbit (baris tayang terhapus)", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul baru" }], "rina");
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });

    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "   " }], "rina");
    /* Draf `null` — dan pratinjaunya sudah memperlihatkan bawaan. */
    expect(fake.tables.siteContentEntry.find((r) => r.status === "draft")?.value).toBeNull();
    const { token } = await createSiteContentPreview("rina");
    expect(await previewSiteContent("id", token)).toEqual({});
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Judul baru" });

    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    expect(await publishedSiteContent("id")).toEqual({});
    expect(fake.tables.siteContentEntry.filter((r) => r.status === "published")).toHaveLength(0);
  });

  it("isian yang sama dengan yang tayang tidak menjadi draf", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul baru" }], "rina");
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    const r = await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul baru" }], "rina");
    expect(r).toEqual({ drafted: [], cleared: [] });
    /* Draf yang dikembalikan persis ke yang tayang DIHAPUS, bukan disimpan. */
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Lain" }], "rina");
    const back = await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Judul baru" }], "rina");
    expect(back.cleared).toEqual([`id:${HERO}`]);
  });

  it("'batalkan penerbitan' membuat draf yang mengembalikan keadaan sebelumnya", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Versi 1" }], "rina");
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    await saveSiteContentDrafts(
      [
        { locale: "id", key: HERO, input: "Versi 2" },
        { locale: "id", key: BODY, input: "Badan baru" },
      ],
      "rina"
    );
    const second = await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });

    await draftsFromHistory({ mode: "undo", publicationId: second.publicationId! }, "rina", editable);
    /* Belum tayang sebelum diterbitkan. */
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Versi 2", [BODY]: "Badan baru" });
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Versi 1" });
  });

  it("'pakai versi ini' mengembalikan satu kunci ke nilai sesudah penerbitan itu", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Versi 1" }], "rina");
    const first = await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Versi 2" }], "rina");
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });

    const revisionId = fake.tables.siteContentRevision.find((r) => r.publicationId === first.publicationId)!.id;
    await draftsFromHistory({ mode: "restore", revisionId }, "rina", editable);
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Versi 1" });
  });

  it("buang draf tidak menyentuh yang tayang", async () => {
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Versi 1" }], "rina");
    await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    await saveSiteContentDrafts([{ locale: "id", key: HERO, input: "Versi 2" }], "rina");
    expect(await discardSiteContentDrafts()).toBe(1);
    expect(await publishedSiteContent("id")).toEqual({ [HERO]: "Versi 1" });
  });

  it("draf kunci yang dicabut dari kamus tidak terbit; pembersihan mencatatnya di riwayat", async () => {
    const ghost = "landing.kunciYangSudahDicabut";
    fake.tables.siteContentEntry = [
      { id: 900, locale: "id", key: ghost, status: "published", value: "lama", updatedBy: "x", createdAt: new Date(), updatedAt: new Date() },
      { id: 901, locale: "id", key: ghost, status: "draft", value: "draf", updatedBy: "x", createdAt: new Date(), updatedAt: new Date() },
    ];
    const r = await publishSiteContentDrafts({ actor: "vyn", note: null, isEditable: editable });
    expect(r.publicationId).toBeNull();
    expect(fake.tables.siteContentEntry).toHaveLength(2);

    const purge = await purgeSiteContentKeys([ghost], "vyn");
    expect(purge.changes).toEqual([{ locale: "id", key: ghost, previousValue: "lama", value: null }]);
    expect(fake.tables.siteContentEntry).toHaveLength(0);
    const [pub] = (await siteContentPublications())!;
    expect(pub.kind).toBe("purge");
  });

  it("platform mati: jalur publik memulangkan {} (gagal-lunak), bukan melempar", async () => {
    const entry = fake.db.siteContentEntry as { findMany: unknown };
    const original = entry.findMany;
    entry.findMany = async () => {
      throw new Error("platform mati");
    };
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await publishedSiteContent("id")).toEqual({});
    } finally {
      entry.findMany = original;
    }
  });
});

/* ─────────────────────────────── Aturan murni ─────────────────────────────── */

describe("urutan resolusi: draf (pratinjau) > terbit > bawaan", () => {
  it("tanpa draf = persis yang terbit", () => {
    expect(resolveSiteContent({ [HERO]: "a" })).toEqual({ [HERO]: "a" });
  });
  it("draf menimpa terbit; draf null menghapus penimpa", () => {
    expect(resolveSiteContent({ [HERO]: "a", [BODY]: "b" }, { [HERO]: "draf", [BODY]: null })).toEqual({
      [HERO]: "draf",
    });
  });
  it("draftIntent: sama dengan yang tayang = tanpa draf; kosong = kembali ke bawaan", () => {
    expect(draftIntent("a", "a")).toEqual({ action: "clear" });
    expect(draftIntent("", null)).toEqual({ action: "clear" });
    expect(draftIntent("  a ", "a")).toEqual({ action: "clear" });
    expect(draftIntent("", "a")).toEqual({ action: "set", value: null });
    expect(draftIntent(" b ", "a")).toEqual({ action: "set", value: "b" });
    /* Nilai lama bertepi spasi tidak berubah jadi draf hanya karena dibuka. */
    expect(draftIntent(" lama ", " lama ")).toEqual({ action: "clear" });
  });
});

describe("aturan isian", () => {
  const keys = [...siteContentDefaults(id as Dictionary).keys()];

  it("setiap kalimat bawaan di KETIGA bahasa muat dalam batas isiannya", () => {
    const over: string[] = [];
    for (const key of keys) {
      const defaults = defaultsOf(dictionaries, key);
      const spec = contentFieldSpec(Object.values(defaults));
      expect(spec.maxLength).toBeGreaterThanOrEqual(40);
      expect(spec.maxLength).toBeLessThanOrEqual(SITE_CONTENT_VALUE_MAX);
      for (const [locale, text] of Object.entries(defaults)) {
        if (contentValueProblem(text, text, spec) !== null) over.push(`${locale}:${key}`);
      }
    }
    expect(over, "kalimat bawaan yang ditolak aturannya sendiri").toEqual([]);
  });

  it("penanda {…} wajib sama dengan kalimat bawaan", () => {
    const spec = contentFieldSpec(["Coba {days} hari"]);
    expect(contentValueProblem("Coba {days} hari gratis", "Coba {days} hari", spec)).toBeNull();
    expect(contentValueProblem("Coba gratis", "Coba {days} hari", spec)).toBe("placeholders");
    expect(contentValueProblem("Coba {dayz} hari", "Coba {days} hari", spec)).toBe("placeholders");
    expect(contentValueProblem("Halo {nama}", "Halo", spec)).toBe("placeholders");
  });

  it("tag HTML, karakter kendali, dan kepanjangan ditolak; kosong selalu sah", () => {
    const spec = contentFieldSpec(["Judul"]);
    expect(contentValueProblem("<b>Judul</b>", "Judul", spec)).toBe("markup");
    expect(contentValueProblem("<script>alert(1)</script>", "Judul", spec)).toBe("markup");
    expect(contentValueProblem("a\u0000b", "Judul", spec)).toBe("control");
    expect(contentValueProblem("x".repeat(spec.maxLength + 1), "Judul", spec)).toBe("too_long");
    expect(contentValueProblem("", "Judul", spec)).toBeNull();
    /* Tanda < biasa bukan tag. */
    expect(contentValueProblem("Harga < Rp 1 juta", "Judul", spec)).toBeNull();
  });

  it("panjang dihitung per code point, seperti char_length PostgreSQL", () => {
    const spec = { kind: "label" as const, maxLength: 40 };
    expect(contentValueProblem("😀".repeat(40), "x", spec)).toBeNull();
    expect(contentValueProblem("😀".repeat(41), "x", spec)).toBe("too_long");
  });
});

describe("terjemahan tertinggal", () => {
  const cell = (published: string | null, draft?: string | null): ContentCell => ({
    defaultValue: "d",
    published,
    draft,
  });
  it("diganti di sebagian bahasa = bahasa sisanya tertinggal", () => {
    expect(lockedBehindLocales({ id: cell("a"), en: cell(null), zh: cell(null) })).toEqual(["en", "zh"]);
    expect(lockedBehindLocales({ id: cell(null, "draf"), en: cell("b"), zh: cell(null) })).toEqual(["zh"]);
  });
  it("tidak diganti di mana pun, atau di semua bahasa = tidak tertinggal", () => {
    expect(lockedBehindLocales({ id: cell(null), en: cell(null), zh: cell(null) })).toEqual([]);
    expect(lockedBehindLocales({ id: cell("a"), en: cell("b"), zh: cell("c") })).toEqual([]);
    /* Draf "kembali ke bawaan" dihitung sebagai keadaan sesudah terbit. */
    expect(lockedBehindLocales({ id: cell("a", null), en: cell(null), zh: cell(null) })).toEqual([]);
  });
});

/* ─────────────────────── Kosakata kode = CHECK migration ─────────────────────── */

describe("kosakata kode = CHECK constraint migration 0008", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/postgresql/platform/0008_site_content_publishing/migration.sql"),
    "utf8"
  );
  const inList = (constraint: string) => {
    const m = new RegExp(`"${constraint}" CHECK \\("\\w+" IN \\(([^)]*)\\)\\)`).exec(sql);
    expect(m, constraint).not.toBeNull();
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  };

  it("status, jenis penerbitan, dan bahasa", () => {
    expect(inList("site_content_entries_status_check")).toEqual([...SITE_CONTENT_STATUSES].sort());
    expect(inList("site_content_publications_kind_check")).toEqual([...SITE_CONTENT_PUBLICATION_KINDS].sort());
    expect(inList("site_content_entries_locale_check")).toEqual(["en", "id", "zh"]);
  });

  it("bentuk kunci di SQL = SITE_CONTENT_KEY_PATTERN, dan setiap kunci kamus lolos", () => {
    const m = /"site_content_entries_key_check" CHECK \("content_key" ~ '([^']+)'\)/.exec(sql);
    expect(m?.[1]).toBe(SITE_CONTENT_KEY_PATTERN.source);
    for (const key of siteContentDefaults(id as Dictionary).keys()) {
      expect(SITE_CONTENT_KEY_PATTERN.test(key), key).toBe(true);
    }
  });

  it("batas nilai di SQL = SITE_CONTENT_VALUE_MAX", () => {
    expect(sql).toContain(`BETWEEN 1 AND ${SITE_CONTENT_VALUE_MAX}`);
  });
});

/* ──────────────────────────── Pratinjau di proxy ──────────────────────────── */

describe("proxy: header pratinjau tidak pernah dipercaya dari klien", () => {
  const src = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  it("`x-sai-preview` dibuang dulu, lalu hanya dipasang dari ?preview= di halaman pemasaran", () => {
    const hapus = src.indexOf('headers.delete("x-sai-preview")');
    const pasang = src.indexOf('headers.set("x-sai-preview"');
    expect(hapus).toBeGreaterThan(-1);
    expect(pasang).toBeGreaterThan(hapus);
    expect(src).toMatch(/SITE_CONTENT_PREVIEW_TOKEN_PATTERN\.test\(preview\)/);
    expect(src).toMatch(/isSiteContentPath\(request\.nextUrl\.pathname\)/);
  });
  it("respons pratinjau tidak di-cache, tidak diindeks, dan tanpa Referer", () => {
    expect(src).toContain('"Cache-Control", "private, no-store"');
    expect(src).toContain('"X-Robots-Tag", "noindex, nofollow"');
    expect(src).toContain('"Referrer-Policy", "no-referrer"');
  });
});
