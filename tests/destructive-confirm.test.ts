/**
 * Tombol destruktif WAJIB berpasangan dengan `ConfirmDialog` (issue #308).
 *
 * ══ Aturan yang dijaga, dan kenapa ia bukan soal gaya ══════════════════════
 *
 * MASTER.md §Pola Komponen menulis **"destruktif = merah + konfirmasi"**, dan
 * §Aksi destruktif (#219) BERSANDAR pada kalimat itu: isian tombol destruktif
 * di tema gelap sengaja dibiarkan gagal ambang 3:1 (2,69:1) **karena** risiko
 * "tidak melihat ada tombol destruktif di sana" dianggap sudah ditutup
 * dialognya. Sebuah tombol merah tanpa dialog karena itu menanggung dua
 * kelemahan sekaligus — dan ia membatalkan alasan sebuah keputusan warna yang
 * ditulis di dokumen lain.
 *
 * Saat #308 dibuka, kalimat itu **tidak benar untuk satu tombol**: pelepasan
 * aset tetap (`fixed-assets/[id]/asset-actions.tsx`) memposting jurnal dan
 * menyetel `status: "disposed"` yang tidak punya endpoint pembatalan — dalam
 * satu klik. Penjaga ini ada supaya kalimat di MASTER.md berhenti menjadi
 * kebiasaan dan mulai menjadi aturan.
 *
 * ══ Kenapa ELEMEN, bukan string ════════════════════════════════════════════
 *
 * Penjaga yang mencari teks `variant="danger"` akan **palsu**, dan bukan secara
 * teoretis — ketiga bentuk di bawah ini semuanya ada di repo ini hari ini:
 *
 *   • **`Badge variant="danger"` itu SAH dan banyak.** Terukur dengan parser:
 *     **14 `<Badge>`** bisa bernilai `danger` (mis. "Tidak seimbang" di neraca,
 *     status "Dibatalkan" di surat jalan, hasil uji SMTP yang gagal). Tak satu
 *     pun tombol; tak satu pun pantas dituduh.
 *   • **Prosa yang menyebut namanya.** `contracts/new/contract-form.tsx`
 *     menulis `variant="danger"` di dalam KOMENTAR yang justru menjelaskan
 *     kenapa ia TIDAK dipakai di sana. Komentar bukan simpul AST, jadi penjaga
 *     ini buta terhadapnya — dan itu memang yang benar.
 *   • **Varian berkondisi.** `variant={mode === "suspend" ? "danger" : "secondary"}`
 *     adalah tombol destruktif pada separuh keadaannya. Penjaga yang hanya
 *     mengenal literal akan hijau pada bentuk yang justru paling sering dipakai
 *     untuk MENYALAKAN bahaya.
 *
 * Angka yang beredar di badan issue #308 — "16 berkas, 6 di antaranya `Badge`"
 * — adalah sapuan `grep` atas literal saja. Hitungan dengan parser: **21 berkas**
 * menyebut `danger`/`destructive` sebagai nilai `variant`, di antaranya **14
 * `<Badge>`** dan **12 `<Button>`**. Jangan menghitung ulang dengan `grep`; di
 * #267 dan #289 empat angka berturut-turut salah persis karena itu.
 *
 * ══ Apa artinya "berpasangan dengan dialog" — DUA bentuk, keduanya sah ══════
 *
 * `ConfirmDialog` punya dua cara pakai (lihat kepala `ui/confirm-dialog.tsx`),
 * dan penjaga yang hanya mengenal satu akan menuduh separuh repo:
 *
 *   1. **Pemicu** — tombolnya DI DALAM `<ConfirmDialog trigger={…}>`. Terukur:
 *      5 dari 12.
 *   2. **Terkendali** — `<ConfirmDialog open={…} onOpenChange={…}>` hidup di
 *      tempat lain di berkas yang sama, dan tombolnya membukanya lewat
 *      `onClick`. Terukur: 5 dari 12. Bentuk ini WAJIB ada di sini, bukan
 *      kelonggaran: tombol `type="submit"` tidak bisa menjadi pemicu (satu klik
 *      akan mengirim formulirnya SEKALIGUS membuka dialognya), dan tombol di
 *      dalam kolom tabel `.map()` tidak boleh melahirkan satu dialog per baris.
 *
 * ══ Satu pengecualian, dan ia berbentuk ATRIBUT — bukan nama berkas ════════
 *
 * `<Button aria-pressed>` adalah **tombol saklar**, dan saklar tidak punya apa
 * pun untuk dikonfirmasi: menekannya lagi mengembalikan keadaannya. Merahnya di
 * sana bukan "aksi ini menghancurkan sesuatu" melainkan "saklar ini sedang
 * menyala, dan yang akan terjadi saat Anda menyimpan berbahaya". Satu-satunya
 * pemakainya hari ini adalah tombol "Hapus kata sandi tersimpan" di
 * `operator/mail-settings-form.tsx` — yang penghapusannya baru terjadi saat
 * formulirnya disimpan, bukan saat saklarnya ditekan.
 *
 * **Kenapa atribut dan bukan daftar nama berkas.** Daftar nama berkas membusuk
 * dalam dua arah sekaligus: berkas yang sudah terdaftar boleh menambah tombol
 * telanjang sebanyak-banyaknya tanpa membuatnya merah, dan satu `git mv`
 * mengubah pengecualian menjadi baris mati yang tetap lulus (pelajaran #289 dan
 * #267 potongan 3–4). Pengecualian berbentuk atribut tidak punya kedua cacat
 * itu: ia menempel pada elemen yang dikecualikan, ikut pindah bersamanya, dan
 * berlaku untuk saklar berikutnya tanpa seorang pun perlu ingat mendaftarkannya.
 * Karena itu berkas ini **tidak punya satu pun daftar pengecualian** — daftar
 * pengecualian yang panjang adalah tanda penjaganya salah bentuk.
 *
 * ⚠ Konsekuensinya, dan ia harus disebut: `aria-pressed` BISA dipakai untuk
 * kabur. Menempelkannya pada tombol "Hapus" yang sungguhan akan menghijaukan
 * penjaga ini — tetapi ia juga berbohong kepada pembaca layar, yang akan
 * mengumumkan tombol itu sebagai saklar "tidak ditekan". Itu bug tersendiri,
 * terlihat di diff, dan bukan sesuatu yang bisa ditulis tanpa sadar.
 *
 * ══ ⚠ Yang penjaga ini TIDAK bisa lihat ════════════════════════════════════
 *
 * Ditulis karena di repo ini lima penjaga sudah ketahuan palsu, tumpul, atau
 * usang modelnya, dan yang membuat mereka bertahan adalah orang yang membaca
 * hijau lalu berhenti bertanya.
 *
 *   • **Dialog mana untuk tombol mana.** Bentuk terkendali diperiksa pada
 *     tingkat BERKAS: satu `<ConfirmDialog open>` melindungi setiap tombol
 *     merah di berkas itu. `operator/tenant-actions.tsx` punya 4 dialog dan 3
 *     tombol merah; penjaga ini tidak tahu — dan tidak bisa tahu tanpa
 *     menelusuri `useState` — apakah pasangannya benar. Yang menemukannya
 *     adalah membuka halamannya dan mengkliknya.
 *   • **Apakah dialognya menyebut AKIBATNYA.** "Anda yakin?" lulus di sini
 *     persis seperti kalimat yang menyebut jurnal apa yang akan lahir.
 *     Kriteria #308 menuntut yang kedua; yang bisa menilainya hanya pembaca.
 *   • **Tombol destruktif yang TIDAK merah.** Sebuah "Hapus" bergaya `outline`
 *     tak terlihat penjaga ini sama sekali. Ia menjaga separuh kalimat "merah +
 *     konfirmasi": bahwa yang merah punya konfirmasi. Bahwa yang menghancurkan
 *     berwarna merah adalah keputusan penulisnya, dan tidak ada penjaga untuk
 *     niat.
 *   • **Perakitan antar-berkas.** Sebuah komponen bersama yang merender
 *     `<Button variant="danger">` dan menyerahkan `onClick` kepada pemanggilnya
 *     dinilai di berkas komponennya, bukan di tempat ia benar-benar dipakai.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

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

function atribut(n: Jsx, nama: string): ts.JsxAttribute | undefined {
  const daftar = (ts.isJsxElement(n) ? n.openingElement : n).attributes;
  for (const p of daftar.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText() === nama) return p;
  }
  return undefined;
}

/**
 * `danger` dan `destructive` adalah OBJEK YANG SAMA di `ui/button.tsx`
 * (`const DANGER`), jadi keduanya dihitung — `destructive` adalah alias shadcn
 * yang masih dipakai satu berkas (`platform/privacy-section.tsx`), dan penjaga
 * yang hanya mengenal satu namanya akan buta terhadap berkas itu.
 */
