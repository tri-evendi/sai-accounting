/**
 * GAMBAR & BUKTI SOSIAL HALAMAN DEPAN — inti murni (`@sai/core/landing-media`).
 *
 * Yang dijaga:
 *   1. **Hanya PNG/JPEG/WebP diam, diukur dari ISI berkas.** SVG (dokumen XML
 *      yang bisa membawa skrip), GIF, HTML yang menyamar — semuanya ditolak,
 *      apa pun nama/MIME kirimannya. Batas ukuran per pemakaian.
 *   2. **Metadata dibuang.** EXIF (lokasi GPS foto ponsel) tidak boleh sampai
 *      ke halaman publik — JPEG, PNG, dan WebP.
 *   3. **Tidak diatur / rusak = tidak ada seksi.** Baris kosong atau JSON
 *      rusak tidak menjatuhkan halaman dan tidak memunculkan seksi kosong.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_MEDIA,
  inspectLandingImage,
  landingImageUrl,
  landingMediaFromRow,
  published,
  referencedImageIds,
  stripImageMetadata,
  validateLandingImage,
} from "@sai/core/landing-media";

/* ── Berkas buatan: hanya kepala yang dibaca pemeriksa ─────────────────────── */

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const asc = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...asc(type), ...data, 0, 0, 0, 0];

function png(w: number, h: number, extra: number[] = [], padTo = 0): Uint8Array {
  const ihdr = pngChunk("IHDR", [...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
  const body = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...extra];
  const idat = pngChunk("IDAT", new Array(Math.max(0, padTo - body.length - 24)).fill(0));
  return new Uint8Array([...body, ...idat, ...pngChunk("IEND", [])]);
}

function jpeg(w: number, h: number, withExif = false): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...asc("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const exifData = [...asc("Exif"), 0, 0, ...asc("GPS-LAT-6.2"), 0];
  const app1 = [0xff, 0xe1, 0x00, exifData.length + 2, ...exifData];
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9];
  return new Uint8Array([0xff, 0xd8, ...app0, ...(withExif ? app1 : []), ...sof, ...sos]);
}

function webpVp8x(w: number, h: number, opts: { animated?: boolean; exif?: boolean } = {}): Uint8Array {
  const flags = (opts.animated ? 0x02 : 0) | (opts.exif ? 0x08 : 0);
  const vp8x = [...asc("VP8X"), ...le32(10), flags, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)];
  const exif = opts.exif ? [...asc("EXIF"), ...le32(4), ...asc("GPS!")] : [];
  const vp8 = [...asc("VP8 "), ...le32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, ...[w & 0xff, w >> 8, h & 0xff, h >> 8]];
  const body = [...asc("WEBP"), ...vp8x, ...exif, ...vp8];
  return new Uint8Array([...asc("RIFF"), ...le32(body.length), ...body]);
}

function webpLossy(w: number, h: number): Uint8Array {
  const vp8 = [...asc("VP8 "), ...le32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, w & 0xff, w >> 8, h & 0xff, h >> 8];
  const body = [...asc("WEBP"), ...vp8];
  return new Uint8Array([...asc("RIFF"), ...le32(body.length), ...body]);
}

const teks = (s: string) => new TextEncoder().encode(s);

