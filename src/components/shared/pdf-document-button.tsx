"use client";

/**
 * Tombol dokumen PDF yang dipakai ulang: "Pratinjau" membuat PDF (via jsPDF,
 * di-load malas per dokumen), menampilkannya di `DocumentPreview`, lalu di sana
 * bisa Unduh & Cetak. Ganti tombol "Export PDF" lama yang langsung mengunduh
 * tanpa pratinjau.
 *
 * `generate` mengembalikan instance jsPDF (import dinamis di pemanggil agar
 * jsPDF tak masuk bundle utama). Blob dibuat dari doc dan URL-nya dibersihkan
 * saat pratinjau ditutup.
 */
import { useState } from "react";
import type { jsPDF } from "jspdf";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DocumentPreview } from "@/components/shared/document-preview";
import { useT } from "@/lib/i18n/client";

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
  generate: () => Promise<jsPDF>;
  label?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [doc, setDoc] = useState<jsPDF | null>(null);

  async function openPreview() {
    setLoading(true);
    try {
      const generated = await generate();
      const url = URL.createObjectURL(generated.output("blob"));
      setDoc(generated);
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
      setDoc(null);
    }
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={openPreview} disabled={loading || disabled}>
        <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
        {loading ? t("pdf.preparing") : (label ?? t("pdf.previewAndPrint"))}
      </Button>
      {src && (
        <DocumentPreview
          open={open}
          onOpenChange={handleOpenChange}
          title={title}
          src={src}
          kind="pdf"
          onDownload={() => doc?.save(filename)}
        />
      )}
    </>
  );
}