const NILAI_DESTRUKTIF = /["'](?:danger|destructive)["']/;

/**
 * Apakah `variant` elemen ini BISA bernilai destruktif — literal maupun salah
 * satu cabang sebuah ekspresi. "Bisa", bukan "pasti": `mode === "suspend" ?
 * "danger" : "secondary"` adalah tombol destruktif pada separuh keadaannya, dan
 * separuh itu yang perlu dialognya.
 */
function bisaDestruktif(n: Jsx): boolean {
  const a = atribut(n, "variant");
  if (!a?.initializer) return false;
  if (ts.isStringLiteral(a.initializer)) return NILAI_DESTRUKTIF.test(`"${a.initializer.text}"`);
  return NILAI_DESTRUKTIF.test(a.initializer.getText());
}

interface Temuan {
  rel: string;
  baris: number;
  /** Di dalam `<ConfirmDialog>` — bentuk pemicu. */
  pemicu: boolean;
  /** Saklar (`aria-pressed`) — tidak ada yang perlu dikonfirmasi. */
  saklar: boolean;
}

/** Setiap `<Button>` yang bisa merah di sebuah berkas, + apakah berkas itu punya dialog terkendali. */
function periksa(rel: string, kode: string): { tombol: Temuan[]; dialogTerkendali: number } {
  const src = sumber(rel, kode);
  const tombol: Temuan[] = [];
  let dialogTerkendali = 0;

  const kunjungi = (node: ts.Node, didalamDialog: boolean) => {
    let dialog = didalamDialog;
    if (isJsx(node) && namaTag(node) === "ConfirmDialog") {
      dialog = true;
      if (atribut(node, "open")) dialogTerkendali += 1;
    }
    if (isJsx(node) && namaTag(node) === "Button" && bisaDestruktif(node)) {
      tombol.push({
        rel,
        baris: src.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        pemicu: dialog,
        saklar: atribut(node, "aria-pressed") !== undefined,
      });
    }
    ts.forEachChild(node, (anak) => kunjungi(anak, dialog));
  };
  kunjungi(src, false);
  return { tombol, dialogTerkendali };
}

const BERKAS = berkasTsx(SRC).map((jalur) => ({
  rel: relatif(jalur),
  isi: readFileSync(jalur, "utf8"),
}));

/** Setiap tombol merah di `src/`, dengan status perlindungannya. */
function tombolMerah(): (Temuan & { terlindungi: boolean })[] {
  const keluar: (Temuan & { terlindungi: boolean })[] = [];
  for (const { rel, isi } of BERKAS) {
    const { tombol, dialogTerkendali } = periksa(rel, isi);
    for (const t of tombol) {
      keluar.push({ ...t, terlindungi: t.pemicu || t.saklar || dialogTerkendali > 0 });
    }
  }
  return keluar.sort((a, b) => `${a.rel}:${a.baris}`.localeCompare(`${b.rel}:${b.baris}`));
}

/** Jumlah elemen JSX bernama `tag` yang `variant`-nya bisa destruktif. */
function hitungDestruktif(tag: string): number {
  let n = 0;
  for (const { rel, isi } of BERKAS) {
    const src = sumber(rel, isi);
    const kunjungi = (node: ts.Node) => {
      if (isJsx(node) && namaTag(node) === tag && bisaDestruktif(node)) n += 1;
      ts.forEachChild(node, kunjungi);
    };
    kunjungi(src);
  }
  return n;
}

describe("tombol destruktif berpasangan dengan ConfirmDialog (#308)", () => {
  it("memindai pohon sumber yang benar", () => {
    /*
     * Kalau pemindainya rusak (jalur salah, saringan kelewat rakus), daftar di
     * bawah menjadi kosong dan SETIAP tes lain di berkas ini berubah arti tanpa
     * satu pun gagal. Ini yang menahan kegagalan diam itu.
     */
    expect(BERKAS.length).toBeGreaterThan(200);
    expect(BERKAS.some(({ rel }) => rel === "components/ui/confirm-dialog.tsx")).toBe(true);
  });

  it("tidak ada satu pun <Button> merah tanpa ConfirmDialog di seluruh src/", () => {
    const telanjang = tombolMerah()
      .filter((t) => !t.terlindungi)
      .map((t) => `${t.rel}:${t.baris}`);
    expect(
      telanjang,
      "Tombol destruktif tanpa konfirmasi. MASTER.md §Pola Komponen: " +
        "destruktif = merah + KONFIRMASI, dan keputusan warna #219 bersandar " +
        "pada dialog itu.\n" +
        "Pasang `ConfirmDialog` — `trigger={<Button variant=\"danger\">…}` untuk " +
        "tombol biasa, atau bentuk terkendali (`open` + `onOpenChange`) bila " +
        "tombolnya `type=\"submit\"` atau hidup di dalam `.map()`.\n" +
        "Pesannya menyebut AKIBATNYA (apa yang dihapus, jurnal apa yang lahir, " +
        "apa yang tak bisa dibalik) — bukan \"Anda yakin?\"."
    ).toEqual([]);
  });

  it("penjaganya benar-benar melihat sesuatu — bukan himpunan kosong yang lulus", () => {
    /*
     * Tes di atas hijau juga seandainya `bisaDestruktif()` tidak pernah cocok
     * pada apa pun — bentuk kegagalan yang persis dialami penjaga `Alert` di
     * #206 (hijau pada pelanggaran yang sengaja disuntikkan). Angka-angka di
     * sini yang menahannya: kalau salah satunya jatuh ke nol, pendeteksinya
     * yang rusak, bukan repo-nya yang bersih.
     *
     * Terukur saat #308 ditutup: 12 tombol — 5 pemicu, 6 terkendali (asset
     * disposal yang keenam), 1 saklar. Angka pastinya sengaja TIDAK dikunci
     * (`toEqual(12)`): tombol destruktif baru yang benar akan menaikkannya, dan
     * penjaga yang merah pada penambahan yang sah akan dilonggarkan orang
     * berikutnya sampai tidak menjaga apa pun.
     */
    const semua = tombolMerah();
    expect(semua.length).toBeGreaterThanOrEqual(12);
    expect(semua.filter((t) => t.pemicu).length).toBeGreaterThanOrEqual(5);
    expect(semua.filter((t) => !t.pemicu && !t.saklar && t.terlindungi).length).toBeGreaterThanOrEqual(6);
  });

  it("pelepasan aset tetap punya dialognya — premis #219 yang dipulihkan #308", () => {
    /*
     * Tombol yang membuka issue ini, disebut namanya. Tes di atas sudah
     * menjaganya secara umum, tetapi berkas INI yang membuat kalimat "aksi
     * destruktif WAJIB lewat ConfirmDialog" di MASTER.md §Aksi destruktif
     * benar — dan seluruh keputusan kontras tema gelap #219 bersandar padanya.
     * Kalau ia dicabut, yang harus merah adalah sesuatu yang menyebut #219.
     */
    const rel =
      "app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/[id]/asset-actions.tsx";
    const berkas = BERKAS.find((b) => b.rel === rel);
    expect(berkas, `${rel} tidak ditemukan — penjaga ini menunjuk berkas yang salah`).toBeDefined();

    const { tombol, dialogTerkendali } = periksa(rel, berkas!.isi);
    expect(tombol).toHaveLength(1);
    expect(dialogTerkendali).toBe(1);
    // Dan dialognya benar-benar merah, bukan `primary` yang lolos diam-diam.
    expect(berkas!.isi).toMatch(/confirmVariant="danger"/);
  });

  it("pendeteksinya benar-benar bisa merah — dibuktikan di sini, bukan diandaikan", () => {
    const telanjang = (kode: string) => {
      const { tombol, dialogTerkendali } = periksa("uji.tsx", kode);
      return tombol.filter((t) => !(t.pemicu || t.saklar || dialogTerkendali > 0)).length;
    };

    // ── Bentuk yang dijaga ────────────────────────────────────────────────
    expect(telanjang('<Button variant="danger">Hapus</Button>')).toBe(1);
    expect(telanjang('<Button variant="destructive">Hapus</Button>')).toBe(1);
    // Varian berkondisi: merah pada separuh keadaannya tetap merah.
    expect(telanjang('<Button variant={x ? "danger" : "secondary"}>Hapus</Button>')).toBe(1);
    // Dialog di berkas yang sama TIDAK menyelamatkan tombol lain kalau dialog
    // itu bentuk pemicu — pemicunya sudah punya tombolnya sendiri.
    expect(
      telanjang(
        '<div><ConfirmDialog trigger={<Button variant="danger">A</Button>} />' +
          '<Button variant="danger">B</Button></div>'
      )
    ).toBe(1);

    // ── …dan hijau pada bentuk-bentuk yang justru BENAR ───────────────────
    // 1. Pemicu.
    expect(telanjang('<ConfirmDialog trigger={<Button variant="danger">Hapus</Button>} />')).toBe(0);
    // Pembungkus di tengah tidak mengubah apa pun.
    expect(
      telanjang('<ConfirmDialog trigger={<span><Button variant="danger">Hapus</Button></span>} />')
    ).toBe(0);
    // 2. Terkendali — tombolnya di tempat lain, dialognya `open`.
    expect(
      telanjang(
        '<div><Button variant="danger" onClick={() => setOpen(true)}>Hapus</Button>' +
          "<ConfirmDialog open={open} onOpenChange={setOpen} /></div>"
      )
    ).toBe(0);
    // 3. Saklar.
    expect(telanjang('<Button variant="danger" aria-pressed={on}>Bersihkan</Button>')).toBe(0);
    // Tombol yang tidak merah bukan urusan penjaga ini.
    expect(telanjang('<Button variant="outline">Hapus</Button>')).toBe(0);
    expect(telanjang("<Button>Hapus</Button>")).toBe(0);
  });

  it("⚠ `Badge variant=\"danger\"` TIDAK pernah dituduh — 14 di antaranya sah hari ini", () => {
    /*
     * Kegagalan yang paling mungkin dari penjaga ini, dan alasan ia memakai
     * parser: `variant="danger"` di app ini jauh lebih sering berarti LENCANA
     * status daripada tombol. Sebuah penjaga berbasis teks akan menuduh neraca
     * yang tidak seimbang, surat jalan yang dibatalkan, dan uji SMTP yang
     * gagal — lalu ditutup dengan daftar pengecualian yang panjangnya sendiri
     * adalah bukti bentuknya salah.
     */
    const uji = (kode: string) => periksa("uji.tsx", kode).tombol.length;
    expect(uji('<Badge variant="danger">Tidak seimbang</Badge>')).toBe(0);
    expect(uji('<Badge variant={ok ? "success" : "danger"}>{label}</Badge>')).toBe(0);
    // Lencana dan tombol berdampingan: hanya tombolnya yang dihitung.
    expect(uji('<div><Badge variant="danger">Batal</Badge><Button variant="danger">Hapus</Button></div>')).toBe(1);

    // Dan di repo sungguhan lencana merah memang banyak — kalau angka ini
    // jatuh ke nol, `bisaDestruktif()` berhenti mengenali sesuatu.
    expect(hitungDestruktif("Badge")).toBeGreaterThanOrEqual(14);
    expect(hitungDestruktif("Button")).toBeGreaterThanOrEqual(12);
  });

  it("⚠ prosa yang menyebut `variant=\"danger\"` bukan pelanggaran", () => {
    /*
     * `contracts/new/contract-form.tsx` menulis `variant="danger"` di dalam
     * komentar yang menjelaskan kenapa ia TIDAK dipakai di sana. Penjaga yang
     * merah pada penjelasannya sendiri adalah penjaga yang salah — dan
     * penjaga yang dilonggarkan orang berikutnya sampai tidak menjaga apa pun.
     */
    expect(periksa("uji.tsx", '/* `variant="danger"` akan menggambar isian merah */').tombol).toEqual(
      []
    );
    expect(periksa("uji.tsx", 'const s = \'<Button variant="danger">\';').tombol).toEqual([]);

    // Berkas sungguhannya, supaya contoh di atas tidak jadi teori.
    const kontrak = BERKAS.find(({ rel }) =>
      rel.endsWith("contracts/new/contract-form.tsx")
    );
    expect(kontrak, "contract-form.tsx tidak ditemukan — contoh prosanya pindah?").toBeDefined();
    expect(kontrak!.isi).toContain('variant="danger"');
    expect(periksa(kontrak!.rel, kontrak!.isi).tombol).toEqual([]);
  });
});
