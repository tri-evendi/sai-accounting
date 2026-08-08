/**
 * Sortir kolom lewat URL — penjaga issue #265.
 *
 * ── Kelas kegagalan yang dijaga ────────────────────────────────────────────
 * `StaticTable` MENGABAIKAN `sorter` selama tiga issue. Prop-nya ada di
 * kontrak kolom, `moneyColumn`/`qtyColumn` menyalakannya secara bawaan, dan 30
 * dari 62 berkas karena itu memasang kendali urut yang tidak pernah ada di
 * layar. `tsc` diam, ESLint diam, tidak satu pun tes gagal.
 *
 * Karena itu penjaga di bawah tidak menguji SATU kolom yang kebetulan bisa
 * diurutkan. Ia menguji SETIAP BENTUK `sorter` yang bisa ditulis di repo ini —
 * `true`, sebuah pembanding, lewat masing-masing pembantu kolom, dan sebagai
 * objek kolom polos — dan menuntut dua hal untuk semuanya:
 *
 *   1. bila konteks `sort` ada, judulnya WAJIB menjadi kendali sortir;
 *   2. bila konteks `sort` TIDAK ada (atau kuncinya tak dikenal kueri), ia
 *      WAJIB melempar — diam adalah keadaan yang issue ini hapus.
 *
 * Butir 2 yang menutup kelasnya. Kalau kelak seseorang menambah bentuk `sorter`
 * baru dan lupa merendernya, ia tidak akan lolos sebagai "tidak ada tesnya".
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { StaticTable } from "@/components/ui/static-table";
import { scopedHref } from "@/components/ui/app-link";
import {
  qtyColumn,
  textColumn,
  type SaiColumn,
  type SaiColumns,
} from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { statusColumn } from "@/components/ui/status-column";
import {
  nextSort,
  parseSort,
  sortHref,
  sortOrderBy,
  sortableKeys,
  type SortSpec,
} from "@/lib/table-sort";

type Row = { doc: string; amount: number };

const rows: Row[] = [
  { doc: "INV-1", amount: 9000 },
  { doc: "INV-2", amount: 10000 },
];

const rowKey = (r: Row) => r.doc;

const render = (columns: SaiColumns<Row>, sort?: Parameters<typeof StaticTable<Row>>[0]["sort"]) =>
  renderToStaticMarkup(
    <StaticTable<Row> columns={columns} rows={rows} rowKey={rowKey} sort={sort} />
  );

const head = (html: string) => html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));

/* ────────── SETIAP bentuk `sorter` yang bisa ditulis di repo ini ────────── */

/**
 * Daftar ini adalah penjaganya. Menambah pembantu kolom baru tanpa menambah
 * barisnya di sini berarti bentuk itu tidak pernah diuji — dan bentuk yang
 * tidak diuji adalah persis bagaimana `sorter` bisa mati diam-diam.
 */
const BENTUK_SORTER: { nama: string; kolom: () => SaiColumn<Row> }[] = [
  {
    nama: "objek kolom polos, sorter: true",
    kolom: () => ({ key: "doc", dataIndex: "doc", title: "Dokumen", sorter: true }),
  },
  {
    nama: "objek kolom polos, sorter sebuah pembanding",
    kolom: () => ({
      key: "doc",
      dataIndex: "doc",
      title: "Dokumen",
      sorter: (a: Row, b: Row) => a.doc.localeCompare(b.doc),
    }),
  },
  {
    nama: "textColumn",
    kolom: () => textColumn<Row>({ dataIndex: "doc", title: "Dokumen", sorter: true }),
  },
  {
    nama: "qtyColumn",
    kolom: () => qtyColumn<Row>({ dataIndex: "amount", key: "doc", title: "Qty", sorter: true }),
  },
  {
    nama: "moneyColumn",
    kolom: () => moneyColumn<Row>({ dataIndex: "amount", key: "doc", title: "Nilai", sorter: true }),
  },
  {
    nama: "statusColumn",
    kolom: () => statusColumn<Row>({ dataIndex: "doc", title: "Status", sorter: true }),
  },
];

