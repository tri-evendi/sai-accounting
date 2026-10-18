/**
 * Penyaji HTTP logo produk untuk KEDUA aplikasi. Berkas rute di masing-masing
 * aplikasi tinggal memanggil fungsi di sini, supaya pelanggan dan konsol tidak
 * menyajikan logo dengan dua cara yang bisa menyimpang.
 *
 *   /brand/mark       logo unggahan (404 bila tidak ada — pemanggil hanya
 *                     menautkannya bila ada)
 *   /favicon.ico      logo unggahan, atau lambang bawaan digambar 48 px
 *   /apple-icon.png   logo unggahan, atau lambang bawaan digambar 180 px
 *
 * Lambang bawaan digambar dari `brandMarkSvg` (`@sai/ui/brand/mark`) dengan
 * warna yang sama dengan `scripts/build-brand-icons.ts`, jadi tanpa unggahan
 * hasilnya identik dengan ikon raster yang dulu statis.
 */
import { ImageResponse } from "next/og";

import { brandMarkSvg } from "@sai/ui/brand/mark";
import { BRAND_GLYPH_ON_SOLID, BRAND_SOLID_LIGHT } from "@sai/ui/theme/antd-tokens";

import { brandMarkUrl, cachedBrandMark, cachedBrandMarkContent, imageResponseHeaders } from "./brand-assets";
import { platformDb } from "./platform-db";

/** Logo unggahan, atau 404. `?v=<sidik>` yang cocok → boleh di-cache selamanya. */
export async function brandMarkResponse(request: Request): Promise<Response> {
  const active = await cachedBrandMarkContent({ platform: platformDb });
  if (!active) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const v = new URL(request.url).searchParams.get("v");
  const immutable = v !== null && active.meta.sha256.startsWith(v) && v.length >= 16;
  return new Response(Buffer.from(active.content), {
    headers: imageResponseHeaders(active.meta.mimeType, active.meta.sha256, immutable),
  });
}

function lambangBawaan(size: number): Response {
  const svg = brandMarkSvg({ size, background: BRAND_SOLID_LIGHT, foreground: BRAND_GLYPH_ON_SOLID });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (satori) tidak mengenal next/image.
    <img src={src} width={size} height={size} alt="" />,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=300" } }
  );
}

/** Ikon tab & ikon layar depan: logo unggahan bila ada, selain itu lambang bawaan. */
export async function brandIconResponse(size: number): Promise<Response> {
  const active = await cachedBrandMarkContent({ platform: platformDb });
  if (active) {
    return new Response(Buffer.from(active.content), {
      headers: imageResponseHeaders(active.meta.mimeType, active.meta.sha256, false),
    });
  }
  return lambangBawaan(size);
}

/**
 * Alamat logo unggahan untuk `RootDocument` (root layout kedua aplikasi), atau
 * `null` untuk lambang bawaan. Ber-cache 60 detik dan fail-soft — root layout
 * dirender setiap permintaan, dan platform yang mati tidak boleh menjatuhkannya.
 */
export async function activeBrandMarkSrc(): Promise<string | null> {
  const meta = await cachedBrandMark({ platform: platformDb });
  return meta ? brandMarkUrl(meta) : null;
}
