/**
 * Invarian tabel & sel nominal (issue #52; sel uang ditulis ulang di atas AntD
 * pada #186; primitif tabel dipecah dua pada #189).
 *
 * Sejak #189 ada DUA perender dengan SATU kontrak kolom:
 *
 *   • `StaticTable` — server, tanpa JavaScript, untuk laporan yang menampilkan;
 *   • `DataTable`   — client, di atas AntD `Table`, untuk yang butuh sortir/
 *     filter/paginasi seketika.
 *
 * Berkas ini mengunci hal yang sama pada keduanya, karena aturan MASTER.md
 * tidak boleh bergantung pada varian mana yang kebetulan dipilih halaman:
 * tabel lebar menggeser DIRINYA (bukan halamannya), nominal membawa seluruh
 * aturan uang, baris total ada, dan keadaan kosong bermakna.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Money, MoneyCell } from "@/components/ui/money";
import { MONEY_TOKENS_LIGHT } from "@/lib/theme/antd-tokens";
import { DataTable } from "@/components/ui/data-table";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, textColumn } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { Pagination } from "@/components/ui/pagination";
import { stockMovementColumns, STOCK_MOVEMENT_HEADERS } from "@/lib/statement-layout";

type Row = { doc: string; amount: number | null };

const rows: Row[] = [
  { doc: "INV-1", amount: 9000 },
  { doc: "INV-2", amount: 10000 },
  { doc: "INV-3", amount: -2500 },
];

const columns = [
  textColumn<Row>({ dataIndex: "doc", title: "Dokumen" }),
  moneyColumn<Row>({ dataIndex: "amount", title: "Nilai" }),
];

const rowKey = (r: Row) => r.doc;

const renderStatic = (props: Partial<Parameters<typeof StaticTable<Row>>[0]> = {}) =>
  renderToStaticMarkup(
    <StaticTable<Row> columns={columns} rows={rows} rowKey={rowKey} {...props} />
  );

const renderData = (props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  renderToStaticMarkup(
    <DataTable<Row> columns={columns} data={rows} rowKey={rowKey} {...props} />
  );

/* ───────────────────────── StaticTable (server) ───────────────────────── */

describe("StaticTable — varian server", () => {
  it("membungkus dirinya dengan pembungkus geser mendatar", () => {
    // Inilah yang menjaga aturan responsif MASTER.md: yang menggulung adalah
    // kotak tabelnya, bukan halamannya. Sejak #203 gayanya sebaris, bukan
    // kelas `overflow-x-auto`.
    const html = renderStatic();
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain('data-slot="table-container"');
  });

  it("memakai struktur semantik thead/tbody", () => {
    const html = renderStatic();
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<th");
  });

  it("merender setiap baris dan menerapkan aturan uang lewat moneyColumn", () => {
    const html = renderStatic();
    expect(html).toContain("INV-1");
    expect(html).toContain("INV-3");
    // Nilai negatif tetap berwarna walau dirender lewat kolom, bukan manual.
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
    expect(html).toContain("font-variant-numeric:tabular-nums");
  });

  it("kolom nominal rata kanan, termasuk header-nya", () => {
    const html = renderStatic();
    // Header dan sel sama-sama membawa perataannya, jadi angka tidak pernah
    // berdiri di bawah judul yang rata kiri.
    const headerCells = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(headerCells).toContain("text-align:right");
    expect(html).toContain("text-align:right");
  });

  it("menampilkan empty state ketika tidak ada baris", () => {
    const html = renderStatic({ rows: [], empty: <p>Belum ada data</p> });
    expect(html).toContain("Belum ada data");
  });

  it("merender baris total di dalam tfoot", () => {
    const html = renderStatic({ summary: { doc: "Total", amount: "Rp 16.500" } });
    expect(html).toContain("<tfoot");
    expect(html).toContain("Rp 16.500");
  });

  it("baris total dihilangkan ketika tidak ada baris untuk ditotal", () => {
    // Total dari nol baris bukan informasi; ia hanya membuat keadaan kosong
    // terlihat seperti laporan yang isinya nol.
    const html = renderStatic({ rows: [], empty: <p>kosong</p>, summary: { doc: "Total" } });
    expect(html).not.toContain("<tfoot");
  });

  it("baris total mengikuti kolom yang benar-benar tampil", () => {
    // Kolom yang tidak disebut di `summary` tetap mendapat SEL-nya sendiri,
    // supaya angka total tak bisa bergeser satu kolom ketika pengguna
    // mengurangi kolom lewat dialog parameter.
    const html = renderStatic({ summary: { amount: "Rp 16.500" } });
    const foot = html.slice(html.indexOf("<tfoot"));
    expect(foot.match(/<td/g)).toHaveLength(columns.length);
  });
});

