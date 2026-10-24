/**
 * BENTUK USAHA perusahaan (keputusan pemilik 24 Okt 2026) — kosakata dan
 * akibatnya pada pembukuan. MURNI: tanpa Prisma, tanpa React; dipakai aplikasi
 * pelanggan, skrip `create-company`, dan konsol operator.
 *
 * ══ KENAPA BENTUK USAHA MENYENTUH PEMBUKUAN ════════════════════════════════
 * Sebelum ini setiap buku diperlakukan sebagai PT: templat ekuitas "Modal" +
 * "3102 Laba Ditahan", dan tutup buku tahunan memindahkan laba ke Laba
 * Ditahan. Itu salah untuk tiga bentuk lain yang dipakai pelanggan:
 *
 *   • CV dan Firma — persekutuan. Laba dibagi ke MODAL MASING-MASING SEKUTU
 *     menurut porsi di akta; penarikan pribadi dicatat di PRIVE per sekutu.
 *     Tidak ada "laba ditahan" milik badan.
 *   • Usaha perorangan (UD) — satu pemilik. Laba menambah Modal Pemilik,
 *     penarikan dicatat di Prive Pemilik. Tidak ada dividen, tidak ada laba
 *     ditahan.
 *   • PT dan PT Perorangan — badan hukum: tetap Modal + Laba Ditahan.
 *
 * ══ ISTILAH ════════════════════════════════════════════════════════════════
 * Istilah GENERIK di antarmuka adalah "perusahaan", tidak pernah "badan
 * usaha": usaha perorangan bukan badan usaha. Label bentuknya sendiri ada di
 * kamus (`legalForm.options.*`).
 */

/** Kosakata `companies.legal_form` — urutan ini juga urutan pilihan di layar. */
export const LEGAL_FORMS = ["pt", "pt_perorangan", "cv", "firma", "perorangan", "lainnya"] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number];

/** Bawaan setiap baris lama (control 0014) dan setiap pembuatan tanpa pilihan. */
export const DEFAULT_LEGAL_FORM: LegalForm = "pt";

export function isLegalForm(value: unknown): value is LegalForm {
  return typeof value === "string" && (LEGAL_FORMS as readonly string[]).includes(value);
}

/**
 * Nilai tersimpan → bentuk usaha. Nilai yang tidak dikenali menjadi `pt`:
 * CHECK di basis data sudah menolaknya, jadi cabang ini hanya untuk klien
 * palsu dan data yang dibaca sebelum migration diterapkan — dan `pt` adalah
 * satu-satunya jawaban yang tidak mengubah perilaku buku mana pun.
 */
export function parseLegalForm(value: unknown): LegalForm {
  return isLegalForm(value) ? value : DEFAULT_LEGAL_FORM;
}

/**
 * Model ekuitas yang diturunkan dari bentuk usaha.
 *
 *   • `retained_earnings` — PT, PT Perorangan, lainnya: laba ke Laba Ditahan.
 *   • `partners`          — CV, Firma: laba dibagi ke modal tiap sekutu.
 *   • `sole_owner`        — usaha perorangan: laba ke Modal Pemilik.
 *
 * `lainnya` jatuh ke `retained_earnings` dengan sengaja: bentuk yang tidak
 * kita kenal (koperasi, yayasan, BUMDes) diperlakukan seperti sebelum fitur
 * ini ada, dan pemiliknya tetap bisa mengatur Pemetaan Akun sendiri.
 */
export type EquityModel = "retained_earnings" | "partners" | "sole_owner";

export function equityModelFor(form: LegalForm): EquityModel {
  switch (form) {
    case "cv":
    case "firma":
      return "partners";
    case "perorangan":
      return "sole_owner";
    default:
      return "retained_earnings";
  }
}

/** Bentuk yang menyimpan daftar pemilik/sekutu (`company_partners`). */
export function usesPartnerLedger(form: LegalForm): boolean {
  return equityModelFor(form) !== "retained_earnings";
}

/** Peran sekutu CV. Firma tidak membedakan peran (semua sekutu aktif). */
export const PARTNER_ROLES = ["aktif", "komanditer"] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export function isPartnerRole(value: unknown): value is PartnerRole {
  return typeof value === "string" && (PARTNER_ROLES as readonly string[]).includes(value);
}

/** Bentuk yang memakai peran aktif/komanditer. */
export function usesPartnerRoles(form: LegalForm): boolean {
  return form === "cv";
}

/** Kunci kamus label bentuk usaha — satu tempat, dipakai layar dan konsol. */
export const LEGAL_FORM_LABEL_KEYS = {
  pt: "legalForm.options.pt",
  pt_perorangan: "legalForm.options.pt_perorangan",
  cv: "legalForm.options.cv",
  firma: "legalForm.options.firma",
  perorangan: "legalForm.options.perorangan",
  lainnya: "legalForm.options.lainnya",
} as const satisfies Record<LegalForm, string>;

/**
 * Label bahasa Indonesia untuk keluaran BARIS PERINTAH dan jejak audit —
 * kalimat yang sama dengan `legalForm.options.*` di `id.json` (dijaga tes).
 */
export const LEGAL_FORM_PRINT_LABELS: Record<LegalForm, string> = {
  pt: "Perseroan Terbatas (PT)",
  pt_perorangan: "PT Perorangan",
  cv: "Persekutuan Komanditer (CV)",
  firma: "Firma",
  perorangan: "Usaha Perorangan (UD)",
  lainnya: "Lainnya",
};

/** Basis poin = 100%. Porsi laba disimpan sebagai bilangan bulat basis poin. */
export const FULL_SHARE_BP = 10_000;

/**
 * Nilai bendera baris perintah (`create-company --bentuk-usaha …`) → bentuk
 * usaha. Menerima kosakata kolom apa adanya plus dua ejaan yang wajar diketik
 * orang: tanda hubung (`pt-perorangan`) dan `ud` untuk usaha perorangan.
 * `undefined` (bendera tidak disebut) → `pt`; nilai lain yang tidak dikenali
 * → `null`, dan skripnya BERHENTI: bentuk usaha yang salah ketik tidak boleh
 * diam-diam menjadi PT.
 */
export function legalFormFromCli(value: string | undefined): LegalForm | null {
  if (value === undefined) return DEFAULT_LEGAL_FORM;
  const v = value.trim().toLowerCase().replace(/-/g, "_");
  if (v === "ud") return "perorangan";
  return isLegalForm(v) ? v : null;
}
