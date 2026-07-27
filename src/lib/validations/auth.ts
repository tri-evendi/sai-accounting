import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

export const loginSchema = z.object({
  username: z.string().min(1, vmsg("validation.usernameRequired")).max(50).trim(),
  password: z.string().min(1, vmsg("validation.passwordRequired")).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, vmsg("validation.currentPasswordRequired")),
    newPassword: z.string().min(8, vmsg("validation.passwordMin8")).max(128),
    confirmPassword: z.string().min(1, vmsg("validation.passwordConfirmRequired")),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: vmsg("validation.passwordMismatch"),
    path: ["confirmPassword"],
  });

/** API body (confirm handled on client). */
export const changePasswordApiSchema = z.object({
  currentPassword: z.string().min(1, vmsg("validation.currentPasswordRequired")).max(128),
  newPassword: z.string().min(8, vmsg("validation.passwordMin8")).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
