/**
 * Peta label enum yang MENGIKUTI BAHASA — versi multibahasa dari peta di
 * `src/lib/constants.ts`.
 *
 * Kenapa fungsi, bukan tiga objek per bahasa?
 *
 * MASTER.md (Anti-Patterns) melarang nilai enum DB tampil mentah dan menuntut
 * peta `Record<Type, string>` BERTIPE PENUH supaya `tsc` menolak nilai enum
 * baru yang belum punya label (issue #68). Kalau labelnya hidup di JSON, tipe
 * itu hilang: JSON hanya `Record<string, string>`, dan status baru bisa lolos
 * tanpa label di ketiga bahasa sekaligus.
 *
 * Maka bentuknya dibalik: TEKS tetap di kamus (satu tempat untuk penerjemah),
 * tetapi BENTUK peta ditegakkan di sini oleh literal objek yang beranotasi
 * `Record<Type, string>`. Menambah satu `DocumentType` baru langsung
 * memerahkan berkas ini — sekali, untuk ketiga bahasa — dan `tsc` juga menolak
 * bila kunci kamusnya belum ada. Persis jaminan issue #68, dikalikan tiga.
 *
 * Tanpa kamus (mis. komponen client di luar `LocaleProvider`), semuanya jatuh
 * ke peta bahasa Indonesia di `constants.ts` — tak pernah ke nilai mentah DB.
 */

import {
  CASH_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_FILTER_LABELS,
  type CashType,
  type ContractStatus,
  type DocumentType,
  type SystemRole,
} from "@/lib/constants";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import { MONTH_NAMES } from "@/lib/month-names";
import type { Dictionary } from "./dictionary";

/**
 * Label tipe akun (bagan akun). Sumber bentuknya `ACCOUNT_TYPES` di
 * `lib/accounting.ts` — tipe akun baru yang belum punya kunci kamus langsung
 * ditolak `tsc` di sini, persis seperti peta enum lain di berkas ini.
 */
export function accountTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<string, string> {
  if (!dictionary) return Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t.label]));
  const d = dictionary.accountType;
  return {
    cash_bank: d.cash_bank,
    account_receivable: d.account_receivable,
    inventory: d.inventory,
    other_current_asset: d.other_current_asset,
    fixed_asset: d.fixed_asset,
    accumulated_depreciation: d.accumulated_depreciation,
    other_asset: d.other_asset,
    account_payable: d.account_payable,
    tax_payable: d.tax_payable,
    other_current_liability: d.other_current_liability,
    long_term_liability: d.long_term_liability,
    equity: d.equity,
    revenue: d.revenue,
    other_income: d.other_income,
    cogs: d.cogs,
    expense: d.expense,
    other_expense: d.other_expense,
  };
}

/** Satu label tipe akun; nilai tak dikenal dikembalikan apa adanya. */
export function accountTypeLabel(
  dictionary: Dictionary | null | undefined,
  value: string
): string {
  return accountTypeLabels(dictionary)[value] ?? value;
}

/**
 * Nama bulan, urut Januari→Desember (indeks 0 = Januari, seperti
 * `MONTH_NAMES`). `lib/month-names.ts` bebas Prisma, jadi cadangan bahasa
 * Indonesianya aman diimpor komponen client — sama seperti `constants.ts`.
 */
export function monthNames(dictionary: Dictionary | null | undefined): readonly string[] {
  if (!dictionary) return MONTH_NAMES;
  const m = dictionary.month;
  return [m.m1, m.m2, m.m3, m.m4, m.m5, m.m6, m.m7, m.m8, m.m9, m.m10, m.m11, m.m12];
}

/** Label peran SISTEM. Peran kustom (data, tabel `roles`) tetap ambil label dari DB. */
export function roleLabels(dictionary: Dictionary | null | undefined): Record<SystemRole, string> {
  if (!dictionary) {
    return { bos: ROLE_LABELS.bos, core: ROLE_LABELS.core, ptg: ROLE_LABELS.ptg };
  }
  return {
    bos: dictionary.role.bos,
    core: dictionary.role.core,
    ptg: dictionary.role.ptg,
  };
}

/** Label status kontrak/dokumen (nilai DB tidak ikut berubah). */
export function contractStatusLabels(
  dictionary: Dictionary | null | undefined
): Record<ContractStatus, string> {
  if (!dictionary) return CONTRACT_STATUS_LABELS;
  return {
    signed: dictionary.status.contract.signed,
    pending: dictionary.status.contract.pending,
    canceled: dictionary.status.contract.canceled,
  };
}

/** Label tombol saringan status, termasuk pilihan "semua". */
export function statusFilterLabels(
  dictionary: Dictionary | null | undefined
): Record<string, string> {
  if (!dictionary) return STATUS_FILTER_LABELS;
  return {
    all: dictionary.status.all,
    ...contractStatusLabels(dictionary),
  };
}

/** Label jenis dokumen ekspor (B/L, COO, …). */
export function documentTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<DocumentType, string> {
  if (!dictionary) return DOCUMENT_TYPE_LABELS;
  return {
    bl: dictionary.documentType.bl,
    invoice: dictionary.documentType.invoice,
    coo: dictionary.documentType.coo,
    fumigation: dictionary.documentType.fumigation,
    contract: dictionary.documentType.contract,
    other: dictionary.documentType.other,
  };
}

/** Label jenis kas (bank / kas besar / kas kecil). */
export function cashTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<CashType, string> {
  if (!dictionary) return CASH_TYPE_LABELS;
  return {
    bank: dictionary.cashType.bank,
    kas_besar: dictionary.cashType.kas_besar,
    kas_kecil: dictionary.cashType.kas_kecil,
  };
}
