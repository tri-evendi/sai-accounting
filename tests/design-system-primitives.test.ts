/**
 * Adopsi primitif design system — penjaga bagian "Primitif Wajib" di
 * design-system/sai-accounting/MASTER.md. Ditulis ulang untuk Ant Design di
 * issue #204 (fase D4).
 *
 * ── Apa yang berubah, dan apa yang TIDAK ───────────────────────────────────
 * Dua larangan pertama tidak berubah sedikit pun, karena alasannya tidak
 * pernah tentang pustaka gayanya: `<table>` dan `<button>` mentah kehilangan
 * hal-hal yang TIDAK terlihat saat menyalin markup — pembungkus geser, cincin
 * fokus papan ketik, target sentuh 40px. Yang berganti hanya pemilik janji
 * itu: dulu kelas Tailwind di primitif, kini `scroll.x` dan token
 * `controlHeight` di AntD.
 *
 * Tiga larangan berikutnya BARU, dan ketiganya lahir dari kelas kesalahan yang
 * hanya ada setelah migrasi — bentuk kode yang terbaca benar, lolos `tsc`, dan
 * tidak melakukan apa pun:
 *
 *  3. **`className`.** Sejak #203 tidak ada satu lembar gaya pun yang
 *     memaknainya. Sebuah kelas karena itu tidak GAGAL — ia hanya berhenti
 *     berlaku, diam-diam, dan diff-nya tetap terlihat seperti perubahan gaya
 *     yang berhasil.
 *  4. **Ukuran ikon lewat prop `size`/`width`/`height`.** `size={16}` **lolos
 *     `tsc`** (diverifikasi di #204 dengan menjalankan `bun run typecheck`
 *     terhadap pelanggaran yang sengaja disuntikkan: nol galat): props
 *     `@ant-design/icons` turun dari `React.HTMLProps<HTMLSpanElement>`, yang
 *     memang punya `size` — atribut HTML `<input>`/`<select>`. Ia mendarat
 *     sebagai `size="16"` di `<span>` dan tidak mengatur apa pun.
 *     `width`/`height` mengenai span-nya, bukan `<svg width="1em">` di
 *     dalamnya — sama tidak berpengaruhnya. Ukuran ikon AntD adalah
 *     `font-size`, selalu.
 *  5. **`role`/`aria-live` pada `Alert` AntD.** Terukur: `Alert` selalu
 *     merender `role="alert"` (asertif) dan MEMBUANG `role` yang dioper —
 *     `role="status"` tidak bisa dicapai dengannya. Sebuah `<Alert
 *     role="status">` karena itu adalah pengumuman yang MEMOTONG bacaan
 *     pembaca layar yang sedang berjalan, sambil terbaca di kode seolah-olah
 *     sopan. Kalau yang dibutuhkan memang wilayah live yang sopan, bungkus
 *     isinya dengan elemen ber-`role="status"` SENDIRI (pola `wizard.tsx`),
 *     jangan mengoper `role` ke `Alert`.
 *
 * Semuanya diperiksa dengan membaca sumber, bukan merender: aturannya tentang
 * markup apa yang DITULIS, dan penjaga berbasis regex tetap hijau/merah tanpa
 * bergantung pada jsdom.
 *
 * Lingkup dua larangan pertama `src/app/(app)/(dashboard)` + `src/app/(app)/(setup)` +
 * `src/components`, KECUALI `src/components/ui` — di situlah primitifnya
 * sendiri tinggal, dan mereka memang harus menulis `<table>`/`<button>`
 * mentah. Tiga larangan berikutnya berlaku di SELURUH `src/`: sebuah kelas
 * yang tak berlaku dan sebuah `size={16}` yang inert sama saja salahnya di
 * dalam primitif.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_DIR = join(__dirname, "..", "src");
// `(setup)` ikut sejak issue #103: wizard penyiapan pindah ke grup rutenya
// sendiri demi kerangka fokus, dan pindah grup rute tidak boleh berarti pindah
// keluar dari aturan primitif.
const ROOTS = [
  join(SRC_DIR, "app", "(app)", "(dashboard)"),
  join(SRC_DIR, "app", "(app)", "(setup)"),
  join(SRC_DIR, "components"),
];
/** Rumah para primitif — satu-satunya tempat markup mentah memang benar. */
const PRIMITIVES_DIR = join(SRC_DIR, "components", "ui");

