import { z } from "zod";
import { ROLE_VALUES } from "@/lib/constants";

/**
 * Enum peran bersama (audit RBAC fase 1) — dipakai validasi user (buat/ubah),
 * `approverRole` aturan persetujuan, dan skrip create-admin. Diturunkan dari
 * `ROLES`, jadi menambah peran cukup di satu tempat.
 */
export const roleEnum = z.enum(ROLE_VALUES);

/**
 * Optional payment due date on a document (issue #12), as a `YYYY-MM-DD` string
 * from a date input.
 *
 * Optional by design and never defaulted: the aging report treats a missing due
 * date as genuinely unknown and ages the document from its issue date instead,
 * rather than inventing a deadline the parties never agreed. An empty string
 * from an untouched form field normalises to `null` so it clears the column.
 */
export const dueDateField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/**
 * Boolean yang aman dari `<select>`, `<input hidden>`, dan pemanggil API.
 *
 * ── Kenapa BUKAN `z.coerce.boolean()` ──────────────────────────────────────
 * `Boolean("false")` bernilai **TRUE** — sebuah string tak-kosong selalu truthy.
 * Setiap kontrol HTML hanya bisa mengirim string, dan `/api/v1` menerima JSON
 * dari pemanggil yang tidak kita tulis. Jadi dengan `coerce`, jawaban "tidak"
 * yang dikirim sebagai `"false"` tersimpan sebagai "ya": tanpa galat, tanpa
 * peringatan, dan tanpa satu pun cara melihatnya kecuali dari akibatnya di
 * dokumen yang lain. Ditemukan saat menambahkan PPN kontrak (migrasi 0062) —
 * di sana akibatnya adalah faktur yang memungut PPN atas kontrak yang justru
 * ditandai Non-PPN.
 *
 * Yang diterima: boolean asli, dan empat string yang memang punya arti
 * (`"true"/"false"/"1"/"0"`). Selain itu ditolak, bukan ditebak — sebuah nilai
 * yang tidak kita mengerti tidak boleh diam-diam menjadi `true`.
 */
const BOOLEAN_TEXT: Record<string, boolean> = {
  true: true,
  "1": true,
  false: false,
  "0": false,
};

/** Bentuk mentah → boolean, atau `undefined` bila bukan bentuk yang dikenal. */
function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return BOOLEAN_TEXT[value.trim()];
  return undefined;
}

/**
 * Boolean WAJIB dengan bawaan — untuk penanda dua-keadaan (`is_active`,
 * `is_pkp`) tempat "tidak disebut" memang punya jawaban yang benar.
 */
export function booleanField(fallback: boolean) {
  return z.preprocess(
    (v) => (v === "" || v == null ? fallback : (readBoolean(v) ?? v)),
    z.boolean()
  );
}

/**
 * Boolean TIGA-keadaan: `true`, `false`, dan NULL = belum dinyatakan.
 *
 * Dipakai ketika "tidak" dan "belum disebut" adalah dua hal yang berbeda —
 * `contracts.taxable` adalah kasus pertamanya: memampatkan keduanya menjadi
 * `false` membuat kontrak warisan berbunyi "Non-PPN" tanpa ada yang pernah
 * menyatakannya, DAN membuat kontrak yang memang Non-PPN tak pernah bisa
 * mematikan bawaan PPN pada fakturnya.
 */
export const nullableBooleanField = z
  .preprocess((v) => (v === "" || v == null ? null : (readBoolean(v) ?? v)), z.boolean().nullable())
  .default(null);

/** `YYYY-MM-DD` (or empty) to a Date for Prisma. */
export function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