describe("format dibaca dari isi berkas", () => {
  it("PNG, JPEG, dan WebP (VP8 & VP8X) dikenali beserta ukurannya", () => {
    expect(inspectLandingImage(png(800, 600))).toMatchObject({ mime: "image/png", width: 800, height: 600 });
    expect(inspectLandingImage(jpeg(1024, 768))).toMatchObject({ mime: "image/jpeg", width: 1024, height: 768 });
    expect(inspectLandingImage(webpLossy(640, 480))).toMatchObject({ mime: "image/webp", width: 640, height: 480 });
    expect(inspectLandingImage(webpVp8x(1200, 900))).toMatchObject({ mime: "image/webp", width: 1200, height: 900 });
  });

  it.each([
    ["SVG berskrip", teks('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["SVG ber-BOM/spasi", teks('  <?xml version="1.0"?><svg/>')],
    ["GIF", new Uint8Array([...asc("GIF89a"), 10, 0, 10, 0, 0, 0, 0])],
    ["HTML", teks("<!doctype html><script>alert(1)</script>")],
    ["kosong", new Uint8Array()],
  ])("ditolak sebagai bukan gambar: %s", (_nama, bytes) => {
    expect(inspectLandingImage(bytes)).toBeNull();
    const r = validateLandingImage(bytes, "gallery");
    expect(r.ok).toBe(false);
  });
});

describe("batas per pemakaian", () => {
  it("terlalu besar (byte) → too_large; logo 256 KB, tangkapan layar 1 MB", () => {
    const besar = png(800, 600, [], 300 * 1024);
    expect(validateLandingImage(besar, "client_logo")).toEqual({ ok: false, reason: "too_large" });
    expect(validateLandingImage(besar, "gallery").ok).toBe(true);
    expect(validateLandingImage(png(800, 600, [], 1100 * 1024), "gallery")).toEqual({ ok: false, reason: "too_large" });
  });

  it("terlalu kecil / terlalu lebar dimensinya", () => {
    expect(validateLandingImage(png(300, 300), "hero")).toEqual({ ok: false, reason: "too_small" });
    expect(validateLandingImage(png(64, 64), "client_logo").ok).toBe(true);
    expect(validateLandingImage(png(5000, 1000), "gallery")).toEqual({ ok: false, reason: "too_big_dimensions" });
  });

  it("WebP bergerak ditolak", () => {
    expect(validateLandingImage(webpVp8x(800, 600, { animated: true }), "gallery")).toEqual({
      ok: false,
      reason: "animated",
    });
  });

  it("gambar OG: PNG ±1,91:1, lebar ≥ 600", () => {
    expect(validateLandingImage(png(1200, 630), "og").ok).toBe(true);
    expect(validateLandingImage(png(1200, 1200), "og")).toEqual({ ok: false, reason: "og_shape" });
    expect(validateLandingImage(png(580, 300), "og")).toEqual({ ok: false, reason: "og_shape" });
    expect(validateLandingImage(jpeg(1200, 630), "og")).toEqual({ ok: false, reason: "og_shape" });
  });
});

describe("metadata dibuang", () => {
  it("JPEG: segmen EXIF (APP1) hilang, JFIF & data gambar utuh", () => {
    const asli = jpeg(800, 600, true);
    const bersih = stripImageMetadata(asli, "image/jpeg");
    expect(Buffer.from(asli).includes("GPS-LAT")).toBe(true);
    expect(Buffer.from(bersih).includes("GPS-LAT")).toBe(false);
    expect(Buffer.from(bersih).includes("JFIF")).toBe(true);
    expect(inspectLandingImage(bersih)).toMatchObject({ mime: "image/jpeg", width: 800, height: 600 });
  });

  it("PNG: tEXt & eXIf hilang, IHDR utuh", () => {
    const asli = png(800, 600, [...pngChunk("tEXt", asc("Author\0Rahasia")), ...pngChunk("eXIf", asc("GPS"))]);
    const bersih = stripImageMetadata(asli, "image/png");
    expect(Buffer.from(bersih).includes("Rahasia")).toBe(false);
    expect(Buffer.from(bersih).includes("eXIf")).toBe(false);
    expect(inspectLandingImage(bersih)).toMatchObject({ mime: "image/png", width: 800, height: 600 });
  });

  it("WebP: chunk EXIF hilang, penandanya dimatikan, ukuran RIFF ditulis ulang", () => {
    const asli = webpVp8x(800, 600, { exif: true });
    const bersih = stripImageMetadata(asli, "image/webp");
    expect(Buffer.from(bersih).includes("GPS!")).toBe(false);
    expect(bersih[20] & 0x08).toBe(0);
    expect(bersih[4] | (bersih[5] << 8) | (bersih[6] << 16)).toBe(bersih.length - 8);
    expect(inspectLandingImage(bersih)).toMatchObject({ mime: "image/webp", width: 800, height: 600 });
  });
});

describe("baris → media", () => {
  const ref = { id: 7, sha256: "a".repeat(64), width: 200, height: 100 };

  it("tidak diatur / rusak = bawaan (tanpa seksi, purwarupa tetap)", () => {
    expect(landingMediaFromRow(null)).toEqual(DEFAULT_LANDING_MEDIA);
    expect(
      landingMediaFromRow({
        testimonialsJson: "{rusak",
        clientLogosJson: '"x"',
        partnersJson: null,
        heroImageJson: "[]",
        galleryJson: "{}",
        ogImageJson: '{"id":"7"}',
      })
    ).toEqual(DEFAULT_LANDING_MEDIA);
  });

  it("logo tanpa gambar sah dibuang; tautan non-https dibuang bersama butirnya", () => {
    const m = landingMediaFromRow({
      clientLogosJson: JSON.stringify([
        { key: "a", published: true, name: "PT A", href: null, logo: ref },
        { key: "b", published: true, name: "PT B", href: null, logo: { id: 1 } },
        { key: "c", published: true, name: "PT C", href: "javascript:alert(1)", logo: ref },
      ]),
    });
    expect(m.clientLogos.map((l) => l.key)).toEqual(["a"]);
  });

  it("`published()` menyaring butir yang tidak ditampilkan", () => {
    const m = landingMediaFromRow({
      testimonialsJson: JSON.stringify([
        { key: "a", published: false, quote: { id: "Bagus" }, name: "Ani", role: null, photo: null },
        { key: "b", published: true, quote: { id: "Rapi" }, name: "Budi", role: "CFO", photo: ref },
      ]),
    });
    expect(m.testimonials).toHaveLength(2);
    expect(published(m.testimonials).map((t) => t.name)).toEqual(["Budi"]);
    expect(referencedImageIds(m)).toEqual([7]);
  });

  it("alamat gambar memuat sidik → cache peramban aman", () => {
    expect(landingImageUrl(ref)).toBe(`/brand/landing/7?v=${"a".repeat(16)}`);
  });
});
