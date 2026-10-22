/**
 * KONFIGURASI AUTENTIKASI YANG RUSAK WAJIB GAGAL-TERTUTUP — GHSA-8fpg-xm3f-6cx3.
 *
 * ══ APA CACATNYA ═══════════════════════════════════════════════════════════
 * Sampai `next-auth@5.0.0-beta.31`, `auth()` di server component memulangkan
 * BADAN RESPONS `@auth/core` apa adanya — termasuk ketika badannya galat 500
 * (`{ message: "There was a problem with the server configuration…" }`).
 * Objek itu TRUTHY. Pemeriksaan berbentuk keberadaan (`if (!session)`) lalu
 * lolos untuk SETIAP pengunjung begitu konfigurasinya rusak — mis.
 * `AUTH_SECRET` hilang saat penggelaran. Diperbaiki di `5.0.0-beta.32`
 * (`parseSessionResponse`: respons tidak-OK = tanpa sesi).
 *
 * Dua halaman di repo ini memang berbentuk begitu (beranda buku dan
 * notifikasi) sampai berkas ini lahir.
 *
 * ══ TIGA LAPIS YANG DIJAGA DI SINI ═════════════════════════════════════════
 *   1. PUSTAKANYA: `auth()` tanpa rahasia memulangkan `null`, bukan objek
 *      galat — penurunan versi `next-auth` ke rentang rentan gagal di sini.
 *   2. PROXY: tanpa `AUTH_SECRET`, permintaan ke halaman terlindung TIDAK
 *      diteruskan (melempar atau menolak — keduanya tertutup).
 *   3. PEMAKAI: tidak satu pun berkas yang memeriksa hasil `await auth()`
 *      hanya dari keberadaannya. Yang membuktikan sesi adalah `session?.user`
 *      — objek galat tidak pernah punya `user` — jadi lapis ini tetap
 *      tertutup bahkan bila pustakanya kelak memundur lagi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { berkasSumber, tanpaKomentar } from "./akar-sumber";

/*
 * `auth()` bentuk server component membaca `headers()` dari `next/headers`,
 * yang hanya hidup di dalam permintaan Next. Dipalsukan dengan cookie sesi
 * KARANGAN — persis permintaan penyerang: ada cookie, tapi tidak sah.
 */
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      cookie: "authjs.session-token=karangan-penyerang",
      host: "buku.contoh.test",
      "x-forwarded-proto": "https",
    }),
}));

const RAHASIA_ASLI = process.env.AUTH_SECRET;

beforeEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.OPERATOR_HOST;
});

afterEach(() => {
  process.env.AUTH_SECRET = RAHASIA_ASLI;
});

describe("next-auth: konfigurasi rusak → tanpa sesi (GHSA-8fpg)", () => {
  it("auth() tanpa AUTH_SECRET memulangkan null, bukan objek galat yang truthy", async () => {
    const { default: NextAuth } = await import("next-auth");
    const { default: Credentials } = await import("next-auth/providers/credentials");
    const { auth } = NextAuth({
      trustHost: true,
      providers: [Credentials({ credentials: {}, authorize: async () => null })],
    });

    // Log galat konfigurasi memang diharapkan di sini; jangan kotori keluaran.
    const diam = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const session = await (auth as () => Promise<unknown>)();
      expect(
        session,
        "auth() memulangkan objek galat konfigurasi sebagai sesi — setiap " +
          "pemeriksaan `if (!session)` lolos untuk semua orang (GHSA-8fpg-xm3f-6cx3). " +
          "Pastikan next-auth >= 5.0.0-beta.32."
      ).toBeNull();
    } finally {
      diam.mockRestore();
    }
  });
});

describe("proxy: tanpa AUTH_SECRET, halaman terlindung tidak diteruskan", () => {
  it("melempar atau menolak — tidak pernah NextResponse.next()", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const req = new NextRequest(new URL("/t/acme/pt-satu/sales", "https://buku.contoh.test"), {
      headers: { cookie: "authjs.session-token=karangan-penyerang" },
    });

    let res: Response | null = null;
    try {
      res = await proxy(req);
    } catch {
      return; // melempar = 500 di depan pengguna = tertutup.
    }
    expect(
      res.headers.get("x-middleware-next"),
      "proxy MENERUSKAN permintaan tanpa rahasia penandatangan sesi"
    ).toBeNull();
  });
});

describe("pemakai auth(): sesi dibuktikan lewat `session?.user`, bukan keberadaan", () => {
  it("tidak ada `if (!session)` / `if (session)` telanjang atas hasil `await auth()`", () => {
    const pelanggar: string[] = [];
    for (const { rel, isi } of berkasSumber([".ts", ".tsx"])) {
      const kode = tanpaKomentar(isi);
      for (const [, nama] of kode.matchAll(/const (\w+) = await auth\(\)/g)) {
        const telanjang = new RegExp(`if \\(\\s*!?${nama}\\s*\\)|!${nama}\\s*(\\|\\||&&)`);
        if (telanjang.test(kode)) pelanggar.push(`${rel} (${nama})`);
      }
    }
    expect(
      pelanggar,
      "Periksa `session?.user`, bukan `session`: objek galat konfigurasi " +
        "Auth.js truthy tetapi tidak punya `user` (GHSA-8fpg-xm3f-6cx3)."
    ).toEqual([]);
  });
});
