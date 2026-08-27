/**
 * PENJAGA #471 butir 2 — gulir mendatar pada level BADAN di layar 390px.
 *
 * == Apa yang dijaga, dan apa yang TIDAK ===================================
 * Yang dijaga adalah MEKANISMENYA, bukan hasil rendernya. Sebuah halaman yang
 * menggulir mendatar di ponsel hampir selalu punya satu penyebab yang bisa
 * dibaca dari sumbernya: sebuah lebar piksel TETAP yang lebih besar daripada
 * layarnya, tanpa langit-langit `maxWidth: "100%"` yang mengizinkannya
 * menyusut.
 *
 * ⚠ Ini BUKAN pengganti pengukuran di peramban sungguhan, dan tidak boleh
 * dibaca begitu. Gulir mendatar juga bisa lahir dari hal-hal yang tidak
 * kelihatan di sumber — teks panjang tanpa titik putus, `position:absolute`
 * yang meleset, tabel yang isinya lebih lebar daripada wadahnya. Suite ini
 * berjalan di Node tanpa DOM dan tanpa mesin tata letak: ia tidak bisa
 * mengukur satu piksel pun.
 *
 * Yang bisa dikatakannya jujur cuma ini: penyebab yang PALING SERING, dan
 * satu-satunya yang bisa masuk diam-diam lewat tinjauan kode, tidak ada di
 * berkas mana pun. Sisanya menunggu peramban — dan itu ditulis di sini supaya
 * tidak ada yang menyangka masalahnya sudah tertutup.
 *
 * == Kenapa 390 ============================================================
 * iPhone 12/13/14 dan sebagian besar Android arus utama berlebar CSS 390px.
 * Angka yang lebih besar melewatkan perangkat nyata; yang lebih kecil (320px,
 * iPhone SE generasi 1) menolak lebar yang sah pada perangkat yang praktis
 * sudah tidak dipakai pengguna aplikasi ini.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Lebar CSS ponsel arus utama. Lihat catatan di kepala berkas. */
const NARROW = 390;

const SRC = join(__dirname, "..", "src");

/**
 * Rute PENGHASIL GAMBAR, bukan halaman.
 *
 * `opengraph-image` menggambar kanvas 1200×630 — ukuran yang DITETAPKAN
 * spesifikasi Open Graph, bukan tata letak yang pernah bertemu sebuah viewport.
 * Menuntutnya menyusut di 390px berarti menuntut gambar pratinjau tautan yang
 * salah ukuran di setiap aplikasi perpesanan.
 */
