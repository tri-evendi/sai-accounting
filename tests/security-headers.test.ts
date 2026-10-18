/**
 * HEADER KEAMANAN — dan `'unsafe-eval'` yang hanya hidup di pengembangan.
 *
 * ══ KENAPA BERKAS INI ADA ═══════════════════════════════════════════════════
 * Sampai berkas ini lahir, TIDAK ADA satu pun tes yang menyentuh header
 * keamanan. Seluruh CSP di `next.config.ts` bisa dilemahkan, atau dihapus
 * seluruhnya, tanpa satu pun tes merah — dan kelemahan CSP tidak punya gejala:
 * halamannya tetap terbuka, tetap terlihat benar, dan tetap berfungsi. Satu-
 * satunya yang berubah adalah apa yang bisa dilakukan penyerang.
 *
 * ══ YANG PALING PENTING DI SINI ════════════════════════════════════════════
 * Bukan tes yang menuntut sesuatu ADA, melainkan dua yang menuntut sesuatu
 * TETAP TIDAK ADA di produksi (`'unsafe-eval'`) dan satu yang menuntut sesuatu
 * TETAP ADA walau terlihat seperti kelalaian (`style-src 'unsafe-inline'`).
 *
 * `isProduction` dibaca `next.config.ts` SAAT MODUL DIMUAT, jadi setiap kasus
 * harus memuat ulang modulnya dengan `NODE_ENV` yang sudah disetel. Itu
 * sebabnya `vi.resetModules()` dipanggil di setiap pemuatan.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Header = { key: string; value: string };

/** CSP seperti yang Next akan kirimkan, pada `NODE_ENV` tertentu. */
async function headersFor(nodeEnv: string): Promise<Header[]> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  const cfg = (await import("../next.config")).default;
  const entries = (await cfg.headers?.()) ?? [];
  /* Satu aturan untuk `/:path*` — berlaku ke SETIAP jalur. Kalau suatu saat
     ada aturan kedua, tes ini harus diajari memilih; dibiarkan sempit supaya
     perubahan itu tidak lolos diam-diam. */
  expect(entries, "diharapkan tepat satu aturan header").toHaveLength(1);
  expect((entries[0] as { source: string }).source).toBe("/:path*");
  return (entries[0] as unknown as { headers: Header[] }).headers;
}

const csp = (h: Header[]) =>
  h.find((x) => x.key === "Content-Security-Policy")?.value ?? "";
