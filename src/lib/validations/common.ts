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

/** `YYYY-MM-DD` (or empty) to a Date for Prisma. */
export function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
