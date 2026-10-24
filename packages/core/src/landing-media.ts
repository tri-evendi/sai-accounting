/**
 * GAMBAR & BUKTI SOSIAL HALAMAN DEPAN — INTI MURNI (tabel platform
 * `landing_images` + kolom `landing_settings`, migration platform 0015).
 *
 * Tanpa Prisma, tanpa `server-only`: dipakai pembaca halaman publik, server
 * action konsol, dan formulir client konsol.
 *
 * ══ BERKAS GAMBAR: POLA LOGO PRODUK, DIPERKETAT ═══════════════════════════
 * Mekanismenya sama dengan `/brand` (`brand_assets`): isi berkas di basis data
 * (ikut cadangan, dibaca kedua aplikasi tanpa volume bersama), format dibaca
 * dari ISI berkas — bukan nama atau MIME kiriman peramban — dan disajikan
 * dengan `nosniff` + CSP `sandbox` (`imageResponseHeaders`). Yang ditambahkan:
 *
 *   • WebP diterima di samping PNG/JPEG (tangkapan layar & foto jauh lebih
 *     kecil). WebP BERANIMASI ditolak.
 *   • SVG TETAP ditolak — ia dokumen XML yang bisa membawa skrip, dan jalur
 *     logo produk pun tidak menyanitasinya; tanda tangan berkasnya tidak cocok
 *     dengan satu pun format di atas, jadi ia jatuh di `not_image`.
 *   • METADATA DIBUANG sebelum disimpan (`stripImageMetadata`): EXIF/XMP/teks
 *     pada JPEG, PNG, dan WebP. Foto testimoni dari ponsel membawa koordinat
 *     GPS dan model kamera; halaman publik tidak boleh membagikannya.
 *     Piksel tidak disentuh — tidak ada pustaka gambar native.
 */

import {
  normalizeLocalizedText,
  parseHttpsUrl,
  type LocalizedText,
} from "./landing-settings";

/* ── Berkas gambar ─────────────────────────────────────────────────────────── */

export type LandingImageMime = "image/png" | "image/jpeg" | "image/webp";

/** Pemakaian sebuah gambar — menentukan batas ukurannya. Kosakata ditutup CHECK. */
export const LANDING_IMAGE_KINDS = ["hero", "gallery", "og", "testimonial", "client_logo", "partner_logo"] as const;
export type LandingImageKind = (typeof LANDING_IMAGE_KINDS)[number];

export interface LandingImageLimits {
  maxBytes: number;
  minSide: number;
  maxSide: number;
}

/**
 * Batas per pemakaian. Tangkapan layar boleh 1 MB (dimuat sekali, di bawah
 * lipatan atau sebagai gambar utama); logo & foto kecil 256 KB — mereka tampil
 * berjajar, dan sepuluh logo 1 MB adalah halaman 10 MB.
 */
export const LANDING_IMAGE_LIMITS: Record<LandingImageKind, LandingImageLimits> = {
  hero: { maxBytes: 1024 * 1024, minSide: 400, maxSide: 4096 },
  gallery: { maxBytes: 1024 * 1024, minSide: 400, maxSide: 4096 },
  /* Kartu pratinjau tautan 1,91:1; di bawah 600 px lebar WhatsApp/Facebook
     menampilkannya sebagai gambar kecil, bukan kartu. Rasio & format (PNG)
     diperiksa terpisah. */
  og: { maxBytes: 1024 * 1024, minSide: 300, maxSide: 4096 },
  testimonial: { maxBytes: 256 * 1024, minSide: 64, maxSide: 2048 },
  client_logo: { maxBytes: 256 * 1024, minSide: 32, maxSide: 2048 },
  partner_logo: { maxBytes: 256 * 1024, minSide: 32, maxSide: 2048 },
};

/** Batas mutlak (CHECK di basis data memakai angka yang sama). */
export const LANDING_IMAGE_MAX_BYTES = 1024 * 1024;

export interface LandingImageInfo {
  mime: LandingImageMime;
  width: number;
  height: number;
}

