/**
 * Penyajian PENAWARAN MASUK di konsol — label, warna lencana, dan tautan
 * WhatsApp. MURNI (tanpa Prisma, tanpa `next/*`), dipakai halaman daftar,
 * rincian, dan diuji `tests/operator-leads.test.ts`.
 */

import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { LeadKind, LeadStatus } from "@sai/core/lead-request";
import type { BadgeVariant } from "@sai/ui/badge";

export const LEAD_STATUS_LABEL = {
  baru: "operator.leads.statusBaru",
  dihubungi: "operator.leads.statusDihubungi",
  selesai: "operator.leads.statusSelesai",
  spam: "operator.leads.statusSpam",
} as const satisfies Record<LeadStatus, DictionaryKey>;

export const LEAD_KIND_LABEL = {
  demo: "auth.lead.kindDemo",
  quote: "auth.lead.kindQuote",
  question: "auth.lead.kindQuestion",
} as const satisfies Record<LeadKind, DictionaryKey>;

/** Label tombol PERALIHAN — kata kerja, bukan nama status. */
export const LEAD_ACTION_LABEL = {
  baru: "operator.leads.actionRestore",
  dihubungi: "operator.leads.actionContacted",
  selesai: "operator.leads.actionDone",
  spam: "operator.leads.actionSpam",
} as const satisfies Record<LeadStatus, DictionaryKey>;

/** Warna lencana status — selalu berteks, bukan warna-saja. */
export function leadStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "baru":
      return "warning";
    case "dihubungi":
      return "default";
    case "selesai":
      return "success";
    case "spam":
      return "danger";
    default:
      return "outline";
  }
}

/**
 * Nomor `wa.me` tersimpan (`62812…`) → bentuk yang enak dibaca:
 * `+62 812-3456-7890`. Nomor non-Indonesia hanya diberi `+`.
 */
export function formatLeadPhone(digits: string): string {
  if (!/^\d+$/.test(digits)) return digits;
  if (!digits.startsWith("62")) return `+${digits}`;
  const lokal = digits.slice(2);
  const bagian = [lokal.slice(0, 3), lokal.slice(3, 7), lokal.slice(7)].filter(Boolean);
  return `+62 ${bagian.join("-")}`;
}

/** Tautan WhatsApp ke PROSPEK dengan sapaan siap kirim (manusia yang menekan kirim). */
export function leadWhatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
