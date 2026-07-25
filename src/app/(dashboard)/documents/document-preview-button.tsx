"use client";

/**
 * Pratinjau file yang diunggah (B/L, PEB, packing list, dll). Gambar & PDF
 * ditampilkan langsung di `DocumentPreview`; tipe lain (docx/xlsx) tak bisa
 * dipratinjau di browser, jadi cukup "Buka" di tab baru.
 */
import { useState } from "react";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/shared/document-preview";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);

function kindOf(filename: string): "pdf" | "image" | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function DocumentPreviewButton({
  filename,
  filepath,
}: {
  filename: string;
  filepath: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(filename);

  if (kind === null) {
    // Tak bisa dipratinjau di browser — buka di tab baru saja.
    return (
      <a href={filepath} target="_blank" rel="noopener noreferrer">
        <Button variant="secondary" size="sm">
          <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" /> Buka
        </Button>
      </a>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Eye className="mr-1 h-4 w-4" aria-hidden="true" /> Pratinjau
      </Button>
      <DocumentPreview
        open={open}
        onOpenChange={setOpen}
        title={filename}
        src={filepath}
        kind={kind}
      />
    </>
  );
}