const KONTEKS = { basePath: "/documents", keys: ["doc"], params: {} } as const;

describe("StaticTable tidak boleh mengabaikan `sorter` diam-diam", () => {
  it.each(BENTUK_SORTER)("$nama merender kendali sortir", ({ kolom }) => {
    const html = render([kolom()], KONTEKS);
    const judul = head(html);
    // Kendalinya TAUTAN sungguhan — bukan tombol, bukan teks polos: ia menuju
    // ke sebuah alamat, dan itu yang membuat klik tengah, Ctrl-klik, dan
    // "salin alamat tautan" bekerja tanpa satu baris JavaScript.
    expect(judul).toContain('data-slot="table-sort"');
    expect(judul).toMatch(/<a[^>]+href="\/documents\?sort=doc&amp;dir=asc"/);
  });

  it.each(BENTUK_SORTER)("$nama MELEMPAR tanpa konteks sort", ({ kolom }) => {
    // Inilah yang menggantikan diam. Sebuah kendali yang tidak bisa merakit
    // URL-nya adalah prop mati yang sama seperti sebelum #265 — hanya lebih
    // meyakinkan, karena kali ini ia bisa diklik.
    expect(() => render([kolom()])).toThrow(/kolom "doc" menyatakan [\s\S]*tidak diberi prop/);
  });

  it.each(BENTUK_SORTER)("$nama MELEMPAR bila kuncinya tak dikenal kueri", ({ kolom }) => {
    // Kolom yang menyatakan `sorter` tapi tidak ada di `sort.keys` akan
    // memasang tautan yang disaring habis `parseSort`: kendali yang bisa
    // diklik dan tidak mengurutkan apa pun.
    expect(() => render([kolom()], { basePath: "/documents", keys: ["lain"] })).toThrow(
      /kolom "doc" menyatakan [\s\S]*tidak ada di [\s\S]*sort\.keys/
    );
  });

  it("kolom TANPA `sorter` tetap judul polos — tidak ada kendali yang menyelinap", () => {
    // Sisi sebaliknya: penjaga di atas akan tetap hijau kalau perendernya
    // memasang tautan pada SEMUA judul, dan itu bukan yang diminta.
    const html = render([textColumn<Row>({ dataIndex: "doc", title: "Dokumen" })], KONTEKS);
    expect(head(html)).not.toContain('data-slot="table-sort"');
    expect(head(html)).toContain("Dokumen");
  });

  it("pembantu kolom uang & kuantitas tidak lagi menyalakan sortir sendiri", () => {
    // Asal-usul issue #265: bawaan yang menyala di lapisan yang tidak tahu
    // apakah kolomnya punya `orderBy`.
    const html = render([
      moneyColumn<Row>({ dataIndex: "amount", title: "Nilai" }),
      qtyColumn<Row>({ dataIndex: "amount", key: "qty", title: "Qty" }),
    ]);
    expect(head(html)).not.toContain('data-slot="table-sort"');
  });
});

/* ───────────────────────────── aria-sort ───────────────────────────────── */

describe("aria-sort pada <th>", () => {
  const kolom: SaiColumns<Row> = [
    { key: "doc", dataIndex: "doc", title: "Dokumen", sorter: true },
    { key: "amount", dataIndex: "amount", title: "Nilai" },
  ];
  const keys = ["doc"];

  it("kolom aktif menyebut ARAHnya, bukan hanya 'terurut'", () => {
    // Tanpa ini pembaca layar tidak tahu tabelnya terurut, apalagi ke arah
    // mana — dan arah adalah separuh informasinya di kolom uang.
    const naik = head(render(kolom, { basePath: "/x", keys, active: { key: "doc", dir: "asc" } }));
    expect(naik).toContain('aria-sort="ascending"');
    const turun = head(render(kolom, { basePath: "/x", keys, active: { key: "doc", dir: "desc" } }));
    expect(turun).toContain('aria-sort="descending"');
  });

  it("kolom yang bisa diurutkan tapi belum aktif menyebut `none`", () => {
    // `none` bukan basa-basi: ia yang mengumumkan bahwa kolomnya PUNYA sortir.
    expect(head(render(kolom, { basePath: "/x", keys }))).toContain('aria-sort="none"');
  });

  it("kolom yang tidak bisa diurutkan tidak membawa aria-sort sama sekali", () => {
    // Menurut ARIA, `aria-sort` hanya berlaku pada header yang MEMANG bisa
    // diurutkan; memasangnya di semua kolom mengumumkan sortir yang tidak ada.
    const sel = head(render(kolom, { basePath: "/x", keys })).split("<th");
    const nilai = sel.find((s) => s.includes("Nilai"));
    expect(nilai).toBeDefined();
    expect(nilai).not.toContain("aria-sort");
    // …dan tesnya memang membelah selnya dengan benar: yang lain membawanya.
    expect(sel.find((s) => s.includes("Dokumen"))).toContain("aria-sort");
  });
});

