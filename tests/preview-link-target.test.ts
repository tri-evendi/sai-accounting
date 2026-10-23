/**
 * PRATINJAU TIDAK BOCOR KELUAR LEWAT TAUTAN: selama `?preview=<token>`,
 * tautan ke halaman ber-isi-situs membawa tokennya, dan tidak ada tautan lain
 * yang ikut membawanya.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { previewLinkTarget } from "@sai/core/site-content";

const TOKEN = "A".repeat(43);
const HERE = `https://sai.example/?preview=${TOKEN}`;

describe("previewLinkTarget", () => {
  it("tautan ke halaman ber-isi-situs membawa token", () => {
    expect(previewLinkTarget("/pricing", HERE, TOKEN)).toBe(`https://sai.example/pricing?preview=${TOKEN}`);
    expect(previewLinkTarget("/status", HERE, TOKEN)).toBe(`https://sai.example/status?preview=${TOKEN}`);
    expect(previewLinkTarget("/#tanya", `https://sai.example/pricing?preview=${TOKEN}`, TOKEN)).toBe(
      `https://sai.example/?preview=${TOKEN}#tanya`
    );
  });

  it("tautan yang sudah membawa token yang sama dibiarkan", () => {
    expect(previewLinkTarget(`/pricing?preview=${TOKEN}`, HERE, TOKEN)).toBeNull();
  });

  it("token tidak pernah ikut ke halaman lain, origin lain, atau skema lain", () => {
    for (const href of ["/register", "/login", "/docs", "/docs/mulai", "https://wa.me/62811", "mailto:a@b.c"]) {
      expect(previewLinkTarget(href, HERE, TOKEN), href).toBeNull();
    }
    expect(previewLinkTarget("https://evil.example/pricing", HERE, TOKEN)).toBeNull();
  });

  it("token yang salah bentuk tidak pernah dibawa", () => {
    expect(previewLinkTarget("/pricing", HERE, "pendek")).toBeNull();
  });
});

describe("layout pemasaran memasang pembawa token hanya saat pratinjau", () => {
  it("dibaca dari `x-sai-preview` (ditulis proxy), bukan dari parameter mentah", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(marketing)/layout.tsx"), "utf8");
    expect(src).toContain('get("x-sai-preview")');
    expect(src).toMatch(/isPreview && <PreviewLinkKeeper/);
  });
});