/**
 * Tombol yang SENGAJA tetap `<button>` mentah. Bukan utang teknis: masing-masing
 * adalah pola yang primitif `Button` justru merusaknya, dan alasannya juga
 * ditulis di komentar kepala file masing-masing. Menambah baris di sini adalah
 * keputusan desain — sertakan alasannya.
 */
const RAW_BUTTON_ALLOWLIST = new Set([
  /*
   * ── Lima entri chrome aplikasi DIKELUARKAN di issue #193 ─────────────────
   * `sidebar`, `navbar`, `accountant-mode-toggle`, `user-menu`, dan
   * `help-menu` dulu ada di sini dengan dua alasan: "bentuknya ditentukan
   * bilah/panelnya sendiri" dan "dropdown rakitan tangan yang mengelola fokus,
   * Escape, serta klik-di-luar sendiri". Migrasi AntD menghapus KEDUA alasan
   * itu, bukan sekadar merapikannya:
   *   • baris menu kini `Menu` (bentuk & keadaan aktifnya milik komponen),
   *   • kedua dropdown kini `Dropdown` (fokus, Escape, dan klik-di-luar milik
   *     rc-dropdown — termasuk pengembalian fokus ke pemicu, yang tidak pernah
   *     dilakukan versi rakitan tangan),
   *   • pemicu, sakelar mode, dan tombol tutup laci kini `Button` primitif.
   * Karena itu kelimanya bukan lagi pengecualian; tes "daftar tidak menyimpan
   * entri basi" di bawah yang akan berteriak kalau ada yang mengembalikannya
   * tanpa alasan baru.
   */
  /*
   * ── Entri tur berpemandu DIKELUARKAN di issue #224 ───────────────────────
   * Alasannya dulu "tombolnya melayang di atas overlay dengan penempatan &
   * z-index sendiri" — dan overlay itulah yang lenyap: `guided-tour.tsx` kini
   * `Tour` AntD, jadi penempatan, z-index, tirai, dan panah penunjuk datang
   * dari komponennya. Yang tersisa untuk ditulis sendiri adalah satu tombol
   * "Lewati" di `actionsRender`, dan tombol biasa di dalam kartu biasa tidak
   * punya alasan apa pun untuk melewati primitif.
   */
  // Penanda langkah wizard: kembaran interaktif dari <div> di sebelahnya, harus
  // tampil identik (kartu dua baris, tinggi mengikuti isi) — `Button` memaksa
  // tinggi 40px, perataan tengah, dan `whitespace-nowrap`.
  "components/shared/wizard.tsx",
  /*
   * ── Entri grup chip Kamus Istilah DIKELUARKAN di issue #198 ──────────────
   * Alasannya dulu "semantik toggle, belum ada primitifnya (tidak ada
   * `ToggleGroup` di src/components/ui)". Yang dibutuhkan `glossary-browser`
   * ternyata bukan ToggleGroup melainkan kelompok pilihan SALING MENIADAKAN —
   * satu kategori, atau "semua" — dan itu `Segmented` AntD, yang merender
   * `role="radiogroup"` berisi `<input type="radio">` sungguhan: panah
   * kiri/kanan berpindah pilihan dan `checked` diumumkan pembaca layar.
   *
   * Itu lebih ketat daripada tujuh `aria-pressed` yang berdiri sendiri-sendiri
   * padahal hanya satu boleh aktif. `<input type="radio">` native memang di
   * luar aturan ini (lihat MASTER.md), jadi tidak ada pengecualian baru yang
   * menggantikannya.
   */
]);

/**
 * Satu-satunya `className` yang sah di aplikasi ini, dan ia bukan gaya:
 * `<html>` memikul tiga KAIT — variabel `next/font`, kunci `cssVar` AntD
 * (`ANTD_CSS_VAR_KEY`, yang membuat `var(--ant-…)` teratasi di seluruh dokumen
 * sejak #227), dan kelas tema yang dipasang skrip sinkron di `<head>`.
 * Ketiganya disasar SELEKTOR, bukan aturan utilitas; tak satu pun punya bentuk
 * sebaris. Sejak #399 `<html>` itu ditulis SEKALI di `RootDocument` dan dipakai
 * kedua root layout (`app/(app)`, `app/(marketing)`).
 */
