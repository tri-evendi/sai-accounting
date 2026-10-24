/**
 * PPh FINAL UMKM (PP 55/2022) — ALAT BANTU LAPORAN, bukan posting.
 *
 * Perkiraan bulanan = 0,5% × peredaran bruto bulan itu, plus pengingat batas
 * waktu pemakaian tarif menurut bentuk usaha. TIDAK menerbitkan jurnal apa pun:
 * repo ini belum punya konvensi posting pajak penghasilan yang aman diikuti,
 * dan perkiraan yang salah tidak boleh berubah menjadi utang pajak di buku.
 *
 * ══ KETENTUAN — DITULIS SEBAGAI KONSTANTA BESERTA BUNYINYA ═════════════════
 * Angka dan batas di bawah dirangkum dari PP 55/2022 (mengganti PP 23/2018)
 * dan PMK 164/2023 sebagaimana dipahami saat fitur ini ditulis (Okt 2026).
 * Ketentuan perpajakan berubah — termasuk perpanjangan untuk wajib pajak orang
 * pribadi yang pernah diumumkan pemerintah — jadi setiap angka tampil BERSAMA
 * teks aturannya dan catatan "periksa ketentuan terbaru", tidak sebagai
 * kepastian.
 *
 *  • Tarif 0,5% dari peredaran bruto (Pasal 56–57), bagi peredaran bruto
 *    sampai Rp 4,8 miliar setahun.
 *  • Wajib pajak ORANG PRIBADI: bagian peredaran bruto sampai Rp 500 juta
 *    setahun tidak dikenai PPh (Pasal 60 ayat 2). Usaha perorangan (UD)
 *    dikenai pajak sebagai orang pribadi pemiliknya.
 *  • Batas waktu (Pasal 59 ayat 1):
 *      a. 7 tahun pajak — wajib pajak orang pribadi;
 *      b. 4 tahun pajak — koperasi, CV, firma, BUMDes/BUMDesma, dan PERSEROAN
 *         PERORANGAN yang didirikan oleh satu orang;
 *      c. 3 tahun pajak — perseroan terbatas.
 *    Catatan: PT Perorangan masuk kelompok 4 tahun (huruf b), BUKAN 3 tahun
 *    seperti PT biasa.
 */
import type { LegalForm } from "@sai/core/legal-form";

/** Tarif dalam basis poin: 50 bp = 0,5%. */
export const PPH_FINAL_UMKM_RATE_BP = 50;
/** Batas peredaran bruto setahun agar PP 55/2022 berlaku. */
export const PPH_FINAL_UMKM_GROSS_LIMIT = 4_800_000_000;
/** Bagian peredaran bruto setahun yang tidak dikenai PPh — orang pribadi saja. */
export const PPH_FINAL_UMKM_PERSONAL_EXEMPTION = 500_000_000;

/** Kelompok batas waktu Pasal 59 ayat (1). */
export type PphFinalGroup = "orang_pribadi" | "badan_4" | "pt_3";

export const PPH_FINAL_TIME_LIMITS: Record<PphFinalGroup, { years: number; rule: string }> = {
  orang_pribadi: {
    years: 7,
    rule: "PP 55/2022 Pasal 59 ayat (1) huruf a: paling lama 7 tahun pajak bagi wajib pajak orang pribadi.",
  },
  badan_4: {
    years: 4,
    rule:
      "PP 55/2022 Pasal 59 ayat (1) huruf b: paling lama 4 tahun pajak bagi wajib pajak badan berbentuk " +
      "koperasi, persekutuan komanditer, firma, BUMDes/BUMDesma, atau perseroan perorangan yang didirikan oleh 1 orang.",
  },
  pt_3: {
    years: 3,
    rule: "PP 55/2022 Pasal 59 ayat (1) huruf c: paling lama 3 tahun pajak bagi wajib pajak badan berbentuk perseroan terbatas.",
  },
};

/**
 * Kelompok batas waktu per bentuk usaha; `null` untuk `lainnya` — bentuk yang
 * tidak kita kenal tidak diberi angka tebakan (layar menampilkan ketiga aturan).
 */
export function pphFinalGroupFor(form: LegalForm): PphFinalGroup | null {
  switch (form) {
    case "perorangan":
      return "orang_pribadi";
    case "cv":
    case "firma":
    case "pt_perorangan":
      return "badan_4";
    case "pt":
      return "pt_3";
    default:
      return null;
  }
}