/* ─────────── Baris seksi & subtotal di dalam badan (issue #233) ─────────── */

describe("StaticTable — baris seksi & subtotal di dalam tbody", () => {
  const laporan: Row[] = [
    { doc: "ASET LANCAR", amount: null },
    { doc: "INV-1", amount: 9000 },
    { doc: "Jumlah Aset Lancar", amount: 9000 },
  ];

  const rowCells = (row: Row) =>
    row.doc === "ASET LANCAR"
      ? { doc: { content: row.doc, colSpan: 2, scope: "colgroup" as const } }
      : row.doc.startsWith("Jumlah")
        ? { doc: { content: row.doc, scope: "row" as const } }
        : undefined;

  const body = (html: string) =>
    html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));

  /*
   * Terukur pada react-dom 19: perender server MENULIS `colSpan="2"` apa
   * adanya — pada `<td>` maupun `<th>` — bukan `colspan` huruf kecil. Nama
   * atribut HTML tidak peka huruf besar-kecil, jadi peramban tetap membacanya
   * sebagai `colspan`; yang tidak boleh adalah tes ini menyangka sebaliknya
   * lalu gagal karena hal yang benar.
   */
  const COLSPAN_2 = /colspan="2"/i;

  it("tanpa rowCells badan tabel tidak berubah sedikit pun", () => {
    /*
     * Inilah janji yang menjaga 20-an pemanggil lama: prop yang tidak dikirim
     * berarti jalur lama PERSIS — tidak ada `<th>` yang menyelinap ke badan,
     * dan jumlah selnya tetap baris × kolom.
     */
    const tubuh = body(renderStatic());
    expect(tubuh).not.toContain("<th");
    expect(tubuh.match(/<td/g)).toHaveLength(rows.length * columns.length);
  });

  it("baris seksi membentang seluruh kolom di tengah badan tabel", () => {
    const tubuh = body(renderStatic({ rows: laporan, rowCells }));
    expect(tubuh).toMatch(COLSPAN_2);
    expect(tubuh).toContain("ASET LANCAR");
    // Baris akun di bawahnya tetap dua sel — `colSpan` tidak menular.
    const akun = tubuh.slice(tubuh.indexOf("INV-1"));
    expect(akun.slice(0, akun.indexOf("</tr>")).match(/<td/g)).toHaveLength(1);
  });

  it("baris seksi adalah <th scope=\"colgroup\">, bukan sel data", () => {
    /*
     * Tanpa ini "ASET LANCAR" dibacakan pembaca layar sebagai satu sel data
     * tanpa konteks di tengah tabel, dan tak satu pun angka di bawahnya
     * terhubung ke judulnya. Tidak ada tes LAIN yang akan berteriak kalau ini
     * kembali menjadi `<td colSpan>` — itu sebabnya tes ini ada.
     */
    const tubuh = body(renderStatic({ rows: laporan, rowCells }));
    expect(tubuh).toMatch(/<th[^>]*scope="colgroup"/);
    expect(tubuh).toMatch(/<th[^>]*scope="row"/);
  });

  it("sel bertag th tampil seperti sel isi, bukan seperti judul kolom", () => {
    /*
     * Bawaan peramban untuk `<th>` adalah `font-weight: bold; text-align:
     * center`, dan sejak #203 tidak ada satu lembar gaya pun yang
     * menetralkannya (preflight Tailwind dulu juga tidak menyentuh `<th>`).
     * Tanpa penetralan sebaris, baris seksi akan tampil tebal & DI TENGAH.
     * Perataan datang dari kolomnya, tebal huruf dari barisnya — sama seperti
     * sel lain.
     */
    const tubuh = body(renderStatic({ rows: laporan, rowCells }));
    const th = tubuh.slice(tubuh.indexOf("<th"));
    expect(th).toContain("font-weight:inherit");
    // Gaya sel ISI, bukan gaya `TableHead` (tinggi baris judul 44px).
    expect(th.slice(0, th.indexOf(">"))).toContain(
      "padding-inline:var(--ant-padding-lg);padding-block:var(--ant-padding-sm)"
    );
    expect(th.slice(0, th.indexOf(">"))).not.toContain("height:44px");
  });

  it("kolom yang tidak disebut tetap digambar dari barisnya", () => {
    /*
     * Beda yang disengaja dari `<tfoot>` (yang tidak punya baris data): baris
     * subtotal cukup mengganti LABELnya, dan angkanya tetap datang dari
     * `moneyColumn`. Kalau kolomnya ikut dikosongkan, setiap halaman laporan
     * harus menulis ulang aturan uang di sisi `rowCells` — dua aturan uang.
     */
    const tubuh = body(renderStatic({ rows: laporan, rowCells }));
    const subtotal = tubuh.slice(tubuh.indexOf("Jumlah Aset Lancar"));
    expect(subtotal).toContain("9.000");
    expect(subtotal).toContain("font-variant-numeric:tabular-nums");
  });

  it("baris tanpa peta tetap baris data biasa di tabel yang sama", () => {
    // Barisnya dipotong tepat pada `</tr>`-nya sendiri: tanpa itu potongan
    // ikut memuat `<th>` milik baris subtotal SESUDAHNYA, dan tesnya gagal
    // karena hal yang benar.
    const tubuh = body(renderStatic({ rows: laporan, rowCells }));
    const sisa = tubuh.slice(tubuh.indexOf("INV-1"));
    const akun = sisa.slice(0, sisa.indexOf("</tr>"));
    expect(akun).not.toContain("<th");
  });

  it("kaki memakai reduksi colSpan yang sama — satu perilaku, bukan dua", () => {
    // `scope` dan `colSpan` yang sama harus bekerja di kedua ujung tabel;
    // kalau badan dan kaki punya perendernya masing-masing, keduanya akan
    // menyimpang tanpa ada yang gagal.
    const html = renderStatic({
      summary: [{ cells: { doc: { content: "Total", colSpan: 2, scope: "row" as const } } }],
    });
    const foot = html.slice(html.indexOf("<tfoot"));
    expect(foot).toMatch(/<th[^>]*scope="row"/);
    expect(foot).toMatch(COLSPAN_2);
    expect(foot).not.toContain("<td");
  });
});

