/**
 * Satu baris kendali = satu ukuran.
 *
 * Aturannya di `design-system/sai-accounting/MASTER.md` §Jarak, radius, bayangan
 * → "Satu baris kendali = satu ukuran". Berkas ini menjaga bagian yang bisa
 * dijaga, dan — sama pentingnya — menyebut bagian yang tidak, supaya tidak ada
 * yang membaca hijau di sini lalu menyimpulkan aturannya sudah ditegakkan
 * seluruhnya.
 *
 * ══ Kenapa ini sebuah penjaga, bukan catatan di checklist ══════════════════
 *
 * Tinggi kendali app ini datang dari SATU token (`controlHeight: 40`), jadi
 * `size="sm"` bukan gaya melainkan turunan aritmetik: `40 × 0,75` = 30px. Dua
 * kendali berdampingan yang berbeda ukuran karena itu selalu berselisih tepat
 * sepuluh piksel — cukup untuk mematahkan garis dasar barisnya, tidak cukup
 * untuk terbaca sebagai keputusan. Yang dilihat pengguna adalah render yang
 * gagal.
 *
 * Dan bentuknya tidak pernah gagal di mana pun yang lain: `tsc` senang,
 * `bun run build` senang, seluruh 2.200-an tes lain senang. Satu-satunya tempat
 * ia terlihat adalah layar — dan di layar ia terlihat seperti bug CSS, sehingga
 * orang yang menemukannya mencarinya di tempat yang salah. Pemilik melaporkannya
 * dari `/finance`; auditnya menemukan bentuk yang sama di empat tempat lain,
 * tak satu pun ditulis oleh orang yang sama.
 *
 * ══ Model yang dipakai penjaga ini ═════════════════════════════════════════
 *
 *  • **Kendali** = primitif yang tingginya `controlHeight`: `Button`,
 *    `ButtonLink` (prop `size`), `Input`/`TextInput`/`Select`/`SelectField`
 *    (prop `fieldSize`), dan yang tingginya TETAP bawaan karena primitifnya
 *    tidak menerima ukuran sama sekali (`MoneyInput`, `PasswordInput`,
 *    `PasswordField`, `Textarea`, `SearchableSelect`, `ServerSearchableSelect`).
 *    Yang terakhir itu penting: mereka SELALU 40px, jadi `size="sm"` di
 *    sebelahnya selalu salah dan tidak ada cara menyamakannya selain menaikkan
 *    tombolnya.
 *  • **Baris** = wadah yang menata anaknya mendatar: `<Flex>` tanpa `vertical`,
 *    `<Space>` yang bukan `direction="vertical"`, `<Row>` AntD, dan elemen apa
 *    pun yang `style`-nya `display: "flex"` (bukan `flexDirection: "column"`)
 *    atau `display: "grid"`.
 *  • **Penghalang** = wadah yang menumpuk anaknya, jadi kendali di dalamnya
 *    bukan tetangga mendatar siapa-siapa: `<Flex vertical>`, `<Space
 *    direction="vertical">`, `flexDirection: "column"`, sel kisi yang melebar
 *    penuh (`<Col span={24}>` / `<Col xs={24}>`, `gridColumn: "1 / -1"`).
 *    Kaki formulir yang duduk di sel melebar-penuh KARENA ITU bukan pelanggaran
 *    — ia memang punya barisnya sendiri, dan `tests/button-emphasis.test.ts`
 *    yang mengurus penekanannya.
 *  • Baris yang bersarang di dalam baris **tembus pandang**: sebuah `<Flex>`
 *    berisi dua tombol di dalam kolom kisi tetap satu garis dasar dengan isian
 *    di kolom sebelahnya. Yang dilaporkan hanya baris TERLUAR, supaya satu
 *    kesalahan tidak dicetak tiga kali.
 *
 * `style={twoColumnGrid(gap)}` ikut terbaca: penjaga menyelesaikan const gaya
 * tingkat-modul di berkas yang sama. Tanpa itu dua pelanggaran nyata
 * (`invoices/new`, `sales/new`) tidak terlihat — keduanya menulis kisinya lewat
 * pembantu, bukan objek sebaris.
 *
 * ══ ⚠ Yang penjaga ini TIDAK bisa lihat — baca sebelum memercayainya ════════
 *
 * Repo ini punya empat penjaga yang terbaca benar dan tidak menjaga apa pun
 * (§Penjaga di MASTER.md), dan yang membuatnya bertahan adalah orang yang
 * membaca hijau lalu berhenti bertanya. Yang berikut HARUS diperiksa mata:
 *
 *   • **Baris yang dirakit antar-BERKAS.** `<PageHeader actions={…}>`,
 *     `EmptyState`, dan setiap komponen yang menaruh `{children}` di sebelah
 *     tombolnya sendiri menyusun barisnya dari dua berkas. Penjaga membaca satu
 *     berkas pada satu waktu dan tidak melihat pasangan itu.
 *   • **Gaya yang datang dari IMPOR.** Const gaya diselesaikan hanya di dalam
 *     berkasnya; `style={rowStyle}` dari modul lain membuat wadahnya tidak
 *     dikenali sebagai baris — arah kesalahannya diam (lolos), bukan berisik.
 *   • **Ukuran berkondisi.** `size={padat ? "sm" : "md"}` tidak dinilai sama
 *     sekali. Bentuk ini justru yang paling mungkin dipakai orang yang ingin
 *     "mengecilkan satu tombol saja".
 *   • **Kisi AntD tidak disimulasikan.** `<Col xs={24} sm={12}>` yang membungkus
 *     ke baris kedua di lebar tertentu tetap dianggap satu baris. Itu disengaja:
 *     kendali yang bertukar-tukar baris menurut lebar layar justru paling perlu
 *     berukuran sama.
 *   • **Tinggi yang dipaksa lewat `style`.** `style={{ height: 32 }}` pada
 *     sebuah kendali mengalahkan tokennya dan tidak terbaca di sini.
 *
 * ══ Bukti ia bisa merah ════════════════════════════════════════════════════
 *
 * Pada jalannya yang pertama ia merah di LIMA berkas: `/finance` (yang
 * dilaporkan), `/accounts`, `inventory/update/stock-form.tsx`,
 * `invoices/new/invoice-form.tsx`, `sales/new/sales-wizard.tsx`. Kelimanya
 * diperbaiki di PR yang sama dengan menaikkan tombolnya, bukan mengecilkan
 * barisnya. Tes "pendeteksinya benar-benar bisa merah" di bawah mengunci
 * kemampuan itu pada contoh sintetis, supaya ia tidak menguap saat kelima berkas
 * itu berubah.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");

/** Seluruh permukaan UI app — dua akar, bukan daftar subdirektori. */
const AREA = [join("src", "app"), join("src", "components")];