/** Bentuk yang memakai pembebasan Rp 500 juta (orang pribadi). */
export function usesPersonalExemption(form: LegalForm): boolean {
  return pphFinalGroupFor(form) === "orang_pribadi";
}

export type PphFinalStatus = "not_started" | "active" | "last_year" | "expired" | "unknown";

export interface PphFinalTimeLimit {
  group: PphFinalGroup | null;
  years: number | null;
  /** Tahun pajak TERAKHIR yang masih boleh memakai tarif ini. */
  lastYear: number | null;
  status: PphFinalStatus;
}

/**
 * Batas waktu untuk tahun pajak `year`: tahun terakhir = tahun mulai + masa − 1.
 * `last_year` menandai tahun terakhir itu sendiri (pengingat), `expired`
 * tahun sesudahnya (peringatan).
 */
export function pphFinalTimeLimit(form: LegalForm, startYear: number | null, year: number): PphFinalTimeLimit {
  const group = pphFinalGroupFor(form);
  if (!group || startYear === null) {
    return { group, years: group ? PPH_FINAL_TIME_LIMITS[group].years : null, lastYear: null, status: "unknown" };
  }
  const years = PPH_FINAL_TIME_LIMITS[group].years;
  const lastYear = startYear + years - 1;
  const status: PphFinalStatus =
    year < startYear ? "not_started" : year > lastYear ? "expired" : year === lastYear ? "last_year" : "active";
  return { group, years, lastYear, status };
}

export interface PphFinalMonth {
  /** 1–12. */
  month: number;
  gross: number;
  /** Peredaran bruto kumulatif sejak Januari. */
  cumulative: number;
  /** Bagian yang dikenai PPh bulan ini (setelah pembebasan orang pribadi). */
  taxable: number;
  /** Perkiraan PPh Final, dibulatkan KE BAWAH ke rupiah penuh. */
  tax: number;
}

export interface PphFinalEstimate {
  months: PphFinalMonth[];
  totalGross: number;
  totalTaxable: number;
  totalTax: number;
  /** Peredaran bruto setahun melewati Rp 4,8 miliar. */
  overGrossLimit: boolean;
  personalExemption: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Perkiraan PPh Final per bulan dari peredaran bruto bulanan (12 angka,
 * Januari–Desember).
 *
 * Orang pribadi: pembebasan Rp 500 juta dihitung KUMULATIF sejak Januari —
 * bulan-bulan sampai omzet kumulatif menyentuh Rp 500 juta tidak dikenai PPh;
 * bulan yang melewatinya dikenai atas bagian yang melewati saja.
 *
 * Bulan dengan peredaran bruto negatif (retur melebihi penjualan) dianggap nol
 * untuk pajak bulan itu — PP 55/2022 tidak mengenal PPh Final negatif; angka
 * bruto-nya tetap ditampilkan apa adanya.
 */
export function estimatePphFinal(form: LegalForm, monthlyGross: readonly number[]): PphFinalEstimate {
  const exemption = usesPersonalExemption(form) ? PPH_FINAL_UMKM_PERSONAL_EXEMPTION : 0;
  const months: PphFinalMonth[] = [];
  let cumulative = 0;
  let cumulativePositive = 0;
  for (let i = 0; i < 12; i++) {
    const gross = round2(monthlyGross[i] ?? 0);
    cumulative = round2(cumulative + gross);
    const before = cumulativePositive;
    cumulativePositive = round2(cumulativePositive + Math.max(0, gross));
    const taxable = round2(Math.max(0, cumulativePositive - exemption) - Math.max(0, before - exemption));
    const tax = Math.floor((taxable * PPH_FINAL_UMKM_RATE_BP) / 10_000);
    months.push({ month: i + 1, gross, cumulative, taxable, tax });
  }
  return {
    months,
    totalGross: cumulative,
    totalTaxable: round2(months.reduce((s, m) => s + m.taxable, 0)),
    totalTax: months.reduce((s, m) => s + m.tax, 0),
    overGrossLimit: cumulative > PPH_FINAL_UMKM_GROSS_LIMIT,
    personalExemption: exemption > 0,
  };
}