export type LandingImageRejection =
  | "empty"
  | "too_large"
  | "not_image"
  | "animated"
  | "too_small"
  | "too_big_dimensions"
  | "og_shape";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function inspectPng(b: Uint8Array): LandingImageInfo | null {
  if (b.length < 24 || !PNG_SIG.every((v, i) => b[i] === v)) return null;
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
  return { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function inspectJpeg(b: Uint8Array): LandingImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

/** WebP: `RIFF....WEBP` + chunk pertama `VP8 ` / `VP8L` / `VP8X`. */
function inspectWebp(b: Uint8Array): (LandingImageInfo & { animated: boolean }) | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  const d = 20;
  if (chunk === "VP8 ") {
    if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null;
    return {
      mime: "image/webp",
      width: (b[d + 6] | (b[d + 7] << 8)) & 0x3fff,
      height: (b[d + 8] | (b[d + 9] << 8)) & 0x3fff,
      animated: false,
    };
  }
  if (chunk === "VP8L") {
    if (b[d] !== 0x2f) return null;
    const b1 = b[d + 1], b2 = b[d + 2], b3 = b[d + 3], b4 = b[d + 4];
    return {
      mime: "image/webp",
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      animated: false,
    };
  }
  if (chunk === "VP8X") {
    return {
      mime: "image/webp",
      width: 1 + u24le(b, d + 4),
      height: 1 + u24le(b, d + 7),
      animated: (b[d] & 0x02) !== 0,
    };
  }
  return null;
}

/** Format & ukuran dari ISI berkas, atau `null` (SVG, GIF, HTML, … semuanya `null`). */
export function inspectLandingImage(bytes: Uint8Array): (LandingImageInfo & { animated: boolean }) | null {
  const png = inspectPng(bytes);
  if (png) return { ...png, animated: false };
  const jpeg = inspectJpeg(bytes);
  if (jpeg) return { ...jpeg, animated: false };
  return inspectWebp(bytes);
}

/** Validasi berkas untuk satu pemakaian. */
export function validateLandingImage(
  bytes: Uint8Array,
  kind: LandingImageKind
): { ok: true; info: LandingImageInfo } | { ok: false; reason: LandingImageRejection } {
  const lim = LANDING_IMAGE_LIMITS[kind];
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > lim.maxBytes) return { ok: false, reason: "too_large" };
  const info = inspectLandingImage(bytes);
  if (!info || info.width === 0 || info.height === 0) return { ok: false, reason: "not_image" };
  if (info.animated) return { ok: false, reason: "animated" };
  if (Math.min(info.width, info.height) < lim.minSide) return { ok: false, reason: "too_small" };
  if (Math.max(info.width, info.height) > lim.maxSide) return { ok: false, reason: "too_big_dimensions" };
  if (kind === "og") {
    /* PNG saja: `opengraph-image.tsx` mengumumkan `og:image:type` image/png,
       dan rasio ±1,91:1 supaya `og:image:width/height` (1200×630) tetap
       menyatakan bentuk yang benar. */
    const ratio = info.width / info.height;
    if (info.mime !== "image/png" || info.width < 600 || ratio < 1.8 || ratio > 2.0) {
      return { ok: false, reason: "og_shape" };
    }
  }
  return { ok: true, info: { mime: info.mime, width: info.width, height: info.height } };
}

/* ── Buang metadata ────────────────────────────────────────────────────────── */

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** JPEG: buang APP1–APP13 & APP15 (EXIF, XMP, IPTC, …) dan COM. APP0 (JFIF),
 *  APP14 (Adobe — memengaruhi warna) dan semua penanda gambar dipertahankan. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda) break; // awal data gambar: sisanya disalin utuh
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const length = (b[i + 2] << 8) | b[i + 3];
    const end = i + 2 + length;
    const buang = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!buang) parts.push(b.subarray(i, end));
    i = end;
  }
  parts.push(b.subarray(i));
  return concat(parts);
}

