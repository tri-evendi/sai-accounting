/**
 * Penekanan tombol: satu aksi utama per layar (issue #267).
 *
 * Aturannya sendiri ada di `design-system/sai-accounting/MASTER.md` §Aksi utama
 * per layar. Berkas ini menjaga BAGIAN YANG BISA DIJAGA — dan sama pentingnya,
 * menyebut bagian yang tidak bisa, supaya tidak ada yang membaca hijau di sini
 * lalu menyimpulkan aturannya sudah ditegakkan.
 *
 * ══ Kenapa dua penjaga, bukan satu ═════════════════════════════════════════
 *
 * `variant` pada primitif `Button` bawaannya masih `"primary"`. Artinya
 * `<Button>` tanpa atribut adalah tombol BERISI PENUH — dan itulah bagaimana
 * 197 dari 310 tombol jadi primer tanpa seorang pun memutuskannya. Bawaan itu
 * memang akan dibalik ke `secondary` kelak, tetapi membaliknya SEKARANG
 * menurunkan 197 tombol sekaligus dan membuat setiap layar kehilangan aksi
 * utamanya. Urutannya karena itu dibalik: audit dulu (tandai varian eksplisit),
 * baru bawaannya. Pada saat itu pembalikannya tidak mengubah satu piksel pun.
 *
 *   1. **Penjaga KEEKSPLISITAN** menjaga urutan itu: di area yang sudah
 *      diaudit, setiap `<Button>` menyebut `variant`-nya. Tombol implisit yang
 *      baru di sana berarti area itu diam-diam keluar lagi dari hasil audit,
 *      dan pembalikan bawaan nanti akan menurunkannya tanpa ada yang tahu.
 *
 *   2. **Penjaga SATU PRIMER PER WADAH** menjaga aturannya sendiri, sejauh
 *      bentuknya memungkinkan: dua tombol primer yang bisa TERENDER BERSAMAAN
 *      di dalam satu elemen JSX.
 *
 * ══ ⚠ Yang penjaga ini TIDAK bisa lihat — baca sebelum memercayainya ════════
 *
 * Ini bukan kerendahhatian basa-basi. Repo ini sudah punya empat penjaga yang
 * terbaca benar dan tidak menjaga apa pun (lihat §Penjaga di MASTER.md), dan
 * yang membuatnya bertahan adalah orang yang membaca hijau lalu berhenti
 * bertanya. Tiga hal berikut HARUS diperiksa mata:
 *
 *   • **Pengulangan lewat `.map()`.** Satu `<Button variant="primary">` di
 *     dalam `.map()` adalah SATU simpul di sumber dan sepuluh blok biru di
 *     layar. Penjaga menghitung sumber, jadi ia menghitungnya satu. Pengecualian
 *     "pilihan setara" di MASTER.md karena itu dijaga komentar di tempatnya
 *     (`select-company/company-choices.tsx`), bukan oleh berkas ini.
 *   • **Primer yang tersebar antar KOMPONEN.** `/platform/billing` memikul tiga
 *     tautan "Lihat paket" dari tiga berkas berbeda; tidak satu pun wadah JSX
 *     memuat lebih dari satu, jadi penjaga ini diam. Yang menemukannya adalah
 *     membuka halamannya.
 *   • **Primer berkondisi.** `variant={urgent ? "primary" : "outline"}` dibaca
 *     sebagai "mungkin primer" (lihat `varianDari`), tapi apakah keadaannya
 *     bisa bertemu dengan primer lain adalah pertanyaan runtime.
 *
 * ══ Bukti bahwa penjaga #2 bukan hiasan ════════════════════════════════════
 *
 * Pada jalannya yang pertama ia MERAH di 13 berkas — seluruhnya di
 * `src/app/(dashboard)` dan `src/components`, yaitu potongan audit berikutnya.
 * Ketiga belasnya didaftar di `SISA_AUDIT` di bawah, dan daftar itu hanya boleh
 * MENGECIL. Tes ketiga menolak entri basi, supaya daftar ini tidak berubah
 * menjadi hiasan yang setiap barisnya sudah lama tidak berarti apa-apa.
 * Potongan kedua (`src/components`) mencabut satu barisnya:
 * `shared/stock-period-filter.tsx`.
 *
 * ══ Penjaga #3: batas pengecualian halaman pendaratan (potongan 2) ═════════
 *
 * `/` merender EMPAT tombol berisi penuh sekaligus, dari empat komponen
 * berbeda. Penjaga #2 tidak melihatnya (tak satu wadah JSX pun memuat dua) dan
 * seandainya ia melihat, ia akan salah: pengulangan ajakan adalah cara halaman
 * pendaratan bekerja, dan MASTER.md §Pemasaran vs App sudah menyebutnya
 * sebagai salah satu dari empat dimensi yang MEMBUAT halaman itu pemasaran.
 * Karena itu pendaratan dikecualikan secara eksplisit dari aturan satu-primer
 * — dan penjaga ketiga menjaga BATAS pengecualiannya: setiap tombol primer di
 * `components/landing/**` harus menuju tujuan yang sama (`/register`). Satu
 * ajakan yang diulang, bukan empat ajakan yang bersaing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");

/**
 * Area yang sudah dilewati audit #267. Bertambah satu baris per potongan;
 * ketika `(dashboard)` dan `components` ikut, bawaan `variant` boleh dibalik.
 */