const CLASSNAME_ALLOWLIST = new Set(["components/providers/root-document.tsx"]);

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

/** Seluruh pohon `src/`, kecuali klien Prisma hasil `prisma generate`. */
function allTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : allTsx(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Berkas-berkas yang isinya cocok dengan sebuah pola, sebagai label. */
function offenders(files: string[], pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(readFileSync(f, "utf8"))).map(label);
}

describe("adopsi primitif design system", () => {
  const files = ROOTS.flatMap(tsxFiles);

  it("menemukan berkas halaman & komponen untuk diperiksa", () => {
    // Penjaga bagi penjaga: kalau jalur di ROOTS berubah dan hasil telusurnya
    // kosong, dua tes di bawah akan lulus tanpa memeriksa apa pun.
    expect(files.length).toBeGreaterThan(150);
  });

  it("tidak ada <table> mentah — tabel lewat StaticTable/DataTable", () => {
    expect(
      offenders(files, /<(table|thead|tbody|tfoot)[\s>]/),
      "Pakai StaticTable (server, tanpa satu baris JS) atau DataTable (AntD, " +
        "client — hanya bila memang butuh sortir/filter seketika), dengan " +
        "kolom dari table-columns/money-column/status-column.\n\n" +
        "Keduanya membawa geser-sendiri: StaticTable lewat pembungkus " +
        "`overflow-x:auto`, DataTable lewat `scroll={{ x: 'max-content' }}` " +
        "yang dipasang primitif sebagai BAWAAN. Tabel lebar karena itu " +
        "menggeser DIRINYA — bukan seluruh halaman di ponsel, yang tidak akan " +
        "terlihat di layar 1440px tempat kodenya ditulis."
    ).toEqual([]);
  });

  it("tidak ada <button> mentah di luar daftar pengecualian — tombol lewat primitif Button", () => {
    expect(
      offenders(files, /<button[\s>]/).filter((f) => !RAW_BUTTON_ALLOWLIST.has(f)),
      "Pakai Button dari @/components/ui/button (tombol ikon: " +
        'variant="ghost" size="icon" = 40px, tinggi yang datang dari token ' +
        "`controlHeight` di AntdProvider, bukan dari angka yang harus " +
        "diingat). Kalau polanya memang tidak bisa memakai primitif, tulis " +
        "alasannya di komentar kepala file lalu daftarkan di " +
        "RAW_BUTTON_ALLOWLIST pada tests/design-system-primitives.test.ts."
    ).toEqual([]);
  });

  it("daftar pengecualian tombol tidak menyimpan entri basi", () => {
    // Pengecualian yang file-nya sudah bersih (atau sudah pindah/hapus) harus
    // dikeluarkan dari daftar, supaya daftar ini tetap bisa dipercaya sebagai
    // dokumentasi "di sini memang mentah". Tiga entri gugur sepanjang epik
    // #206 justru karena tes ini menolak menyimpannya.
    const berbutton = new Set(offenders(files, /<button[\s>]/));
    expect(
      [...RAW_BUTTON_ALLOWLIST].filter((f) => !berbutton.has(f)),
      "Berkas ini tidak lagi punya <button> mentah — hapus dari RAW_BUTTON_ALLOWLIST."
    ).toEqual([]);
  });
});

