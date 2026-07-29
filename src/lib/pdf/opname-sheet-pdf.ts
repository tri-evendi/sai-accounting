/**
 * Lembar hitung fisik (count sheet) untuk stok opname — issue #129.
 *
 * ── Ini SATU-SATUNYA cetakan di app ini yang dipakai SEBELUM datanya ada ────
 * Laporan lain mencetak hasil. Lembar ini dicetak KOSONG, dibawa ke gudang, dan
 * diisi dengan pensil sambil barangnya dihitung — baru sesudah itu angkanya
 * diketik kembali ke formulir. Karena itu ia dirancang untuk ditulisi, bukan
 * untuk dibaca: baris renggang, kolom tulis yang lebar, dan garis tanda tangan
 * di kaki halaman supaya lembarnya sah sebagai berita acara.
 *
 * ── Kenapa jumlah sistem bisa DISEMBUNYIKAN ─────────────────────────────────
 * Menghitung "buta" (tanpa melihat angka sistem) adalah praktik baku opname:
 * begitu penghitung tahu angka yang diharapkan, godaan mencocokkan jauh lebih
 * besar daripada menghitung ulang — dan selisih yang seharusnya ketahuan justru
 * tertutup. Maka bawaannya BUTA, dan menampilkan angka sistem adalah pilihan
 * sadar yang harus dicentang, bukan sebaliknya.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface OpnameSheetItem {
  name: string;
  unit: string | null;
  currentStock: number;
}

const BRAND: [number, number, number] = [30, 64, 175]; // --color-primary #1E40AF

/** Kuantitas id-ID, sampai tiga desimal — sama dengan `formatNumber` di layar. */
function qty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
}

export function generateOpnameSheetPDF(
  items: OpnameSheetItem[],
  company: { name: string; address: string },
  options: { date: string; showSystemQty: boolean }
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.name, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text("Lembar Hitung Fisik Persediaan", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Tanggal hitung: ${options.date}`, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(
    options.showSystemQty
      ? "Jumlah menurut sistem DITAMPILKAN — isi jumlah fisik hasil hitungan Anda."
      : "Hitung buta: jumlah menurut sistem sengaja tidak dicetak. Isi apa adanya.",
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 9;

  const head = ["No", "Barang", "Satuan"];
  if (options.showSystemQty) head.push("Sistem");
  head.push("Jumlah Fisik", "Catatan");

  const body = items.map((it, i) => {
    const row: string[] = [String(i + 1), it.name, it.unit || "-"];
    if (options.showSystemQty) row.push(qty(it.currentStock));
    // Dua kolom terakhir sengaja KOSONG — di sinilah tangan menulis.
    row.push("", "");
    return row;
  });

  const writeCol = options.showSystemQty ? 4 : 3;
  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.length ? body : [["", "Belum ada barang untuk dihitung.", "", ...(options.showSystemQty ? [""] : []), "", ""]],
    styles: { fontSize: 9, cellPadding: { top: 3.2, bottom: 3.2, left: 2, right: 2 } },
    headStyles: { fillColor: BRAND },
    columnStyles: {
      0: { cellWidth: 10, halign: "right" },
      2: { cellWidth: 18 },
      ...(options.showSystemQty ? { 3: { cellWidth: 22, halign: "right" } } : {}),
      // Kolom tulis: lebar tetap dan diberi latar terang supaya terlihat jelas
      // sebagai tempat menulis, bukan kolom yang lupa diisi.
      [writeCol]: { cellWidth: 30, fillColor: [248, 250, 252] },
      [writeCol + 1]: { cellWidth: 38, fillColor: [248, 250, 252] },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let afterY = (doc as any).lastAutoTable.finalY + 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (afterY > pageHeight - 30) {
    doc.addPage();
    afterY = 25;
  }

  // Berita acara: lembar hitung tanpa tanda tangan tidak bisa dipertanggungjawabkan.
  doc.setFontSize(9);
  const colWidth = (pageWidth - 28) / 2;
  const signatories = ["Dihitung oleh", "Diperiksa oleh"];
  signatories.forEach((role, i) => {
    const x = 14 + i * colWidth;
    doc.text(role, x, afterY);
    doc.line(x, afterY + 18, x + colWidth - 12, afterY + 18);
    doc.setFontSize(8);
    doc.text("Nama & tanggal", x, afterY + 23);
    doc.setFontSize(9);
  });

  return doc;
}
