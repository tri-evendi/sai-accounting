import "server-only";

/**
 * ISI HALAMAN DEPAN — sisi BASIS DATAnya (migration platform 0008).
 *
 * KODE PENAGIHAN menurut doktrin #137: bersama `operator/store.ts`,
 * `subscription-store.ts`, dan `plan-catalog.ts`, jenis modul yang boleh
 * mengimpor `platform-db.ts`. JANGAN PERNAH mengimpornya dari penjaga atau
 * proxy, dan jangan pernah mengimpor BERKAS INI dari sana.
 *
 * ══ BENTUKNYA ═════════════════════════════════════════════════════════════
 *   • `site_content_entries`: per kunci+bahasa paling banyak satu `published`
 *     (yang tayang) dan satu `draft`. Draf `value = NULL` = "kembali ke bawaan".
 *   • `site_content_publications` + `site_content_revisions`: setiap penerbitan
 *     dan nilai sebelum/sesudah tiap kunci yang berubah. Mengembalikan versi
 *     lama = membuat DRAF dari revisi, lalu menerbitkannya seperti biasa. Satu
 *     jalur tulis ke yang tayang: `publishSiteContentDrafts`.
 *   • `site_content_previews`: hash token pratinjau berumur pendek.
 *
 * ══ `site_contents` SUDAH DICABUT (paruh contract, migration platform 0010) ═
 * Rilis 0.18.0 (migration 0008) menulis setiap perubahan pada yang tayang
 * juga ke tabel lama, supaya image sebelum 0008 tetap benar bila di-rollback.
 * Sesudah 0.18.x berjalan di produksi tanpa satu image pun yang membaca tabel
 * itu, dual-write-nya dicabut dan tabelnya di-DROP (0010, didaftarkan di
 * `KONTRAKSI_DIIZINKAN`, tests/expand-contract.test.ts). Konsekuensinya:
 * rollback ke image SEBELUM 0.18.0 kini menampilkan kalimat bawaan kamus.
 *
 * ══ GAGAL-LUNAK DI JALUR PUBLIK ═══════════════════════════════════════════
 * Yang gagal dibaca di sini adalah kalimat pemasaran. Platform yang mati
 * berarti halaman depan memakai kalimat bawaan kamus, bukan 500. Pembaca
 * konsol memulangkan `null` dan halamannya menyebutnya dalam satu kalimat.
 *
 * ══ CACHE: SINYAL LINTAS PROSES, BUKAN `updateTag` ════════════════════════
 * Yang menulis adalah `app-operator`; yang membaca adalah `app-customer`. Dua
 * proses, dua cache Next yang terpisah (tanpa `cacheHandler` bersama), jadi
 * `updateTag` dari konsol tidak pernah sampai ke halaman depan. Penerbitan
 * kini menaikkan sinyal `site-content` (`cache-signals.ts`), dan versinya
 * bagian dari kunci cache baca di bawah: halaman depan berubah dalam
 * `SITE_CONTENT_LIVE_DELAY_SECONDS` (= `CACHE_SIGNAL_POLL_SECONDS`). Umur
 * cache 5 menit tinggal sebagai jaring bila sinyalnya tak terbaca.
 *
 * ⚠ KEGAGALAN TIDAK IKUT TER-CACHE: lemparan ditangkap DI LUAR pembungkus
 * cache. Kalau `{}` hasil kegagalan masuk ke cache, satu detik platform tak
 * terjangkau akan membuat halaman depan memakai kalimat bawaan sepanjang umur
 * cache sesudah platformnya pulih (jebakan yang sama di `plan-catalog.ts`).
 */

import { createHash, randomBytes } from "node:crypto";
import { unstable_cache } from "next/cache";

import { bumpCacheSignal, cacheSignalVersion } from "@sai/platform/cache-signals";
import type { Locale } from "@sai/core/i18n/config";
import { platformDb } from "@sai/platform/platform-db";
import {
  SITE_CONTENT_KEY_PATTERN,
  SITE_CONTENT_NOTE_MAX,
  SITE_CONTENT_PREVIEW_TOKEN_PATTERN,
  SITE_CONTENT_PREVIEW_TTL_MINUTES,
  SITE_CONTENT_VALUE_MAX,
  contentLength,
  draftIntent,
  isSiteContentLocale,
  resolveSiteContent,
  type SiteContentPublicationKind,
} from "@sai/core/site-content";

