"use server";

/**
 * Server action TAMPILAN HALAMAN DEPAN (konsol `/landing`, migration platform
 * 0014).
 *
 * Empat kewajiban yang sama dengan `settings/actions.ts`, nol logika setelan:
 *   1. penjaga bidang + IZIN (`requireOperatorActionSession`);
 *   2. validasi ulang dengan SKEMA YANG SAMA yang dipakai formulir;
 *   3. tulis lewat `saveLandingSettings` — HANYA medan milik formulirnya;
 *   4. jejak audit operator dengan nilai LAMA dan BARU.
 *
 * ══ IZIN ═══════════════════════════════════════════════════════════════════
 *   • seksi, pengumuman, FAQ → `site.publish`: ketiganya LANGSUNG tayang dan
 *     mengubah apa yang dibaca calon customer — kewenangan yang sama dengan
 *     menerbitkan draf isi halaman depan (owner saja).
 *   • tautan demo & kalimat WhatsApp → `site.settings`: keduanya mengubah KE
 *     MANA calon customer dikirim, kelompok yang sama dengan kanal kontak.
 *
 * ══ JEJAK ══════════════════════════════════════════════════════════════════
 * Nilai lama & baru dicatat utuh untuk medan pendek (seksi, tautan, kalimat
 * WhatsApp, pengumuman). Untuk FAQ yang dicatat PERTANYAANNYA (bahasa
 * Indonesia) sebelum/sesudah + panjang jawabannya — jawaban utuhnya ada di
 * barisnya sendiri; jejak yang menyalin setiap paragraf pemasaran berhenti
 * bisa dibaca sebagai jejak (alasan yang sama dengan `operator.content.*`).
 *
 * Sesudah tersimpan, sinyal `landing-settings` naik (di `saveLandingSettings`)
 * dan halaman publik berubah dalam `CACHE_SIGNAL_POLL_SECONDS`.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { CACHE_SIGNAL_POLL_SECONDS } from "@sai/core/cache-signals";
import { clientIpFrom } from "@sai/core/operator-plane";
import {
  ANNOUNCEMENT_TEXT_MAX,
  FAQ_ANSWER_MAX,
  FAQ_QUESTION_MAX,
  WHATSAPP_MESSAGE_MAX,
  normalizeLocalizedText,
  parseAnnouncementHref,
  parseDemoBookingUrl,
  wibLocalToIso,
  type LandingAnnouncement,
  type LandingFaqItem,
  type LandingSettings,
} from "@sai/core/landing-settings";
import { getT } from "@sai/platform/i18n/server";
import { landingSettingsForOperator, saveLandingSettings, type LandingSettingsPatch } from "@sai/platform/landing-settings";
import { writeOperatorAuditLog, type OperatorAuditAction } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  landingAnnouncementSchema,
  landingContactSchema,
  landingFaqSchema,
  landingSectionsSchema,
  type LandingActionResult,
} from "@op/lib/validations/landing";


/** Setelan SEBELUM ditulis — untuk sisi "dari" jejak. Tak terbaca = `null`. */
async function setelanLama(): Promise<LandingSettings | null> {
  const lama = await landingSettingsForOperator();
  return lama === "unreachable" ? null : lama.settings;
}

/** Tulis + jejak + segarkan — satu jalan untuk keempat formulir. */
async function simpan(
  operator: string,
  patch: LandingSettingsPatch,
  action: OperatorAuditAction,
  details: Record<string, unknown>
): Promise<LandingActionResult> {
  const t = await getT();
  try {
    await saveLandingSettings(patch, operator);
  } catch (error) {
    /* Platform mati: tidak tersimpan, dan halaman publik tetap memakai
       tampilan terakhir yang terbaca (atau bawaan) — bukan 500. */
    console.error("[operator-landing] tampilan gagal disimpan:", error);
    return { ok: false, message: t("operator.landing.errSave") };
  }
  await writeOperatorAuditLog({
    operator,
    action,
    ipAddress: clientIpFrom(await headers()),
    details,
  });
  revalidatePath("/landing");
  return { ok: true, message: t("operator.landing.saved", { seconds: CACHE_SIGNAL_POLL_SECONDS }) };
}

