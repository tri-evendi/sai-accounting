/**
 * Sarang anchor–tombol: `<Link><Button/></Link>` (issue #289).
 *
 * ══ Bentuk yang dijaga, dan kenapa ia bug ══════════════════════════════════
 *
 * `<Link><Button/></Link>` dan `<a href download><Button/></a>` adalah DUA
 * elemen interaktif bersarang — `<a>` yang di dalamnya ada `<button>`. HTML
 * melarangnya (konten `<a>` tidak boleh memuat konten interaktif), dan
 * akibatnya bukan teoretis: pembaca layar mengumumkan satu kendali sebagai dua,
 * dan urutan fokus papan tik berhenti dua kali di tempat yang terlihat satu.
 *
 * ══ Kenapa penjaganya baru ada sekarang ════════════════════════════════════
 *
 * Sampai #289 tidak ada bentuk pengganti yang benar, jadi tidak ada yang bisa
 * dijaga. `<Button href>` (#250) memang satu elemen, tetapi ia MEMBUANG
 * `next/link`: navigasi sisi-klien dan prefetch hilang, semuanya pemuatan
 * halaman penuh. Untuk ke-37 pemanggil #250 itu gratis — mereka sudah memuat
 * penuh sejak #187 — tapi untuk sarang yang `<Link>`-nya masih hidup, memindah
 * apa adanya berarti menukar bug validitas HTML dengan regresi navigasi.
 *
 * `<ButtonLink>` (#289) adalah bentuk ketiga: `<a class="ant-btn">` yang sama
 * dengan `<Button href>`, ditambah `router.push()` pada klik dan
 * `router.prefetch()` saat masuk viewport. Baru dengan bentuk itu ada tempat
 * bagi sarang-sarang ini untuk pindah, dan baru dengan begitu penjaga ini bisa
 * merah tanpa memaksa orang memilih antara dua bug.
 *
 * ══ Utangnya LUNAS: penjaga ini sekarang menuntut NOL ══════════════════════
 *
 * Sampai paruh kedua #289 berkas ini memegang `SISA_SARANG`, sebuah peta
 * `berkas -> jumlah` yang dibandingkan dengan `toEqual`. Bentuk itu dipilih
 * karena issue-nya meminta pekerjaannya dipecah per modul, jadi penjaganya
 * terpaksa hidup berdampingan dengan utang yang belum lunas — dan daftar
 * pengecualian dalam bentuk NAMA BERKAS akan lumpuh justru di situ: berkas yang
 * sudah terdaftar boleh menambah sarang sebanyak-banyaknya tanpa membuatnya
 * merah. Peta hitungan menutup lubang itu dari dua arah sekaligus: menambah
 * sarang di mana pun membuatnya merah, dan MENCABUT sarang juga — sehingga
 * setiap kemajuan muncul sebagai angka yang mengecil di diff, bukan sebagai
 * baris yang lenyap tanpa jejak.
 *
 * Jejak angkanya: **50 di 29** saat issue dibuka, **45 di 27** setelah modul
 * faktur (PR 1), **24 di 14** setelah paruh pertama (PR 2), **0** sekarang.
 *
 * Peta itu HABIS, bukan dikosongkan — dan karena itu ia dicabut bersama tes
 * "tidak memuat entri basi" yang melayaninya, persis seperti yang diminta di
 * tempat ini sebelumnya. Sebuah daftar kosong yang lulus tanpa memeriksa apa
 * pun adalah cara paling pelan sebuah penjaga menjadi hiasan (pelajaran #267
 * potongan 3–4). Yang menggantikannya lebih keras, bukan lebih longgar: NOL
 * sarang di seluruh `src/`, tanpa satu pun pengecualian yang bisa ditumpangi.
 *
 * ⚠ Jangan menghidupkan kembali daftar pengecualian apa pun di sini. Sarang
 * baru sekarang merah di berkas mana pun, dan itulah satu-satunya keadaan yang
 * tidak bisa memburuk diam-diam. Kalau sebuah sarang baru terasa perlu, yang
 * dibutuhkan bukan pengecualian melainkan `<ButtonLink href>` (rute di dalam
 * app) atau `<Button href>` (tautan keluar / `download` / `target`).
 *
 * `MODUL_SELESAI` ikut dicabut karena alasan yang sama: ia menjaga bahwa modul
 * tertentu tetap nol, yang kini dijamin tes di bawah untuk SEMUA modul. Daftar
 * yang memeriksa sebagian dari apa yang sudah dijamin seluruhnya hanya menambah
 * satu tempat lagi untuk salah ketik.
 *
 * ══ ⚠ Yang penjaga ini TIDAK bisa lihat ════════════════════════════════════
 *
 * Ditulis karena di repo ini lima penjaga sudah ketahuan palsu, tumpul, atau
 * usang modelnya — dan yang membuat mereka bertahan adalah orang yang membaca
 * hijau lalu berhenti bertanya.
 *
 *   • **Sarang yang dirakit antar-berkas.** `<Link><KartuAksi/></Link>` yang
 *     `KartuAksi`-nya merender `<Button>` adalah sarang yang SAMA di DOM, dan
 *     penjaga ini buta terhadapnya: ia membaca satu berkas pada satu waktu dan
 *     tidak menelusuri komponen. Yang bisa menemukannya hanya membuka
 *     halamannya dan memeriksa DOM-nya.
 *   • **Nama tag lain.** Ia mengenal `Link`, `NextLink`, `AppLink`, dan `a`
 *     (terukur: hanya itu yang dipakai `src/`). Alias impor baru
 *     (`import Link as Tautan`) lolos begitu saja.
 *   • **Apakah penggantinya benar.** Memindahkan sarang ke `<Button href>`
 *     alih-alih `<ButtonLink>` akan membuat penjaga ini HIJAU sambil mencabut
 *     navigasi sisi-klien — persis kesalahan yang issue #289 tulis panjang
 *     lebar. Tidak ada penjaga untuk itu, sebab keduanya bentuk yang sah di
 *     tempatnya masing-masing; yang membedakan adalah niat, dan niat tidak bisa
 *     diuji. Yang bisa dilakukan penjaga hanyalah menuntut keduanya berbagi
 *     satu perakit `<a>` (tes terakhir di berkas ini), sehingga perbedaannya
 *     tinggal perilaku klik, bukan rupa.
 *
 * ══ Kenapa parser, bukan regex ═════════════════════════════════════════════
 *
 * Badan issue #289 menyebut "56 sarang di 32 berkas"; angka itu hasil regex dan
 * ia salah. Pola bergaya `<Link[^>]*>` berhenti pada `>` pertama — termasuk `>`
 * milik `=>` — sehingga setiap sarang di dalam `.map((x) => …)` tercacah keliru.
 * Hitungan sebenarnya saat issue ini dibuka adalah **50 sarang di 29 berkas**
 * (46 `<Link>` + 4 `<a>`), diukur dengan parser TypeScript yang sama dengan
 * `tests/button-emphasis.test.ts`. Angka "46" di kepala `ui/button.tsx` pun
 * keliru dengan cara lain: ia menghitung `<Link>` saja. Keduanya sudah
 * dikoreksi di sana. Jangan menghitung ulang dengan `grep`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const BUTTON = join(SRC, "components", "ui", "button.tsx");

/**
 * Nama tag yang merender sebuah `<a>`. `Link` menutupi keduanya sekaligus:
 * `next/link` langsung maupun pembungkus bertenant `ui/app-link.tsx` diimpor
 * dengan nama itu di seluruh `src/`.
 */
