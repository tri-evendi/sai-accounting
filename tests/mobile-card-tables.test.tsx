/**
 * PENJAGA #471 — baris yang dilipat jadi kartu tidak boleh kehilangan nama
 * medannya.
 *
 * == Cacat yang dijaga =====================================================
 * `display:block` di atas elemen tabel MENGHAPUS semantik tabel dari pohon
 * aksesibilitas, dan sekaligus menyembunyikan baris judulnya. Sesudah itu satu
 * kolom yang lupa membawa label akan tampil di kartu sebagai ANGKA TELANJANG —
 * "12.500.000" tanpa sepatah kata pun yang menyatakan itu sisa tagihan, nilai
 * penuh, atau pembayaran.
 *
 * Dan ia tidak akan pernah gagal: tidak ada galat, tidak ada kolom kosong,
 * hanya satu baris kartu yang artinya hilang. Di layar lebar tabelnya tetap
 * sempurna, jadi cacatnya tak terlihat oleh siapa pun yang tidak membuka
 * halamannya di ponsel.
 *
 * == Kenapa labelnya DITURUNKAN, bukan diketik =============================
 * `StaticTable` mengambil label kartu dari `column.title` yang sama dengan
 * judul kolomnya. Tidak ada salinan kedua, jadi tidak ada yang bisa menyimpang
 * — dan sebuah kolom yang judulnya berganti membawa serta label kartunya.
 *
 * Yang tersisa untuk dijaga: kolom yang judulnya BUKAN teks (mis. memuat
 * `TermTooltip`). `content: attr(data-label)` hanya bisa membawa string, jadi
 * judul berbentuk elemen mendarat sebagai label KOSONG — tanpa satu pun galat.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";

type Baris = { nama: string; sisa: number };
const ROWS: Baris[] = [{ nama: "PT Rempah Jaya", sisa: 12_500_000 }];

/**
 * Markup BARISNYA saja.
 *
 * Blok `<style>` aturan tabel ikut terender dan ia sendiri menyebut
 * `[data-label]`, `[data-cards="on"]`, dan `data-card="title"` — sebagai
 * SELEKTOR. Asersi "tidak memuat data-label" yang dijalankan di atas markup
 * penuh karena itu selalu merah, dan merahnya tidak berarti apa-apa. Lembar
 * gayanya dibuang di sini supaya yang tersisa benar-benar atribut.
 */
function markup(columns: SaiColumns<Baris>, cards: boolean) {
  return renderToStaticMarkup(
    <StaticTable<Baris> cards={cards} columns={columns} rows={ROWS} rowKey={(r) => r.nama} />
  ).replace(/<style[\s\S]*?<\/style>/g, "");
}

describe("label kartu diturunkan dari judul kolomnya", () => {
  const columns: SaiColumns<Baris> = [
    { key: "nama", dataIndex: "nama", title: "Pelanggan", card: "title" },
    { key: "sisa", dataIndex: "sisa", title: "Sisa Tagihan", align: "right" },
  ];

  it("sel biasa membawa `data-label` berisi judul kolomnya", () => {
    expect(markup(columns, true)).toContain('data-label="Sisa Tagihan"');
  });

  it("sel subjek TIDAK berlabel — namanya bukan nilai yang perlu dinamai", () => {
    const html = markup(columns, true);
    expect(html).toContain('data-card="title"');
    expect(html).not.toContain('data-label="Pelanggan"');
  });

  it("tanpa `cards`, tidak satu pun atribut kartu ikut ke markup", () => {
    /* Ratusan tabel lain tidak memintanya; markup mereka tidak boleh tumbuh
       hanya karena mekanismenya ada. */
    const html = markup(columns, false);
    expect(html).not.toContain("data-label");
    expect(html).not.toContain("data-cards");
    expect(html).not.toContain('data-card="title"');
  });

  it("judul berbentuk ELEMEN wajib menyebut `cardLabel` sendiri", () => {
    const berikon: SaiColumns<Baris> = [
      { key: "nama", dataIndex: "nama", title: "Pelanggan", card: "title" },
      { key: "sisa", dataIndex: "sisa", title: <span>Sisa</span>, cardLabel: "Sisa Tagihan" },
    ];
    expect(markup(berikon, true)).toContain('data-label="Sisa Tagihan"');

    /* Dan tanpa `cardLabel`, atributnya TIDAK ADA sama sekali — bukan hadir
       tapi kosong. `[data-label]::before` karena itu tidak menyala dengan label
       hampa; nilainya berdiri sendiri, yang jelek tapi jujur. */
    const lupa: SaiColumns<Baris> = [
      { key: "nama", dataIndex: "nama", title: "Pelanggan", card: "title" },
      { key: "sisa", dataIndex: "sisa", title: <span>Sisa</span> },
    ];
    expect(markup(lupa, true)).not.toContain("data-label");
  });
});