const PNG_BUANG = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/** PNG: buang chunk teks, EXIF, dan waktu. Chunk lain (termasuk warna) utuh. */
function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return b; // rusak: biarkan validasi yang memutuskan
    if (!PNG_BUANG.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

/** WebP (VP8X): buang chunk `EXIF` & `XMP `, matikan penandanya, tulis ulang ukuran RIFF. */
function stripWebp(b: Uint8Array): Uint8Array {
  if (ascii(b, 12, 4) !== "VP8X") return b; // VP8/VP8L sederhana tidak memuat metadata
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > b.length) return b;
    if (type !== "EXIF" && type !== "XMP ") parts.push(b.subarray(i, end));
    i = end;
  }
  const body = concat(parts);
  body[8] &= ~(0x08 | 0x04); // penanda EXIF & XMP di VP8X
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff;
  head[5] = (size >> 8) & 0xff;
  head[6] = (size >> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  return concat([head, body]);
}

/** Salinan berkas tanpa metadata. Format tak dikenal dikembalikan apa adanya. */
export function stripImageMetadata(bytes: Uint8Array, mime: LandingImageMime): Uint8Array {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  return stripWebp(bytes);
}

/* ── Rujukan gambar & butir ────────────────────────────────────────────────── */

/**
 * Rujukan ke satu baris `landing_images`, DISALIN ke JSON setelan saat
 * disimpan (penulis memeriksa barisnya ada dan jenisnya cocok). Dengan sidik
 * & ukuran ikut tersimpan, halaman publik membangun `<img>` tanpa query kedua.
 */
export interface LandingImageRef {
  id: number;
  sha256: string;
  width: number;
  height: number;
}

export function normalizeImageRef(raw: unknown): LandingImageRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const id = n(r.id), width = n(r.width), height = n(r.height);
  if (!id || !width || !height) return null;
  if (typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.sha256)) return null;
  return { id, sha256: r.sha256, width, height };
}

/** Alamat publik gambar. Sidik di kueri = boleh di-cache peramban selamanya. */
export function landingImageUrl(ref: Pick<LandingImageRef, "id" | "sha256">): string {
  return `/brand/landing/${ref.id}?v=${ref.sha256.slice(0, 16)}`;
}

export const LANDING_LIST_MAX = 24;
export const TESTIMONIAL_QUOTE_MAX = 600;
export const PERSON_NAME_MAX = 100;
export const PERSON_ROLE_MAX = 120;
export const ALT_TEXT_MAX = 200;
export const GALLERY_MAX = 6;

export interface LandingTestimonial {
  key: string;
  published: boolean;
  quote: LocalizedText;
  name: string;
  role: string | null;
  photo: LandingImageRef | null;
}

export interface LandingClientLogo {
  key: string;
  published: boolean;
  name: string;
  href: string | null;
  logo: LandingImageRef;
}

export interface LandingPartner {
  key: string;
  published: boolean;
  name: string;
  city: string;
  href: string | null;
  logo: LandingImageRef | null;
}

/** Gambar tangkapan layar + teks alternatif per bahasa (`id` wajib). */
export interface LandingScreenshot {
  image: LandingImageRef;
  alt: LocalizedText;
}

const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

function plain(raw: unknown, max: number, required: boolean): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return required ? undefined : null;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (v.length === 0) return required ? undefined : null;
  return v.length <= max ? v : undefined;
}

function optionalHref(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  const v = parseHttpsUrl(raw);
  return v ?? undefined;
}

function optionalRef(raw: unknown): LandingImageRef | null | undefined {
  if (raw === null || raw === undefined) return null;
  return normalizeImageRef(raw) ?? undefined;
}

export function normalizeTestimonial(raw: unknown): LandingTestimonial | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !KEY.test(r.key)) return null;
  const quote = normalizeLocalizedText(r.quote, TESTIMONIAL_QUOTE_MAX);
  const name = plain(r.name, PERSON_NAME_MAX, true);
  const role = plain(r.role, PERSON_ROLE_MAX, false);
  const photo = optionalRef(r.photo);
  if (!quote || !name || role === undefined || photo === undefined) return null;
  return { key: r.key, published: r.published === true, quote, name, role, photo };
}

export function normalizeClientLogo(raw: unknown): LandingClientLogo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !KEY.test(r.key)) return null;
  const name = plain(r.name, PERSON_NAME_MAX, true);
  const href = optionalHref(r.href);
  const logo = normalizeImageRef(r.logo);
  if (!name || href === undefined || !logo) return null;
  return { key: r.key, published: r.published === true, name, href, logo };
}

