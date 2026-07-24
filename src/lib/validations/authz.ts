import { z } from "zod";
import { PERMISSIONS, type Permission } from "@/lib/authz";
import { roleEnum } from "@/lib/validations/common";
import { ROLE_VALUES } from "@/lib/constants";

/**
 * Payload PUT /api/authz/overrides (issue #73): set LENGKAP override yang
 * diinginkan — bukan patch — supaya menyimpan bersifat idempoten dan "Reset
 * ke bawaan" cukup mengirim daftar kosong. Satu skema untuk dua sisi
 * (Konvensi Form MASTER.md): client memvalidasi sebelum konfirmasi, server
 * tetap penjaga terakhir. Invarian lintas-baris (anti-lockout, delete ⊆
 * write ⊆ read) dicek terpisah oleh `validateOverrides` — zod hanya menjaga
 * bentuknya.
 */
export const permissionEnum = z.enum(PERMISSIONS as [Permission, ...Permission[]]);

export const overrideRowSchema = z.object({
  role: roleEnum,
  permission: permissionEnum,
  allowed: z.boolean(),
});

export const overridesPayloadSchema = z.object({
  overrides: z
    .array(overrideRowSchema)
    // Paling banyak satu baris per sel matriks — lebih dari itu pasti kembar.
    .max(PERMISSIONS.length * ROLE_VALUES.length, "Terlalu banyak baris override."),
});

export type OverridesPayload = z.infer<typeof overridesPayloadSchema>;

/**
 * Payload PUT /api/users/[id]/permissions (issue #75): set LENGKAP override
 * pengguna itu — bukan patch — daftar kosong = "ikuti peran sepenuhnya".
 * Bentuk saja; invarian lintas-baris (anti-lockout bos, delete ⊆ write ⊆
 * read pada set FINAL) dicek `validateUserOverrides`.
 */
export const userOverrideRowSchema = z.object({
  permission: permissionEnum,
  allowed: z.boolean(),
});

export const userOverridesPayloadSchema = z.object({
  overrides: z
    .array(userOverrideRowSchema)
    // Paling banyak satu baris per izin — lebih dari itu pasti kembar.
    .max(PERMISSIONS.length, "Terlalu banyak baris override."),
});

export type UserOverridesPayload = z.infer<typeof userOverridesPayloadSchema>;