describe("kosakata gaya pasca-Tailwind (#203/#204)", () => {
  const files = allTsx(SRC_DIR);
  const KELAS = /className\s*=/;

  it("memindai seluruh pohon src, bukan sebagian", () => {
    expect(files.length).toBeGreaterThan(250);
  });

  it("nol `className` — tidak ada lembar gaya yang memaknainya", () => {
    expect(
      offenders(files, KELAS).filter((f) => !CLASSNAME_ALLOWLIST.has(f)),
      "Sejak #203 tidak ada lembar gaya yang memaknai kelas: sebuah " +
        "`className` tidak GAGAL, ia hanya berhenti berlaku — dan diff-nya " +
        "tetap terlihat seperti perubahan gaya yang berhasil.\n\n" +
        "Gaya ditulis SEBARIS (`style={{…}}`) dengan warna & jarak dari " +
        "`var(--ant-…)`. Yang tidak punya bentuk sebaris (`:hover`, `::after`, " +
        "`@media`) hidup di satu `<style href precedence>` di komponennya, " +
        "menyasar atribut `data-*` — pola `landing-scale.ts` / `ui/table.tsx`."
    ).toEqual([]);
  });

  it("daftar pengecualian className tidak menyimpan entri basi", () => {
    const berkelas = new Set(offenders(files, KELAS));
    expect(
      [...CLASSNAME_ALLOWLIST].filter((f) => !berkelas.has(f)),
      "Berkas ini tidak lagi menulis `className` — hapus dari CLASSNAME_ALLOWLIST."
    ).toEqual([]);
  });

  /*
   * Ikon `@ant-design/icons` ditulis `<XOutlined />`, `<XFilled />`, atau
   * `<XTwoTone />`. Polanya sengaja menuntut nama komponen berakhiran salah
   * satu dari tiga varian itu: `<Progress size={16}>` dan `<Button size="sm">`
   * adalah prop `size` yang SUNGGUHAN, dan penjaga yang ikut menangkapnya akan
   * dilonggarkan dalam seminggu.
   */
  const IKON_BERUKURAN =
    /<[A-Z][A-Za-z0-9]*(?:Outlined|Filled|TwoTone)\b[^>]*?\s(?:size|width|height)\s*=/;

  it("ukuran ikon tidak pernah lewat prop `size`/`width`/`height`", () => {
    expect(
      offenders(files, IKON_BERUKURAN),
      "Ukuran ikon Ant Design adalah `font-size`, SELALU — " +
        "`style={{ fontSize: 20 }}`, dan sebagian besar ikon tidak perlu " +
        "menyebutnya sama sekali (di dalam Button/Menu/Tag/paragraf ia sudah " +
        "mengikuti teks di sebelahnya).\n\n" +
        "Kedua bentuk yang dilarang di sini GAGAL DIAM-DIAM:\n" +
        "  • `size={16}` lolos `tsc` — props ikon AntD turun dari " +
        "`React.HTMLProps<HTMLSpanElement>`, yang memang punya `size` " +
        '(atribut HTML <input>/<select>). Ia mendarat sebagai size="16" di ' +
        "<span> dan tidak mengatur apa pun.\n" +
        "  • `width`/`height` mengenai <span> pembungkusnya, bukan " +
        '`<svg width="1em">` di dalamnya — ukurannya terpasang, ikonnya tidak ' +
        "berubah."
    ).toEqual([]);
  });

  /*
   * `<Alert` saja, bukan `<AlertDialog` — batas kata `\b` tidak cukup di sini
   * karena `AlertDialog` juga diawali `Alert`; yang membedakan adalah karakter
   * SESUDAHNYA harus spasi/baris baru/`>`.
   *
   * Pembedanya ditulis sebagai LOOKAHEAD, bukan kelas karakter biasa. Bentuk
   * `<Alert[\s>][^>]*?\s(?:role|…)` terlihat benar dan gagal menangkap
   * `<Alert role="status" …>`: spasi satu-satunya sudah dimakan `[\s>]`,
   * sehingga `\s` di depan `role` tak punya apa pun untuk dicocokkan. Penjaga
   * ini pernah hijau justru pada pelanggaran yang disuntikkan untuk mengujinya
   * — itulah alasan langkah "sekali dilihat MERAH" ada.
   */
  const ALERT_BER_ROLE = /<Alert(?=[\s>])[^>]*?\s(?:role|aria-live)\s*=/;

  it("`Alert` AntD tidak pernah dioper `role`/`aria-live`", () => {
    expect(
      offenders(files, ALERT_BER_ROLE),
      'Terukur: `Alert` AntD selalu merender `role="alert"` — wilayah live ' +
        "ASERTIF, yang memotong bacaan pembaca layar yang sedang berjalan — " +
        'dan MEMBUANG `role` yang dioper. `<Alert role="status">` karena itu ' +
        "adalah kode yang terbaca sopan dan berperilaku sebaliknya; tidak ada " +
        "tes lain, dan tidak ada `tsc`, yang akan menyebutkannya.\n\n" +
        "Kalau pesannya memang tidak mendesak (ringkasan yang berubah, " +
        "hitungan yang diperbarui), bungkus isinya dengan elemen " +
        '`role="status"` SENDIRI dan jangan pakai `Alert` — pola ' +
        "`components/shared/wizard.tsx`."
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/* Isian berkas yang tak bisa dijangkau papan ketik (issue #205)              */
/* ------------------------------------------------------------------------ */

/**
 * `<input type="file">` di aplikasi ini SELALU disembunyikan — kotak pilih
 * berkas bawaan peramban tidak bisa digayai, jadi polanya `<label>` bergaya
 * yang membungkus isian tak terlihat. Yang menentukan pola itu bekerja atau
 * tidak adalah CARA menyembunyikannya, dan kedua cara terbaca sama di diff:
 *
 *   `display: none`  -> isian keluar dari pohon aksesibilitas DAN dari urutan
 *                       Tab. `<label>` bukan elemen fokusable, jadi tidak ada
 *                       satu pun perhentian Tab yang tersisa: unggahannya
 *                       menjadi mouse-only, tanpa satu galat.
 *   `data-sr-only`   -> isian tetap fokusable dan tetap dibacakan; hanya
 *                       kotaknya yang 1x1px terpotong (aturan `globals.css`).
 *
 * Terukur di #205: dua dari tiga pemilih berkas aplikasi ini memakai bentuk
 * pertama (unggah dokumen, impor CSV rekonsiliasi), sedangkan importir CoA
 * memakai bentuk kedua LENGKAP dengan komentar yang menjelaskan kenapa. Jadi
 * aturannya sudah diketahui repo ini; yang hilang hanya penjaganya.
 *
 * `tsc`, ESLint, dan seluruh tes lain hijau di KEDUA bentuk.
 */
describe("isian berkas tetap bisa dijangkau papan ketik (#205)", () => {
  const files = ROOTS.flatMap(tsxFiles);

  /** `<input …type="file"…>` yang di dalam tag-nya memuat `display: "none"`. */
  const FILE_INPUT_DISPLAY_NONE =
    // Tanpa flag `s`: `[^>]` sudah mencakup baris baru, dan `s` menuntut
    // target >= es2018 sehingga `tsc` menolaknya di konfigurasi repo ini.
    /<input(?=[\s>])[^>]*?\stype="file"[^>]*?display:\s*["']none["']/;

  it('tidak ada `<input type="file">` yang disembunyikan dengan `display: none`', () => {
    expect(
      offenders(files, FILE_INPUT_DISPLAY_NONE),
      "`display: none` mengeluarkan isian berkas dari urutan Tab, dan " +
        "`<label>` yang membungkusnya BUKAN elemen fokusable — jadi " +
        "permukaannya berhenti punya perhentian Tab sama sekali dan " +
        "unggahannya menjadi mouse-only.\n\n" +
        "Pakai atribut `data-sr-only` (aturannya di `src/app/globals.css`): " +
        "isiannya tetap fokusable dan tetap dibacakan pembaca layar, hanya " +
        "kotaknya yang 1x1px terpotong. Acuan lengkap beserta alasannya: " +
        "`app/(app)/(dashboard)/.../accounts/import/import-form.tsx`."
    ).toEqual([]);
  });

  it("penjaga bagi penjaga: polanya masih mengenali isian berkas", () => {
    // Kalau polanya kelak berhenti cocok (atribut ditulis berurutan lain,
    // gaya dipindah ke konstanta), tes di atas hijau tanpa memeriksa apa pun.
    expect(
      FILE_INPUT_DISPLAY_NONE.test('<input id="x" type="file" style={{ display: "none" }} />')
    ).toBe(true);
    expect(FILE_INPUT_DISPLAY_NONE.test('<input id="x" type="file" data-sr-only />')).toBe(false);
  });
});