export function normalizePartner(raw: unknown): LandingPartner | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !KEY.test(r.key)) return null;
  const name = plain(r.name, PERSON_NAME_MAX, true);
  const city = plain(r.city, PERSON_NAME_MAX, true);
  const href = optionalHref(r.href);
  const logo = optionalRef(r.logo);
  if (!name || !city || href === undefined || logo === undefined) return null;
  return { key: r.key, published: r.published === true, name, city, href, logo };
}

export function normalizeScreenshot(raw: unknown): LandingScreenshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const image = normalizeImageRef(r.image);
  const alt = normalizeLocalizedText(r.alt, ALT_TEXT_MAX);
  return image && alt ? { image, alt } : null;
}

/** Larik butir: yang tidak sah dibuang, kunci ganda — yang pertama menang. */
export function normalizeList<T extends { key: string }>(raw: unknown, one: (v: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of raw.slice(0, LANDING_LIST_MAX)) {
    const ok = one(item);
    if (!ok || seen.has(ok.key)) continue;
    seen.add(ok.key);
    out.push(ok);
  }
  return out;
}

export function normalizeGallery(raw: unknown): LandingScreenshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, GALLERY_MAX)
    .map(normalizeScreenshot)
    .filter((s): s is LandingScreenshot => s !== null);
}

/** Hanya yang DITERBITKAN — seksi dirender bila hasilnya ≥ 1. */
export function published<T extends { published: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.published);
}

/* ── Baris → media efektif ─────────────────────────────────────────────────── */

/** Kolom media di baris `landing_settings` (migration 0015). */
export interface LandingMediaRow {
  testimonialsJson: string | null;
  clientLogosJson: string | null;
  partnersJson: string | null;
  heroImageJson: string | null;
  galleryJson: string | null;
  ogImageJson: string | null;
}

/** Media EFEKTIF untuk halaman — SEMUA butir (termasuk yang belum diterbitkan);
 *  halaman menyaring dengan `published()`, konsol menampilkan semuanya. */
export interface LandingMedia {
  testimonials: LandingTestimonial[];
  clientLogos: LandingClientLogo[];
  partners: LandingPartner[];
  heroImage: LandingScreenshot | null;
  gallery: LandingScreenshot[];
  ogImage: LandingImageRef | null;
}

/** Tidak ada yang diatur = tidak ada seksi bukti sosial, purwarupa kode tetap. */
export const DEFAULT_LANDING_MEDIA: LandingMedia = Object.freeze({
  testimonials: [],
  clientLogos: [],
  partners: [],
  heroImage: null,
  gallery: [],
  ogImage: null,
}) as LandingMedia;

function parseJson(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Tidak pernah melempar; medan yang tidak lolos jatuh ke bawaannya sendiri. */
export function landingMediaFromRow(row: Partial<LandingMediaRow> | null | undefined): LandingMedia {
  if (!row) return DEFAULT_LANDING_MEDIA;
  return {
    testimonials: normalizeList(parseJson(row.testimonialsJson), normalizeTestimonial),
    clientLogos: normalizeList(parseJson(row.clientLogosJson), normalizeClientLogo),
    partners: normalizeList(parseJson(row.partnersJson), normalizePartner),
    heroImage: normalizeScreenshot(parseJson(row.heroImageJson)),
    gallery: normalizeGallery(parseJson(row.galleryJson)),
    ogImage: normalizeImageRef(parseJson(row.ogImageJson)),
  };
}

/** Semua id gambar yang dirujuk media — untuk memeriksa rujukan saat menyimpan. */
export function referencedImageIds(media: Partial<LandingMedia>): number[] {
  const ids = new Set<number>();
  for (const t of media.testimonials ?? []) if (t.photo) ids.add(t.photo.id);
  for (const l of media.clientLogos ?? []) ids.add(l.logo.id);
  for (const p of media.partners ?? []) if (p.logo) ids.add(p.logo.id);
  if (media.heroImage) ids.add(media.heroImage.image.id);
  for (const g of media.gallery ?? []) ids.add(g.image.id);
  if (media.ogImage) ids.add(media.ogImage.id);
  return [...ids];
}