/* ───────────────────────── DataTable (client, AntD) ───────────────────── */

describe("DataTable — varian interaktif di atas AntD", () => {
  it("tabel lebar menggeser DIRINYA, bukan halamannya", () => {
    /*
     * Ini invarian #189 yang paling mudah hilang tanpa ada yang gagal.
     *
     * Terukur pada antd 6.5.3: AntD `Table` TANPA `scroll.x` merender
     * `.ant-table-content` polos — tanpa `overflow-x`. Tabel dengan 7 kolom
     * lalu melebarkan induknya, dan yang menggulung mendatar di 375px adalah
     * HALAMAN. Itu persis regresi yang dilarang MASTER.md, dan ia tidak
     * terlihat di layar 1440px tempat kodenya ditulis.
     *
     * `scroll={{ x: "max-content" }}` yang dipasang primitif sebagai BAWAAN
     * yang mengubahnya: `overflow-x:auto` pindah ke kotak tabel, dan tabelnya
     * melebar di dalam kotak itu. Jadi `overflow-x-auto` primitif lama TIDAK
     * otomatis setara dengan `scroll={{x}}` — kesetaraan itu baru ada karena
     * bawaan ini, dan itulah yang dikunci di sini.
     */
    const html = renderData();
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain("width:max-content");
    expect(html).toContain("ant-table-scroll-horizontal");
  });

  it("merender setiap baris dan menerapkan aturan uang lewat moneyColumn", () => {
    const html = renderData();
    expect(html).toContain("INV-1");
    expect(html).toContain("INV-3");
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
    expect(html).toContain("font-variant-numeric:tabular-nums");
  });

  it("kolom nominal rata kanan", () => {
    const html = renderData();
    expect(html).toContain("text-align:right");
  });

  it("keadaan kosong memakai EmptyState pemanggil, bukan 'No Data' bawaan AntD", () => {
    // Bawaan AntD adalah gambar "No Data": kalimat yang tidak memberi tahu apa
    // pun dan tidak menawarkan jalan keluar.
    const html = renderToStaticMarkup(
      <DataTable<Row>
        columns={columns}
        data={[]}
        rowKey={rowKey}
        empty={<p>Belum ada pengajuan</p>}
      />
    );
    expect(html).toContain("Belum ada pengajuan");
    expect(html).not.toContain("No Data");
  });

  it("merender baris total lewat summary", () => {
    const html = renderData({ summary: { doc: "Total", amount: "Rp 16.500" } });
    expect(html).toContain("ant-table-summary");
    expect(html).toContain("Rp 16.500");
  });

  it("mengurutkan nominal sebagai ANGKA, bukan sebagai teks terformat", () => {
    // Kalau diurutkan sebagai string, "Rp 9.000" akan mendarat di atas
    // "Rp 10.000" dan daftar nilai terbesar jadi salah — kesalahan yang
    // sangat mudah lolos dari mata. Pembandingnya diuji langsung, karena
    // pengurutan AntD terjadi saat diklik, bukan saat dirender.
    const sorter = columns[1].sorter;
    expect(typeof sorter).toBe("function");
    const compare = sorter as (a: Row, b: Row) => number;
    const sorted = [...rows].sort(compare).map((r) => r.doc);
    expect(sorted).toEqual(["INV-3", "INV-1", "INV-2"]); // -2500 < 9000 < 10000
  });

  it("header kolom yang bisa diurutkan mengumumkan dirinya ke pembaca layar", () => {
    const html = renderData();
    expect(html).toContain('aria-description="sortable"');
  });
});