/**
 * Kendali yang ukurannya ditulis lewat prop `size` (peta `SIZES` di
 * `components/ui/button.tsx`).
 */
const KENDALI_SIZE = new Set(["Button", "ButtonLink"]);

/**
 * Kendali yang ukurannya ditulis lewat prop `fieldSize` (`antdSize()` di
 * `components/ui/input.tsx`, dipakai ulang oleh `ui/select.tsx`).
 */
const KENDALI_FIELDSIZE = new Set(["Input", "TextInput", "Select", "SelectField"]);

/**
 * Kendali yang TIDAK menerima ukuran sama sekali — selalu `controlHeight`.
 * Mereka yang membuat aturan ini punya arah: baris yang memuat salah satu dari
 * mereka hanya bisa diseragamkan ke atas.
 */
const KENDALI_TETAP = new Set([
  "MoneyInput",
  "PasswordInput",
  "PasswordField",
  "Textarea",
  "SearchableSelect",
  "ServerSearchableSelect",
]);

/** Properti span `<Col>` AntD. Semuanya 24 = sel itu memakan barisnya sendiri. */
const SPAN_COL = ["span", "xs", "sm", "md", "lg", "xl", "xxl"];

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;
const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const namaTag = (n: Jsx) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText();
const pembuka = (n: Jsx) => (ts.isJsxElement(n) ? n.openingElement : n);

function berkasTsx(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const jalur = join(dir, entri.name);
    if (entri.isDirectory()) berkasTsx(jalur, keluar);
    else if (entri.name.endsWith(".tsx")) keluar.push(jalur);
  }
  return keluar;
}

const relatif = (jalur: string) => jalur.slice(ROOT.length + 1).split("\\").join("/");

