/**
 * Kepala halaman seragam — penjaga konvensi "Kepala Halaman & Breadcrumb"
 * di design-system/sai-accounting/MASTER.md.
 *
 * Aturan yang dijaga: semua halaman dashboard memakai `PageHeader`
 * (`src/components/ui/page-header.tsx`), tidak menulis judul tingkat-1 atau
 * memanggil breadcrumb sendiri — supaya judul, jejak lokasi, dan tombol aksi
 * tampil di tempat yang sama di seluruh app, dan halaman baru tidak menyimpang
 * lagi.
 *
 * ── Kontraknya tidak berubah di #204; IMPLEMENTASINYA berubah ─────────────
 * Sampai epik #206 satu-satunya cara menulis judul halaman sendiri adalah
 * `<h1>`, jadi satu regex sudah menutup seluruh jalan. Setelah aplikasi ini
 * berdiri di atas Ant Design ada jalan KEDUA yang tidak melewati `<h1>` sama
 * sekali di sumbernya: `<Typography.Title level={1}>` — yang merender `<h1>`
 * juga, hanya saja di dalam paket. Penjaga versi lama akan menyatakan halaman
 * seperti itu bersih.
 *
 * Hal yang sama berlaku di sisi jejak lokasi: `Breadcrumb` bukan lagi primitif
 * milik repo ini (ia larut ke `page-header.tsx` di #191) melainkan komponen
 * AntD yang bisa diimpor siapa saja dari `"antd"`, tanpa menyentuh satu berkas
 * pun di `components/ui`.
 *
 * Karena itu yang dicari sekarang tiga bentuk, bukan dua — dan tesnya tetap
 * membaca sumber, bukan merender: aturannya tentang apa yang DITULIS.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "..", "src", "app");

/**
 * Grup rute yang halamannya tunduk pada konvensi ini. `(setup)` ikut sejak
 * issue #103 — wizard penyiapan pindah ke grup rutenya sendiri demi kerangka
 * fokus, dan kepala halamannya tetap harus `PageHeader` seperti yang lain.
 */
const PAGE_GROUPS = ["(dashboard)", "(setup)"];

/**
 * File cadangan Next.js (`error`/`loading`/`not-found`/`global-error`) BUKAN
 * halaman dalam arti konvensi ini: mereka dirender di luar pohon halaman normal
 * (mis. `error.tsx` justru muncul saat render halaman gagal) dan tak bisa
 * memakai `PageHeader` yang butuh sesi/konteks. Karena itu dikecualikan dari
 * penjaga — judulnya boleh `<h1>` sendiri.
 */
const RESERVED = new Set(["error.tsx", "loading.tsx", "not-found.tsx", "global-error.tsx"]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") && !RESERVED.has(entry.name) ? [full] : [];
  });
}

describe("konvensi PageHeader di halaman aplikasi", () => {
  const files = PAGE_GROUPS.flatMap((group) => tsxFiles(join(APP_DIR, group)));
  const label = (f: string) => f.slice(APP_DIR.length + 1);

  it("menemukan halaman untuk diperiksa", () => {
    expect(files.length).toBeGreaterThan(50);
    // Penjaga bagi penjaga: grup yang salah tulis membuat telusurnya kosong.
    for (const group of PAGE_GROUPS) {
      expect(files.some((f) => label(f).startsWith(`${group}/`)), group).toBe(true);
    }
  });

  it("tidak ada <h1> manual — judul halaman lewat PageHeader", () => {
    const offenders = files.filter((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")));
    expect(
      offenders.map(label),
      "Judul halaman lewat prop `title` PageHeader, bukan <h1> sendiri."
    ).toEqual([]);
  });

  /*
   * `<Title level={1}>` maupun `<Typography.Title level={1}>`; `level` boleh
   * berdiri di mana saja di antara atribut lain, jadi polanya melihat seluruh
   * tag pembuka. Level 2–5 sengaja TIDAK ikut: judul seksi di dalam halaman
   * memang bukan urusan konvensi ini, dan wizard penyiapan memakainya.
   */
  const TITLE_TINGKAT_1 = /<(?:Typography\.)?Title\b[^>]*?\blevel=\{1\}/;

  it("tidak ada Typography.Title level={1} — judul tingkat-1 hanya milik PageHeader", () => {
    const offenders = files.filter((f) => TITLE_TINGKAT_1.test(readFileSync(f, "utf8")));
    expect(
      offenders.map(label),
      "`<Typography.Title level={1}>` merender `<h1>` juga — hanya saja di " +
        "dalam paket, sehingga penjaga yang cuma mencari `<h1>` menyatakan " +
        "halamannya bersih. Dua judul tingkat-1 di satu halaman adalah cacat " +
        "struktur dokumen yang tidak terlihat sama sekali di layar; yang " +
        "melaporkannya hanya pembaca layar.\n\n" +
        "Judul halaman lewat prop `title` PageHeader. Untuk judul SEKSI pakai " +
        "`level={2}` ke bawah."
    ).toEqual([]);
  });

  it("tidak ada <Breadcrumb> manual — jejak lokasi lewat prop breadcrumbs", () => {
    const offenders = files.filter((f) => /<Breadcrumb[\s/>]/.test(readFileSync(f, "utf8")));
    expect(
      offenders.map(label),
      "Sejak #191 `Breadcrumb` adalah komponen AntD yang bisa diimpor " +
        "langsung dari `\"antd\"` — jalan pintas yang tidak menyentuh satu " +
        "berkas pun di components/ui. Jejak lokasi tetap lewat prop " +
        "`breadcrumbs` PageHeader, dengan label yang SAMA dengan menu samping."
    ).toEqual([]);
  });
});
