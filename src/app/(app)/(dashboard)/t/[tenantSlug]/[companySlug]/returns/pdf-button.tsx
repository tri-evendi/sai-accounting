"use client";

/**
 * Nota retur (issue #27).
 *
 * Sejak tahap 1c ia hanya meneruskan arah retur, ID, dan nomornya — PDF-nya
 * dirender di SERVER dari baris buku (rancangan §5). Prop yang dulu memuat
 * seluruh muatan retur dicabut: nota retur adalah dokumen yang diberikan ke
 * pelanggan atau pemasok, dan angka di atasnya tidak boleh ditentukan oleh apa
 * yang dikirim peramban.
 *
 * `kind` tetap prop, dan ia yang memilih jenis dokumennya: retur penjualan dan
 * retur pembelian hidup di DUA tabel dan menuntut dua kueri — bukan satu tabel
 * dengan satu kolom arah.
 */
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@sai/core/i18n/client";
import { fetchDocumentPdfBlob } from "@/lib/report-files";

export function ReturnPdfButton({
  kind,
  returnId,
  returnNo,
}: {
  kind: "sales" | "purchase";
  returnId: number;
  returnNo: string;
}) {
  const t = useT();
  return (
    <PdfDocumentButton
      label="PDF"
      title={t("returns.notaTitle", { no: returnNo })}
      filename={`${returnNo}.pdf`}
      generate={() =>
        fetchDocumentPdfBlob(kind === "sales" ? "sales-return" : "purchase-return", returnId)
      }
    />
  );
}