function sumber(jalur: string, isi?: string): ts.SourceFile {
  return ts.createSourceFile(
    jalur,
    isi ?? readFileSync(jalur, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
}

type Atribut = { ada: boolean; literal?: string; teks?: string };

/** Nilai sebuah atribut JSX: literalnya bila string, teks mentahnya bila bukan. */
function atribut(node: Jsx, nama: string): Atribut {
  for (const a of pembuka(node).attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== nama) continue;
    const nilai = a.initializer;
    if (!nilai) return { ada: true }; // `<Flex vertical>` — atribut tanpa nilai
    if (ts.isStringLiteral(nilai)) return { ada: true, literal: nilai.text, teks: nilai.text };
    if (ts.isJsxExpression(nilai) && nilai.expression && ts.isStringLiteral(nilai.expression)) {
      return { ada: true, literal: nilai.expression.text, teks: nilai.expression.text };
    }
    return { ada: true, teks: nilai.getText() };
  }
  return { ada: false };
}

/**
 * Ukuran efektif sebuah kendali — `undefined` bila bukan kendali ATAU bila
 * ukurannya dinamis. Keduanya dibedakan oleh pemanggil: yang dinamis memang
 * sengaja tidak dinilai (lihat "Yang penjaga ini TIDAK bisa lihat").
 */
function ukuran(node: Jsx): string | undefined {
  const tag = namaTag(node);
  if (KENDALI_SIZE.has(tag)) {
    const s = atribut(node, "size");
    if (!s.ada) return "md";
    /*
     * `icon` adalah BENTUK, bukan ukuran: `shape="circle"` di atas
     * `size="middle"`, yaitu kotak sisi `controlHeight`. Ia sebaris dengan
     * kendali bawaan, jadi dihitung `md` — kalau tidak, setiap baris aksi ikon
     * di samping isian akan merah tanpa satu piksel pun yang salah.
     */
    if (s.literal === "icon" || s.literal === "md") return "md";
    if (s.literal === "sm" || s.literal === "lg") return s.literal;
    return undefined;
  }
  if (KENDALI_FIELDSIZE.has(tag)) {
    const s = atribut(node, "fieldSize");
    if (!s.ada) return "md";
    if (s.literal === "sm" || s.literal === "md") return s.literal;
    return undefined;
  }
  if (KENDALI_TETAP.has(tag)) return "md";
  return undefined;
}

/**
 * Const gaya tingkat-modul → teks nilainya, supaya `style={twoColumnGrid(gap)}`
 * dan `style={ROW}` terbaca. Tanpa ini dua pelanggaran nyata tidak terlihat.
 */
function petaGaya(src: ts.SourceFile): Map<string, string> {
  const peta = new Map<string, string>();
  const kunjungi = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      peta.set(n.name.text, n.initializer.getText());
    }
    ts.forEachChild(n, kunjungi);
  };
  kunjungi(src);
  return peta;
}

/** Teks gaya sebuah elemen, ditambah isi setiap const yang disebut di dalamnya. */
function gaya(node: Jsx, peta: Map<string, string>): string {
  const st = atribut(node, "style");
  if (!st.ada || !st.teks) return "";
  let teks = st.teks;
  for (const m of teks.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const isi = peta.get(m[1]);
    if (isi) teks += " " + isi;
  }
  return teks;
}

/** Sel kisi yang memakan lebar penuh — anaknya punya barisnya sendiri. */
function selPenuh(node: Jsx, peta: Map<string, string>): boolean {
  if (namaTag(node) === "Col") {
    const ditulis = SPAN_COL.filter((p) => atribut(node, p).ada);
    if (ditulis.length === 0) return false;
    return ditulis.every((p) => /\b24\b/.test(atribut(node, p).teks ?? ""));
  }
  return /gridColumn:\s*"1 \/ -1"/.test(gaya(node, peta));
}

/** Wadah yang menata anaknya BERDAMPINGAN. */
function mendatar(node: Jsx, peta: Map<string, string>): boolean {
  const tag = namaTag(node);
  if (tag === "Flex") return !atribut(node, "vertical").ada;
  if (tag === "Space") return atribut(node, "direction").literal !== "vertical";
  if (tag === "Row") return true;
  const st = gaya(node, peta);
  if (/display:\s*"(inline-)?flex"/.test(st)) return !/flexDirection:\s*"column/.test(st);
  return /display:\s*"(inline-)?grid"/.test(st);
}

/** Wadah yang MENUMPUK anaknya — memutus keanggotaan baris. */
function menumpuk(node: Jsx, peta: Map<string, string>): boolean {
  const tag = namaTag(node);
  if (tag === "Flex" && atribut(node, "vertical").ada) return true;
  if (tag === "Space" && atribut(node, "direction").literal === "vertical") return true;
  if (selPenuh(node, peta)) return true;
  return /flexDirection:\s*"column/.test(gaya(node, peta));
}

type Kendali = { ukuran: string; baris: number; tag: string };

