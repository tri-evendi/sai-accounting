/**
 * SPESIFIKASI `/api/v1` TIDAK BOLEH MENYIMPANG DARI ROUTE-NYA (issue #389).
 *
 * ══ INI PENJAGA TERPENTING DARI SELURUH F-10 ═══════════════════════════════
 * Dokumentasi API punya satu sifat yang membuatnya berbeda dari dokumentasi
 * lain: yang membacanya BUKAN kita. Sebuah dokumen internal yang basi
 * membingungkan orang yang bisa membuka kodenya; sebuah dokumen API yang basi
 * membuat program orang lain gagal, dan orang itu tidak punya cara mengetahui
 * bahwa dokumennya yang salah, bukan programnya.
 *
 * Dan bentuk pembusukannya selalu sama: seseorang menambah endpoint,
 * mengujinya, mendaratkannya — dan lupa dokumennya. Tidak ada satu pun yang
 * gagal saat itu. Karena itu yang dibangun di sini bukan kepercayaan melainkan
 * kesetaraan dua arah antara direktori route dan daftar spesifikasi.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ENDPOINTS, GENERAL_NOTES, buildOpenApiDocument } from "@/lib/api-v1-spec";
import { DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/api-v1";

const V1_DIR = join(process.cwd(), "src", "app", "api", "v1");

/** Direktori route v1 yang sungguhan ada — tanpa `openapi.json`, yang bukan daftar. */
function routeSegments(): string[] {
  return readdirSync(V1_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "openapi.json")
    .filter((e) => existsSync(join(V1_DIR, e.name, "route.ts")))
    .map((e) => e.name)
    .sort();
}

describe("kesetaraan dua arah route ↔ spesifikasi", () => {
  it("setiap route punya entri spesifikasi", () => {
    const tanpaSpec = routeSegments().filter(
      (seg) => !ENDPOINTS.some((e) => e.segment === seg)
    );
    expect(
      tanpaSpec,
      "Endpoint yang lahir tanpa didokumentasikan tidak akan pernah ditemukan " +
        "orang yang membutuhkannya — dan yang menemukannya lebih dulu adalah " +
        "integrator yang menebak-nebak. Tambahkan entrinya di lib/api-v1-spec.ts."
    ).toEqual([]);
  });

  it("setiap entri spesifikasi punya route", () => {
    const segments = new Set(routeSegments());
    const tanpaRoute = ENDPOINTS.map((e) => e.segment).filter((s) => !segments.has(s));
    expect(
      tanpaRoute,
      "Spesifikasi yang menjanjikan endpoint yang tidak ada lebih buruk daripada " +
        "tidak ada dokumentasi: integrator menulis kode untuknya, lalu mendapat 404 " +
        "yang tidak bisa ia jelaskan."
    ).toEqual([]);
  });

  it("izin yang disebut spesifikasi = izin yang dituntut route-nya", () => {
    /*
     * Integrator yang mendapat 403 memakai dokumen ini untuk tahu peran apa yang
     * dibutuhkan tokennya. Dokumen yang menyebut izin yang salah mengirimnya
     * menerbitkan token yang tetap ditolak — dan tidak ada di jawabannya yang
     * memberitahu bahwa dokumennya yang keliru.
     */
    for (const endpoint of ENDPOINTS) {
      const src = readFileSync(join(V1_DIR, endpoint.segment, "route.ts"), "utf8");
      expect(src, `${endpoint.segment}: izin di route tidak sama dengan spesifikasi`).toContain(
        `requireApiToken("${endpoint.permission}")`
      );
    }
  });
});

describe("dokumen OpenAPI", () => {
  const doc = buildOpenApiDocument("https://contoh.test") as {
    openapi: string;
    paths: Record<string, { get: { security: unknown[]; responses: Record<string, unknown> } }>;
    components: { securitySchemes: Record<string, unknown> };
    info: { description: string };
  };

  it("versi 3.1 dan setiap endpoint terdaftar", () => {
    expect(doc.openapi).toBe("3.1.0");
    for (const endpoint of ENDPOINTS) {
      expect(doc.paths[`/api/v1/${endpoint.segment}`]).toBeDefined();
    }
  });

  it("setiap endpoint MENUNTUT token — tidak ada yang lolos tanpa disebut", () => {
    // Sebuah endpoint yang lupa mendeklarasikan `security` akan terbaca klien
    // OpenAPI sebagai endpoint publik, dan generator kode akan menghasilkan
    // pemanggil TANPA header autentikasi.
    for (const path of Object.values(doc.paths)) {
      expect(path.get.security).toEqual([{ bearerAuth: [] }]);
    }
  });

  it("keempat kegagalan dijelaskan, bukan hanya jalur suksesnya", () => {
    for (const path of Object.values(doc.paths)) {
      for (const status of ["400", "401", "403", "429"]) {
        expect(path.get.responses[status], `status ${status} tidak dijelaskan`).toBeDefined();
      }
    }
  });

  it("batas paginasi di dokumen = batas yang benar-benar ditegakkan", () => {
    // Dokumen yang menjanjikan limit 1000 sementara kodenya menolak di atas 200
    // menghasilkan integrator yang programnya gagal pada permintaan pertama.
    const teks = JSON.stringify(doc);
    expect(teks).toContain(`"maximum":${MAX_LIMIT}`);
    expect(teks).toContain(`"default":${DEFAULT_LIMIT}`);
  });

  it("catatan umum ikut, termasuk yang paling mudah salah dipahami", () => {
    for (const frasa of ["updatedSince", "hasMore", "Authorization: Bearer", "429"]) {
      expect(doc.info.description).toContain(frasa);
    }
  });

  it("skema keamanannya menyebut bentuk tokennya", () => {
    expect(JSON.stringify(doc.components.securitySchemes)).toContain("sai_");
  });

  it("seluruh catatan umum benar-benar muncul di dokumen", () => {
    expect(GENERAL_NOTES.length).toBeGreaterThan(4);
    for (const note of GENERAL_NOTES) {
      expect(doc.info.description).toContain(note);
    }
  });
});