const ANCHOR = new Set(["Link", "NextLink", "AppLink", "a"]);

function berkasTsx(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const jalur = join(dir, entri.name);
    // `src/generated` adalah klien Prisma, bukan kode kita.
    if (entri.isDirectory()) {
      if (entri.name !== "generated") berkasTsx(jalur, keluar);
    } else if (entri.name.endsWith(".tsx")) keluar.push(jalur);
  }
  return keluar;
}

const relatif = (jalur: string) => jalur.slice(SRC.length + 1).split("\\").join("/");

function sumber(nama: string, kode: string): ts.SourceFile {
  return ts.createSourceFile(nama, kode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;
const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const namaTag = (n: Jsx) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText();

/**
 * Setiap `<Button>` yang punya LELUHUR anchor, dengan barisnya.
 *
 * Leluhur, bukan anak langsung: `<Link><span><Button/></span></Link>` adalah
 * sarang yang persis sama buruknya di DOM, dan pembungkus semacam itu memang
 * ada di app ini. Penjaga yang hanya melihat anak langsung akan hijau pada
 * bentuk yang paling mudah ditulis orang berikutnya.
 *
 * Hanya `ts.isJsxElement` yang diperiksa sebagai anchor: elemen self-closing
 * (`<Link />`) tidak punya anak, jadi ia tidak bisa menyarangkan apa pun.
 */
function sarang(nama: string, kode: string): number[] {
  const src = sumber(nama, kode);
  const baris: number[] = [];
  const kunjungi = (node: ts.Node, didalamAnchor: boolean) => {
    const anchor =
      didalamAnchor || (ts.isJsxElement(node) && ANCHOR.has(namaTag(node)));
    if (anchor && isJsx(node) && namaTag(node) === "Button") {
      baris.push(src.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, (anak) => kunjungi(anak, anchor));
  };
  kunjungi(src, false);
  return baris;
}

/** Jumlah elemen JSX bernama `tag` — elemen, bukan penyebutan di prosa. */
function hitungTag(nama: string, kode: string, tag: string): number {
  const src = sumber(nama, kode);
  let n = 0;
  const kunjungi = (node: ts.Node) => {
    if (isJsx(node) && namaTag(node) === tag) n += 1;
    ts.forEachChild(node, kunjungi);
  };
  kunjungi(src);
  return n;
}

/**
 * Apakah sebuah atribut JSX dengan nama ini benar-benar DITULIS di suatu
 * elemen. Dipisahkan dari pencocokan teks dengan sengaja: berkas yang paling
 * mungkin menyebut `legacyBehavior` adalah justru yang menjelaskan kenapa ia
 * ditolak, dan penjaga yang merah pada penjelasannya sendiri akan dilonggarkan
 * orang berikutnya sampai tidak menjaga apa pun.
 */
function punyaAtribut(nama: string, kode: string, atribut: string): boolean {
  const src = sumber(nama, kode);
  let ada = false;
  const kunjungi = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === atribut) ada = true;
    ts.forEachChild(node, kunjungi);
  };
  kunjungi(src);
  return ada;
}

/**
 * Pengenal (identifier) yang benar-benar dipakai di KODE. Komentar bukan simpul
 * AST, jadi prosa yang menyebut namanya tidak ikut tertangkap — dan berkas yang
 * paling banyak menyebut `cloneElement` di app ini adalah justru yang
 * menjelaskan kenapa ia tidak boleh dipakai.
 */
function pengenalDipakai(nama: string, kode: string, pengenal: string[]): string[] {
  const src = sumber(nama, kode);
  const dipakai = new Set<string>();
  const cari = new Set(pengenal);
  const kunjungi = (node: ts.Node) => {
    if (ts.isIdentifier(node) && cari.has(node.text)) dipakai.add(node.text);
    ts.forEachChild(node, kunjungi);
  };
  kunjungi(src);
  return [...dipakai].sort();
}

const BERKAS = berkasTsx(SRC).map((jalur) => ({
  rel: relatif(jalur),
  isi: readFileSync(jalur, "utf8"),
}));

/** Setiap sarang di seluruh `src/`, sebagai `berkas:baris`. */
function semuaSarang(): string[] {
  const keluar: string[] = [];
  for (const { rel, isi } of BERKAS) {
    for (const baris of sarang(rel, isi)) keluar.push(`${rel}:${baris}`);
  }
  return keluar.sort();
}

describe("sarang anchor–tombol (#289)", () => {
  it("memindai pohon sumber yang benar", () => {
    /*
     * Kalau pemindainya rusak (jalur salah, saringan kelewat rakus), peta di
     * bawah menjadi kosong dan SETIAP tes lain di berkas ini berubah arti tanpa
     * satu pun gagal. Ini yang menahan kegagalan diam itu.
     */
    expect(BERKAS.length).toBeGreaterThan(200);
    expect(BERKAS.some(({ rel }) => rel === "components/ui/button.tsx")).toBe(true);
  });

  it("tidak ada satu pun sarang anchor–tombol di seluruh src/", () => {
    /*
     * NOL, tanpa daftar pengecualian — lihat "Utangnya LUNAS" di kepala berkas
     * untuk kenapa peta hitungan yang dulu ada di sini dicabut alih-alih
     * dikosongkan. Pesan kegagalannya menyebut BENTUK penggantinya, bukan
     * sekadar "jangan": yang menemukan tes ini merah biasanya sedang menulis
     * sebuah tombol yang menavigasi, dan pertanyaan berikutnya selalu "lalu
     * pakai apa".
     */
    expect(
      semuaSarang(),
      "Sarang anchor–tombol baru: `<Link>` (atau `<a>`) membungkus `<Button>` " +
        "adalah dua elemen interaktif bersarang.\n" +
        "Pakai `<ButtonLink href>` untuk rute di dalam app — satu " +
        "`<a class=\"ant-btn\">` yang TETAP navigasi sisi-klien + prefetch.\n" +
        "Pakai `<Button href>` hanya bila pemuatan halaman penuh memang yang " +
        "diinginkan: `download`, `target=\"_blank\"`, tautan keluar, atau jalan " +
        "keluar dari render yang gagal (`error.tsx`)."
    ).toEqual([]);
  });

  it("`legacyBehavior` tidak dipakai di mana pun", () => {
    /*
     * Jalan pintas yang paling menggoda saat memperbaiki sarang: `<Link
     * legacyBehavior>` meng-`cloneElement` anaknya, jadi `<Link
     * legacyBehavior><Button href/></Link>` benar-benar menghasilkan satu `<a>`.
     * Ia ditolak karena dua sebab yang masing-masing sudah cukup: ia MEMBACA
     * anaknya — kelas bug yang mematikan `next build` di #203/#250, dan
     * `next/link` sendiri melempar E863 bila anak itu simpul `react.lazy` — dan
     * Next 16 sudah menandainya usang (`errorOnce`, "will be removed").
     */
    const pemakai = BERKAS.filter(({ rel, isi }) =>
      punyaAtribut(rel, isi, "legacyBehavior")
    ).map(({ rel }) => rel);
    expect(pemakai).toEqual([]);
  });

  it("pendeteksi atribut membedakan KODE dari prosa yang menyebutnya", () => {
    // Kepala `ui/button.tsx` menulis `<Link legacyBehavior>` di dalam komentar
    // untuk menjelaskan kenapa ia ditolak. Penjaga yang merah pada kalimat itu
    // adalah penjaga yang salah.
    expect(punyaAtribut("uji.tsx", "const x = <Link legacyBehavior><a/></Link>;", "legacyBehavior")).toBe(true);
    expect(punyaAtribut("uji.tsx", "/* `<Link legacyBehavior>` sudah usang */", "legacyBehavior")).toBe(false);
    expect(punyaAtribut("uji.tsx", "const x = <Link href=\"/x\">a</Link>;", "legacyBehavior")).toBe(false);
  });

  it("pendeteksinya benar-benar bisa merah — dibuktikan di sini, bukan diandaikan", () => {
    const uji = (kode: string) => sarang("uji.tsx", kode).length;

    /*
     * Bentuk yang dijaga. Sejak sarang terakhir dicabut, INILAH satu-satunya
     * tempat contoh-contohnya masih ada — tanpa tes ini, pendeteksi yang rusak
     * akan membuat tes "nol sarang" di atas hijau selamanya tanpa memeriksa apa
     * pun, dan tidak ada lagi berkas sungguhan yang menahannya.
     */
    expect(uji("<Link href=\"/x\"><Button variant=\"primary\">A</Button></Link>")).toBe(1);
    expect(uji("<a href=\"/f.csv\" download><Button variant=\"outline\">Unduh</Button></a>")).toBe(1);
    // Pembungkus di tengah tidak menyelamatkan apa pun di DOM.
    expect(uji("<Link href=\"/x\"><span><Button variant=\"ghost\">A</Button></span></Link>")).toBe(1);
    // Dua tombol dalam satu anchor = dua sarang.
    expect(
      uji("<Link href=\"/x\"><Button variant=\"ghost\">A</Button><Button variant=\"ghost\">B</Button></Link>")
    ).toBe(2);
    /*
     * ⚠ Jebakan yang membuat angka issue #289 salah: pola regex `<Link[^>]*>`
     * berhenti pada `>` milik `=>`, jadi sarang di dalam `.map()` tercacah
     * keliru. Parser tidak bisa tertipu begitu — dan itu satu-satunya alasan
     * berkas ini memakai `typescript` alih-alih sebuah pola.
     */
    expect(
      uji("<div>{xs.map((x) => (<Link key={x} href={`/x/${x}`}><Button variant=\"ghost\">{x}</Button></Link>))}</div>")
    ).toBe(1);

    // …dan hijau pada bentuk-bentuk yang justru BENAR:
    expect(uji("<ButtonLink href=\"/x\" variant=\"primary\">A</ButtonLink>")).toBe(0);
    expect(uji("<Button href=\"/x\" variant=\"primary\">A</Button>")).toBe(0);
    expect(uji("<Link href=\"/x\">teks biasa</Link>")).toBe(0);
    // Tombol DI LUAR anchor, di berkas yang juga memuat anchor.
    expect(uji("<div><Link href=\"/x\">teks</Link><Button variant=\"ghost\">A</Button></div>")).toBe(0);
    // Nama tag lain yang kebetulan berakhiran sama bukan urusan penjaga ini.
    expect(uji("<Link href=\"/x\"><IconButton>A</IconButton></Link>")).toBe(0);
  });

  it("`ButtonLink` ada, dan sifat-sifat yang membuatnya aman masih utuh", () => {
    const isi = readFileSync(BUTTON, "utf8");

    // Bentuk ketiganya benar-benar diekspor — tanpa ini seluruh penjaga di atas
    // menuntut pemindahan ke tempat yang tidak ada.
    expect(isi).toMatch(/export \{ Button, ButtonLink \}/);

    /*
     * Satu perakit `<a>` untuk KEDUA bentuk tautan. Ini yang membuat
     * `<Button href>` dan `<ButtonLink href>` tidak bisa berpenampilan berbeda:
     * hanya `ButtonAnchor` yang menyentuh `AntdButton` dengan `href`.
     */
    expect(isi).toMatch(/function ButtonAnchor\(/);
    expect(
      hitungTag("button.tsx", isi, "ButtonAnchor"),
      "hanya `Button` (jalur href) dan `ButtonLink` yang boleh merakit <a>"
    ).toBe(2);
    /*
     * Dua `<AntdButton>` di seluruh berkas, tidak lebih: satu `<button>`
     * (`ButtonElement`) dan satu `<a>` (`ButtonAnchor`). Jalur ketiga berarti
     * ada tombol yang gayanya dihitung di tempat lain — bentuk yang bisa
     * menyimpang tanpa satu pun galat.
     */
    expect(hitungTag("button.tsx", isi, "AntdButton")).toBe(2);

    // Jalur bertenant (#157) — tanpa ini tiga tautan wisaya kembali menempuh
    // pantulan 307 yang justru dihapus issue itu.
    expect(isi).toMatch(/scopedHref\(href, pathname\)/);

    // Navigasi sisi-klien + prefetch, yaitu seluruh alasan bentuk ini ada.
    expect(isi).toMatch(/router\.push\(tujuan\)/);
    expect(isi).toMatch(/router\.replace\(tujuan\)/);
    expect(isi).toMatch(/router\.prefetch\(tujuan\)/);

    /*
     * Atribut anchor tetap DIDEKLARASIKAN: yang lupa memindahkan `download`
     * dari `<a>` ke tombolnya harus gugur di `tsc`, bukan di produksi.
     */
    expect(isi).toMatch(/"download" \| "target" \| "rel"/);

    /*
     * Dan yang paling penting: primitif ini tidak boleh MEMBACA anaknya. Itu
     * bentuk `asChild` yang dicabut #250 karena mematikan prerender produksi
     * dari server component (anak `react.lazy` tanpa `.props`).
     */
    expect(pengenalDipakai("button.tsx", isi, ["Children", "cloneElement", "isValidElement"])).toEqual(
      []
    );
  });

  it("pendeteksi pengenal membedakan KODE dari prosa yang menyebutnya", () => {
    // Kepala `ui/button.tsx` menulis `React.Children.only()` dan
    // `cloneElement` panjang lebar; itu sejarah yang harus dibaca, bukan
    // pelanggaran.
    expect(pengenalDipakai("uji.tsx", "const a = React.Children.only(x);", ["Children"])).toEqual([
      "Children",
    ]);
    expect(pengenalDipakai("uji.tsx", "/* `React.Children.only()` melempar */", ["Children"])).toEqual(
      []
    );
  });
});
