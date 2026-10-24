import { z } from "zod";

import { vmsg } from "@sai/core/i18n/validation";
import { LEAD_KINDS, LEAD_LIMITS } from "@sai/core/lead-request";
import { LEGAL_FORMS } from "@sai/core/legal-form";
import { normalizeWhatsAppNumber } from "@sai/core/phone";

/**
 * Formulir PERMINTAAN PENAWARAN / DEMO di halaman publik (`/register` saat
 * pendaftaran tertutup, dan `/register?quote=1`) — SATU skema untuk formulir
 * (RHF) dan route `/api/leads` (MASTER.md §Konvensi Form aturan 1).
 *
 * Semua isian berbentuk TEKS di sisi formulir (termasuk jumlah perusahaan):
 * tipe input skema harus sama dengan nilai isian, dan `toLeadRecord` yang
 * menerjemahkannya ke bentuk kolom di server (`src/lib/lead-record.ts`).
 * Server tidak pernah mempercayai hasil formulir — route menjalankan skema yang
 * sama lagi, lalu `toLeadRecord` memotong dan membersihkan sekali lagi.
 */

/** Surel: kosong ATAU alamat yang sah. */
const emailOpsional = z
  .string()
  .trim()
  .max(LEAD_LIMITS.email, vmsg("validation.emailInvalid"))
  .refine((v) => v === "" || z.email().safeParse(v).success, vmsg("validation.emailInvalid"));

export const leadFormSchema = z.object({
  kind: z.enum(LEAD_KINDS),
  name: z.string().trim().min(1, vmsg("validation.nameRequired")).max(LEAD_LIMITS.name),
  company: z
    .string()
    .trim()
    .min(1, vmsg("validation.companyNameRequired"))
    .max(LEAD_LIMITS.company),
  /* Nomor Indonesia ditulis dengan banyak gaya (0812…, +62 812…, 62 812…);
     yang lolos hanyalah yang `normalizeWhatsAppNumber` pahami dengan YAKIN —
     nomor yang ditebak adalah pesan yang sampai ke orang lain. */
  phone: z
    .string()
    .trim()
    .max(LEAD_LIMITS.phoneInput, vmsg("validation.phoneInvalid"))
    .refine((v) => normalizeWhatsAppNumber(v) !== null, vmsg("validation.phoneInvalid")),
  email: emailOpsional,
  legalForm: z.union([z.literal(""), z.enum(LEGAL_FORMS)]),
  companyCount: z
    .string()
    .trim()
    .refine((v) => {
      if (v === "") return true;
      if (!/^\d{1,4}$/.test(v)) return false;
      const n = Number(v);
      return n >= 1 && n <= LEAD_LIMITS.companyCountMax;
    }, vmsg("validation.leadCompanyCountInvalid")),
  message: z.string().trim().max(LEAD_LIMITS.message, vmsg("validation.leadMessageTooLong")),
  /* Persetujuan dihubungi (UU PDP) — tanpa centang tidak ada yang disimpan. */
  consent: z.literal(true, vmsg("validation.leadConsentRequired")),
  /* HONEYPOT: isian tersembunyi yang tidak pernah diisi manusia. Diterima
     skema (supaya bot tidak belajar dari 400), ditolak diam-diam oleh route. */
  website: z.string().max(200),
  /* Sumber dari URL (`?from=` / `?quote=1`) — disaring `sanitizeLeadSource`. */
  source: z.string().max(LEAD_LIMITS.source),
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;

/** Nilai awal formulir — dipakai komponen dan tes. */
export function emptyLeadForm(kind: LeadFormInput["kind"], source: string): LeadFormInput {
  return {
    kind,
    name: "",
    company: "",
    phone: "",
    email: "",
    legalForm: "",
    companyCount: "",
    message: "",
    consent: false as unknown as true,
    website: "",
    source,
  };
}
