/**
 * PROXY TIDAK BOLEH MENGHALANGI PERMUKAAN BER-TOKEN — regresi produksi
 * 2026-08-16 (issue #389, F-10 lapis 1).
 *
 * ══ APA YANG TERJADI ═══════════════════════════════════════════════════════
 * `src/proxy.ts` membaca sesi NextAuth untuk setiap `/api/*` yang tidak
 * disebut `isPublicPath`, dan menjawab 401 bila tak ada cookie. Permintaan
 * ber-`Authorization: Bearer sai_…` tidak menghasilkan cookie sesi — jadi
 * SELURUH `/api/v1` dijawab 401 sebelum `requireApiToken` sempat berjalan.
 * Bukan sebagian: setiap endpoint, setiap token sah, tanpa kecuali. Termasuk
 * `/api/v1/openapi.json`, yang justru sengaja publik supaya integrator bisa
 * membaca bentuk API sebelum punya kredensial.
 *
 * ══ KENAPA BERKAS INI ADA, DAN KENAPA BENTUKNYA BEGINI ═════════════════════
 * Cacat itu lolos `bun run verify` DAN `bun run build`. Bukan karena tesnya
 * kurang banyak — 3341 tes hijau — melainkan karena semuanya menguji lapisan
 * yang SALAH: tes token memanggil `requireApiToken` langsung, tak satu pun
 * menembus proxy. Sebuah penolakan yang terjadi satu lapis di atas yang diuji
 * tidak terlihat oleh tes mana pun.
 *
 * Karena itu berkas ini MEMANGGIL `proxy()` yang sungguhan atas permintaan
 * yang sungguhan, dengan `getToken` yang dipalsukan mengembalikan `null` —
 * yaitu persis keadaan klien ber-Bearer: tidak ada cookie sesi. Menguji
 * `isPublicPath` saja akan mengulang kesalahan yang sama dalam bentuk baru.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * `getToken` dipalsukan SEBELUM `proxy` diimpor. Nilainya `null` = tidak ada
 * cookie sesi, keadaan setiap klien API yang membawa token Bearer.
 */
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => null) }));

import { NextRequest } from "next/server";

import { proxy } from "@/proxy";
import { isBearerApiPath, V1_ROOT } from "@/lib/api-v1";

const HOST = "https://buku.contoh.test";

/** Permintaan GET bergaya klien API: header Bearer, tanpa cookie apa pun. */
function bearerRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, HOST), {
    headers: { authorization: "Bearer sai_1_contohrahasia" },
  });
}

/** Direktori route `/api/v1/*` yang sungguhan ada. */
function v1Segments(): string[] {
  const dir = join(process.cwd(), "src", "app", "api", "v1");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "route.ts")))
    .map((e) => e.name)
    .sort();
}

beforeEach(() => {
  /*
   * Bidang operator (#154) GAGAL-TERTUTUP: tanpa `OPERATOR_HOST` ia hanya
   * menutup `/operator`, dan itu memang keadaan yang ingin diuji di sini —
   * host pelanggan biasa.
   */
  delete process.env.OPERATOR_HOST;
});

describe("proxy melepaskan /api/v1 (autentikasinya token, bukan sesi)", () => {
  it("setiap route v1 yang sungguhan ada TIDAK dijawab 401 oleh proxy", async () => {
    /*
     * Inti berkas ini. Daftarnya dibaca dari DIREKTORI route, bukan ditulis
     * tangan: endpoint v1 yang lahir besok ikut teruji tanpa siapa pun
     * mengingat berkas ini.
     */
    for (const segment of v1Segments()) {
      const res = await proxy(bearerRequest(`${V1_ROOT}/${segment}`));
      expect(
        res.status,
        `${V1_ROOT}/${segment} dihalangi proxy — tidak ada token sah yang bisa ` +
          `menjangkaunya, dan penjaga route-nya (requireApiToken) tidak pernah berjalan.`
      ).not.toBe(401);
    }
  });

  it("`openapi.json` — yang sengaja publik — juga lolos", async () => {
    // Integrator membaca bentuk API untuk memutuskan apakah akan memakainya.
    // Menuntut kredensial untuk membacanya adalah urutan yang terbalik.
    const res = await proxy(bearerRequest(`${V1_ROOT}/openapi.json`));
    expect(res.status).not.toBe(401);
  });

  it("permukaan API SESI tetap dijaga — pelepasannya tidak melebar", async () => {
    /*
     * Penyeimbangnya, dan tanpa ini berkas di atas hanya membuktikan "proxy
     * melepaskan sesuatu". Route beresi tetap harus 401 tanpa cookie; kalau
     * tidak, perbaikan ini membuka seluruh API internal.
     */
    for (const path of ["/api/customers", "/api/invoices", "/api/company-settings/tax"]) {
      const res = await proxy(bearerRequest(path));
      expect(res.status, `${path} seharusnya tetap 401 tanpa sesi`).toBe(401);
    }
  });
});

describe("isBearerApiPath — bentuknya, bukan `startsWith` telanjang", () => {
  it("cocok untuk akar dan seluruh anaknya", () => {
    expect(isBearerApiPath(V1_ROOT)).toBe(true);
    expect(isBearerApiPath(`${V1_ROOT}/customers`)).toBe(true);
    expect(isBearerApiPath(`${V1_ROOT}/openapi.json`)).toBe(true);
  });

  it("TIDAK cocok untuk jalur yang sekadar berawalan sama", () => {
    /*
     * `startsWith("/api/v1")` telanjang melepaskan ketiganya — dan melepaskan
     * jalur di sini berarti melepaskan pemeriksaan sesi, jadi salah cocok
     * bukan salah tampilan. Ketiga rute ini belum ada hari ini, dan
     * kelahirannya tidak akan mengingatkan siapa pun.
     */
    for (const path of ["/api/v1x", "/api/v10", "/api/v1beta/customers"]) {
      expect(isBearerApiPath(path), `${path} tidak boleh dilepaskan`).toBe(false);
    }
  });

  it("setiap route v1 yang ada dikenali fungsinya", () => {
    for (const segment of v1Segments()) {
      expect(isBearerApiPath(`${V1_ROOT}/${segment}`)).toBe(true);
    }
  });
});

describe("kabelnya tidak boleh dicabut diam-diam", () => {
  it("proxy benar-benar memanggil isBearerApiPath — sebagai KODE, bukan komentar", () => {
    /*
     * Tes di atas memakai `proxy()` sungguhan, jadi mencabut pemanggilan ini
     * sudah menggagalkannya. Baris ini tetap ditulis supaya pencarian teks
     * dari sisi mana pun bertemu penjelasannya.
     *
     * Komentarnya DIBUANG lebih dulu, dan itu bukan kerapian: saat penjaga ini
     * dibuktikan dengan mencabut pemanggilannya, versi pertama tes ini tetap
     * LULUS — sebab baris yang dikomentari masih memuat teks yang dicarinya.
     * Sebuah penjaga yang lulus atas kode mati tidak menjaga apa pun.
     */
    const src = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
    const tanpaKomentar = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((baris) => baris.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(tanpaKomentar).toContain("isBearerApiPath(pathname)");
  });
});
