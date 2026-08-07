/**
 * `Button asChild` sudah TIDAK ADA — penjaga atas bug yang mematikan
 * `next build` dari server component (issue #250, temuan #203).
 *
 * ── Bug yang dijaga ────────────────────────────────────────────────────────
 * Bentuk `asChild` membaca prop anaknya (`href`, label) untuk memasangnya di
 * `<a>` milik AntD. Ketika pemanggilnya server component, anak itu menyeberangi
 * batas RSC lebih dulu: `<Link>` adalah komponen client, jadi Flight
 * menserialisasinya sebagai REFERENSI, dan sisi SSR baru mengubahnya menjadi
 * elemen setelah chunk-nya termuat. Selama belum, React menyerahkan simpul
 * `lazy` — tanpa `.props` untuk dibaca — dan `React.Children.only()`
 * melemparkan:
 *
 *     Error: React.Children.only expected to receive a single React element child
 *
 * Pada halaman statis itu MEMATIKAN prerender-nya, yaitu mematikan build.
 *
 * ── Kenapa penjaganya harus melarang BENTUKNYA, bukan mengaudit pemakaian ──
 * Gejalanya berpindah-pindah: pada satu build #203 `/privacy` lolos dan
 * `/terms` — halaman kembarnya, JSX identik — gagal, dan hanya pada tombol
 * KEDUANYA. Yang menentukan bukan kodenya melainkan urutan pemuatan chunk, dan
 * urutan itu bergeser setiap kali graf modul berubah; di #203 pemicunya sekadar
 * delapan paket yang dicabut dari `package.json`. Artinya **tidak ada satu baris
 * kode aplikasi pun yang perlu berubah untuk menyalakannya kembali**, dan tidak
 * ada tes per-halaman yang bisa dipercaya menangkapnya.
 *
 * Karena itu yang dijaga bukan "apakah pemanggil X aman", melainkan: propnya
 * tidak ada, dan tidak ada yang menulisnya. Selama bentuknya tidak bisa
 * dituliskan, kelas kegagalannya tidak bisa kembali.
 *
 * ── Yang TIDAK dijaga di sini ──────────────────────────────────────────────
 * `asChild` pada primitif LAIN (`dialog`, `popover`, `term-tooltip`,
 * `empty-state`, `learn-more`) sengaja dibiarkan — semuanya pola *trigger* yang
 * hidup di dalam berkas `"use client"`, tempat anaknya selalu elemen sungguhan.
 * Penjaga ini menyebut nama `Button` secara eksplisit supaya pelebarannya
 * kelak menjadi keputusan sadar, bukan efek samping regex yang melar.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const BUTTON = join(SRC, "components", "ui", "button.tsx");

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
 * `<Button …>` yang di antara nama tag dan `>` memuat kata `asChild`.
 *
 * `[^>]*?` sengaja MELARANG `>`: tanpa itu pola melar melewati tag penutupnya
 * dan mencocokkan `asChild` milik elemen lain di beberapa baris bawah — penjaga
 * yang merah pada berkas yang tidak bersalah, yang lalu dilonggarkan orang
 * berikutnya sampai tidak menjaga apa pun. `\b` di depan `Button` mencegah
 * `<IconButton asChild>` dan sejenisnya ikut tertarik.
 *
 * Multi-baris ditangani `[\s\S]`: 15 dari 36 pemanggil lama menulis propnya di
 * barisnya sendiri.
 */
const BUTTON_ASCHILD = /<Button\b[^>]*?\basChild\b/;

describe("Button tanpa asChild (#250)", () => {
  it("tidak ada satu pun `<Button asChild>` di seluruh src/", () => {
    const pelanggar = BERKAS.filter(({ isi }) => BUTTON_ASCHILD.test(isi)).map(({ jalur }) => jalur);
    expect(pelanggar).toEqual([]);
  });

  it("regexnya benar-benar bisa cocok — dibuktikan di sini, bukan diandaikan", () => {
    // Penjaga hijau yang polanya tak akan pernah cocok adalah penjaga nol.
    // Bentuk-bentuk di bawah ini persis bentuk yang dulu ada di 36 pemanggil.
    expect(BUTTON_ASCHILD.test('<Button asChild size="lg">')).toBe(true);
    expect(BUTTON_ASCHILD.test('<Button asChild>')).toBe(true);
    expect(BUTTON_ASCHILD.test('<Button\n  key={x}\n  asChild\n  variant="outline"\n>')).toBe(true);

    // …dan tidak cocok pada hal yang bukan sasarannya:
    expect(BUTTON_ASCHILD.test("<DialogClose asChild>")).toBe(false);
    expect(BUTTON_ASCHILD.test("<PopoverTrigger asChild>")).toBe(false);
    expect(BUTTON_ASCHILD.test('<Button href="/x">teks</Button>\n<Foo asChild>')).toBe(false);
    // Prosa yang menyebut namanya (komentar sejarah) bukan pelanggaran.
    expect(BUTTON_ASCHILD.test("bentuk `Button asChild` sudah dicabut")).toBe(false);
  });

  it("primitifnya sendiri tidak lagi punya prop itu", () => {
    // Pemanggil nol tidak berarti apa-apa kalau propnya masih bisa dipakai:
    // yang berikutnya akan menulisnya, dan `tsc` akan menerimanya.
    //
    // Prosa BOLEH menyebut namanya — sejarahnya justru yang perlu dibaca orang
    // berikutnya. Yang dilarang adalah bentuk KODE-nya: deklarasi tipe
    // (`asChild?:`), destrukturisasi (`asChild =`), atau pembacaan (`asChild`
    // diikuti `:`/`?`). Karena itu polanya menuntut `\s*` sebelum tandanya —
    // backtick di prosa memutusnya.
    const isi = readFileSync(BUTTON, "utf8");
    expect(isi).not.toMatch(/\basChild\b\s*[=:?]/);
    // Jalur tautannya tetap ada — pengganti yang aman, dan tetap bertenant.
    expect(isi).toMatch(/href\?: string/);
    expect(isi).toMatch(/scopedHref\(href, pathname\)/);
  });
});
