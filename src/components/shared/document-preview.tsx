"use client";

/**
 * Pratinjau dokumen — dialog besar berisi PDF (iframe) atau gambar, dengan
 * tombol Unduh & Cetak. Dipakai ulang oleh semua dokumen: PDF yang dihasilkan
 * (faktur, kontrak, surat jalan, retur, laporan) maupun file yang diunggah.
 *
 * Cetak memakai `iframe.contentWindow.print()` (jendela dokumennya sendiri,
 * bukan seluruh halaman aplikasi); bila terhalang, jatuh ke membuka dokumen di
 * tab baru yang punya tombol cetak bawaan browser.
 */
import { useRef } from "react";
import { Printer, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DocumentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** URL sumber: blob (PDF hasil) atau `/uploads/...` (file diunggah). */
  src: string;
  kind: "pdf" | "image";
  /** Aksi Unduh — untuk PDF hasil (doc.save). Bila tak diberi, tombol Unduh
   *  jadi tautan `download` ke `src` (file yang diunggah). */
  onDownload?: () => void;
}

export function DocumentPreview({
  open,
  onOpenChange,
  title,
  src,
  kind,
  onDownload,
}: DocumentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    } else {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-w-5xl p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pratinjau dokumen — bisa diunduh atau dicetak.
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2 pr-8">
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <Printer className="mr-1 h-4 w-4" aria-hidden="true" /> Cetak
            </Button>
            {onDownload ? (
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Unduh
              </Button>
            ) : (
              <a href={src} download>
                <Button size="sm">
                  <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Unduh
                </Button>
              </a>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-b-xl bg-muted">
          {kind === "pdf" ? (
            <iframe
              ref={iframeRef}
              src={src}
              title={title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
