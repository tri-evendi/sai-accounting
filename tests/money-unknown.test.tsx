/**
 * "Nilai tak diketahui ditulis kosong atau '—', TAK PERNAH 0" (MASTER.md,
 * ditegakkan di komponen pada issue #186).
 *
 * Ini bukan aturan kosmetik. Nol menyatakan **tidak ada nilai**; itu pernyataan
 * yang berbeda dari **nilainya belum diketahui**, dan hanya yang pertama boleh
 * ikut dijumlahkan. Aturannya lahir dari bug nyata: dokumen valas tanpa kurs
 * dan barang tanpa dasar biaya muncul sebagai "Rp 0" di Piutang/Utang, Nilai
 * Persediaan, dan rekap mitra — sehingga totalnya menyusut tanpa satu pun tanda
 * di layar, dan angka yang salah itu terlihat persis seperti angka yang benar.
 *
 * Yang dikunci di sini adalah pintu-pintunya, bukan halamannya: `Money`,
 * `MoneyCell`, `moneyColumn` (jalur seluruh `DataTable`), dan sisi isian
 * `MoneyInput`. Selama keempatnya menolak memalsukan nol, halaman tidak bisa
 * membuat bug ini dengan tidak sengaja.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Money, MoneyCell, UNKNOWN } from "@/components/ui/money";
import { DataTable, moneyColumn } from "@/components/ui/data-table";
import { MoneyInput } from "@/components/ui/money-input";

/**
 * Hanya teks yang benar-benar TERBACA, tanpa atribut. Tanpa penyaring ini,
 * "tidak boleh ada nol" akan tersandung pada `rgba(0,0,0,0.65)` di atribut
 * gaya — dan tes yang mengukur hal yang salah lebih buruk daripada tidak ada.
 */
const text = (html: string) => html.replace(/<[^>]*>/g, "");

describe("Money — nilai tak diketahui", () => {
  it("null ditulis '—', bukan 'Rp 0'", () => {
    const html = renderToStaticMarkup(<Money value={null} currency="IDR" />);
    expect(text(html)).toBe(UNKNOWN);
  });

  it("undefined ditulis '—', bukan 'Rp 0'", () => {
    const html = renderToStaticMarkup(<Money value={undefined} currency="IDR" />);
    expect(text(html)).toBe(UNKNOWN);
  });

  it("NaN (hasil bagi/parse yang gagal) juga tak diketahui, bukan nol", () => {
    const html = renderToStaticMarkup(<Money value={Number.NaN} currency="IDR" />);
    expect(text(html)).toBe(UNKNOWN);
  });

  it("NOL yang sungguhan tetap ditulis sebagai nol", () => {
    // Sisi lain dari aturan yang sama, dan yang membuatnya bermakna: kalau "—"
    // dan "Rp 0" tertukar, saldo yang benar-benar nol jadi tak terbaca.
    const html = renderToStaticMarkup(<Money value={0} currency="IDR" />);
    expect(text(html)).toContain("0");
    expect(text(html)).not.toContain(UNKNOWN);
  });

  it("ditandai untuk mesin, bukan hanya untuk mata", () => {
    // Ekspor & uji lanjutan butuh cara membedakan "—" dari teks lain.
    expect(renderToStaticMarkup(<Money value={null} />)).toContain('data-unknown="true"');
    expect(renderToStaticMarkup(<Money value={0} />)).not.toContain("data-unknown");
  });

  it("tidak diwarnai seolah uang keluar", () => {
    // "—" merah akan terbaca sebagai kerugian; ia bukan nilai apa pun.
    const html = renderToStaticMarkup(<Money value={null} />);
    const negative = renderToStaticMarkup(<Money value={-1} />);
    const color = /color:([^";]+)/.exec(html)?.[1];
    const negativeColor = /color:([^";]+)/.exec(negative)?.[1];
    expect(color).toBeDefined();
    expect(color).not.toBe(negativeColor);
  });
});

describe("MoneyCell — nilai tak diketahui", () => {
  it("sel kosong tetap rata kanan dan tetap '—'", () => {
    const html = renderToStaticMarkup(<MoneyCell value={null} />);
    expect(text(html)).toBe(UNKNOWN);
    expect(html).toContain("text-align:right");
  });
});

type Row = { doc: string; amount: number | null };

describe("moneyColumn — nilai tak diketahui", () => {
  const columns = [
    { accessorKey: "doc" as const, header: "Dokumen" },
    moneyColumn<Row>({ accessorKey: "amount", header: "Nilai" }),
  ];

  it("baris tanpa nilai tidak berubah jadi Rp 0 di dalam tabel", () => {
    // Regresi yang dijaga: `Number(getValue() ?? 0)` di dalam moneyColumn dulu
    // mengubah setiap nilai kosong jadi nol di SELURUH tabel yang memakainya —
    // dari dalam primitif, jadi tak terlihat dari halamannya.
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[{ doc: "INV-9", amount: null }]} />
    );
    expect(html).toContain("INV-9");
    expect(html).toContain(UNKNOWN);
    expect(text(html)).not.toMatch(/Rp\s*0/);
  });

  it("nilai yang ada tetap terformat seperti biasa", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[{ doc: "INV-1", amount: 1234567 }]} />
    );
    expect(html).toContain("1.234.567");
    expect(html).not.toContain(UNKNOWN);
  });
});

describe("MoneyInput — sisi isian dari aturan yang sama", () => {
  it("belum diisi tampil kosong, bukan 0", () => {
    const html = renderToStaticMarkup(<MoneyInput value={undefined} onChange={() => {}} />);
    expect(html).toMatch(/value=""/);
  });

  it("nol yang diisi pengguna tetap tampil sebagai 0", () => {
    const html = renderToStaticMarkup(<MoneyInput value={0} onChange={() => {}} />);
    expect(html).toMatch(/value="0"/);
  });
});
