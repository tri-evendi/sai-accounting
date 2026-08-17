/**
 * Header lengket matriks izin (issue #199, fase C7 — dipindah ke PRIMITIFNYA
 * di issue #229).
 *
 * ── Apa yang berubah, dan kenapa tesnya tetap ada ─────────────────────────
 * Mekanismenya dulu dirakit di sisi pemanggil (`permissions/matrix-sticky.ts`)
 * karena `src/components/ui` berada di luar lingkup #199. Berkas itu kini
 * DIHAPUS: `<Table maxHeight>` + `<TableHead sticky>` adalah prop primitifnya
 * sendiri, jadi permukaan lain yang butuh header lengket tidak perlu
 * menemukannya ulang.
 *
 * Yang TIDAK berubah adalah alasan tes ini ada, jadi ia diarahkan ke primitif
 * itu alih-alih dihapus bersama berkasnya.
 *
 * ── Apa yang benar-benar dibuktikan berkas ini, dan apa yang TIDAK ─────────
 * Suite ini berjalan di `environment: "node"`: **tidak ada tata letak, jadi
 * tidak ada yang benar-benar menggulung di sini.** Yang bisa dibuktikan tanpa
 * peramban adalah RANTAI SEBAB yang membuat header itu menempel — dan rantainya
 * punya empat mata yang masing-masing bisa putus sendiri-sendiri, diam-diam:
 *
 *   1. **Sel judulnya `position: sticky` dengan `top: 0`.** Ini satu-satunya
 *      mata yang biasanya ditulis orang, dan sendirian ia tidak melakukan
 *      apa-apa (lihat mata ke-3).
 *   2. **Latar sel judulnya PEKAT.** Sticky tanpa latar berarti baris yang
 *      lewat di belakangnya terbaca menembus judul kolom — regresi yang
 *      terlihat persis seperti kerusakan render.
 *   3. **Ada kotak bertinggi terbatas yang MENGGULUNG.** `position: sticky`
 *      dihitung terhadap ancestor scroll container terdekat. Pembungkus geser
 *      milik primitif `Table` (gulungan mendatar, tinggi mengikuti isi) adalah
 *      scroll container yang tidak pernah menggulung vertikal — jadi tanpa
 *      `maxHeight`, mata pertama menempel pada sesuatu yang ikut naik bersama
 *      halaman.
 *   4. **Kedua matriks benar-benar memakainya.** Prop yang benar tapi tidak
 *      dipasang adalah prop yang tidak menempelkan apa pun; mata ini dibaca
 *      dari sumber kedua berkas matriks, bukan dari ingatan.
 *
 * Yang tersisa di luar jangkauan: apakah 70vh terasa pas di layar 1366px, dan
 * apakah bayangan bawahnya cukup terlihat. Itu bagian sapuan dua tema #205.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { theme } from "antd";

import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tableHeadBg } from "@/lib/theme/antd-tokens";

const token = theme.getDesignToken();

/**
 * Latar sel judul lengket = nada kepala tabel (#266), bukan permukaan kartu.
 * Diambil dari fungsi yang sama yang dipakai `AntdProvider`, bukan diketik
 * ulang: kalau nadanya bergeser, markup di bawah ikut bergeser bersamanya.
 */
const HEAD_BG = tableHeadBg("light");

const MATRIX_FILES = [
  "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/permissions-client.tsx",
  "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/users/user-permissions-panel.tsx",
];

function source(relative: string) {
  return readFileSync(join(__dirname, "..", relative), "utf8");
}

/** Markup baris judul lengket di dalam kotak gulung bertinggi terbatas. */
function stickyMarkup() {
  return renderToStaticMarkup(
    <Table
      maxHeight="70vh"
      stickyHeadBackground={HEAD_BG}
      stickyHeadBorderColor={token.colorBorderSecondary}
    >
      <TableHeader>
        <TableRow>
          <TableHead sticky>Izin</TableHead>
          <TableHead sticky style={{ textAlign: "center" }}>
            Direktur Utama
          </TableHead>
        </TableRow>
      </TableHeader>
    </Table>
  );
}