/** Kendali yang berbagi satu garis dasar dengan wadah ini. */
function anggotaBaris(
  node: ts.Node,
  src: ts.SourceFile,
  peta: Map<string, string>,
  keluar: Kendali[] = []
): Kendali[] {
  ts.forEachChild(node, (anak) => {
    if (isJsx(anak)) {
      const u = ukuran(anak);
      if (u) {
        keluar.push({
          ukuran: u,
          baris: src.getLineAndCharacterOfPosition(anak.getStart()).line + 1,
          tag: namaTag(anak),
        });
        return; // kendali tidak memuat kendali
      }
      if (menumpuk(anak, peta)) return;
    }
    anggotaBaris(anak, src, peta, keluar);
  });
  return keluar;
}

type Pelanggaran = { baris: number; wadah: string; isi: Kendali[] };

/** Baris TERLUAR yang memuat lebih dari satu ukuran kendali. */
function barisCampur(jalur: string, isi?: string): Pelanggaran[] {
  const src = sumber(jalur, isi);
  const peta = petaGaya(src);
  const hasil: Pelanggaran[] = [];

  const kunjungi = (n: ts.Node, dalamBaris: boolean) => {
    let baris = dalamBaris;
    if (isJsx(n)) {
      if (menumpuk(n, peta)) baris = false;
      else if (mendatar(n, peta)) {
        if (!dalamBaris) {
          const anggota = anggotaBaris(n, src, peta);
          if (new Set(anggota.map((a) => a.ukuran)).size >= 2) {
            hasil.push({
              baris: src.getLineAndCharacterOfPosition(n.getStart()).line + 1,
              wadah: namaTag(n),
              isi: anggota,
            });
          }
        }
        baris = true;
      }
    }
    ts.forEachChild(n, (anak) => kunjungi(anak, baris));
  };
  kunjungi(src, false);
  return hasil;
}

function berkasDijaga(): string[] {
  const keluar = new Set<string>();
  for (const area of AREA) for (const j of berkasTsx(join(ROOT, area))) keluar.add(j);
  return [...keluar];
}

