/**
 * Isi surel PEMBERITAHUAN AKHIR UJI COBA — tiga bahasa, satu surel.
 *
 * ══ KENAPA BERKAS INI ADA ═══════════════════════════════════════════════════
 * Sampai alur demo-first (keputusan pemilik 24 Okt 2026) surel `trial_ending`
 * berbunyi "setelah itu siklus tagih dimulai dan tagihan pertama terbit
 * otomatis" — kalimat yang dulu benar dan kini bohong: uji coba yang habis
 * BEKU hanya-baca, tidak ditagih (`docs/KOMERSIALISASI.md` §1.2, K-3). Yang
 * diminta dari penerimanya pun berubah: bukan "bayar", melainkan "minta
 * aktivasi / hubungi kami".
 *
 * ══ TIGA BAHASA DALAM SATU SUREL ═══════════════════════════════════════════
 * Pengguna tidak menyimpan pilihan bahasa di basis data — bahasa hidup di
 * cookie peramban, dan penjadwal tidak punya peramban. Menebak satu bahasa
 * berarti sebagian penerima membaca surel yang tidak bisa mereka baca, tepat
 * pada surel yang menentukan apakah buku mereka tetap bisa ditulis. Jadi
 * ketiganya dikirim berurutan: Indonesia lebih dulu, lalu Inggris, lalu
 * Mandarin.
 *
 * ══ KALIMATNYA DI KAMUS ════════════════════════════════════════════════════
 * Teksnya kunci `billing.trialNotice.*` di ketiga kamus — `tests/i18n.test.ts`
 * menjaga kelengkapannya. Kamusnya DISUNTIKKAN: penjadwal memuatnya lewat
 * `@sai/core/i18n/load` (tanpa `server-only`), tes memakai JSON langsung.
 *
 * MURNI: tanpa I/O, tanpa Prisma.
 */

import type { Dictionary } from "@sai/core/i18n/dictionary";
import { translate } from "@sai/core/i18n/dictionary";

export type TrialNoticeKind =
  /** Sebelum tanggal akhir (F-7/F-3/F-1). */
  | "ending"
  /** Tanggal akhir sudah lewat tanpa pemberitahuan sebelumnya (F-0). */
  | "late";

export interface TrialNoticeInput {
  kind: TrialNoticeKind;
  /** Tanggal akhir uji coba, SUDAH diformat (YYYY-MM-DD, tanggal bisnis). */
  trialEndDate: string;
  /** Paling cepat buku menjadi hanya-baca, SUDAH diformat. */
  freezeDate: string;
  /** "H-7" dst. — hanya dipakai `ending`. */
  dayLabel: string;
  contact: { email?: string; whatsappUrl?: string };
}

const LANGS = ["id", "en", "zh"] as const;

function contactLine(d: Dictionary, contact: TrialNoticeInput["contact"]): string {
  const channels = [contact.whatsappUrl, contact.email].filter(
    (c): c is string => Boolean(c)
  );
  return channels.length > 0
    ? translate(d, "billing.trialNotice.contact", { channels: channels.join(" · ") })
    : translate(d, "billing.trialNotice.contactNone");
}

function block(d: Dictionary, input: TrialNoticeInput): string {
  const values = {
    date: input.trialEndDate,
    freezeDate: input.freezeDate,
    when: input.dayLabel,
  };
  const body =
    input.kind === "ending"
      ? translate(d, "billing.trialNotice.bodyEnding", values)
      : translate(d, "billing.trialNotice.bodyLate", values);
  return [
    translate(d, "billing.trialNotice.greeting"),
    body,
    translate(d, "billing.trialNotice.readOnly"),
    translate(d, "billing.trialNotice.activate"),
    contactLine(d, input.contact),
  ].join("\n\n");
}

/**
 * Subjek (Indonesia — bahasa utama produk) + badan tiga bahasa.
 */
export function trialNoticeMail(
  dictionaries: Record<(typeof LANGS)[number], Dictionary>,
  input: TrialNoticeInput
): { subject: string; text: string } {
  const values = { when: input.dayLabel, date: input.trialEndDate };
  const subject =
    input.kind === "ending"
      ? translate(dictionaries.id, "billing.trialNotice.subjectEnding", values)
      : translate(dictionaries.id, "billing.trialNotice.subjectLate", values);
  const sections = LANGS.map((lang, i) => {
    const heading = i === 0 ? "" : `— ${translate(dictionaries[lang], "billing.trialNotice.langLabel")} —\n\n`;
    return heading + block(dictionaries[lang], input);
  });
  return { subject, text: `${sections.join("\n\n\n")}\n\n— SAI Accounting` };
}