/* ───────────────────────── URL: apa yang dipertahankan ─────────────────── */

describe("tautan sortir", () => {
  const params = { status: "pending", search: "acme", page: "3" };

  it("mempertahankan SELURUH parameter yang sedang berlaku", () => {
    // Saringan yang hilang karena pengguna menyortir adalah kerugian diam:
    // tabelnya tetap tampil, hanya isinya yang bukan lagi yang diminta.
    const href = sortHref("/invoices", params, { key: "date", dir: "asc" });
    expect(href).toContain("status=pending");
    expect(href).toContain("search=acme");
    expect(href).toContain("page=3");
    expect(href).toContain("sort=date");
    expect(href).toContain("dir=asc");
  });

  it("mengganti `sort`/`dir` lama, tidak menggandakannya", () => {
    const href = sortHref(
      "/invoices",
      { ...params, sort: "invoiceNo", dir: "desc" },
      { key: "date", dir: "asc" }
    );
    expect(href).not.toContain("sort=invoiceNo");
    expect(href.match(/sort=/g)).toHaveLength(1);
    expect(href.match(/dir=/g)).toHaveLength(1);
  });

  it("keadaan ketiga MENGHAPUS sortir, bukan menuliskannya sebagai urutan lain", () => {
    // asc → desc → urutan bawaan halaman. Tanpa keadaan ketiga, satu-satunya
    // jalan kembali ke urutan bawaan adalah mengedit URL sendiri.
    expect(nextSort("date", null)).toEqual({ key: "date", dir: "asc" });
    expect(nextSort("date", { key: "date", dir: "asc" })).toEqual({ key: "date", dir: "desc" });
    expect(nextSort("date", { key: "date", dir: "desc" })).toBeNull();
    // Berpindah kolom selalu mulai dari menaik — sama seperti AntD `Table`,
    // supaya sebuah kolom berperilaku sama di kedua perender.
    expect(nextSort("total", { key: "date", dir: "desc" })).toEqual({ key: "total", dir: "asc" });

    const href = sortHref("/invoices", { ...params, sort: "date", dir: "desc" }, null);
    expect(href).not.toContain("sort=");
    expect(href).not.toContain("dir=");
    expect(href).toContain("status=pending");
  });

  it("tidak keluar dari cakupan tenant/perusahaan", () => {
    /*
     * Tautan sortir dirakit sebagai jalur LAMA (`/documents?…`) dan dipetakan
     * ke jalur kanonik oleh `Link`, lewat fungsi yang sama yang dipakai 114
     * tautan lain. Diuji di sini lewat fungsi murninya, karena di dalam SSR
     * `usePathname()` tidak punya alamat untuk dibaca.
     */
    const href = sortHref("/documents", { page: "2" }, { key: "filename", dir: "asc" });
    expect(scopedHref(href, "/t/acme/pt-maju/documents")).toBe(
      "/t/acme/pt-maju/documents?page=2&sort=filename&dir=asc"
    );
  });

  it("tanpa parameter lain, tautannya tetap bersih", () => {
    expect(sortHref("/customers", undefined, { key: "name", dir: "asc" })).toBe(
      "/customers?sort=name&dir=asc"
    );
    expect(sortHref("/customers", undefined, null)).toBe("/customers");
  });
});

