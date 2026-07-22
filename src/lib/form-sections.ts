/**
 * Progressive disclosure pada formulir (issue #4) — peta "inti vs lanjutan".
 *
 * Formulir panjang membuat staf non-akuntan berhenti di tengah jalan, jadi tiga
 * formulir utama (Kontrak, Faktur/Tagihan, Transaksi Kas) memisahkan isian yang
 * SELALU dipakai dari isian yang jarang. Yang jarang masuk ke satu bagian
 * "Detail lengkap" yang tertutup secara default.
 *
 * BAHAYA yang dijaga modul ini: isian tersembunyi TETAP divalidasi Zod di
 * server. Kalau yang gagal ternyata isian di dalam bagian tertutup, pengguna
 * akan melihat pesan galat untuk sesuatu yang tidak ada di layar — lebih buruk
 * daripada formulir panjang. Karena itu `resolveSubmitFailure` menerjemahkan
 * jawaban galat dari API menjadi: pesan manusiawi + field mana + bagian mana
 * yang harus DIBUKA dan DIFOKUSKAN.
 *
 * Murni data + fungsi: tidak ada React, Prisma, maupun DOM di sini, jadi
 * pemetaannya bisa diuji langsung di `tests/`.
 */

import { humanizeFieldMessage } from "@/lib/form-guards";

/** Bagian formulir: yang selalu terlihat, dan yang dilipat. */
export type SectionId = "inti" | "lanjutan";

/** Formulir yang memakai pola ini. */
export type FormKey = "kontrak" | "faktur" | "kas";

/** Judul baku bagian yang dilipat — dipakai semua formulir agar konsisten. */
export const ADVANCED_SECTION_TITLE = "Detail lengkap";

export interface FormLayout {
  /** Isian inti: mitra, tanggal, nilai, baris barang. Selalu terlihat. */
  readonly core: readonly string[];
  /** Isian lanjutan: termin, catatan, valas, PPN/PEB, status. Dilipat. */
  readonly advanced: readonly string[];
}

/**
 * Pembagian per formulir. Nama field = nama di payload API, sehingga
 * `details.fieldErrors` dari server bisa dipetakan langsung tanpa kamus kedua.
 *
 * Aturan pembagiannya: sebuah isian masuk "inti" bila dokumen tidak berarti
 * tanpanya (nomor, tanggal, mitra, nilai/baris barang) atau bila mesin akuntansi
 * WAJIB memilikinya untuk kasus yang paling umum. Sisanya — termin, kemasan,
 * catatan, mata uang non-standar, PPN/PEB — masuk "lanjutan".
 */
export const FORM_LAYOUTS: Record<FormKey, FormLayout> = {
  kontrak: {
    core: ["contractNo", "date", "buyer", "currency", "rate", "items"],
    advanced: ["dueDate", "consigneeId", "consignee", "packaging", "shipment", "top1", "top2", "status"],
  },
  faktur: {
    core: ["invoiceNo", "date", "customerId", "contractId", "items"],
    advanced: [
      "dueDate",
      "status",
      "currency",
      "rate",
      "taxable",
      "taxRate",
      "pebNumber",
      "pebDate",
      "exportNote",
    ],
  },
  kas: {
    core: ["type", "date", "description", "debit", "credit", "counterAccountId"],
    advanced: ["currency", "rate", "note"],
  },
};

/** Di bagian mana sebuah field berada? null bila bukan milik formulir itu. */
export function sectionOfField(form: FormKey, field: string): SectionId | null {
  const layout = FORM_LAYOUTS[form];
  if (layout.core.includes(field)) return "inti";
  if (layout.advanced.includes(field)) return "lanjutan";
  return null;
}

/** Apakah field ini bersembunyi di balik "Detail lengkap"? */
export function isAdvancedField(form: FormKey, field: string): boolean {
  return sectionOfField(form, field) === "lanjutan";
}

/** Semua field formulir, urut tampil: inti dulu, baru lanjutan. */
export function orderedFields(form: FormKey): string[] {
  return [...FORM_LAYOUTS[form].core, ...FORM_LAYOUTS[form].advanced];
}

/** Bentuk galat 400 dari route API (`z.flatten()`), longgar dengan sengaja. */
export interface ApiErrorBody {
  error?: unknown;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
}

/** Apa yang harus dilakukan formulir setelah simpan gagal. */
export interface SubmitFailure {
  /** Pesan berbahasa manusia untuk ditampilkan di `role="alert"`. */
  message: string;
  /** Field penyebab, bila bisa ditentukan. */
  field: string | null;
  /** Bagian yang memuat field itu — "lanjutan" berarti harus dibuka. */
  section: SectionId | null;
}

/** Ambil `details.fieldErrors` yang berbentuk benar, apa pun bentuk body-nya. */
function fieldErrorsOf(body: unknown): Record<string, string[] | undefined> {
  if (!body || typeof body !== "object") return {};
  const details = (body as ApiErrorBody).details;
  if (!details || typeof details !== "object") return {};
  const fieldErrors = details.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return {};
  return fieldErrors;
}

/**
 * Field bermasalah PERTAMA menurut urutan tampil formulir — bukan menurut
 * urutan kunci objek JSON, yang tidak punya makna bagi pengguna. Dengan begitu
 * fokus selalu jatuh ke isian paling atas yang salah, persis seperti perilaku
 * validasi bawaan peramban.
 */
export function firstOffendingField(
  form: FormKey,
  fieldErrors: Record<string, string[] | undefined>
): { field: string; raw: string } | null {
  const withMessage = (field: string) => {
    const messages = fieldErrors[field];
    const raw = messages?.find((m) => typeof m === "string" && m.trim().length > 0);
    return raw ? { field, raw } : null;
  };

  for (const field of orderedFields(form)) {
    const hit = withMessage(field);
    if (hit) return hit;
  }
  // Field yang tidak dikenal formulir ini masih lebih baik daripada tidak ada.
  for (const field of Object.keys(fieldErrors)) {
    const hit = withMessage(field);
    if (hit) return hit;
  }
  return null;
}

/** Pesan cadangan bila API tidak memberi keterangan apa pun. */
const GENERIC_FAILURE =
  "Data belum bisa disimpan. Periksa lagi isian yang bertanda merah, lalu coba simpan ulang.";

/**
 * Terjemahkan jawaban galat API menjadi instruksi konkret untuk formulir:
 * pesan apa yang ditampilkan, field mana yang difokuskan, dan bagian mana yang
 * harus ikut dibuka.
 *
 * `fallback` dipakai bila body sama sekali tidak informatif (mis. 500 tanpa
 * badan JSON) sehingga tiap formulir tetap bisa menyebut namanya sendiri.
 */
export function resolveSubmitFailure(
  form: FormKey,
  body: unknown,
  fallback = GENERIC_FAILURE
): SubmitFailure {
  const offending = firstOffendingField(form, fieldErrorsOf(body));
  if (offending) {
    return {
      message: humanizeFieldMessage(offending.field, offending.raw),
      field: offending.field,
      section: sectionOfField(form, offending.field),
    };
  }

  const details = (body as ApiErrorBody | null)?.details;
  const formError = details?.formErrors?.find(
    (m) => typeof m === "string" && m.trim().length > 0
  );
  if (formError) {
    return { message: humanizeFieldMessage(null, formError), field: null, section: null };
  }

  const error = (body as ApiErrorBody | null)?.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return { message: humanizeFieldMessage(null, error), field: null, section: null };
  }

  return { message: fallback, field: null, section: null };
}