const IMAGE_ROUTES = new Set(["opengraph-image.tsx", "twitter-image.tsx", "icon.tsx", "apple-icon.tsx"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      /* Klien Prisma yang dibangkitkan bukan tulisan siapa pun di repo ini. */
      if (entry === "generated") continue;
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx") && !IMAGE_ROUTES.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Buang segala sesuatu yang angkanya BUKAN lebar tata letak.
 *
 * Titik henti (`@media (min-width:992px)`, `@container (min-width:520px)`)
 * memuat angka besar menurut rancangannya — angka itu justru yang MENGAKHIRI
 * tata letak sempit, bukan yang melanggarnya. Ia hidup di dalam string
 * lembar gaya, jadi dibuang sebagai string.
 */
function layoutOnly(source: string): string {
  return source
    // Blok `<style>` dan literal templat lembar gaya.
    .replace(/@(media|container)[^{]*\{[\s\S]*?\}\s*\}/g, "")
    .replace(/@(media|container)[^{]*\{[^}]*\}/g, "")
    // Komentar: contoh dan catatan bebas menyebut angka apa pun.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Lebar piksel TETAP yang melewati layar sempit, beserta konteks di sekitarnya.
 * Konteksnya dipakai mencari langit-langit `maxWidth` pada objek gaya yang sama.
 */
function unboundedWidths(source: string): string[] {
  const found: string[] = [];
  const re = /\b(minWidth|width)\s*:\s*"?(\d{3,5})(px)?"?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (Number(m[2]) <= NARROW) continue;
    /* Objek gaya yang sama = kurung kurawal yang sama. Dilihat 400 karakter ke
       kedua arah: cukup untuk satu literal gaya, terlalu sempit untuk bocor ke
       gaya di sebelahnya. */
    const around = source.slice(Math.max(0, m.index - 400), m.index + 400);
    if (/maxWidth\s*:\s*"100%"/.test(around)) continue;
    if (/maxWidth\s*:\s*"?\d+/.test(around)) continue;
    found.push(`${m[1]}: ${m[2]}`);
  }
  return found;
}

describe("tak ada lebar tetap yang melebihi layar 390px tanpa langit-langit", () => {
  const files = tsxFiles(SRC);

  it("menemukan berkas untuk diperiksa (penjaga yang memeriksa nol berkas selalu hijau)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("setiap lebar piksel di atas 390 berpasangan dengan `maxWidth`", () => {
    const pelanggar: string[] = [];
    for (const file of files) {
      const hits = unboundedWidths(layoutOnly(readFileSync(file, "utf8")));
      if (hits.length > 0) {
        pelanggar.push(`${file.slice(SRC.length + 1)}: ${hits.join(", ")}`);
      }
    }
    expect(
      pelanggar,
      "Lebar piksel tetap di atas 390 tanpa `maxWidth: \"100%\"` di sebelahnya. " +
        "Di layar 390px ia memaksa BADAN halaman menggulir mendatar — dan gulir " +
        "mendatar di ponsel membuat separuh isi layar mustahil ditemukan. " +
        "Tambahkan `maxWidth: \"100%\"` pada gaya yang sama, atau pindahkan " +
        "angkanya ke titik henti `@media`/`@container` bila memang lebar itu " +
        "hanya berlaku di layar lebar."
    ).toEqual([]);
  });
});

describe("wisaya Penjualan & Pembelian ikut diperiksa (#471 butir 3)", () => {
  /*
   * Catatan #471 menyebut wisaya "sengaja tidak disentuh" karena tata letaknya
   * DIBACA sudah runtuh ke satu kolom di 390px — kesimpulan dari membaca, bukan
   * dari mengukur. Yang bisa ditegakkan tanpa peramban adalah premis bacaan itu:
   * kisi dua kolomnya memakai titik patah yang muat di layar sempit.
   */
  const wizards = [
    join(SRC, "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]", "sales", "new"),
    join(
      SRC,
      "app",
      "(app)",
      "(dashboard)",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      "purchases",
      "new"
    ),
  ];

  it("keduanya ada, dan tak satu pun memuat lebar tetap yang melebihi layarnya", () => {
    const pelanggar: string[] = [];
    for (const dir of wizards) {
      const files = tsxFiles(dir);
      expect(files.length, `wisaya tidak ditemukan di ${dir}`).toBeGreaterThan(0);
      for (const file of files) {
        const hits = unboundedWidths(layoutOnly(readFileSync(file, "utf8")));
        if (hits.length > 0) pelanggar.push(`${file.slice(SRC.length + 1)}: ${hits.join(", ")}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("kisi dua kolomnya patah DI BAWAH 390px, bukan di atasnya", () => {
    /*
     * `twoColumnGrid` menahan dua kolom selama masing-masing muat pada
     * `FIELD_MIN`. Bila FIELD_MIN naik melewati separuh layar sempit, kisinya
     * berhenti runtuh dan kedua kolomnya justru mendorong badan halaman.
     */
    const forms = tsxFiles(SRC).filter((f) => /\bFIELD_MIN\b/.test(readFileSync(f, "utf8")));
    expect(forms.length, "tak satu pun formulir memakai FIELD_MIN").toBeGreaterThan(0);
    for (const file of forms) {
      const src = readFileSync(file, "utf8");
      const m = /const FIELD_MIN\b\s*=\s*(\d+)/.exec(src);
      expect(m, `${file} menyebut FIELD_MIN tanpa mendefinisikannya`).not.toBeNull();
      expect(Number(m![1]), `${file.slice(SRC.length + 1)}: FIELD_MIN`).toBeLessThanOrEqual(
        NARROW
      );
    }
  });
});