/** Tag cache baca halaman depan (berlaku di dalam proses `app-customer`). */
export const SITE_CONTENT_TAG = "site-content";

/**
 * Umur cache yang tayang di `app-customer`: JARING, bukan jeda yang dijanjikan
 * — jedanya `SITE_CONTENT_LIVE_DELAY_SECONDS` lewat sinyal (kepala berkas).
 */
export const SITE_CONTENT_CACHE_SECONDS = 300;

/* ─────────────────────────────── Jalur publik ─────────────────────────────── */

async function readPublished(locale: Locale): Promise<Record<string, string>> {
  const rows = await platformDb.siteContentEntry.findMany({
    where: { locale, status: "published" },
    select: { key: true, value: true },
  });
  const out: Record<string, string> = {};
  for (const row of rows) if (row.value !== null) out[row.key] = row.value;
  return out;
}

const cachedPublished = unstable_cache(
  /* `_versi` = versi sinyal `site-content`; tidak dipakai di badan, ia ada
     supaya menjadi bagian kunci cache. */
  async (locale: Locale, _versi: number) => readPublished(locale),
  /* Kunci baru (`entries`): entri cache versi lama berisi baca `site_contents`
     dan tidak boleh dipakai ulang sesudah penukaran image. */
  ["site-content", "entries", "published", "signal"],
  { revalidate: SITE_CONTENT_CACHE_SECONDS, tags: [SITE_CONTENT_TAG] }
);

/**
 * Penimpa yang TAYANG untuk satu bahasa, atau `{}` bila platform tak
 * terjangkau. Tidak pernah memuat draf.
 */
export async function publishedSiteContent(locale: Locale): Promise<Record<string, string>> {
  try {
    /* -1 = versi tidak diketahui: satu entri tetap, umur cache yang memutuskan. */
    return await cachedPublished(locale, (await cacheSignalVersion(platformDb, "site-content")) ?? -1);
  } catch (error) {
    console.error("[site-content] penimpa tak terbaca, memakai kamus bawaan:", error);
    return {};
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Penimpa untuk PRATINJAU: yang tayang + draf di atasnya, hanya bila token
 * sah dan belum kedaluwarsa. Token yang salah bentuk, tidak dikenal, atau
 * kedaluwarsa memulangkan yang tayang saja, tanpa membedakan ketiganya.
 * Tanpa cache: pratinjau harus memperlihatkan draf yang baru disimpan.
 */
export async function previewSiteContent(
  locale: Locale,
  token: string
): Promise<Record<string, string>> {
  if (!SITE_CONTENT_PREVIEW_TOKEN_PATTERN.test(token)) return publishedSiteContent(locale);
  try {
    const preview = await platformDb.siteContentPreview.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { expiresAt: true },
    });
    if (!preview || preview.expiresAt.getTime() <= Date.now()) {
      return publishedSiteContent(locale);
    }
    const rows = await platformDb.siteContentEntry.findMany({
      where: { locale },
      select: { key: true, status: true, value: true },
    });
    const published: Record<string, string> = {};
    const drafts: Record<string, string | null> = {};
    for (const row of rows) {
      if (row.status === "published" && row.value !== null) published[row.key] = row.value;
      if (row.status === "draft") drafts[row.key] = row.value;
    }
    return resolveSiteContent(published, drafts);
  } catch (error) {
    console.error("[site-content] pratinjau tak terbaca, memakai yang tayang:", error);
    return publishedSiteContent(locale);
  }
}

/* ──────────────────────────────── Bacaan konsol ───────────────────────────── */

export interface SiteContentEntryRow {
  locale: string;
  key: string;
  status: string;
  value: string | null;
  updatedBy: string;
  updatedAt: Date;
}