/* ──────────────── Membaca URL & membangun `orderBy` Prisma ─────────────── */

/** Bentuk yang sama persis dengan yang dipakai halaman Rekonsiliasi Bank. */
// `| undefined` supaya bentuk `[{ periodEnd: dir }, { id: dir }]` — dua objek
// dengan kunci BERBEDA — tetap cocok dengan satu tipe elemen, seperti yang
// dilakukan `…OrderByWithRelationInput` Prisma pada halaman sungguhan.
type OrderBy = Record<string, "asc" | "desc" | undefined>[];
const SPEC: SortSpec<OrderBy> = {
  period: (dir) => [{ periodEnd: dir }, { id: dir }],
  opening: (dir) => [{ openingBalance: dir }, { id: dir }],
};

describe("parseSort / sortOrderBy", () => {
  it("mengurutkan UANG di sisi basis data, sebagai kolom Decimal", () => {
    /*
     * Ini alasan sortirnya dijalankan kueri dan bukan di baris yang sudah
     * diformat: `opening_balance` adalah `Decimal(15,2)`, jadi basis data
     * membandingkannya sebagai ANGKA. Diurutkan sebagai teks hasil format,
     * "Rp 1.000" mendarat sebelum "Rp 9" dan daftar saldo terbesar jadi salah
     * tanpa satu pun tanda di layar.
     */
    const aktif = parseSort({ sort: "opening", dir: "desc" }, SPEC);
    expect(aktif).toEqual({ key: "opening", dir: "desc" });
    expect(sortOrderBy(aktif, SPEC, [{ id: "desc" }])).toEqual([
      { openingBalance: "desc" },
      { id: "desc" },
    ]);
  });

  it("pemutus seri ikut membalik arah", () => {
    // Tanpa urutan TOTAL, baris bisa berpindah halaman antar permintaan dan
    // paginasi tampak "loncat".
    expect(sortOrderBy(parseSort({ sort: "period", dir: "asc" }, SPEC), SPEC, [])).toEqual([
      { periodEnd: "asc" },
      { id: "asc" },
    ]);
  });

  it("tanpa `?sort=` urutan bawaan halaman dipakai APA ADANYA", () => {
    // Yang membuat pemasangan sortir tidak mengubah tampilan bawaan satu
    // halaman pun — penting di aplikasi yang sudah berjalan di produksi.
    const bawaan = [{ periodEnd: "desc" as const }, { id: "desc" as const }];
    expect(sortOrderBy(parseSort({}, SPEC), SPEC, bawaan)).toBe(bawaan);
    expect(sortOrderBy(parseSort(undefined, SPEC), SPEC, bawaan)).toBe(bawaan);
  });

  it("kunci di luar daftar putih diabaikan, bukan diteruskan ke Prisma", () => {
    // URL editan tangan (atau tautan lama setelah sebuah kolom dihapus) harus
    // mendarat pada urutan bawaan, bukan pada layar 500 — dan tidak boleh
    // menitipkan nama kolom apa pun ke kueri.
    expect(parseSort({ sort: "password" }, SPEC)).toBeNull();
    expect(parseSort({ sort: "constructor" }, SPEC)).toBeNull();
    expect(parseSort({ sort: "__proto__" }, SPEC)).toBeNull();
    expect(parseSort({ sort: "toString" }, SPEC)).toBeNull();
  });

  it("arah yang tidak dikenal jatuh ke menaik, bukan melempar", () => {
    expect(parseSort({ sort: "period", dir: "MENURUN" }, SPEC)).toEqual({
      key: "period",
      dir: "asc",
    });
  });

  it("`sortableKeys` adalah daftar yang sama dengan yang punya orderBy", () => {
    // Satu sumber kebenaran: kunci yang boleh muncul di URL, kunci yang boleh
    // dinyatakan kolom, dan kunci yang punya `orderBy` tidak bisa menyimpang.
    expect(sortableKeys(SPEC)).toEqual(["period", "opening"]);
  });
});
