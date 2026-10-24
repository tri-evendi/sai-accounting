/**
 * Skema konsol `/landing` — TAMPILAN HALAMAN DEPAN (migration platform 0014).
 *
 * SATU skema, dua sisi (Konvensi Form MASTER.md): formulir client
 * memvalidasi dengan skema yang sama yang diurai ulang server action. Aturan
 * sahnya (https saja, jalur internal, batas panjang, kunci butir) TIDAK
 * ditulis ulang di sini — semuanya dipanggil dari INTI
 * `@sai/core/landing-settings`, yang juga dipakai pembaca halaman publik.
 * Jadi tidak ada nilai yang lolos konsol tetapi ditolak saat dibaca.
 *
 * Berkas terpisah dari `operator.ts` supaya formulir pengaturan situs dan
 * formulir tampilan tidak saling menyunting satu berkas.
 */

import { z } from "zod";
import { vmsg } from "@sai/core/i18n/validation";
import {
  ANNOUNCEMENT_TEXT_MAX,
  DEMO_BOOKING_URL_MAX,
  FAQ_ANSWER_MAX,
  FAQ_ITEMS_MAX,
  FAQ_KEY_PATTERN,
  FAQ_QUESTION_MAX,
  LANDING_SECTIONS,
  WHATSAPP_MESSAGE_MAX,
  parseAnnouncementHref,
  parseDemoBookingUrl,
  wibLocalToIso,
} from "@sai/core/landing-settings";

/** Jawaban server action `/landing` — kalimat dalam bahasa pengguna. Tinggal
 *  di sini (bukan di `actions.ts`) supaya formulir tidak mengimpor rute. */
export interface LandingActionResult {
  ok: boolean;
  message: string;
}

/* ── 1. Seksi yang tampil ──────────────────────────────────────────────────── */

export const landingSectionsSchema = z.object({
  /** Kunci seksi yang DISEMBUNYIKAN. Kosong = semua tampil (bawaan). */
  hidden: z.array(z.enum(LANDING_SECTIONS)).max(LANDING_SECTIONS.length),
});
export type LandingSectionsFormInput = z.infer<typeof landingSectionsSchema>;

/* ── 2. Demo & WhatsApp ────────────────────────────────────────────────────── */

/** Teks opsional per bahasa: kosong boleh, tetapi `id` wajib bila yang lain diisi. */
const optionalText = (max: number) => z.string().trim().max(max);

export const landingContactSchema = z
  .object({
    /** Kosong = "Jadwalkan demo" tetap ke `/register`. */
    demoBookingUrl: z
      .string()
      .trim()
      .max(DEMO_BOOKING_URL_MAX)
      .refine((v) => v.length === 0 || parseDemoBookingUrl(v) !== null, {
        message: vmsg("validation.landingHttpsUrl"),
      }),
    whatsappId: optionalText(WHATSAPP_MESSAGE_MAX),
    whatsappEn: optionalText(WHATSAPP_MESSAGE_MAX),
    whatsappZh: optionalText(WHATSAPP_MESSAGE_MAX),
  })
  .refine((v) => v.whatsappId.length > 0 || (v.whatsappEn.length === 0 && v.whatsappZh.length === 0), {
    path: ["whatsappId"],
    message: vmsg("validation.landingIndonesianRequired"),
  });
export type LandingContactFormInput = z.infer<typeof landingContactSchema>;

/* ── 3. Bilah pengumuman ───────────────────────────────────────────────────── */

/** `""` atau `YYYY-MM-DDTHH:mm` (WIB). */
const wibDateTime = z
  .string()
  .trim()
  .refine((v) => v.length === 0 || wibLocalToIso(v) !== null, { message: vmsg("validation.dateRequired") });

export const landingAnnouncementSchema = z
  .object({
    enabled: z.boolean(),
    textId: z.string().trim().min(1, vmsg("validation.landingIndonesianRequired")).max(ANNOUNCEMENT_TEXT_MAX),
    textEn: optionalText(ANNOUNCEMENT_TEXT_MAX),
    textZh: optionalText(ANNOUNCEMENT_TEXT_MAX),
    href: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v.length === 0 || parseAnnouncementHref(v) !== null, {
        message: vmsg("validation.landingLinkInvalid"),
      }),
    startsAt: wibDateTime,
    endsAt: wibDateTime,
  })
  .refine(
    (v) => {
      const mulai = wibLocalToIso(v.startsAt);
      const akhir = wibLocalToIso(v.endsAt);
      return !mulai || !akhir || Date.parse(akhir) > Date.parse(mulai);
    },
    { path: ["endsAt"], message: vmsg("validation.endBeforeStart") }
  );
export type LandingAnnouncementFormInput = z.infer<typeof landingAnnouncementSchema>;

/* ── 4. Daftar tanya-jawab ─────────────────────────────────────────────────── */

export const landingFaqItemSchema = z.object({
  key: z.string().regex(FAQ_KEY_PATTERN),
  questionId: z.string().trim().min(1, vmsg("validation.landingIndonesianRequired")).max(FAQ_QUESTION_MAX),
  questionEn: optionalText(FAQ_QUESTION_MAX),
  questionZh: optionalText(FAQ_QUESTION_MAX),
  answerId: z.string().trim().min(1, vmsg("validation.landingIndonesianRequired")).max(FAQ_ANSWER_MAX),
  answerEn: optionalText(FAQ_ANSWER_MAX),
  answerZh: optionalText(FAQ_ANSWER_MAX),
});

export const landingFaqSchema = z.object({
  /** Minimal satu — "tanpa FAQ" adalah sakelar seksi, bukan daftar kosong. */
  items: z
    .array(landingFaqItemSchema)
    .min(1)
    .max(FAQ_ITEMS_MAX)
    .refine((items) => new Set(items.map((i) => i.key)).size === items.length),
});
export type LandingFaqFormInput = z.infer<typeof landingFaqSchema>;
export type LandingFaqItemFormInput = z.infer<typeof landingFaqItemSchema>;
