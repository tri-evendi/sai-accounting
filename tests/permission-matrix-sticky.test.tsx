/**
 * Header lengket matriks izin (issue #199, fase C7).
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
 *      milik primitif `Table` (`overflow-x-auto`, tinggi mengikuti isi) adalah
 *      scroll container yang tidak pernah menggulung vertikal — jadi tanpa
 *      `matrixScrollBox` + `max-height`, mata pertama menempel pada sesuatu
 *      yang ikut naik bersama halaman.
 *   4. **Kedua matriks benar-benar memakainya.** Helper yang benar tapi tidak
 *      dipanggil adalah helper yang tidak menempelkan apa pun; mata ini dibaca
 *      dari sumber kedua berkas matriks, bukan dari ingatan.
 *
 * Yang tersisa di luar jangkauan: apakah 70vh terasa pas di layar 1366px, dan
 * apakah bayangan bawahnya cukup terlihat. Itu bagian sapuan dua tema #205.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { theme } from "antd";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MATRIX_MAX_HEIGHT,
  matrixScrollBox,
  stickyHead,
} from "@/app/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/matrix-sticky";

const token = theme.getDesignToken();

const MATRIX_FILES = [
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/permissions-client.tsx",
  "src/app/(dashboard)/t/[tenantSlug]/[companySlug]/users/user-permissions-panel.tsx",
];

function source(relative: string) {
  return readFileSync(join(__dirname, "..", relative), "utf8");
}

describe("matriks izin — header tetap terbaca saat digulir", () => {
  it("sel judul menempel di puncak kotaknya", () => {
    const style = stickyHead(token);
    expect(style.position).toBe("sticky");
    expect(style.top).toBe(0);
    // Di atas isi tabel; tanpa ini sel yang lewat menutupi judulnya.
    expect(Number(style.zIndex)).toBeGreaterThan(0);
  });

  it("sel judul berlatar PEKAT, bukan tembus pandang", () => {
    const style = stickyHead(token);
    expect(style.background).toBe(token.colorBgContainer);
    // `colorBgContainer` bukan warna beralfa di kedua algoritma AntD — kalau
    // suatu saat ia menjadi `rgba(...)`, baris yang lewat akan terbaca
    // menembusnya dan tes ini yang lebih dulu berteriak.
    expect(String(style.background)).not.toContain("rgba");
  });

  it("kotak matriks bertinggi terbatas dan menyusun ulang pembungkus gesernya", () => {
    const box = matrixScrollBox(token);
    /*
     * Inilah mata rantai yang paling mudah hilang saat seseorang "merapikan"
     * gaya: tanpa flex-column ber-`max-height`, pembungkus `overflow-x-auto`
     * milik primitif tetap setinggi isinya dan tidak pernah menggulung
     * vertikal — dan `top: 0` di atas menempel pada sesuatu yang ikut naik
     * bersama halaman.
     */
    expect(box.display).toBe("flex");
    expect(box.flexDirection).toBe("column");
    expect(MATRIX_MAX_HEIGHT).toMatch(/vh$/);
  });

  it("pembungkus geser primitif memang scroll container (dan karena itu perlu dibatasi)", () => {
    // Dibaca dari primitifnya sendiri, bukan diasumsikan: kalau `table.tsx`
    // kelak berhenti membungkus tabelnya dengan `overflow-x-auto`, seluruh
    // alasan `matrixScrollBox` ada ikut berubah — dan itu harus terbaca di sini
    // lebih dulu, bukan di layar sebagai header yang tiba-tiba lengket ganda.
    expect(source("src/components/ui/table.tsx")).toContain("overflow-x-auto");
  });

  it("gaya lengketnya benar-benar mendarat di setiap <th> yang dirender", () => {
    const markup = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={stickyHead(token)}>Izin</TableHead>
            <TableHead style={{ ...stickyHead(token), textAlign: "center" }}>
              Direktur Utama
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    const headStyles = [...markup.matchAll(/<th[^>]*style="([^"]*)"/g)].map((m) => m[1]);
    expect(headStyles).toHaveLength(2);
    for (const style of headStyles) {
      expect(style).toContain("position:sticky");
      expect(style).toContain("top:0");
    }
    // Perataan kolom peran tidak boleh hilang tertimpa gaya lengketnya.
    expect(headStyles[1]).toContain("text-align:center");
  });

  it("kedua matriks memakai kedua bagiannya, bukan salah satu saja", () => {
    for (const file of MATRIX_FILES) {
      const code = source(file);
      expect(code, `${file} tidak memakai matrixScrollBox`).toContain("matrixScrollBox(token)");
      expect(code, `${file} tidak membatasi tingginya`).toContain("MATRIX_MAX_HEIGHT");
      expect(code, `${file} tidak melengketkan judul kolomnya`).toContain("stickyHead(token)");
    }
  });

  it("tidak ada <th> tanpa gaya lengket di kedua matriks", () => {
    for (const file of MATRIX_FILES) {
      const code = source(file);
      const heads = [...code.matchAll(/<TableHead\b([^>]*)>/g)].map((m) => m[1]);
      expect(heads.length, `${file} tidak punya baris judul`).toBeGreaterThan(0);
      for (const attrs of heads) {
        expect(attrs, `<TableHead${attrs}> di ${file} tidak lengket`).toContain(
          "stickyHead(token)"
        );
      }
    }
  });
});