/* ── 1. Seksi ──────────────────────────────────────────────────────────────── */

export async function operatorSaveLandingSections(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingSectionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const lama = await setelanLama();
  return simpan(session.operator.name, { hiddenSections: parsed.data.hidden }, "operator.landing.sections", {
    hiddenFrom: lama?.hiddenSections ?? null,
    hiddenTo: parsed.data.hidden,
  });
}

/* ── 2. Demo & WhatsApp ────────────────────────────────────────────────────── */

export async function operatorSaveLandingContact(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.settings");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const d = parsed.data;

  const demoBookingUrl = d.demoBookingUrl.length > 0 ? parseDemoBookingUrl(d.demoBookingUrl) : null;
  const whatsappMessage = normalizeLocalizedText(
    { id: d.whatsappId, en: d.whatsappEn, zh: d.whatsappZh },
    WHATSAPP_MESSAGE_MAX
  );

  const lama = await setelanLama();
  return simpan(session.operator.name, { demoBookingUrl, whatsappMessage }, "operator.landing.contact", {
    demoBookingUrlFrom: lama?.demoBookingUrl ?? null,
    demoBookingUrlTo: demoBookingUrl,
    whatsappMessageFrom: lama?.whatsappMessage ?? null,
    whatsappMessageTo: whatsappMessage,
  });
}

/* ── 3. Pengumuman ─────────────────────────────────────────────────────────── */

export async function operatorSaveLandingAnnouncement(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingAnnouncementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const d = parsed.data;

  const text = normalizeLocalizedText({ id: d.textId, en: d.textEn, zh: d.textZh }, ANNOUNCEMENT_TEXT_MAX);
  if (!text) return { ok: false, message: t("validation.invalidInput") };
  const announcement: LandingAnnouncement = {
    enabled: d.enabled,
    text,
    href: d.href.length > 0 ? parseAnnouncementHref(d.href) : null,
    startsAt: d.startsAt ? wibLocalToIso(d.startsAt) : null,
    endsAt: d.endsAt ? wibLocalToIso(d.endsAt) : null,
  };

  const lama = await setelanLama();
  return simpan(session.operator.name, { announcement }, "operator.landing.announcement", {
    announcementFrom: lama?.announcement ?? null,
    announcementTo: announcement,
  });
}

/** Hapus pengumuman sepenuhnya (bukan sekadar mematikannya). */
export async function operatorClearLandingAnnouncement(): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const lama = await setelanLama();
  return simpan(session.operator.name, { announcement: null }, "operator.landing.announcement", {
    announcementFrom: lama?.announcement ?? null,
    announcementTo: null,
  });
}

/* ── 4. FAQ ────────────────────────────────────────────────────────────────── */

const ringkasFaq = (items: LandingFaqItem[] | null | undefined) =>
  items ? items.map((i) => ({ key: i.key, question: i.question.id, answerLength: i.answer.id.length })) : null;

export async function operatorSaveLandingFaq(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingFaqSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const items: LandingFaqItem[] = [];
  for (const i of parsed.data.items) {
    const question = normalizeLocalizedText({ id: i.questionId, en: i.questionEn, zh: i.questionZh }, FAQ_QUESTION_MAX);
    const answer = normalizeLocalizedText({ id: i.answerId, en: i.answerEn, zh: i.answerZh }, FAQ_ANSWER_MAX);
    if (!question || !answer) return { ok: false, message: t("validation.invalidInput") };
    items.push({ key: i.key, question, answer });
  }

  const lama = await setelanLama();
  return simpan(session.operator.name, { faqItems: items }, "operator.landing.faq", {
    faqFrom: ringkasFaq(lama?.faqItems),
    faqTo: ringkasFaq(items),
  });
}

/** Kembali ke daftar bawaan dari kamus. */
export async function operatorResetLandingFaq(): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const lama = await setelanLama();
  return simpan(session.operator.name, { faqItems: null }, "operator.landing.faq", {
    faqFrom: ringkasFaq(lama?.faqItems),
    faqTo: null,
  });
}
