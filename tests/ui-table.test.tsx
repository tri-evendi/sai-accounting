/**
 * Invarian tabel & sel nominal (issue #52).
 *
 * Yang dikunci: tabel lebar tidak boleh membuat SELURUH halaman menggulung
 * mendatar di layar 375px, dan sel uang harus selalu membawa aturan MASTER.md
 * (rata kanan, tabular-nums, mata uang eksplisit, negatif merah bertanda
 * minus) tanpa bergantung pada setiap halaman mengetiknya ulang.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Money, MoneyCell } from "@/components/ui/money";
import { DataTable, moneyColumn } from "@/components/ui/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

describe("Table", () => {
  it("membungkus dirinya dengan overflow-x-auto", () => {
    // Inilah yang menjaga aturan responsif MASTER.md: yang menggulung adalah
    // kotak tabelnya, bukan halamannya.
    const html = renderToStaticMarkup(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain('data-slot="table-container"');
  });

  it("memakai struktur semantik thead/tbody", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kolom</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>isi</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<th");
  });
});

describe("Money", () => {
  it("nominal positif: tabular-nums, mata uang eksplisit, tidak merah", () => {
    const html = renderToStaticMarkup(<Money value={1234567} currency="IDR" />);
    expect(html).toContain("tabular-nums");
    expect(html).toContain("Rp");
    expect(html).toContain("1.234.567");
    expect(html).not.toContain("text-destructive");
  });

  it("nominal negatif: merah DAN bertanda minus", () => {
    // Dua penanda, bukan satu: warna saja dilarang MASTER.md.
    const html = renderToStaticMarkup(<Money value={-50000} currency="IDR" />);
    expect(html).toContain("text-destructive");
    expect(html).toContain("-");
  });

  it("hideCurrency menghilangkan simbol tapi mempertahankan format", () => {
    const html = renderToStaticMarkup(
      <Money value={1234567} currency="IDR" hideCurrency />
    );
    expect(html).not.toContain("Rp");
    expect(html).toContain("1.234.567");
  });
});

describe("MoneyCell", () => {
  it("rata kanan — syarat kolom nominal MASTER.md", () => {
    const html = renderToStaticMarkup(<MoneyCell value={1000} />);
    expect(html).toContain("text-right");
    expect(html).toContain("tabular-nums");
  });
});

type Row = { doc: string; amount: number };

const rows: Row[] = [
  { doc: "INV-1", amount: 9000 },
  { doc: "INV-2", amount: 10000 },
  { doc: "INV-3", amount: -2500 },
];

const columns = [
  { accessorKey: "doc" as const, header: "Dokumen" },
  moneyColumn<Row>({ accessorKey: "amount", header: "Nilai" }),
];

describe("DataTable", () => {
  it("merender setiap baris dan menerapkan aturan uang lewat moneyColumn", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={rows} />);
    expect(html).toContain("INV-1");
    expect(html).toContain("INV-3");
    // Nilai negatif tetap merah walau dirender lewat kolom, bukan manual.
    expect(html).toContain("text-destructive");
    expect(html).toContain("tabular-nums");
  });

  it("kolom nominal rata kanan, termasuk header-nya", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={rows} />);
    expect(html).toContain("text-right");
  });

  it("menampilkan empty state ketika tidak ada baris", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[]} empty={<p>Belum ada data</p>} />
    );
    expect(html).toContain("Belum ada data");
  });

  it("mengurutkan nominal sebagai ANGKA, bukan sebagai teks terformat", () => {
    // Kalau diurutkan sebagai string, "Rp 9.000" akan mendarat di atas
    // "Rp 10.000" dan daftar nilai terbesar jadi salah — kesalahan yang
    // sangat mudah lolos dari mata.
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "amount", desc: true }]}
      />
    );
    const order = ["INV-1", "INV-2", "INV-3"]
      .map((doc) => ({ doc, at: html.indexOf(doc) }))
      .sort((a, b) => a.at - b.at)
      .map((r) => r.doc);
    // 10000 > 9000 > -2500
    expect(order).toEqual(["INV-2", "INV-1", "INV-3"]);
  });

  it("header kolom yang bisa diurutkan mengumumkan arah urutannya", () => {
    // aria-sort adalah satu-satunya cara pembaca layar tahu tabel ini terurut.
    const html = renderToStaticMarkup(<DataTable columns={columns} data={rows} />);
    expect(html).toContain('aria-sort="none"');
  });
});