describe("satu baris kendali = satu ukuran", () => {
  it("tidak ada baris yang mencampur ukuran kendali di src/app + src/components", () => {
    const pelanggar: string[] = [];
    for (const jalur of berkasDijaga()) {
      for (const p of barisCampur(jalur)) {
        pelanggar.push(
          `${relatif(jalur)}:${p.baris} <${p.wadah}> — ` +
            p.isi.map((k) => `${k.tag}@${k.baris}=${k.ukuran}`).join(", ")
        );
      }
    }
    expect(pelanggar.sort()).toEqual([]);
  });

  it("penjaganya menyentuh SETIAP berkas .tsx di kedua akar", () => {
    /*
     * Tes di atas hanya sekuat lingkupnya, dan lingkup itu sebuah konstanta yang
     * bisa dipersempit dalam satu baris. Pola yang sama dipakai
     * `tests/button-emphasis.test.ts`, dan alasannya sama: penyempitan diam-diam
     * adalah cara termurah membuat penjaga berhenti menjaga tanpa satu pun tes
     * berubah warna.
     */
    const semua = new Set<string>();
    for (const akar of ["src/app", "src/components"]) {
      for (const j of berkasTsx(join(ROOT, akar))) semua.add(relatif(j));
    }
    const dijaga = new Set(berkasDijaga().map(relatif));
    expect([...semua].filter((r) => !dijaga.has(r)).sort()).toEqual([]);
    expect(dijaga.size).toBeGreaterThan(100);
  });

  it("pendeteksinya benar-benar bisa merah — dibuktikan di sini, bukan diandaikan", () => {
    const uji = (kode: string) => barisCampur("uji.tsx", kode).length;

    // Bentuk yang dilaporkan pemilik: baris saringan, Select bawaan + tombol sm.
    expect(
      uji('<div style={{ display: "flex" }}><SelectField /><Button size="sm">Filter</Button></div>')
    ).toBe(1);
    // `Flex` AntD mendatar tanpa perlu gaya sebaris.
    expect(uji('<Flex><TextInput /><Button size="sm">Cari</Button></Flex>')).toBe(1);
    // Kendali yang TIDAK menerima ukuran tetap dihitung 40px.
    expect(uji('<Flex><MoneyInput /><Button size="sm">Simpan</Button></Flex>')).toBe(1);
    // Baris bersarang tembus pandang: tombolnya tetap tetangga isian di kolom lain.
    expect(
      uji(
        '<div style={{ display: "grid" }}><ServerSearchableSelect />' +
          '<Flex align="flex-end"><Button size="sm">Tarik</Button></Flex></div>'
      )
    ).toBe(1);
    // Const gaya tingkat-modul diselesaikan (bentuk `twoColumnGrid`).
    expect(
      uji(
        'const kisi = () => ({ display: "grid" });\n' +
          'const A = () => (<div style={kisi()}><SelectField /><Button size="sm">X</Button></div>);'
      )
    ).toBe(1);
    // `lg` juga sebuah ukuran: dua tinggi tetap dua tinggi.
    expect(uji('<Flex><Button size="lg">A</Button><Button size="sm">B</Button></Flex>')).toBe(1);

    // …dan HIJAU pada yang memang benar:
    // Satu ukuran untuk seluruh baris.
    expect(uji('<Flex><SelectField /><Button variant="outline">Filter</Button></Flex>')).toBe(0);
    // Grup chip yang seluruhnya `sm` di barisnya sendiri.
    expect(
      uji('<Flex><Button size="sm">Bulan</Button><Button size="sm">Tahun</Button></Flex>')
    ).toBe(0);
    // Tumpukan: tombol kirim di bawah isian tidak berbagi garis dasar.
    expect(uji('<Flex vertical><Input /><Button size="lg">Masuk</Button></Flex>')).toBe(0);
    // Sel kisi melebar penuh = barisnya sendiri (kaki formulir `<Row>`/`<Col>`).
    expect(
      uji(
        '<Row><Col sm={12}><Input /></Col>' +
          '<Col span={24}><Button size="sm">Simpan</Button></Col></Row>'
      )
    ).toBe(0);
    expect(
      uji(
        '<div style={{ display: "grid" }}><Input />' +
          '<div style={{ gridColumn: "1 / -1" }}><Button size="sm">Simpan</Button></div></div>'
      )
    ).toBe(0);
    // `size="icon"` adalah BENTUK setinggi `controlHeight`, bukan ukuran ketiga.
    expect(uji('<Flex><TextInput /><Button size="icon" variant="ghost">x</Button></Flex>')).toBe(0);
    // Ukuran dinamis sengaja tidak dinilai — dan itu tertulis sebagai batas, bukan lolos diam.
    expect(uji('<Flex><Input /><Button size={padat ? "sm" : "md"}>A</Button></Flex>')).toBe(0);
  });

  it("modelnya tidak menyimpang dari primitif yang dijaganya", () => {
    /*
     * Penjaga ini memodelkan dua primitif: peta `SIZES` di `ui/button.tsx` dan
     * `antdSize()` di `ui/input.tsx`. Kalau salah satunya digeser — `sm` berhenti
     * berarti `small`, atau `md` berhenti berarti "biarkan token provider" — maka
     * yang ditegakkan di atas adalah aturan tentang app yang sudah tidak ada.
     * Itu persis kelas penjaga yang §Penjaga di MASTER.md daftar sebagai "terbaca
     * benar, tidak menjaga apa pun", jadi yang merah harus tes ini, bukan sebuah
     * layar.
     */
    const button = readFileSync(join(ROOT, "src", "components", "ui", "button.tsx"), "utf8");
    expect(button).toMatch(/sm:\s*\{\s*size:\s*"small"\s*\}/);
    expect(button).toMatch(/md:\s*\{\s*size:\s*"middle"\s*\}/);
    expect(button).toMatch(/lg:\s*\{\s*size:\s*"large"\s*\}/);
    // `icon` = bentuk lingkaran setinggi `controlHeight`, bukan ukuran ketiga.
    expect(button).toMatch(/icon:\s*\{\s*size:\s*"middle",\s*shape:\s*"circle"\s*\}/);

    const input = readFileSync(join(ROOT, "src", "components", "ui", "input.tsx"), "utf8");
    expect(input).toMatch(/fieldSize === "sm" \? \("small" as const\) : undefined/);

    /*
     * Dan `KENDALI_TETAP` benar-benar tetap: kalau salah satunya kelak menerima
     * ukuran, ia harus pindah ke daftar yang dibaca propnya — bukan diam-diam
     * dihitung 40px oleh penjaga yang tidak tahu.
     */
    for (const berkas of [
      "money-input.tsx",
      "password-input.tsx",
      "textarea.tsx",
      "searchable-select.tsx",
      "server-searchable-select.tsx",
    ]) {
      const isi = readFileSync(join(ROOT, "src", "components", "ui", berkas), "utf8");
      expect(isi, `${berkas} kini menerima ukuran — perbarui KENDALI_TETAP`).not.toMatch(
        /\bfieldSize\b/
      );
    }
  });
});
