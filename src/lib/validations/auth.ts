import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

export const loginSchema = z.object({
  username: z.string().min(1, vmsg("validation.usernameRequired")).max(50).trim(),
  password: z.string().min(1, vmsg("validation.passwordRequired")).max(128),
});

/**
 * Field yang DIPAKAI BERSAMA form dan route handler (MASTER.md §Konvensi Form
 * aturan 1, pola `paymentFormFields`).
 *
 * Sebelumnya `changePasswordSchema` dan `changePasswordApiSchema` masing-masing
 * mengetik ulang `currentPassword` + `newPassword` — dan sudah menyimpang:
 * versi client kehilangan `.max(128)` yang dipegang versi server. Dua daftar
 * yang seharusnya identik tidak boleh ditulis dua kali.
 */
const changePasswordFields = {
  currentPassword: z.string().min(1, vmsg("validation.currentPasswordRequired")).max(128),
  newPassword: z.string().min(8, vmsg("validation.passwordMin8")).max(128),
};

/**
 * Kata sandi baru tidak boleh sama dengan yang lama.
 *
 * Aturannya berlaku di KEDUA sisi karena inilah satu-satunya alasan layar
 * `/change-password` ada: ia dipaksakan pada akun yang masih memakai kata sandi
 * bawaan pemasangan. Tanpa aturan ini, mengetik ulang sandi bawaan itu
 * memenuhi syarat, `mustChangePassword` dimatikan, dan gerbangnya lewat tanpa
 * satu pun hal yang seharusnya ia cegah benar-benar berubah.
 */
const differsFromCurrent = (data: { currentPassword: string; newPassword: string }) =>
  data.newPassword !== data.currentPassword;

/** Pabrik, bukan konstanta: zod menerima `path` yang bisa diubah, dan dua
 *  skema di bawah tidak boleh berbagi array yang sama. */
const differsIssue = () => ({
  message: vmsg("validation.passwordSameAsCurrent"),
  path: ["newPassword"],
});

export const changePasswordSchema = z
  .object({
    ...changePasswordFields,
    confirmPassword: z.string().min(1, vmsg("validation.passwordConfirmRequired")),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: vmsg("validation.passwordMismatch"),
    path: ["confirmPassword"],
  })
  .refine(differsFromCurrent, differsIssue());

/** API body (`confirmPassword` hanya urusan client). */
export const changePasswordApiSchema = z
  .object(changePasswordFields)
  .refine(differsFromCurrent, differsIssue());

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