describe("matriks izin — header tetap terbaca saat digulir", () => {
  it("sel judul menempel di puncak kotaknya", () => {
    const headStyles = [...stickyMarkup().matchAll(/<th[^>]*style="([^"]*)"/g)].map((m) => m[1]);
    expect(headStyles).toHaveLength(2);
    for (const style of headStyles) {
      expect(style).toContain("position:sticky");
      expect(style).toContain("top:0");
      // Di atas isi tabel; tanpa ini sel yang lewat menutupi judulnya.
      expect(style).toContain("z-index:1");
    }
    // Perataan kolom peran tidak boleh hilang tertimpa gaya lengketnya.
    expect(headStyles[1]).toContain("text-align:center");
  });

  it("sel judul berlatar PEKAT, bukan tembus pandang", () => {
    const markup = stickyMarkup();
    /*
     * Warnanya disalurkan lewat properti kustom CSS — satu-satunya nilai yang
     * DIWARISI dari pembungkus ke `<th>` di dalamnya, dan karena itu
     * satu-satunya cara `table.tsx` (server-safe, tanpa hook) bisa memakai
     * token AntD sama sekali.
     */
    expect(markup).toContain(`--sai-table-head-bg:${HEAD_BG}`);
    expect(markup).toContain("background:var(--sai-table-head-bg");
    // Nada kepala bukan warna beralfa di kedua tema — kalau suatu saat ia
    // menjadi `rgba(...)`, baris yang lewat akan terbaca menembusnya dan tes
    // ini yang lebih dulu berteriak.
    expect(HEAD_BG).not.toContain("rgba");
  });

  it("sel judul BIASA memakai latar yang sama — kepala tak berganti warna saat menempel", () => {
    /*
     * Jebakan #266 yang paling mudah lolos: nada dipasang di jalur biasa,
     * bawaan jalur LENGKET dibiarkan `colorBgContainer`, dan kepalanya menjadi
     * putih persis saat ia menempel. Yang membuktikan keduanya sepakat bukan
     * dua nilai yang kebetulan sama, melainkan SATU properti kustom yang sama
     * dengan SATU cadangan yang sama.
     */
    const plain = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Izin</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
    const fallback = "background:var(--sai-table-head-bg, var(--ant-color-table-head-bg))";
    expect(plain).toContain(fallback);
    /*
     * Dan jalur LENGKETnya menghasilkan deklarasi yang sama persis — dibaca
     * dari gaya `<th>` yang benar-benar dirender, bukan dari sumbernya: sebuah
     * latar kedua yang ditulis sesudahnya akan menang tanpa satu pun galat.
     */
    const stickyHeadStyle = /<th[^>]*style="([^"]*)"/.exec(stickyMarkup())?.[1] ?? "";
    expect(stickyHeadStyle).toContain(fallback);
    expect(stickyHeadStyle).not.toContain("bg-container");
  });

  it("garis pemisah judul–isi ikut menempel", () => {
    // `boxShadow`, bukan `border-bottom`: batas milik BARIS judul menggulung
    // bersama tabelnya, sehingga garisnya hilang persis saat paling dibutuhkan.
    expect(stickyMarkup()).toContain("box-shadow:inset 0 -1px 0 var(--sai-table-head-line");
  });

  it("kotak matriks bertinggi terbatas — dan itu pembungkus geser primitifnya sendiri", () => {
    /*
     * Inilah mata rantai yang paling mudah hilang saat seseorang "merapikan"
     * gaya: tanpa `max-height`, pembungkus `overflow-x-auto` milik primitif
     * tetap setinggi isinya dan tidak pernah menggulung vertikal — dan
     * `top: 0` di atas menempel pada sesuatu yang ikut naik bersama halaman.
     *
     * Sejak #229 keduanya satu kotak yang sama, jadi keduanya dibaca dari satu
     * markup: kalau `table.tsx` kelak berhenti membungkus tabelnya dengan
     * gulungan mendatar, seluruh alasan `maxHeight` ada ikut berubah.
     *
     * Sejak #203 gayanya sebaris, bukan kelas `overflow-x-auto`.
     */
    const markup = stickyMarkup();
    expect(markup).toContain("overflow-x:auto");
    expect(markup).toContain("max-height:70vh");
    expect(source("src/components/ui/table.tsx")).toContain('overflowX: "auto"');
  });

  it("tanpa `sticky`, sel judul tidak membawa gaya lengket sama sekali", () => {
    // Prop yang menyala diam-diam untuk semua tabel akan membuat 18 pemakai
    // `StaticTable` mendapat header berlatar pekat yang tidak mereka minta.
    const markup = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Izin</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
    expect(markup).not.toContain("position:sticky");
    expect(markup).not.toContain("max-height");
  });

  it("kedua matriks memakai kedua bagiannya, bukan salah satu saja", () => {
    for (const file of MATRIX_FILES) {
      const code = source(file);
      expect(code, `${file} tidak membatasi tingginya`).toContain("maxHeight={MATRIX_MAX_HEIGHT}");
      expect(code, `${file} tidak mengirim latar sel judulnya`).toContain(
        "stickyHeadBackground={token.colorTableHeadBg}"
      );
      expect(code, `${file} tidak melengketkan judul kolomnya`).toMatch(/<TableHead\s+sticky/);
    }
  });

  it("tidak ada <th> tanpa gaya lengket di kedua matriks", () => {
    for (const file of MATRIX_FILES) {
      const code = source(file);
      const heads = [...code.matchAll(/<TableHead\b([^>]*)>/g)].map((m) => m[1]);
      expect(heads.length, `${file} tidak punya baris judul`).toBeGreaterThan(0);
      for (const attrs of heads) {
        expect(attrs, `<TableHead${attrs}> di ${file} tidak lengket`).toContain("sticky");
      }
    }
  });

  it("berkas rakitan sementara #199 benar-benar hilang", () => {
    // Kalau ia hidup lagi, ada dua sumber kebenaran untuk satu perilaku — dan
    // yang kalah selalu yang tidak terlihat di kode.
    expect(
      existsSync(
        join(
          __dirname,
          "..",
          "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/matrix-sticky.ts"
        )
      ),
      "matrix-sticky.ts hidup lagi"
    ).toBe(false);

    /*
     * Yang dilarang adalah MEMAKAINYA, bukan menyebutnya: kedua berkas matriks
     * menjelaskan di komentarnya kenapa rakitan itu dihapus, dan larangan
     * berupa pencarian substring akan menghapus penjelasan itu — mengubah tes
     * ini menjadi alasan untuk melupakan sejarahnya.
     */
    for (const file of MATRIX_FILES) {
      expect(source(file), `${file} masih mengimpor matrix-sticky`).not.toMatch(
        /^\s*import[^;]*matrix-sticky/m
      );
    }
  });
});
