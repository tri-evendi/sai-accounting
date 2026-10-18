/**
 * Pemeriksa berkas logo: format & ukuran dibaca dari ISI berkas, bukan dari
 * nama atau MIME kiriman peramban. Gambar uji dibangkitkan `sharp` (sudah
 * terpasang sebagai dependensi Next) supaya kepala berkasnya asli.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { LOGO_MAX_BYTES, inspectImage, sha256Hex, validateLogo } from "@sai/core/image-file";

const gambar = (format: "png" | "jpeg" | "webp", width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
    .toFormat(format)
    .toBuffer()
    .then((b) => new Uint8Array(b));

describe("inspectImage", () => {
  it("membaca PNG", async () => {
    expect(inspectImage(await gambar("png", 300, 120))).toEqual({ mime: "image/png", width: 300, height: 120 });
  });

  it("membaca JPEG (termasuk progresif)", async () => {
    expect(inspectImage(await gambar("jpeg", 640, 480))).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
    const progresif = new Uint8Array(
      await sharp({ create: { width: 200, height: 260, channels: 3, background: "#fff" } })
        .jpeg({ progressive: true })
        .toBuffer()
    );
    expect(inspectImage(progresif)).toEqual({ mime: "image/jpeg", width: 200, height: 260 });
  });

  it("menolak WebP, SVG, teks, dan berkas terpotong", async () => {
    expect(inspectImage(await gambar("webp", 300, 300))).toBeNull();
    expect(inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(inspectImage(new TextEncoder().encode("bukan gambar"))).toBeNull();
    const png = await gambar("png", 300, 300);
    expect(inspectImage(png.slice(0, 12))).toBeNull();
  });

  it("tidak tertipu nama berkas: PNG yang dinamai .jpg tetap PNG", async () => {
    expect(inspectImage(await gambar("png", 256, 256))?.mime).toBe("image/png");
  });
});

describe("validateLogo", () => {
  it("menerima gambar yang memenuhi sisi minimum", async () => {
    const r = validateLogo(await gambar("png", 512, 512), { minSide: 256 });
    expect(r).toEqual({ ok: true, info: { mime: "image/png", width: 512, height: 512 } });
  });

  it("menolak dengan alasan yang tepat", async () => {
    expect(validateLogo(new Uint8Array(), { minSide: 64 })).toEqual({ ok: false, reason: "empty" });
    expect(validateLogo(new Uint8Array(LOGO_MAX_BYTES + 1), { minSide: 64 })).toEqual({ ok: false, reason: "too_large" });
    expect(validateLogo(new TextEncoder().encode("x"), { minSide: 64 })).toEqual({ ok: false, reason: "not_image" });
    expect(validateLogo(await gambar("png", 200, 900), { minSide: 256 })).toEqual({ ok: false, reason: "too_small" });
  });
});

it("sha256Hex stabil dan heksadesimal 64 karakter", async () => {
  const a = await sha256Hex(new TextEncoder().encode("abc"));
  expect(a).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
