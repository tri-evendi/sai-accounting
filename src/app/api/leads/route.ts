/**
 * Formulir PERMINTAAN PENAWARAN / DEMO dari halaman publik (migration platform
 * 0016) — `POST /api/leads`.
 *
 * PUBLIK (tanpa sesi — pengirimnya calon customer yang belum punya akun;
 * dilepas `proxy.ts` sebagai jalur persis, dan terdaftar sebagai pengecualian
 * beralasan di `tests/authz-coverage.test.ts`).
 *
 * ══ PAGARNYA ═══════════════════════════════════════════════════════════════
 *   • Hanya `application/json` — formulir lintas-situs polos tidak bisa
 *     mengirimnya tanpa preflight CORS, yang tidak dijawab route ini.
 *   • Pembatas laju PERSISTEN per sidik IP (sebelum validasi — banjir isian
 *     rusak ikut terhitung) dan per nomor WhatsApp (sesudah validasi).
 *   • Skema yang SAMA dengan formulirnya (`leadFormSchema`), lalu
 *     `toLeadRecord` memotong & membersihkan sekali lagi.
 *   • HONEYPOT `website`: terisi = bot. Dijawab SUKSES tanpa menyimpan apa
 *     pun — jawaban berbeda hanya mengajari bot isian mana yang dijebak.
 *   • Tanpa CAPTCHA: tidak ada ketergantungan pihak ketiga di halaman publik.
 *
 * ══ URUTAN ═════════════════════════════════════════════════════════════════
 * Baris disimpan DULU, dan "terima kasih" hanya dijawab bila barisnya ada.
 * Surel ke tim berjalan SESUDAH jawaban (`after()`), dan kegagalannya — atau
 * pemasangan tanpa SMTP — tidak pernah mengubah jawaban.
 */
import { NextResponse, after } from "next/server";

import { clientIpFrom } from "@sai/core/client-ip";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { resolveMailConfig, sendMail } from "@sai/platform/mailer";
import { platformDb } from "@sai/platform/platform-db";
import { resolveContactChannels } from "@sai/platform/site-settings";
import { createLeadRequest, hashClientIp, notifyTeamOfLead } from "@/lib/lead-intake";
import { PERSISTENT_RATE_LIMITS, checkPersistentRateLimit } from "@/lib/rate-limit-persistent";
import { toLeadRecord } from "@/lib/lead-record";
import { leadFormSchema } from "@/lib/validations/lead";

export async function POST(request: Request) {
  const { t, dictionary, locale } = await getRequestI18n();

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 415 });
  }

  /* `null` (rantai proxy lebih pendek dari topologi) = SATU ember bersama —
     gagal-tertutup, pola `forgot-password`. */
  const ipHash = hashClientIp(clientIpFrom(request.headers) ?? "unknown");

  try {
    const perIp = await checkPersistentRateLimit(`lead:ip:${ipHash}`, PERSISTENT_RATE_LIMITS.leadIp);
    if (!perIp.allowed) {
      return NextResponse.json({ error: t("auth.lead.tooMany") }, { status: 429 });
    }
  } catch (error) {
    console.error("[leads] pembatas laju tak terjangkau:", error);
    return NextResponse.json({ error: t("auth.lead.failed") }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leadFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  /* Honeypot — lihat kepala berkas. */
  if (parsed.data.website.trim() !== "") {
    return NextResponse.json({ ok: true, reference: null });
  }

  const record = toLeadRecord(parsed.data);
  if (!record.name || !record.company) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  try {
    const perPhone = await checkPersistentRateLimit(
      `lead:phone:${record.phone}`,
      PERSISTENT_RATE_LIMITS.leadPhone
    );
    if (!perPhone.allowed) {
      return NextResponse.json({ error: t("auth.lead.tooMany") }, { status: 429 });
    }
  } catch (error) {
    console.error("[leads] pembatas laju tak terjangkau:", error);
    return NextResponse.json({ error: t("auth.lead.failed") }, { status: 503 });
  }

  let lead;
  try {
    lead = await createLeadRequest(platformDb, record, { ipHash, locale });
  } catch (error) {
    console.error("[leads] permintaan gagal disimpan:", error);
    return NextResponse.json({ error: t("auth.lead.failed") }, { status: 503 });
  }

  after(() =>
    notifyTeamOfLead(
      {
        recipient: async () => (await resolveContactChannels()).email,
        resolveMailConfig: () => resolveMailConfig(),
        sendMail,
      },
      lead
    ).then((outcome) => {
      if (outcome !== "sent") console.log(`[leads] ${lead.reference}: surel tim ${outcome}`);
    })
  );

  return NextResponse.json({ ok: true, reference: lead.reference });
}
