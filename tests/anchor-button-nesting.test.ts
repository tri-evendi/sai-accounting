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
 * ══ Kenapa PETA HITUNGAN, bukan daftar berkas ══════════════════════════════
 *
 * 45 sarang masih tersisa di 27 berkas, dan issue #289 sendiri meminta
 * pekerjaannya dipecah per modul — jadi penjaga ini terpaksa hidup berdampingan
 * dengan utang yang belum lunas. Daftar pengecualian dalam bentuk NAMA BERKAS
 * akan lumpuh justru di situ: berkas yang sudah ada di daftar boleh menambah
 * sarang sebanyak-banyaknya tanpa membuatnya merah.
 *
 * Karena itu yang dicatat adalah JUMLAHNYA per berkas, dan pembandingnya sama
 * dengan (`toEqual`), bukan "tidak lebih dari". Akibatnya dua arah:
 *   • menambah sarang di mana pun — termasuk di berkas yang sudah terdaftar —
 *     membuatnya merah;
 *   • mencabut sarang juga membuatnya merah sampai angkanya diperbarui, jadi
 *     setiap kemajuan muncul sebagai angka yang MENGECIL di diff, bukan
 *     sebagai baris yang lenyap tanpa jejak.
 *
 * Daftar ini hanya boleh mengecil, dan ia akan HABIS — bukan dikosongkan.
 * Entri terakhir yang dicabut harus mencabut `SISA_SARANG` berikut tes
 * "tidak memuat entri basi" bersamanya: daftar kosong yang lulus tanpa
 * memeriksa apa pun adalah cara paling pelan sebuah penjaga menjadi hiasan
 * (pelajaran #267 potongan 3–4).
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

/**
 * Sisa utang per 2026-08-08, SESUDAH modul faktur dipindahkan (#289 PR 1).
 * 45 sarang di 27 berkas. Hanya boleh mengecil; lihat kepala berkas untuk
 * kenapa ini peta hitungan dan bukan daftar nama.
 *
 * Urutan modulnya kelak: yang terpadat lebih dulu — `fixed-assets` (4),
 * `accounts`/`contracts`/`inventory` (masing-masing 3–5 bila detail & daftarnya
 * dihitung bersama), lalu sisanya.
 */
const SISA_SARANG: Record<string, number> = {
  "app/(dashboard)/error.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/accounts/import/import-form.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/accounts/page.tsx": 3,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/advances/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/consignees/[id]/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/consignees/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/[id]/page.tsx": 3,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/cost-centers/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/[id]/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/documents/document-preview-button.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/documents/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/finance/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/page.tsx": 4,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/opname/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/page.tsx": 3,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/journal/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/purchases/new/purchase-wizard.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/reconciliation/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/returns/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/sales/new/sales-wizard.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/[id]/page.tsx": 2,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/page.tsx": 1,
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/tax/efaktur/page.tsx": 1,
  "components/shared/document-preview.tsx": 1,
};

/**
 * Modul yang sudah dibersihkan. Daftar ini hanya boleh BERTAMBAH, dan ia yang
 * membuat kemajuan tidak bisa mundur diam-diam: peta di atas menjaga jumlah
 * total, daftar ini menjaga bahwa modul yang sudah selesai tidak menerima
 * sarang baru sekalipun modul lain kebetulan kehilangan satu.
 */
const MODUL_SELESAI = ["app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices"];

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

/** Peta `berkas -> jumlah sarang` untuk seluruh `src/`. */
function petaSarang(): Record<string, number> {
  const peta: Record<string, number> = {};
  for (const { rel, isi } of BERKAS) {
    const n = sarang(rel, isi).length;
    if (n > 0) peta[rel] = n;
  }
  return peta;
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

  it("jumlah sarang per berkas sama persis dengan yang tercatat", () => {
    expect(
      petaSarang(),
      "Sarang anchor–tombol bertambah, berkurang, atau berpindah berkas.\n" +
        "Kalau BERTAMBAH: pakai `<ButtonLink href>` (rute di dalam app) atau " +
        "`<Button href>` (tautan keluar / download) — satu elemen, bukan " +
        "`<Link>` membungkus `<Button>`.\n" +
        "Kalau BERKURANG: bagus, itu tujuannya — perbarui angkanya di " +
        "SISA_SARANG supaya penjaga ini mengunci hitungan yang baru."
    ).toEqual(SISA_SARANG);
  });

  it("SISA_SARANG tidak memuat entri basi", () => {
    /*
     * Tes di atas sudah membandingkan dua peta, jadi entri basi sebenarnya
     * ikut tertangkap di sana. Yang ini menjawab pertanyaan yang BERBEDA dan
     * jauh lebih mudah salah: apakah kunci-kuncinya masih menunjuk berkas yang
     * ada. Berkas yang dipindah atau dihapus meninggalkan kunci yang tidak akan
     * pernah cocok, dan pesan kegagalan "peta tidak sama" tidak menyebutkan
     * sebabnya.
     */
    const ada = new Set(BERKAS.map(({ rel }) => rel));
    const hilang = Object.keys(SISA_SARANG).filter((f) => !ada.has(f));
    expect(hilang, "SISA_SARANG menyebut berkas yang sudah tidak ada").toEqual([]);
    // …dan tidak ada entri bernilai nol, yang lulus tanpa memeriksa apa pun.
    expect(Object.entries(SISA_SARANG).filter(([, n]) => n < 1)).toEqual([]);
  });

  it("modul yang sudah dibersihkan tetap nol", () => {
    const pelanggar: string[] = [];
    for (const { rel, isi } of BERKAS) {
      if (!MODUL_SELESAI.some((m) => rel.startsWith(`${m}/`))) continue;
      for (const baris of sarang(rel, isi)) pelanggar.push(`${rel}:${baris}`);
    }
    expect(pelanggar.sort()).toEqual([]);
    // Daftarnya menunjuk modul yang benar-benar ada — bukan jalur yang salah
    // ketik, yang akan membuat tes di atas lulus tanpa memeriksa apa pun.
    for (const modul of MODUL_SELESAI) {
      expect(
        BERKAS.some(({ rel }) => rel.startsWith(`${modul}/`)),
        `MODUL_SELESAI menyebut "${modul}" yang tidak memuat satu pun .tsx`
      ).toBe(true);
    }
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

    // Bentuk yang dijaga, persis seperti yang ada di 45 berkas tersisa.
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
