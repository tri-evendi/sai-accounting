import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Pengenal masuk (issue #136): EMAIL — pengenal resmi sejak migrasi #134
 * membekali setiap akun dengan email — atau, untuk masa peralihan, username
 * lama. Keduanya lewat satu field: berisi `@` berarti email; `authorize()`
 * yang memutuskan jalur pencariannya (lihat lib/auth.ts). Batasnya 255
 * mengikuti kolom `users.email`.
 */
export const loginSchema = z.object({
  identifier: z.string().min(1, vmsg("validation.identifierRequired")).max(255).trim(),
  password: z.string().min(1, vmsg("validation.passwordRequired")).max(128),
});

/** Meminta tautan atur-ulang kata sandi (issue #136). */
export const forgotPasswordSchema = z.object({
  email: z.email(vmsg("validation.emailInvalid")).max(255).trim(),
});

/**
 * Pendaftaran mandiri (issue #138) — form §7.1: nama, email, kata sandi,
 * setuju S&K. `termsAccepted` literal `true`: tanpa persetujuan tidak ada
 * yang diproses, dan waktunya dicatat di baris pendaftaran.
 */
export const registerSchema = z.object({
  name: z.string().min(1, vmsg("validation.nameRequired")).max(100).trim(),
  email: z.email(vmsg("validation.emailInvalid")).max(255).trim(),
  password: z.string().min(8, vmsg("validation.passwordMin8")).max(128),
  termsAccepted: z.literal(true, vmsg("validation.termsRequired")),
});

/** Memakai tautan verifikasi email (issue #138). */
export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(128),
});

/**
 * Field yang DIPAKAI BERSAMA form dan route handler atur-ulang (pola yang sama
 * dengan `changePasswordFields` di bawah — dua daftar identik tidak ditulis
 * dua kali).
 */
const resetPasswordFields = {
  token: z.string().min(1).max(128),
  newPassword: z.string().min(8, vmsg("validation.passwordMin8")).max(128),
};

/** API body atur-ulang (`confirmPassword` hanya urusan client). */
export const resetPasswordApiSchema = z.object(resetPasswordFields);

export const resetPasswordSchema = z
  .object({
    ...resetPasswordFields,
    confirmPassword: z.string().min(1, vmsg("validation.passwordConfirmRequired")),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: vmsg("validation.passwordMismatch"),
    path: ["confirmPassword"],
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
