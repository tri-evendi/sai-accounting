/**
 * Kunci kamus bentuk usaha — LITERAL penuh, bukan dirakit template.
 *
 * Kode galat (`validatePartners`, `savePartners`, wisaya) dipetakan ke kunci
 * `legalForm.errors.*` lewat tabel ini supaya setiap kunci tertulis utuh di
 * sumber: penjaga kunci yatim (`tests/i18n-orphan-keys.test.ts`) melihatnya,
 * dan kode galat baru yang lupa diberi kalimat gagal di `tsc` (tipe kunci
 * diikat ke kamus), bukan tampil sebagai jalur-titik mentah di layar.
 */
import type { EquityModel, PartnerRole } from "@sai/core/legal-form";

export const LEGAL_FORM_ERROR_KEYS = {
  partnersRequired: "legalForm.errors.partnersRequired",
  partnersMinTwo: "legalForm.errors.partnersMinTwo",
  soleOwnerExactlyOne: "legalForm.errors.soleOwnerExactlyOne",
  partnerNameRequired: "legalForm.errors.partnerNameRequired",
  partnerNameDuplicate: "legalForm.errors.partnerNameDuplicate",
  partnerShareInvalid: "legalForm.errors.partnerShareInvalid",
  partnerSharesNot100: "legalForm.errors.partnerSharesNot100",
  cvNeedsActive: "legalForm.errors.cvNeedsActive",
  cvNeedsLimited: "legalForm.errors.cvNeedsLimited",
  partnerRoleNotAllowed: "legalForm.errors.partnerRoleNotAllowed",
  lockedAfterSeed: "legalForm.errors.lockedAfterSeed",
  partnersNotForThisForm: "legalForm.errors.partnersNotForThisForm",
  partnerUnknown: "legalForm.errors.partnerUnknown",
  partnersIncomplete: "legalForm.errors.partnersIncomplete",
  parentCodeTaken: "legalForm.errors.parentCodeTaken",
} as const;

export type LegalFormErrorCode = keyof typeof LEGAL_FORM_ERROR_KEYS;

/** Petunjuk templat ekuitas per model (wisaya). */
export const EQUITY_HINT_KEYS = {
  retained_earnings: "legalForm.equityHint.retained_earnings",
  partners: "legalForm.equityHint.partners",
  sole_owner: "legalForm.equityHint.sole_owner",
} as const satisfies Record<EquityModel, string>;

/** Pilihan peran sekutu CV. */
export const PARTNER_ROLE_OPTION_KEYS = {
  aktif: "legalForm.roleOption.aktif",
  komanditer: "legalForm.roleOption.komanditer",
} as const satisfies Record<PartnerRole, string>;