/* ────────────── Kontrak kolom dipakai kedua varian sekaligus ───────────── */

describe("kontrak kolom", () => {
  it("kolom yang sama dirender kedua varian tanpa ditulis ulang", () => {
    // Ini yang membuat sebuah tabel bisa berpindah statis <-> interaktif
    // dengan mengganti perendernya saja.
    const statis = renderStatic();
    const interaktif = renderData();
    for (const html of [statis, interaktif]) {
      expect(html).toContain("Dokumen");
      expect(html).toContain("INV-2");
      expect(html).toContain("font-variant-numeric:tabular-nums");
    }
  });

  it("gaya SEL tidak bocor ke header — di kedua varian", () => {
    /*
     * Kolom laporan kerap berwarna menurut arah angkanya ("Masuk" hijau,
     * "Keluar" merah). Kalau gaya itu ikut ke `<th>`, judul kolomnya ikut
     * berwarna dan berubah menjadi penanda status palsu — dan karena warnanya
     * masuk akal di mata, tidak ada yang melaporkannya sebagai bug.
     *
     * Sampai #203 bentuknya `className` berisi kelas Tailwind; ia berganti
     * menjadi `cellStyle` bersama pencabutan Tailwind.
     */
    const berwarna = [
      qtyColumn<{ masuk: number }>({
        dataIndex: "masuk",
        title: "Masuk",
        cellStyle: { color: "var(--ant-color-money-positive)" },
      }),
    ];
    const baris = [{ masuk: 5 }];

    const statis = renderToStaticMarkup(
      <StaticTable columns={berwarna} rows={baris} rowKey={() => "x"} />
    );
    const interaktif = renderToStaticMarkup(
      <DataTable columns={berwarna} data={baris} rowKey={() => "x"} />
    );

    for (const html of [statis, interaktif]) {
      const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
      expect(header).toContain("Masuk");
      expect(header).not.toContain("--ant-color-money-positive");
      // Selnya tetap mendapatkannya — kalau tidak, tesnya menguji ketiadaan.
      expect(html).toContain("--ant-color-money-positive");
    }
  });

  it("laporan berkolom-pilihan menyusun kolom DARI penentu di statement-layout", () => {
    /*
     * Kriteria selesai #189: layar, PDF, dan lembar sebar memakai penentu yang
     * SAMA. Yang dikunci di sini adalah arah alirannya — daftar id datang dari
     * `stockMovementColumns`, lalu kolom dibentuk dari id itu. Daftar kolom
     * kedua yang ditulis di sebelahnya adalah cara pratinjau dan berkas ekspor
     * mulai berbeda kolom, dan itu bug yang baru ditutup.
     */
    const ids = stockMovementColumns({ hasProcess: false, visibleColumns: ["opening", "closing"] });
    // `processed` gugur karena isinya tidak ada; `unit`/`movedIn`/`movedOut`
    // gugur karena pengguna tidak mencentangnya; `name` tak pernah bisa dibuang.
    expect(ids).toEqual(["name", "opening", "closing"]);

    type StokRow = Record<string, number | string>;
    const kolom = ids.map((id) =>
      id === "name"
        ? textColumn<StokRow>({ dataIndex: "name", title: STOCK_MOVEMENT_HEADERS.name })
        : qtyColumn<StokRow>({ dataIndex: id, title: STOCK_MOVEMENT_HEADERS[id] })
    );

    expect(kolom.map((k) => k.key)).toEqual(ids);

    const html = renderToStaticMarkup(
      <StaticTable<StokRow>
        columns={kolom}
        rows={[{ name: "Kayu", opening: 10, closing: 12 }]}
        rowKey={(r) => String(r.name)}
      />
    );
    expect(html).toContain("Saldo Awal");
    expect(html).toContain("Saldo Akhir");
    // Kolom yang tidak dipilih tidak boleh menyelinap kembali lewat perender.
    expect(html).not.toContain("Masuk");
    expect(html).not.toContain("Diolah");
  });
});

