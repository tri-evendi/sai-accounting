"use client";

/**
 * Pratinjau file yang diunggah (B/L, PEB, packing list, dll). Gambar & PDF
 * ditampilkan langsung di `DocumentPreview`; tipe lain (docx/xlsx) tak bisa
 * dipratinjau di browser, jadi cukup "Buka" di tab baru.
 */
import { useState } from "react";
import { ExportOutlined, EyeOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/shared/document-preview";
import { useT } from "@/lib/i18n/client";

/** Ikon di dalam tombol — `h-4 w-4` + `mr-1` lama. */
const ICON_SIZE = 16;
const ICON_STYLE: React.CSSProperties = { marginInlineEnd: 4 };

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);

function kindOf(filename: string): "pdf" | "image" | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function DocumentPreviewButton({
  filename,
  href,
}: {
  filename: string;
  /**
   * Alamat pengambilan berkasnya (`/api/documents/<id>/file`, issue #367) —
   * BUKAN `documents.filepath`. Sejak berkasnya keluar dari `public/`, kolom
   * itu adalah kunci penyimpanan internal dan tidak pernah bisa dipasang di
   * `href` maupun `src`.
   */
  href: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const kind = kindOf(filename);

  if (kind === null) {
    /*
     * Tak bisa dipratinjau di browser — buka di tab baru saja.
     *
     * `<Button href>`, BUKAN `<ButtonLink>` (#289): `target="_blank"` tidak
     * boleh dicegat menjadi navigasi sisi-klien — dicegat berarti berkasnya
     * membuka di tab yang SAMA dan halaman dokumen yang sedang dibaca hilang.
     * `tautanDicegat()` pun menolaknya, jadi `<ButtonLink>` di sini hanya akan
     * menjanjikan sesuatu yang tidak pernah terjadi. `target` dan `rel` pindah
     * ke tombolnya bersama `href` — ketiganya dideklarasikan di `ButtonProps`
     * justru supaya yang lupa memindahkannya gugur di `tsc`.
     */
    return (
      <Button
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="secondary"
        size="sm"
      >
        <ExportOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, ...ICON_STYLE }} />{" "}
        {t("documents.open")}
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <EyeOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, ...ICON_STYLE }} /> {t("documents.preview")}
      </Button>
      <DocumentPreview
        open={open}
        onOpenChange={setOpen}
        title={filename}
        src={href}
        kind={kind}
      />
    </>
  );
}
