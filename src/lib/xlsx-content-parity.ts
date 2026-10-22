/**
 * PARITAS ISI LEMBAR SEBAR — TypeScript ⇄ Go (tahap 1d).
 *
 * Lembar sebar laporan ber-`engine: "go"` (`src/lib/report-engine.ts`)
 * dihasilkan penulis XLSX Go (`services/integrator/internal/document`), bukan
 * ExcelJS. Byte-identik MUSTAHIL — dua penulis ZIP/XML tidak pernah sepakat
 * tentang urutan atribut, kompresi, atau tabel gaya — dan bukan tujuannya.
 * Yang disepakati ISI, didefinisikan DI SINI, dan dibaca dengan SATU pembaca
 * (ExcelJS) untuk kedua berkas:
 *
 *   • pembuat buku kerja (`creator` — nama perusahaan), jumlah & NAMA lembar;
 *   • lebar setiap kolom yang terisi;
 *   • jumlah baris, dan untuk SETIAP sel: nilai beserta TIPE-nya (teks tetap
 *     teks, angka tetap angka — angka dibandingkan pada ketelitian SEN, sebab
 *     TS menjumlahkan float dan Go sen int64, aturan yang sama dengan
 *     `trial-balance-parity.ts`);
 *   • untuk sel BERNILAI: format angka, tebal, ukuran & warna huruf, warna isi,
 *     dan perataan horizontal.
 *
 * Yang SENGAJA tidak dibandingkan: waktu cetak di baris "Dicetak: …" (dua
 * berkas dicetak pada detik yang berbeda — yang dibandingkan BENTUKNYA, lewat
 * pola yang disusun dari `sheetPrintedLine` sendiri), gaya sel KOSONG (tak
 * terlihat dan tak terjumlah), dan apa pun di luar daftar di atas.
 */
import ExcelJS from "exceljs";

import { sheetPrintedLine } from "@/lib/report-export";

/** Pola baris "Dicetak", dari kalimat TS-nya sendiri — bukan salinan. */
const PENANDA = "\u0000";
const POLA_DICETAK = new RegExp(
  "^" +
    sheetPrintedLine(PENANDA)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(PENANDA, String.raw`\d{1,2}/\d{1,2}/\d{4}, \d{2}\.\d{2}\.\d{2}`) +
    "$"
);

/** Nilai sel yang dibandingkan — setelah normalisasi. */
type NilaiSel = { tipe: "kosong" } | { tipe: "teks"; teks: string } | { tipe: "angka"; sen: number };

function nilai(v: ExcelJS.CellValue): NilaiSel {
  if (v === null || v === undefined || v === "") return { tipe: "kosong" };
  if (typeof v === "number") return { tipe: "angka", sen: Math.round(v * 100) };
  if (typeof v === "string") {
    return { tipe: "teks", teks: POLA_DICETAK.test(v) ? "Dicetak: <waktu> · …" : v };
  }
  /* Teks kaya, rumus, tanggal: lembar laporan tidak memakainya. Bila suatu
     hari muncul, ia DIBANDINGKAN sebagai JSON — bukan dilewati diam-diam. */
  return { tipe: "teks", teks: JSON.stringify(v) };
}

function teksNilai(n: NilaiSel): string {
  if (n.tipe === "kosong") return "∅";
  if (n.tipe === "angka") return `${(n.sen / 100).toFixed(2)} (angka)`;
  return JSON.stringify(n.teks);
}

/** Gaya sel yang dibandingkan. Huruf bawaan kedua penulis Calibri 11. */
function gaya(c: ExcelJS.Cell): string {
  const font = c.font ?? {};
  const fill = c.fill as ExcelJS.FillPattern | undefined;
  return JSON.stringify({
    numFmt: c.numFmt || "",
    bold: font.bold === true,
    size: font.size ?? 11,
    color: font.color?.argb ?? "",
    fill: fill?.type === "pattern" && fill.pattern === "solid" ? (fill.fgColor?.argb ?? "") : "",
    align: c.alignment?.horizontal ?? "",
  });
}

async function muat(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

/**
 * Bandingkan ISI dua berkas .xlsx. Kosong = setara; selain itu satu baris
 * per selisih, dengan alamat selnya.
 */
export async function compareWorkbookContent(
  ts: Uint8Array,
  go: Uint8Array
): Promise<string[]> {
  const [a, b] = await Promise.all([muat(ts), muat(go)]);
  const beda: string[] = [];

  if ((a.creator ?? "") !== (b.creator ?? "")) {
    beda.push(`pembuat: TS ${JSON.stringify(a.creator)} ≠ Go ${JSON.stringify(b.creator)}`);
  }
  if (a.worksheets.length !== b.worksheets.length) {
    beda.push(`jumlah lembar: TS ${a.worksheets.length} ≠ Go ${b.worksheets.length}`);
    return beda;
  }

  a.worksheets.forEach((wa, i) => {
    const wb = b.worksheets[i]!;
    const lembar = `lembar ${i + 1}`;
    if (wa.name !== wb.name) beda.push(`${lembar}: nama TS ${JSON.stringify(wa.name)} ≠ Go ${JSON.stringify(wb.name)}`);
    if (wa.rowCount !== wb.rowCount) beda.push(`${lembar}: jumlah baris TS ${wa.rowCount} ≠ Go ${wb.rowCount}`);

    const kolom = Math.max(wa.columnCount, wb.columnCount);
    for (let k = 1; k <= kolom; k += 1) {
      const la = wa.getColumn(k).width;
      const lb = wb.getColumn(k).width;
      if (la !== lb) beda.push(`${lembar}: lebar kolom ${k} TS ${String(la)} ≠ Go ${String(lb)}`);
    }

    const baris = Math.max(wa.rowCount, wb.rowCount);
    for (let r = 1; r <= baris; r += 1) {
      for (let k = 1; k <= kolom; k += 1) {
        const ca = wa.getRow(r).getCell(k);
        const cb = wb.getRow(r).getCell(k);
        const na = nilai(ca.value);
        const nb = nilai(cb.value);
        const alamat = `${lembar} ${ca.address}`;
        if (JSON.stringify(na) !== JSON.stringify(nb)) {
          beda.push(`${alamat}: TS ${teksNilai(na)} ≠ Go ${teksNilai(nb)}`);
          continue;
        }
        if (na.tipe === "kosong") continue;
        const ga = gaya(ca);
        const gb = gaya(cb);
        if (ga !== gb) beda.push(`${alamat}: gaya TS ${ga} ≠ Go ${gb}`);
      }
    }
  });
  return beda;
}
