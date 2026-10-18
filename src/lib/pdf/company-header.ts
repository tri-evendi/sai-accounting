/**
 * Kepala dokumen PDF: identitas perusahaan yang dicetak setiap generator, dan
 * logo perusahaan (migration company 0002) bila pemilik PT mengunggahnya.
 *
 * Logo digambar di KIRI ATAS, sejajar dengan nama perusahaan yang tetap di
 * tengah, sehingga tata letak tiap dokumen tidak bergeser: dokumen tanpa logo
 * persis sama dengan sebelum fitur ini ada.
 */
import type { jsPDF } from "jspdf";

export interface PdfCompanyLogo {
  /** `data:image/png;base64,...` atau `data:image/jpeg;base64,...`. */
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

export interface PdfCompany {
  name: string;
  address: string;
  logo?: PdfCompanyLogo | null;
}

/** Tinggi & lebar maksimum logo di kepala dokumen (mm). */
const LOGO_MAX_H = 14;
const LOGO_MAX_W = 36;
const LOGO_X = 14;

/**
 * Gambar logo perusahaan (bila ada). `nameY` = garis dasar nama perusahaan;
 * tepi atas logo diletakkan sedikit di atasnya agar sejajar secara visual.
 * Logo yang rusak tidak boleh menggagalkan dokumen: galatnya dicatat, dan
 * dokumen dicetak tanpa logo.
 */
export function drawCompanyLogo(doc: jsPDF, company: PdfCompany, nameY: number): void {
  const logo = company.logo;
  if (!logo || logo.width <= 0 || logo.height <= 0) return;
  const scale = Math.min(LOGO_MAX_H / logo.height, LOGO_MAX_W / logo.width);
  const w = logo.width * scale;
  const h = logo.height * scale;
  try {
    doc.addImage(logo.dataUrl, logo.format, LOGO_X, Math.max(4, nameY - 6), w, h);
  } catch (error) {
    console.error("[pdf] logo perusahaan tak tergambar:", error);
  }
}

/** Ubah isi berkas logo (PNG/JPEG) menjadi bentuk yang dipakai `drawCompanyLogo`. */
export function toPdfLogo(input: { mimeType: string; width: number; height: number; base64: string }): PdfCompanyLogo {
  return {
    dataUrl: `data:${input.mimeType};base64,${input.base64}`,
    format: input.mimeType === "image/png" ? "PNG" : "JPEG",
    width: input.width,
    height: input.height,
  };
}