/** Seluruh baris (tayang + draf, ketiga bahasa) untuk konsol. Tanpa cache. */
export async function siteContentEntriesForOperator(): Promise<SiteContentEntryRow[] | null> {
  try {
    return await platformDb.siteContentEntry.findMany({
      orderBy: [{ key: "asc" }, { locale: "asc" }],
      select: {
        locale: true,
        key: true,
        status: true,
        value: true,
        updatedBy: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    console.error("[site-content] daftar isi tak terbaca:", error);
    return null;
  }
}

export interface SiteContentRevisionRow {
  id: number;
  locale: string;
  key: string;
  previousValue: string | null;
  value: string | null;
}

export interface SiteContentPublicationRow {
  id: number;
  kind: string;
  note: string | null;
  changeCount: number;
  publishedBy: string;
  createdAt: Date;
  revisions: SiteContentRevisionRow[];
}

/** Penerbitan terbaru beserta revisinya, terbaru dulu. */
export async function siteContentPublications(
  limit = 30
): Promise<SiteContentPublicationRow[] | null> {
  try {
    return await platformDb.siteContentPublication.findMany({
      orderBy: { id: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        note: true,
        changeCount: true,
        publishedBy: true,
        createdAt: true,
        revisions: {
          orderBy: [{ key: "asc" }, { locale: "asc" }],
          select: { id: true, locale: true, key: true, previousValue: true, value: true },
        },
      },
    });
  } catch (error) {
    console.error("[site-content] riwayat tak terbaca:", error);
    return null;
  }
}

/* ──────────────────────────────────── Draf ─────────────────────────────────── */

export interface DraftInput {
  locale: Locale;
  key: string;
  /** Isi isian editor apa adanya. Kosong = kembali ke bawaan. */
  input: string;
}

export interface SaveDraftsResult {
  /** `locale:key` yang kini punya draf. */
  drafted: string[];
  /** `locale:key` yang drafnya dihapus karena isiannya sama dengan yang tayang. */
  cleared: string[];
}

function assertShape(locale: string, key: string, value: string | null) {
  if (!isSiteContentLocale(locale)) throw new Error(`[site-content] bahasa tidak dikenal: ${locale}`);
  if (!SITE_CONTENT_KEY_PATTERN.test(key)) throw new Error(`[site-content] kunci tidak sah: ${key}`);
  if (value !== null && (value.length === 0 || contentLength(value) > SITE_CONTENT_VALUE_MAX)) {
    throw new Error(`[site-content] nilai di luar batas untuk ${key}`);
  }
}

type Tx = Parameters<Parameters<typeof platformDb.$transaction>[0]>[0];

/**
 * Tulis draf sebuah target (`null` = kembali ke bawaan), dibandingkan dengan
 * yang TAYANG saat ini di basis data, bukan dengan yang dikira editor.
 */
async function writeDraft(
  tx: Tx,
  locale: Locale,
  key: string,
  input: string,
  actor: string
): Promise<"drafted" | "cleared" | "none"> {
  const published = await tx.siteContentEntry.findUnique({
    where: { locale_key_status: { locale, key, status: "published" } },
    select: { value: true },
  });
  const intent = draftIntent(input, published?.value ?? null);
  if (intent.action === "clear") {
    const removed = await tx.siteContentEntry.deleteMany({ where: { locale, key, status: "draft" } });
    return removed.count > 0 ? "cleared" : "none";
  }
  assertShape(locale, key, intent.value);
  await tx.siteContentEntry.upsert({
    where: { locale_key_status: { locale, key, status: "draft" } },
    create: { locale, key, status: "draft", value: intent.value, updatedBy: actor },
    update: { value: intent.value, updatedBy: actor },
  });
  return "drafted";
}

/**
 * Simpan isian editor sebagai DRAF. Tidak ada yang tayang berubah.
 *
 * ⚠ Pemanggil WAJIB sudah memvalidasi kunci terhadap kamus
 * (`isEditableContentKey`) dan nilainya (`contentValueProblem`). Di sini hanya
 * bentuk yang tidak butuh kamus yang ditegakkan; CHECK di basis data adalah
 * lapis terakhirnya.
 */
export async function saveSiteContentDrafts(
  inputs: readonly DraftInput[],
  actor: string
): Promise<SaveDraftsResult> {
  const drafted: string[] = [];
  const cleared: string[] = [];
  await platformDb.$transaction(async (tx) => {
    for (const { locale, key, input } of inputs) {
      const result = await writeDraft(tx, locale, key, input, actor);
      if (result === "drafted") drafted.push(`${locale}:${key}`);
      if (result === "cleared") cleared.push(`${locale}:${key}`);
    }
  });
  return { drafted, cleared };
}

/** Buang SEMUA draf. Yang tayang tidak berubah. Memulangkan jumlah yang dibuang. */
export async function discardSiteContentDrafts(): Promise<number> {
  const removed = await platformDb.siteContentEntry.deleteMany({ where: { status: "draft" } });
  return removed.count;
}

/**
 * Kembalikan versi dari riwayat sebagai DRAF.
 *
 *   • `undo`    — seluruh penerbitan `publicationId` dibalik: setiap kunci yang
 *                 berubah di sana kembali ke nilai SEBELUMnya;
 *   • `restore` — satu revisi: kunci itu kembali ke nilai SESUDAH penerbitan
 *                 tersebut.
 *
 * Hasilnya draf biasa: diperiksa di tinjauan, bisa dipratinjau, lalu
 * diterbitkan. Draf yang sudah ada pada kunci yang sama ditimpa.
 */
export async function draftsFromHistory(
  target: { mode: "undo"; publicationId: number } | { mode: "restore"; revisionId: number },
  actor: string,
  isEditable: (key: string) => boolean
): Promise<SaveDraftsResult> {
  const revisions =
    target.mode === "undo"
      ? await platformDb.siteContentRevision.findMany({
          where: { publicationId: target.publicationId },
          select: { locale: true, key: true, previousValue: true, value: true },
        })
      : await platformDb.siteContentRevision.findMany({
          where: { id: target.revisionId },
          select: { locale: true, key: true, previousValue: true, value: true },
        });

  const inputs: DraftInput[] = [];
  for (const rev of revisions) {
    if (!isSiteContentLocale(rev.locale) || !isEditable(rev.key)) continue;
    const wanted = target.mode === "undo" ? rev.previousValue : rev.value;
    inputs.push({ locale: rev.locale, key: rev.key, input: wanted ?? "" });
  }
  return saveSiteContentDrafts(inputs, actor);
}

/* ───────────────────────────────── Penerbitan ──────────────────────────────── */

export interface ContentChange {
  locale: string;
  key: string;
  previousValue: string | null;
  value: string | null;
}

export interface PublishResult {
  publicationId: number | null;
  changes: ContentChange[];
}

/**
 * Tulis satu perubahan ke yang tayang. `value = null` = kembali ke bawaan
 * (barisnya dihapus).
 */
async function applyPublished(tx: Tx, change: ContentChange, actor: string) {
  const { locale, key, value } = change;
  if (value === null) {
    await tx.siteContentEntry.deleteMany({ where: { locale, key, status: "published" } });
    return;
  }
  await tx.siteContentEntry.upsert({
    where: { locale_key_status: { locale, key, status: "published" } },
    create: { locale, key, status: "published", value, updatedBy: actor },
    update: { value, updatedBy: actor },
  });
}

async function recordPublication(
  tx: Tx,
  kind: SiteContentPublicationKind,
  changes: readonly ContentChange[],
  actor: string,
  note: string | null
): Promise<number> {
  const publication = await tx.siteContentPublication.create({
    data: {
      kind,
      note: note ? note.slice(0, SITE_CONTENT_NOTE_MAX) : null,
      changeCount: changes.length,
      publishedBy: actor,
    },
    select: { id: true },
  });
  await tx.siteContentRevision.createMany({
    data: changes.map((c) => ({
      publicationId: publication.id,
      locale: c.locale,
      key: c.key,
      previousValue: c.previousValue,
      value: c.value,
    })),
  });
  return publication.id;
}

/**
 * Terbitkan SEMUA draf dalam satu transaksi: yang tayang berubah, satu
 * penerbitan + revisinya tercatat, draf terhapus.
 *
 * Draf untuk kunci yang sudah tidak ada di kamus (`isEditable` false) tidak
 * diterbitkan dan tetap tinggal sebagai draf; konsol menampilkannya sebagai
 * kunci yatim. Draf yang hasilnya sama dengan yang tayang dihapus tanpa revisi.
 * Draf yang disimpan orang lain SELAMA transaksi ini berjalan tidak ikut
 * terhapus: yang dihapus hanya baris yang dibaca di awal.
 */
export async function publishSiteContentDrafts(input: {
  actor: string;
  note: string | null;
  isEditable: (key: string) => boolean;
}): Promise<PublishResult> {
  const result = await platformDb.$transaction(async (tx) => {
    const drafts = await tx.siteContentEntry.findMany({
      where: { status: "draft" },
      select: { id: true, locale: true, key: true, value: true },
    });
    const usable = drafts.filter((d) => isSiteContentLocale(d.locale) && input.isEditable(d.key));
    if (usable.length === 0) return { publicationId: null, changes: [] };

    const published = await tx.siteContentEntry.findMany({
      where: {
        status: "published",
        OR: usable.map((d) => ({ locale: d.locale, key: d.key })),
      },
      select: { locale: true, key: true, value: true },
    });
    const live = new Map(published.map((p) => [`${p.locale}:${p.key}`, p.value]));

    const changes: ContentChange[] = [];
    for (const d of usable) {
      const previousValue = live.get(`${d.locale}:${d.key}`) ?? null;
      if (previousValue === d.value) continue;
      changes.push({ locale: d.locale, key: d.key, previousValue, value: d.value });
    }

    let publicationId: number | null = null;
    if (changes.length > 0) {
      publicationId = await recordPublication(tx, "publish", changes, input.actor, input.note);
      for (const change of changes) await applyPublished(tx, change, input.actor);
    }
    await tx.siteContentEntry.deleteMany({ where: { id: { in: usable.map((d) => d.id) } } });
    return { publicationId, changes };
  });
  /* SESUDAH transaksi selesai: pembaca yang melihat versi baru wajib melihat
     isi baru. Tanpa perubahan pada yang tayang, tidak ada yang perlu dibuang. */
  if (result.changes.length > 0) await bumpCacheSignal(platformDb, "site-content");
  return result;
}

/**
 * Hapus semua baris (tayang + draf) untuk kunci yang sudah dicabut dari kamus.
 * Yang tayang dicatat sebagai penerbitan `purge` supaya nilainya tetap bisa
 * dibaca di riwayat.
 */
export async function purgeSiteContentKeys(keys: readonly string[], actor: string): Promise<PublishResult> {
  const valid = keys.filter((k) => SITE_CONTENT_KEY_PATTERN.test(k));
  if (valid.length === 0) return { publicationId: null, changes: [] };
  const result = await platformDb.$transaction(async (tx) => {
    const rows = await tx.siteContentEntry.findMany({
      where: { key: { in: valid } },
      select: { locale: true, key: true, status: true, value: true },
    });
    const changes: ContentChange[] = rows
      .filter((r) => r.status === "published" && r.value !== null)
      .map((r) => ({ locale: r.locale, key: r.key, previousValue: r.value, value: null }));
    let publicationId: number | null = null;
    if (changes.length > 0) {
      publicationId = await recordPublication(tx, "purge", changes, actor, null);
    }
    await tx.siteContentEntry.deleteMany({ where: { key: { in: valid } } });
    return { publicationId, changes };
  });
  if (result.changes.length > 0) await bumpCacheSignal(platformDb, "site-content");
  return result;
}

/* ───────────────────────────────── Pratinjau ───────────────────────────────── */

/**
 * Terbitkan token pratinjau baru. Token mentahnya hanya dipulangkan ke
 * pemanggil (untuk tautan); yang disimpan hanya SHA-256-nya. Token yang sudah
 * kedaluwarsa dibersihkan di sini.
 */
export async function createSiteContentPreview(
  actor: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SITE_CONTENT_PREVIEW_TTL_MINUTES * 60_000);
  await platformDb.siteContentPreview.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await platformDb.siteContentPreview.create({
    data: { tokenHash: hashToken(token), expiresAt, createdBy: actor },
  });
  return { token, expiresAt };
}
