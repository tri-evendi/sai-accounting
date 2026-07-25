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
import type { Dictionary } from "./dictionary";

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
