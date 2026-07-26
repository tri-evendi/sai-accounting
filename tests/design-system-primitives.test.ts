/**
 * Adopsi primitif design system — penjaga bagian "Primitif Wajib" di
 * design-system/sai-accounting/MASTER.md.
 *
 * Dua aturan yang dijaga di sini, keduanya soal hal yang TIDAK terlihat saat
 * menyalin-tempel markup mentah:
 *
 *  1. **Tabel lewat primitif `Table`** (`src/components/ui/table.tsx`).
 *     `<table>` mentah tampak baik di layar lebar lalu memaksa seluruh halaman
 *     menggeser ke samping di ponsel — padahal MASTER.md melarang horizontal
 *     scroll di 375px. `Table` membawa pembungkus `overflow-x-auto`-nya
 *     sendiri, jadi yang menggeser hanya tabelnya. Ia juga menyeragamkan garis,
 *     padding, dan hover baris, dan `MoneyCell`/`Money` menyeragamkan nominal
 *     (tabular-nums, rata kanan, format id-ID) — 48 tabel tangan sebelumnya
 *     menyimpang satu per satu.
 *
 *  2. **Tombol lewat primitif `Button`** (`src/components/ui/button.tsx`).
 *     `<button>` mentah kehilangan hal-hal yang tidak kelihatan sampai
 *     diuji: `focus-visible` ring untuk pengguna keyboard, `cursor-pointer`,
 *     transisi 150ms, penanganan `disabled`, dan — yang paling sering —
 *     **target sentuh**. Tombol ikon rakitan tangan biasanya berakhir ~28px
 *     (`p-1.5`), di bawah minimum 40px MASTER.md; `size="icon"` memberi 40px
 *     tanpa perlu diingat.
 *
 * Keduanya diperiksa dengan membaca sumber, bukan merender: aturannya tentang
 * markup apa yang DITULIS, dan penjaga berbasis regex tetap hijau/merah tanpa
 * bergantung pada jsdom.
 *
 * Lingkupnya `src/app/(dashboard)` + `src/components`, KECUALI
 * `src/components/ui` — di situlah primitifnya sendiri tinggal, dan mereka
 * memang harus menulis `<table>`/`<button>` mentah.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_DIR = join(__dirname, "..", "src");
const ROOTS = [join(SRC_DIR, "app", "(dashboard)"), join(SRC_DIR, "components")];
/** Rumah para primitif — satu-satunya tempat markup mentah memang benar. */
const PRIMITIVES_DIR = join(SRC_DIR, "components", "ui");

/**
 * Tombol yang SENGAJA tetap `<button>` mentah. Bukan utang teknis: masing-masing
 * adalah pola yang primitif `Button` justru merusaknya, dan alasannya juga
 * ditulis di komentar kepala file masing-masing. Menambah baris di sini adalah
 * keputusan desain — sertakan alasannya.
 */
const RAW_BUTTON_ALLOWLIST = new Set([
  // Chrome aplikasi: tombol yang bentuknya ditentukan bilah/panelnya sendiri,
  // bukan tombol aksi di dalam halaman.
  "components/layout/sidebar.tsx", // pemicu collapse + baris menu (aktif/nonaktif, lebar penuh)
  "components/layout/navbar.tsx", // pemicu menu mobile
  "components/layout/accountant-mode-toggle.tsx", // sakelar mode dengan status di dalam label
  // Pola dropdown yang dirakit tangan (pemicu + isi menu): fokus, Escape, dan
  // klik-di-luar dikelola sendiri, dan itemnya bergaya baris menu — bukan tombol.
  "components/layout/user-menu.tsx",
  "components/layout/help-menu.tsx",
  // Lapisan tur berpemandu: tombolnya melayang di atas overlay dengan
  // penempatan & z-index sendiri.
  "components/help/guided-tour.tsx",
  // Penanda langkah wizard: kembaran interaktif dari <div> di sebelahnya, harus
  // tampil identik (kartu dua baris, tinggi mengikuti isi) — `Button` memaksa
  // tinggi 40px, `justify-center`, dan `whitespace-nowrap`.
  "components/shared/wizard.tsx",
  // Grup chip filter `aria-pressed`: semantik toggle, belum ada primitifnya
  // (tidak ada `ToggleGroup` di src/components/ui).
  "app/(dashboard)/glossary/glossary-browser.tsx",
]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return full === PRIMITIVES_DIR ? [] : tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Jalur relatif terhadap `src/`, selalu bergaya posix supaya pesan galat stabil. */
function label(file: string): string {
  return relative(SRC_DIR, file).split(sep).join("/");
}

describe("adopsi primitif design system", () => {
  const files = ROOTS.flatMap(tsxFiles);

  it("menemukan berkas halaman & komponen untuk diperiksa", () => {
    // Penjaga bagi penjaga: kalau jalur di ROOTS berubah dan hasil telusurnya
    // kosong, dua tes di bawah akan lulus tanpa memeriksa apa pun.
    expect(files.length).toBeGreaterThan(150);
  });

  it("tidak ada <table> mentah — tabel lewat primitif Table", () => {
    const offenders = files
      .filter((f) => /<(table|thead|tbody|tfoot)[\s>]/.test(readFileSync(f, "utf8")))
      .map(label);
    expect(
      offenders,
      "Pakai Table/TableHeader/TableBody/TableRow/TableCell dari " +
        "@/components/ui/table (nominal lewat MoneyCell/Money). Primitifnya " +
        "membawa pembungkus overflow-x-auto, jadi tabel lebar menggeser " +
        "dirinya sendiri — bukan seluruh halaman di ponsel."
    ).toEqual([]);
  });

  it("tidak ada <button> mentah di luar daftar pengecualian — tombol lewat primitif Button", () => {
    const offenders = files
      .filter((f) => /<button[\s>]/.test(readFileSync(f, "utf8")))
      .map(label)
      .filter((f) => !RAW_BUTTON_ALLOWLIST.has(f));
    expect(
      offenders,
      "Pakai Button dari @/components/ui/button (tombol ikon: " +
        'variant="ghost" size="icon" = 40px, jarak antar aksi gap-2). Kalau ' +
        "polanya memang tidak bisa memakai primitif, tulis alasannya di " +
        "komentar kepala file lalu daftarkan di RAW_BUTTON_ALLOWLIST pada " +
        "tests/design-system-primitives.test.ts."
    ).toEqual([]);
  });

  it("daftar pengecualian tombol tidak menyimpan entri basi", () => {
    // Pengecualian yang file-nya sudah bersih (atau sudah pindah/hapus) harus
    // dikeluarkan dari daftar, supaya daftar ini tetap bisa dipercaya sebagai
    // dokumentasi "di sini memang mentah".
    const withRawButton = new Set(
      files.filter((f) => /<button[\s>]/.test(readFileSync(f, "utf8"))).map(label)
    );
    const stale = [...RAW_BUTTON_ALLOWLIST].filter((f) => !withRawButton.has(f));
    expect(
      stale,
      "Berkas ini tidak lagi punya <button> mentah — hapus dari RAW_BUTTON_ALLOWLIST."
    ).toEqual([]);
  });
});