const directive = (h: Header[], name: string) =>
  csp(h)
    .split("; ")
    .find((d) => d.startsWith(`${name} `)) ?? "";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("`'unsafe-eval'` — produksi TIDAK, pengembangan YA", () => {
  it("PRODUKSI: `script-src` tanpa `'unsafe-eval'`", async () => {
    /*
     * Dokumentasi Next sendiri: "unsafe-eval is not required for production.
     * Neither React nor Next.js use eval in production by default."
     * Diperiksa juga di repo ini — nol `eval(` di `src/`, dan satu-satunya
     * kemunculan di `.next/static` adalah shim `vm` milik dependensi Next
     * tanpa tempat pemanggilan.
     */
    const h = await headersFor("production");
    expect(directive(h, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp(h)).not.toContain("unsafe-eval");
  });

  it("PENGEMBANGAN: `'unsafe-eval'` tetap diizinkan", async () => {
    /*
     * Tanpa itu, React berhenti bisa merekonstruksi jejak galat sisi-server di
     * peramban — dan yang hilang justru perkakas yang dipakai saat memperbaiki
     * galat. Tes ini ada supaya tidak ada yang "merapikan" dev menjadi sama
     * dengan produksi dan mengambil alat itu tanpa sengaja.
     */
    const h = await headersFor("development");
    expect(directive(h, "script-src")).toContain("'unsafe-eval'");
  });

  it("pengaturannya bercabang pada NODE_ENV, bukan dipaku", async () => {
    const prod = directive(await headersFor("production"), "script-src");
    const dev = directive(await headersFor("development"), "script-src");
    expect(prod).not.toBe(dev);
  });
});

describe("`style-src 'unsafe-inline'` WAJIB tinggal — terlihat seperti kelalaian, bukan", () => {
  it("ada di produksi, dan itu memang disengaja", async () => {
    /*
     * ⚠ JANGAN HAPUS INI, dan jangan "perbaiki" dengan nonce.
     *
     * Sejak #203 seluruh gaya repo ini ditulis SEBARIS (`style={{...}}`).
     * Di CSP, `style-src` mengatur DUA hal: elemen `<style>` DAN atribut
     * `style="..."`. Nonce hanya bisa menandai yang pertama — atribut gaya
     * tidak punya tempat untuk membawa nonce.
     *
     * Jadi mencabutnya menuntut PEMBATALAN #203, bukan penyetelan CSP.
     */
    const h = await headersFor("production");
    expect(directive(h, "style-src")).toContain("'unsafe-inline'");
  });

  it("dan gaya sebaris memang mekanisme utamanya — bukan sisa", () => {
    /* Angka ini yang membuat alasan di atas bisa diperiksa, bukan dipercaya. */
    // Kebijakannya hidup di satu modul untuk KEDUA aplikasi (monorepo Fase 3d).
    const src = readFileSync(join(process.cwd(), "packages/core/src/security-headers.ts"), "utf8");
    expect(src).toContain("#203");
    expect(src).toMatch(/style="\.\.\."|style="/);
  });
});

describe("arahan yang menanggung beban keamanan", () => {
  it("default-src, frame-ancestors, base-uri, form-action terkunci ke `self`/`none`", async () => {
    const h = await headersFor("production");
    expect(directive(h, "default-src")).toBe("default-src 'self'");
    expect(directive(h, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(h, "base-uri")).toBe("base-uri 'self'");
    expect(directive(h, "form-action")).toBe("form-action 'self'");
  });

  it("`connect-src` & `font-src` tidak membuka sumber luar", async () => {
    const h = await headersFor("production");
    expect(directive(h, "connect-src")).toBe("connect-src 'self'");
    expect(directive(h, "font-src")).toBe("font-src 'self'");
  });

  it("`blob:` diizinkan HANYA di frame/object/img — untuk pratinjau PDF", async () => {
    /* Faktur & kontrak dirender sebagai blob: di dalam <iframe>/<embed>.
       Izin ini sempit dengan sengaja: tidak ada sumber LUAR yang dibuka. */
    const h = await headersFor("production");
    expect(directive(h, "frame-src")).toBe("frame-src 'self' blob:");
    expect(directive(h, "object-src")).toBe("object-src 'self' blob:");
    expect(directive(h, "img-src")).toContain("blob:");
    /* Dan TIDAK di script-src — blob: di sana akan mengizinkan skrip yang
       dirakit di runtime, yaitu lubang yang bentuknya mirip `unsafe-eval`. */
    expect(directive(h, "script-src")).not.toContain("blob:");
  });

  it("tak satu pun arahan membuka `*` atau skema http:", async () => {
    const value = csp(await headersFor("production"));
    expect(value).not.toContain("*");
    expect(value).not.toMatch(/\bhttp:/);
  });
});

describe("header non-CSP", () => {
  it("empat header dasar selalu ada", async () => {
    const h = await headersFor("production");
    const byKey = new Map(h.map((x) => [x.key, x.value]));
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
  });

  it("HSTS HANYA di produksi — preload tidak bisa ditarik kembali", async () => {
    /*
     * HSTS dengan `preload` masuk daftar bawaan peramban dan praktis tidak bisa
     * dibatalkan. Mengirimnya dari mesin pengembangan berarti mengunci
     * `localhost` ke HTTPS di peramban orang yang menjalankannya.
     */
    const prod = await headersFor("production");
    expect(prod.find((x) => x.key === "Strict-Transport-Security")?.value).toContain(
      "includeSubDomains; preload"
    );
    const dev = await headersFor("development");
    expect(dev.some((x) => x.key === "Strict-Transport-Security")).toBe(false);
  });
});
