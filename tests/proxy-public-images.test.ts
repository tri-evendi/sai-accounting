/**
 * Gambar publik melewati proxy TANPA sesi: pratinjau tautan (`opengraph-image`),
 * ikon tab, ikon layar depan, dan logo produk unggahan (`/brand/mark`).
 * Peramban dan perayap media sosial memintanya tanpa cookie; dialihkan ke
 * /login berarti kartu tautan tanpa gambar dan ikon tab kosong.
 *
 * Yang pernah lolos ke produksi (sampai 18 Okt 2026): Next menamai gambar OG
 * di grup `(marketing)` `/opengraph-image-<sufiks>`, dan proxy hanya mengenal
 * `/opengraph-image` dan `/opengraph-image/…`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => null) }));

import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

const HOST = "https://buku.contoh.test";
const ke = (pathname: string) => proxy(new NextRequest(new URL(pathname, HOST)));
const keLogin = (res: Response) => (res.headers.get("location") ?? "").includes("/login");

beforeEach(() => {
  delete process.env.OPERATOR_HOST;
});

describe("gambar publik tidak dialihkan ke /login", () => {
  it.each([
    "/opengraph-image",
    "/opengraph-image-pwu6ef?0c049477e9a57562",
    "/opengraph-image/0",
    "/favicon.ico",
    "/apple-icon.png",
    "/brand/mark?v=0123456789abcdef",
  ])("%s", async (path) => {
    expect(keLogin(await ke(path))).toBe(false);
  });

  it("yang hanya mirip tetap butuh sesi", async () => {
    for (const path of ["/opengraph-imagex", "/opengraph-image-PWU/../dashboard", "/brand", "/brand/markx", "/settings"]) {
      expect(keLogin(await ke(path)), path).toBe(true);
    }
  });
});