/* ──────────────────────────────── Pagination ──────────────────────────── */

describe("Pagination — kendali AntD, navigasi tetap lewat URL", () => {
  const render = (currentPage: number, totalPages: number) =>
    renderToStaticMarkup(
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/invoices"
        searchParams={{ q: "acme", page: "3" }}
      />
    );

  it("butir halaman adalah TAUTAN sungguhan, bukan tombol", () => {
    /*
     * Dua belas halaman daftar mengambil datanya di server berdasarkan `?page=`.
     * Kalau paginasinya berubah jadi tombol `onClick`, yang hilang bukan gaya:
     * URL per halaman tak bisa disalin/ditandai, klik tengah mati, dan Next.js
     * kehilangan prefetch. AntD dipakai untuk tata letaknya, `itemRender` yang
     * mempertahankan tautannya.
     */
    const html = render(2, 9);
    expect(html).toContain('href="/invoices?q=acme&amp;page=1"');
    expect(html).toContain('href="/invoices?q=acme&amp;page=3"');
  });

  it("query yang sedang berlaku ikut, tapi `page` lama tidak menempel", () => {
    const html = render(2, 9);
    expect(html).toContain("q=acme");
    // `page` dari searchParams lama harus DIGANTI, bukan diduplikasi.
    expect(html).not.toMatch(/page=3&amp;page=/);
  });

  it("panah yang bisa dituju membawa ikonnya — tidak jadi tautan kosong", () => {
    // Mengembalikan `<Link/>` telanjang dari `itemRender` menghapus ikon panah
    // bawaan AntD dan menyisakan target klik yang tak terlihat.
    const html = render(2, 9);
    const prev = html.slice(html.indexOf("ant-pagination-prev"));
    expect(prev).toContain("<svg");
  });

  it("menyebutkan halaman ke berapa dari berapa", () => {
    // Di luar `LocaleProvider` `useT` mengembalikan KUNCInya, jadi yang bisa
    // ditegaskan di sini adalah bahwa labelnya memang dirender dan mengambil
    // kalimatnya dari kamus — bukan kalimat yang ditulis di komponen.
    const html = render(2, 9);
    expect(html).toContain("table.page");
    expect(html).toMatch(/<p[^>]*>table\.page<\/p>/);
  });

  it("tidak merender apa pun ketika hanya ada satu halaman", () => {
    // Kendali yang tak bisa menuju ke mana pun hanya menambah kebisingan.
    expect(render(1, 1)).toBe("");
  });
});

/* ─────────────────────────── Money / MoneyCell ─────────────────────────── */

describe("Money", () => {
  it("nominal positif: tabular-nums, mata uang eksplisit, tidak merah", () => {
    const html = renderToStaticMarkup(<Money value={1234567} currency="IDR" />);
    expect(html).toContain("font-variant-numeric:tabular-nums");
    expect(html).toContain("Rp");
    expect(html).toContain("1.234.567");
    expect(html).not.toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
  });

  it("nominal negatif: merah DAN bertanda minus", () => {
    // Dua penanda, bukan satu: warna saja dilarang MASTER.md.
    const html = renderToStaticMarkup(<Money value={-50000} currency="IDR" />);
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
    expect(html).toContain("-");
  });

  it("hideCurrency menghilangkan simbol tapi mempertahankan format", () => {
    const html = renderToStaticMarkup(<Money value={1234567} currency="IDR" hideCurrency />);
    expect(html).not.toContain("Rp");
    expect(html).toContain("1.234.567");
  });

  it("signed mewarnai positif dengan hijau yang lolos AA", () => {
    const html = renderToStaticMarkup(<Money value={50000} currency="IDR" signed />);
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyPositive);
  });

  it("tone eksplisit mewarnai menurut arah kolom, bukan tanda", () => {
    // Kolom "Keluar"/"Kredit": angkanya positif, artinya uang keluar. Penanda
    // non-warnanya adalah judul kolom, jadi tandanya tidak dibalik.
    const html = renderToStaticMarkup(<Money value={50000} currency="IDR" tone="negative" />);
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
    expect(html).toContain("50.000");
  });
});

describe("MoneyCell", () => {
  it("rata kanan — syarat kolom nominal MASTER.md", () => {
    const html = renderToStaticMarkup(<MoneyCell value={1000} />);
    expect(html).toContain("text-align:right");
    expect(html).toContain("font-variant-numeric:tabular-nums");
  });
});
