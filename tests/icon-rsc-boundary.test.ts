/**
 * Bentuk impor ikon — penjaga atas regresi yang mematikan `next build` di
 * develop (2026-08-06, peninggalan #201/#242/#244).
 *
 * ── Bug yang dijaga ────────────────────────────────────────────────────────
 * Barrel `@ant-design/icons` (`es/index.js`) memuat `components/Context.js`,
 * yang memanggil `createContext` di tingkat modul TANPA `"use client"`. Build
 * React untuk server component tidak mengekspor `createContext` sama sekali,
 * jadi satu server component yang menyentuh barrel itu sudah cukup untuk
 * menjatuhkan seluruh build:
 *
 *     TypeError: (0 , a.r(...).createContext) is not a function
 *     Error: Failed to collect page data for /setup-required
 *
 * Perhatikan halaman yang disebut galat itu: `/setup-required` tidak bersalah,
 * ia hanya halaman pertama yang kebetulan dikumpulkan. 162 berkas mengimpor
 * ikon dan galatnya menunjuk satu halaman acak — itulah kenapa bug ini mahal
 * ditelusuri dan pantas dijaga.
 *
 * Perbaikannya satu baris di `next.config.ts`: `modularizeImports` menulis
 * ulang impor bernama menjadi jalur dalam (`@ant-design/icons/PlusOutlined`),
 * yang isinya cuma `React.createElement` + `forwardRef` dan berhenti di
 * `AntdIconLight` — komponen yang SUDAH memikul `"use client"` dari paketnya.
 * Ikon tetap menjadi daun client; tidak ada halaman yang ikut menyeberang.
 *
 * ── Kenapa tes ini ada, padahal `next build` membuktikannya ────────────────
 * Karena `next build` BUKAN gerbang di repo ini: pemeriksaan tipe sengaja
 * dicabut dari build (lihat komentar `typescript.ignoreBuildErrors` di
 * `next.config.ts`), dan gerbang yang wajib hijau adalah `bun run verify`.
 * Regresi ini lolos `typecheck`, lolos `lint`, dan lolos 2.232 tes — karena
 * tidak satu pun di antaranya memuat modul lewat graf RSC yang sebenarnya.
 * Berkas ini menutup celah itu dengan ongkos milidetik, bukan sepuluh menit.
 *
 * ── Yang TIDAK dijaga di sini ──────────────────────────────────────────────
 * Ini penjaga BENTUK IMPOR, bukan pengganti build. Ia tidak akan menangkap
 * paket lain yang kelak mengulangi kesalahan yang sama. Satu-satunya penjaga
 * yang menangkap seluruh KELASNYA adalah `next build` di CI.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const PAKET = join(ROOT, "node_modules", "@ant-design", "icons");

/** Setiap `.ts`/`.tsx` di bawah `src/`. */
function berkasSumber(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const jalur = join(dir, entri.name);
    if (entri.isDirectory()) berkasSumber(jalur, keluar);
    else if (/\.tsx?$/.test(entri.name)) keluar.push(jalur);
  }
  return keluar;
}

const BERKAS = berkasSumber(SRC).map((jalur) => ({
  jalur: jalur.slice(ROOT.length + 1),
  isi: readFileSync(jalur, "utf8"),
}));

/**
 * Impor apa pun dari paket ikon, apa pun bentuknya — klausanya boleh berbaris
 * banyak, tapi tidak boleh memuat kutip atau titik koma. Batasan itulah yang
 * mencegah pencocokan melar mundur melewati pernyataan `import` sebelumnya.
 */
const IMPOR = /import\s+([^"';]*?)\s*from\s*["']@ant-design\/icons["']/g;

describe("bentuk impor @ant-design/icons", () => {
  it("selalu impor BERNAMA — bukan default, bukan namespace", () => {
    const pelanggar: string[] = [];
    for (const { jalur, isi } of BERKAS) {
      for (const [, klausa] of isi.matchAll(IMPOR)) {
        // `modularizeImports` hanya menulis ulang `{ … }`. Bentuk lain lolos
        // apa adanya, memuat barrel, dan mengembalikan bug tanpa suara.
        if (!klausa.replace(/^type\s+/, "").startsWith("{")) {
          pelanggar.push(`${jalur}: import ${klausa} from …`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("setiap nama yang diimpor punya berkas ikonnya sendiri di paket", () => {
    // `modularizeImports` memetakan `{ X }` → `@ant-design/icons/X`, yang lewat
    // peta `exports` paket (`"./*"` → `./es/icons/*.js`) harus mendarat pada
    // berkas sungguhan. Nama yang ADA di barrel tapi bukan ikon — `IconProvider`,
    // `getTwoToneColor`, `setTwoToneColor`, `createFromIconfontCN` — lolos `tsc`
    // tetapi menghasilkan jalur yang tidak ada; ditangkap di sini.
    const nama = new Set<string>();
    for (const { isi } of BERKAS) {
      for (const [, klausa] of isi.matchAll(IMPOR)) {
        const isian = klausa.replace(/^type\s+/, "");
        if (!isian.startsWith("{")) continue;
        for (const bagian of isian.replace(/[{}]/g, "").split(",")) {
          const bersih = bagian.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
          if (bersih) nama.add(bersih);
        }
      }
    }
    expect(nama.size).toBeGreaterThan(50); // regex ini harus benar-benar menemukan sesuatu
    const hilang = [...nama]
      .sort()
      .filter((n) => !existsSync(join(PAKET, "es", "icons", `${n}.js`)));
    expect(hilang).toEqual([]);
  });

  it("next.config.ts masih memasang modularizeImports untuk paket ini", () => {
    // Menghapus baris itu mengembalikan build yang mati, dan tidak ada tes lain
    // yang akan mengeluh. Kalau paketnya kelak memberi `"use client"` pada
    // `components/Context.js`, tes DI BAWAH ini yang gugur lebih dulu dan
    // menandai bahwa siasat ini boleh dilepas.
    const konfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(konfig).toMatch(/modularizeImports/);
    expect(konfig).toMatch(/"@ant-design\/icons":\s*\{\s*transform:\s*"@ant-design\/icons\/\{\{member\}\}"/);
  });

  it("barrel paketnya memang masih beracun di lapisan RSC", () => {
    // Alasan siasat ini ada, diukur ulang dari paket yang benar-benar terpasang
    // dan bukan dari ingatan. Kalau assertion ini gugur setelah bump versi,
    // itu KABAR BAIK: hapus `modularizeImports`, jalankan `bun run build`, dan
    // hapus tes ini bila build hijau.
    const barrel = readFileSync(join(PAKET, "es", "index.js"), "utf8");
    expect(barrel).toMatch(/from\s+["']\.\/components\/Context["']/);

    const konteks = readFileSync(join(PAKET, "es", "components", "Context.js"), "utf8");
    expect(konteks).toMatch(/createContext\(/);
    expect(konteks).not.toMatch(/^\s*["']use client["']/);

    // …sementara berkas ikonnya sendiri aman: batas client-nya sudah dipikul
    // komponen dasar milik paket, satu lapis di bawahnya.
    const dasar = readFileSync(join(PAKET, "es", "components", "AntdIconLight.js"), "utf8");
    expect(dasar).toMatch(/^\s*["']use client["']/);
  });
});
