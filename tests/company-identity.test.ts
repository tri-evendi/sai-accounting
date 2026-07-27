/**
 * Identitas perusahaan harus datang dari BASIS DATA, bukan dari kode.
 *
 * Latar: `CompanySetting` (wizard setup, issue #20) sudah lama menyimpan nama
 * & alamat perusahaan — komentar di skema bahkan menulis "Was
 * constants.COMPANY_NAME" — tapi migrasinya berhenti separuh jalan. Halaman
 * masuk, halaman pengaturan, berkas Excel, dan TUJUH pembuat PDF masih membaca
 * konstanta di kode. Empat di antaranya (kontrak, faktur, surat jalan, retur)
 * adalah dokumen yang DIKIRIM KE PELANGGAN, jadi pemasangan untuk perusahaan
 * lain akan mencetak nama pemasang pertama di atas surat resmi mereka.
 *
 * Penjaga ini menahan kemunduran itu: `COMPANY_NAME`/`COMPANY_ADDRESS` hanya
 * boleh diimpor oleh berkas yang memang berhak — yaitu yang mendefinisikan
 * nilai cadangan, dan yang mengisi nilai awal form wizard.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");

/**
 * Berkas yang SAH mengimpor konstanta identitas, beserta alasannya.
 * Menambah entri di sini berarti menyatakan "berkas ini bukan permukaan
 * tampilan/cetak" — pikirkan dua kali.
 */
const ALLOWED = new Map<string, string>([
  ["lib/company-identity.ts", "mendefinisikan nilai cadangan sisi server"],
  ["lib/company-identity-client.tsx", "mendefinisikan nilai cadangan sisi client"],
  ["lib/constants.ts", "tempat konstanta itu sendiri"],
  ["app/api/setup/route.ts", "nilai awal yang mengisi form wizard setup"],
  ["app/(setup)/setup/page.tsx", "nilai awal yang mengisi form wizard setup"],
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // `src/generated` adalah keluaran Prisma, bukan kode tulisan tangan.
      return entry.name === "generated" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  rel: path.slice(SRC.length + 1),
  code: readFileSync(path, "utf8"),
}));

describe("identitas perusahaan dibaca dari basis data", () => {
  it("menemukan berkas sumber untuk diperiksa", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("tidak ada berkas di luar daftar yang mengimpor konstanta identitas", () => {
    const offenders = files
      .filter(({ rel, code }) => !ALLOWED.has(rel) && /COMPANY_(NAME|ADDRESS)/.test(code))
      .map(({ rel }) => rel);

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "Berkas berikut memakai konstanta identitas perusahaan. Untuk " +
            "menampilkan/mencetak, ambil dari basis data: `getCompanyIdentity()` " +
            "di server, `useCompanyIdentity()` di client. Kalau memang bukan " +
            "permukaan tampilan, daftarkan di ALLOWED beserta alasannya:\n  " +
            offenders.join("\n  ")
    ).toEqual([]);
  });

  it("tidak ada pembuat PDF yang menyalin nama perusahaan sebagai literal", () => {
    // Empat dari tujuh pembuat PDF dulu mendeklarasikan sendiri
    // `const COMPANY_NAME = "PT Subur Anugerah Indonesia"` — literal yang
    // tersalin, bukan sekadar impor. Regex ini menjaga agar tidak kembali.
    const offenders = files
      .filter(({ rel }) => rel.startsWith("lib/pdf/"))
      .filter(({ code }) => /"PT\s+\w/.test(code))
      .map(({ rel }) => rel);

    expect(
      offenders,
      "Pembuat PDF menuliskan nama perusahaan sebagai literal. Nama harus " +
        "dioper masuk lewat parameter `company`:\n  " + offenders.join("\n  ")
    ).toEqual([]);
  });
});