describe("wadahnya berhenti menggulir mendatar saat menjadi kartu", () => {
  const css = readFileSync(join(__dirname, "..", "src", "components", "ui", "table.tsx"), "utf8");

  it("`overflow-x` dibatalkan di dalam @media kartu", () => {
    /* Tanpa ini kartunya duduk di dalam kotak yang tetap bisa digeser
       menyamping — bentuknya berubah, keluhannya tidak. */
    expect(css).toMatch(
      /\[data-slot="table-container"\]\[data-cards="on"\]\{overflow-x:visible\}/
    );
  });

  it("ambangnya dalam `em`, bukan `px`", () => {
    /* Supaya pengguna yang memperbesar huruf bawaan peramban ikut mendapat
       bentuk kartu, alih-alih tabel sepuluh kolom yang kini lebih lebar lagi. */
    expect(css).toMatch(/@media \(max-width:40em\)/);
  });

  it("judul kolom disembunyikan dengan clip-path, bukan display:none", () => {
    /* Jarak yang sama, tetapi judulnya tetap ada bagi mesin pencari dan bagi
       peramban yang tidak menerapkan @media ini. */
    const blok = css.slice(css.indexOf("const CARD_RULES"), css.indexOf("const CARD_RULES") + 2000);
    expect(blok).toMatch(/\[data-slot="table-header"\]\{[^}]*clip-path:inset\(50%\)/);
    expect(blok).not.toMatch(/\[data-slot="table-header"\]\{display:none/);
  });
});

describe("setiap tabel berkartu menyatakan SUBJEKnya", () => {
  const HALAMAN = [
    join("receivables", "page.tsx"),
    "page.tsx",
  ].map((rel) =>
    join(
      __dirname,
      "..",
      "src",
      "app",
      "(app)",
      "(dashboard)",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      rel
    )
  );

  it.each(HALAMAN)("%s", (path) => {
    const src = readFileSync(path, "utf8");
    const berkartu = (src.match(/<StaticTable[\s\S]{0,80}?\bcards\b/g) ?? []).length;
    if (berkartu === 0) return;
    /*
     * Kartu tanpa subjek adalah tumpukan "label: nilai" tanpa satu pun baris
     * yang menyatakan kartu ini TENTANG APA — pembacanya harus menebak dari
     * salah satu nilainya.
     */
    /* Dua bentuk sah dan keduanya dihitung: `card: "title"` langsung di
       kolomnya, atau sebuah peta peran (`documentNo: "title"`) yang disebar ke
       kolomnya — halaman Piutang memakai yang kedua supaya keputusan "apa yang
       penting di layar sempit" bisa dibaca sekali pandang. */
    const subjek = (src.match(/(?:card:|\w+:)\s*"title"/g) ?? []).length;
    expect(subjek, `${berkartu} tabel berkartu, ${subjek} yang menyatakan subjek`).toBe(berkartu);
  });
});