const AREA_TERAUDIT = [
  join("src", "app", "(auth)"),
  join("src", "app", "(setup)"),
  join("src", "app", "(operator)"),
  join("src", "app", "(tenant)"),
  join("src", "components"),
];

/**
 * SATU berkas di `src/components` yang masih boleh menulis `<Button>` tanpa
 * `variant`, dan alasannya bukan kemalasan.
 *
 * `EmptyState` adalah PRIMITIF: variannya bukan keputusan tentang satu layar
 * melainkan keputusan yang diwarisi setiap keadaan-kosong di aplikasi ini. Dan
 * keadaan-kosong itulah pola yang tersisa di potongan berikutnya — dua belas
 * berkas `(dashboard)` di `SISA_AUDIT` di bawah semuanya bentuknya sama: CTA
 * kepala halaman DAN CTA keadaan-kosong menyala bersamaan. Menetapkan varian
 * `EmptyState` di sini berarti memutuskan kedua belas layar itu tanpa membuka
 * satu pun. Barisnya dicabut di potongan yang mengaudit mereka; sampai itu, tes
 * "tidak memuat entri basi" di bawah menjaga agar ia tidak jadi hiasan.
 */
const SISA_KEEKSPLISITAN = ["src/components/ui/empty-state.tsx"];

/**
 * Direktori halaman pendaratan — DIKECUALIKAN dari aturan satu-primer, dengan
 * batas yang dijaga terpisah. Lihat MASTER.md §Aksi utama per layar →
 * "Pendaratan `/` dikecualikan".
 */
const AREA_PENDARATAN = join("src", "components", "landing");

/**
 * Satu-satunya tujuan yang boleh dipakai tombol berisi penuh di pendaratan.
 * Ini yang membuat pengecualiannya berbatas, bukan tanpa dasar: pengulangan
 * ajakan sah karena ajakannya SATU. Dua tujuan primer yang berbeda di halaman
 * yang sama adalah hierarki rata yang dibuka #267, dan di sinilah ia merah.
 */
const TUJUAN_PRIMER_PENDARATAN = "/register";

/** Seluruh permukaan yang dijaga penjaga #2. */
const AREA_LUAS = [join("src", "app"), join("src", "components")];

/**
 * Wadah yang MASIH memuat lebih dari satu primer — utang potongan berikutnya,
 * bukan izin. Jalur relatif terhadap akar repo; hanya boleh berkurang.
 */
const SISA_AUDIT = [
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/advances/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/documents/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/finance/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/update/stock-form.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/reconciliation/[id]/reconciliation-workspace.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/reconciliation/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/returns/page.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/users/users-client.tsx",
];

function berkasTsx(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const jalur = join(dir, entri.name);
    if (entri.isDirectory()) berkasTsx(jalur, keluar);
    else if (entri.name.endsWith(".tsx")) keluar.push(jalur);
  }
  return keluar;
}

const relatif = (jalur: string) => jalur.slice(ROOT.length + 1).split("\\").join("/");

