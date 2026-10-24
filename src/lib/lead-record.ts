/**
 * Isian formulir penawaran yang SUDAH lolos `leadFormSchema` → nilai kolom
 * `lead_requests`. Sisi server saja (route `/api/leads`).
 *
 * Tidak tinggal di `lib/validations/`: berkas di sana hanya memuat skema, dan
 * penjaga `tests/i18n-validation.test.tsx` menyapu literalnya untuk kalimat
 * yang tertinggal — pembersih teks di bawah bukan skema.
 */

import { LEAD_LIMITS, sanitizeLeadSource } from "@sai/core/lead-request";
import { normalizeWhatsAppNumber } from "@sai/core/phone";
import type { LeadFormInput } from "@/lib/validations/lead";

/** Bentuk kolom `lead_requests` yang diturunkan dari isian yang sudah lolos. */
export interface LeadRecordInput {
  kind: LeadFormInput["kind"];
  name: string;
  company: string;
  phone: string;
  email: string | null;
  legalForm: string | null;
  companyCount: number | null;
  message: string | null;
  source: string;
}

/**
 * Buang karakter kendali (kecuali baris baru di pesan) — teks ini dirender di
 * konsol dan masuk ke surel tim; karakter kendali tidak punya tempat di sana.
 */
function bersihkan(v: string, multiline = false): string {
  const sumber = multiline ? v.replace(/\r\n?/g, "\n") : v;
  let hasil = "";
  for (const ch of sumber) {
    const kode = ch.charCodeAt(0);
    const kendali = kode < 32 || kode === 127;
    if (!kendali) hasil += ch;
    else if (multiline && ch === "\n") hasil += ch;
    else if (!multiline) hasil += " ";
  }
  return (multiline ? hasil : hasil.replace(/\s+/g, " ")).trim();
}

/**
 * Isian tervalidasi → nilai kolom. Memotong sekali lagi ke batas kolom (pagar
 * kedua di belakang skema), menormalkan nomor, mengecilkan huruf surel, dan
 * menyaring sumbernya. `fallbackSource` dipakai bila `source` tidak sah.
 */
export function toLeadRecord(input: LeadFormInput, fallbackSource = "contact_page"): LeadRecordInput {
  const phone = normalizeWhatsAppNumber(input.phone);
  if (!phone) throw new Error("toLeadRecord: nomor tidak lolos skema");
  const email = input.email.trim().toLowerCase();
  const message = bersihkan(input.message, true).slice(0, LEAD_LIMITS.message);
  return {
    kind: input.kind,
    name: bersihkan(input.name).slice(0, LEAD_LIMITS.name),
    company: bersihkan(input.company).slice(0, LEAD_LIMITS.company),
    phone,
    email: email === "" ? null : email.slice(0, LEAD_LIMITS.email),
    legalForm: input.legalForm === "" ? null : input.legalForm,
    companyCount: input.companyCount === "" ? null : Number(input.companyCount),
    message: message === "" ? null : message,
    source: sanitizeLeadSource(input.source) ?? fallbackSource,
  };
}
