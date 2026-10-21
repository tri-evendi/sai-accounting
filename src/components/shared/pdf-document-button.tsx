"use client";

/**
 * Tombol dokumen PDF yang dipakai ulang: "Pratinjau" mengambil PDF-nya,
 * menampilkannya di `DocumentPreview`, lalu di sana bisa Unduh & Cetak. Ganti
 * tombol "Export PDF" lama yang langsung mengunduh tanpa pratinjau.
 *
 * ══ `generate` MEMULANGKAN BLOB, BUKAN INSTANCE jsPDF (tahap 1c) ═══════════
 * Sampai tahap 1c kontraknya `() => Promise<jsPDF>`, dan itu memaku satu hal
 * yang seharusnya bukan urusan tombol ini: BAHWA PDF-nya dibuat di peramban.
 * Sejak §5 memindahkan generator ke server, sebagian dokumen datang sebagai
 * byte dari sebuah rute — dan tombol yang menuntut instance jsPDF memaksa
 * setiap pemanggil mengurainya kembali menjadi jsPDF hanya untuk dibongkar
 * lagi menjadi Blob.
 *
 * Blob juga memperbaiki satu hal yang lebih halus. Dengan instance jsPDF,
 * pratinjau memakai `output("blob")` dan unduhan memakai `doc.save()` — dua
 * serialisasi. Diukur di sesi ini: dua `output()` dari SATU instance memang
 * identik, jadi tidak ada cacat di sana hari ini. Tapi untuk dokumen yang
 * datang dari server, dua panggilan berarti dua PERMINTAAN — dan dua instance
 * jsPDF atas muatan yang sama berbeda pada `/ID` di trailer. Satu Blob
 * menghapus kemungkinan itu alih-alih mengandalkan pemanggil mengingatnya.
 */
import { useState } from "react";
import { EyeOutlined } from "@ant-design/icons";
import { Button } from "@sai/ui/button";
import { useToast } from "@sai/ui/toast";
import { DocumentPreview } from "@/components/shared/document-preview";
import { useT } from "@sai/core/i18n/client";

export function PdfDocumentButton({
  title,
  filename,
  generate,
  label,
  variant = "secondary",
  disabled = false,
}: {
  title: string;
  filename: string;
  generate: () => Promise<Blob>;
  label?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  async function openPreview() {
    setLoading(true);
    try {
      const berkas = await generate();
      const url = URL.createObjectURL(berkas);
      setBlob(berkas);
      setSrc(url);
      setOpen(true);
    } catch (err) {
      console.error(err);
      toast(t("pdf.generateFailed"), "error");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && src) {
      URL.revokeObjectURL(src);
      setSrc(null);
      setBlob(null);
    }
  }

  return (
    <>
      {/* Jarak ikon–teks datang dari `iconGap` (= `marginXS`) milik `.ant-btn`,
          yang sudah `display:inline-flex`. Ukurannya 16px dari primitif
          `Button` sendiri. Karena itu ikonnya tidak lagi membawa kelas apa pun. */}
      <Button variant={variant} size="sm" onClick={openPreview} disabled={loading || disabled}>
        <EyeOutlined aria-hidden="true" />
        {loading ? t("pdf.preparing") : (label ?? t("pdf.previewAndPrint"))}
      </Button>
      {src && (
        <DocumentPreview
          open={open}
          onOpenChange={handleOpenChange}
          title={title}
          src={src}
          kind="pdf"
          /* Diunduh dari Blob yang SAMA dengan yang sedang dilihat — bukan
             dari pembangkitan atau permintaan kedua. Untuk dokumen dari
             server, permintaan kedua menghasilkan `/ID` PDF yang berbeda:
             yang dilihat pengguna dan yang ia simpan bukan berkas yang sama. */
          onDownload={() => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}
        />
      )}
    </>
  );
}