function sumber(jalur: string): ts.SourceFile {
  return ts.createSourceFile(
    jalur,
    readFileSync(jalur, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;
const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const namaTag = (n: Jsx) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText();

/**
 * `"primary"` dan `"default"` adalah OBJEK YANG SAMA di `ui/button.tsx`
 * (`const PRIMARY`), jadi keduanya dihitung. `undefined` berarti tak ditulis —
 * dan selama bawaannya `primary`, tak ditulis BERARTI primary.
 */
const NILAI_PRIMER = new Set(["primary", "default"]);

/**
 * Nilai `variant` sebuah `<Button>`, atau `undefined` bila tidak ditulis.
 * Untuk nilai dinamis (`variant={urgent ? "primary" : "outline"}`) yang
 * dikembalikan adalah `"primary"` bila salah satu cabangnya bisa primer —
 * penjaga yang menganggap setiap ekspresi "bukan primer" akan buta terhadap
 * bentuk yang justru paling sering dipakai untuk MENAIKKAN penekanan.
 */
function varianDari(node: Jsx): string | undefined {
  const atribut = (ts.isJsxElement(node) ? node.openingElement : node).attributes;
  for (const a of atribut.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== "variant") continue;
    const nilai = a.initializer;
    if (nilai && ts.isStringLiteral(nilai)) return nilai.text;
    const teks = nilai ? nilai.getText() : "";
    return /["'](?:primary|default)["']/.test(teks) ? "primary" : "__dinamis__";
  }
  return undefined;
}

const primer = (node: Jsx) => {
  if (namaTag(node) !== "Button") return false;
  const v = varianDari(node);
  return v === undefined || NILAI_PRIMER.has(v);
};

/**
 * Jumlah tombol primer yang bisa TERENDER BERSAMAAN di bawah `node`.
 *
 * Kunci ketelitiannya ada pada `ConditionalExpression`: `step < last ? <Lanjut/>
 * : <Selesai/>` adalah DUA tombol di sumber dan SATU di layar. Tanpa `Math.max`
 * di sana penjaga ini merah pada kaki wisaya, `/verify-email` (tiga cabang yang
 * saling meniadakan), dan `shared/wizard.tsx` — tiga berkas yang justru contoh
 * paling bersih dari aturannya. Penjaga yang merah pada yang benar akan
 * dilonggarkan orang berikutnya sampai tidak menjaga apa pun.
 *
 * `&&` sengaja TIDAK diperlakukan begitu: `{a && <X/>}{b && <Y/>}` bisa benar
 * keduanya sekaligus.
 */
function hitungPrimer(node: ts.Node, memo: Map<ts.Node, number>): number {
  let n = 0;
  if (ts.isConditionalExpression(node)) {
    hitungPrimer(node.condition, memo);
    n = Math.max(hitungPrimer(node.whenTrue, memo), hitungPrimer(node.whenFalse, memo));
  } else {
    ts.forEachChild(node, (anak) => {
      n += hitungPrimer(anak, memo);
    });
  }
  if (isJsx(node) && primer(node)) n += 1;
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) memo.set(node, n);
  return n;
}

/** Wadah TERKECIL yang memuat >1 primer — supaya laporannya menunjuk baris aksi, bukan `<body>`. */
function wadahBermasalah(jalur: string): { baris: number; jumlah: number }[] {
  const src = sumber(jalur);
  const memo = new Map<ts.Node, number>();
  hitungPrimer(src, memo);

  const hasil: { baris: number; jumlah: number }[] = [];
  for (const [node, jumlah] of memo) {
    if (jumlah < 2) continue;
    let terkecil = true;
    const turun = (anak: ts.Node) => {
      if (memo.get(anak) === jumlah) terkecil = false;
      else ts.forEachChild(anak, turun);
    };
    ts.forEachChild(node, turun);
    if (!terkecil) continue;
    hasil.push({ baris: src.getLineAndCharacterOfPosition(node.getStart()).line + 1, jumlah });
  }
  return hasil;
}

/** Nilai literal sebuah atribut, atau `undefined` bila tak ditulis / dinamis. */
function atributLiteral(node: Jsx, nama: string): string | undefined {
  const atribut = (ts.isJsxElement(node) ? node.openingElement : node).attributes;
  for (const a of atribut.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== nama) continue;
    const nilai = a.initializer;
    if (nilai && ts.isStringLiteral(nilai)) return nilai.text;
    return undefined;
  }
  return undefined;
}

/** Setiap `<Button>` primer di sebuah berkas, dengan `href`-nya. */
function tombolPrimer(jalur: string): { baris: number; href: string | undefined }[] {
  const src = sumber(jalur);
  const hasil: { baris: number; href: string | undefined }[] = [];
  const kunjungi = (node: ts.Node) => {
    if (isJsx(node) && primer(node)) {
      hasil.push({
        baris: src.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        href: atributLiteral(node, "href"),
      });
    }
    ts.forEachChild(node, kunjungi);
  };
  kunjungi(src);
  return hasil;
}

/** `<Button …>` tanpa `variant` — sumbernya, bukan hasil rendernya. */
function tombolImplisit(jalur: string): number[] {
  const src = sumber(jalur);
  const baris: number[] = [];
  const kunjungi = (node: ts.Node) => {
    if (isJsx(node) && namaTag(node) === "Button" && varianDari(node) === undefined) {
      baris.push(src.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, kunjungi);
  };
  kunjungi(src);
  return baris;
}

describe("penekanan tombol (#267)", () => {
  it("area yang sudah diaudit tidak punya satu pun <Button> tanpa `variant`", () => {
    /*
     * Bukan soal gaya penulisan. Selama bawaannya `primary`, `<Button>` polos
     * adalah tombol berisi penuh yang TIDAK ADA yang memutuskannya — dan
     * pembalikan bawaan nanti akan menurunkannya diam-diam. Menuliskan
     * variannya memaksa pertanyaannya dijawab sekali, di tempat yang terlihat
     * di diff.
     */
    const pelanggar: string[] = [];
    for (const area of AREA_TERAUDIT) {
      for (const jalur of berkasTsx(join(ROOT, area))) {
        const rel = relatif(jalur);
        if (SISA_KEEKSPLISITAN.includes(rel)) continue;
        for (const baris of tombolImplisit(jalur)) pelanggar.push(`${rel}:${baris}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("SISA_KEEKSPLISITAN tidak memuat entri basi", () => {
    const basi = SISA_KEEKSPLISITAN.filter((rel) => tombolImplisit(join(ROOT, rel)).length === 0);
    expect(basi).toEqual([]);
  });

  it("tidak ada wadah JSX dengan lebih dari satu tombol primer, di luar SISA_AUDIT", () => {
    const pelanggar: string[] = [];
    for (const area of AREA_LUAS) {
      for (const jalur of berkasTsx(join(ROOT, area))) {
        const rel = relatif(jalur);
        if (SISA_AUDIT.includes(rel)) continue;
        for (const { baris, jumlah } of wadahBermasalah(jalur)) {
          pelanggar.push(`${rel}:${baris} (${jumlah} primer)`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("SISA_AUDIT tidak memuat entri basi", () => {
    /*
     * Daftar pengecualian yang barisnya sudah tidak melanggar apa pun adalah
     * cara paling pelan sebuah penjaga berubah menjadi dekorasi: ia tumbuh saat
     * ada yang macet, tidak pernah menyusut saat ada yang beres, dan pembaca
     * berikutnya membacanya sebagai "memang begitu di sini".
     */
    const basi = SISA_AUDIT.filter(
      (rel) => wadahBermasalah(join(ROOT, rel)).length === 0
    );
    expect(basi).toEqual([]);
  });

  it("setiap tombol primer di pendaratan menuju satu tujuan yang sama", () => {
    /*
     * Halaman pendaratan DIKECUALIKAN dari "satu aksi utama per layar", dan
     * pengecualian tanpa batas adalah izin. Ini batasnya.
     *
     * `/` merender empat tombol berisi penuh sekaligus — bilah atas, hero,
     * tiap kartu paket (`.map()`), dan ajakan penutup. Menurut aturannya itu
     * pelanggaran empat kali; menurut cara halaman pendaratan bekerja itu
     * justru bentuk yang benar, sebab orang yang membaca sampai bawah tidak
     * boleh disuruh menggulung balik untuk menemukan tombolnya. MASTER.md
     * §Pemasaran vs App sudah menyebut "aksi yang SAMA diulang tiga kali"
     * sebagai salah satu dari empat dimensi yang MEMBUAT sebuah halaman
     * pemasaran — jadi menegakkan satu-primer di sini berarti menghapus
     * dimensi yang dokumen lain sengaja pasang.
     *
     * Yang menyelamatkan pengecualian ini dari menjadi pintu belakang adalah
     * kata "SAMA": pengulangan sah karena ajakannya satu. Begitu tombol primer
     * kedua menuju tempat LAIN, halaman ini berhenti mengulang satu ajakan dan
     * mulai menawarkan dua — persis hierarki rata yang dibuka #267, hanya di
     * permukaan yang berbeda. Tes ini merah pada saat itu, dan hanya pada saat
     * itu.
     *
     * ⚠ Yang tes ini TIDAK lihat: berapa KALI tombolnya muncul di layar
     * (`.map()` paket), dan apakah label yang berbeda untuk tujuan yang sama
     * ("Daftar" di bilah atas, "Mulai gratis" di hero) masih terbaca sebagai
     * satu ajakan. Keduanya urusan mata.
     */
    const salahTujuan: string[] = [];
    for (const jalur of berkasTsx(join(ROOT, AREA_PENDARATAN))) {
      for (const { baris, href } of tombolPrimer(jalur)) {
        if (href !== TUJUAN_PRIMER_PENDARATAN) {
          salahTujuan.push(`${relatif(jalur)}:${baris} (href=${href ?? "—"})`);
        }
      }
    }
    expect(salahTujuan).toEqual([]);
  });

  it("pendeteksinya benar-benar bisa merah — dibuktikan di sini, bukan diandaikan", () => {
    const uji = (kode: string) => {
      const src = ts.createSourceFile("uji.tsx", kode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const memo = new Map<ts.Node, number>();
      hitungPrimer(src, memo);
      return Math.max(0, ...memo.values());
    };

    // Dua primer bersebelahan — bentuk yang dijaga.
    expect(uji('<div><Button variant="primary">A</Button><Button>B</Button></div>')).toBe(2);
    // Implisit + implisit: keduanya primer, sebab bawaannya masih `primary`.
    expect(uji("<div><Button>A</Button><Button>B</Button></div>")).toBe(2);
    // `default` adalah alias `primary` di `ui/button.tsx`, bukan "tombol biasa".
    expect(uji('<div><Button variant="default">A</Button><Button>B</Button></div>')).toBe(2);
    // Varian berkondisi yang salah satu cabangnya primer tetap dihitung.
    expect(uji('<div><Button variant={x ? "primary" : "outline"}>A</Button><Button>B</Button></div>')).toBe(2);

    // …dan hijau pada yang memang benar:
    expect(uji('<div><Button>A</Button><Button variant="outline">B</Button></div>')).toBe(1);
    // Cabang yang saling meniadakan bukan dua tombol di layar.
    expect(uji("<div>{x ? <Button>A</Button> : <Button>B</Button>}</div>")).toBe(1);
    // Destruktif tidak pernah dihitung sebagai aksi utama (aturannya di #219).
    expect(uji('<div><Button>A</Button><Button variant="destructive">Hapus</Button></div>')).toBe(1);
    // Nama tag lain bukan urusan penjaga ini.
    expect(uji("<div><IconButton>A</IconButton><Button>B</Button></div>")).toBe(1);
  });

  it("primitifnya masih berbawaan `primary` — kalau tidak, penjaga #1 kehilangan alasannya", () => {
    /*
     * Penjaga keeksplisitan berdiri di atas satu fakta: tak-ditulis = primer.
     * Kalau bawaannya suatu hari dibalik ke `secondary` TANPA menyelesaikan
     * audit, tombol implisit berhenti berbahaya dengan cara yang berbeda — dan
     * daftar `AREA_TERAUDIT` harus dibaca ulang, bukan diwarisi begitu saja.
     * Tes ini yang memaksa pembacaan itu terjadi.
     */
    const isi = readFileSync(join(ROOT, "src", "components", "ui", "button.tsx"), "utf8");
    expect(isi).toMatch(/variant = "primary"/);
  });
});
