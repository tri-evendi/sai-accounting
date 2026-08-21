"use server";

/**
 * Server action PENGATURAN SUREL (issue #169) — SENGAJA server action, bukan
 * route API: `tests/authz-coverage.test.ts` menolak `route.ts` mana pun di
 * bawah grup `(operator)`, karena permukaan `src/app/api` adalah permukaan
 * PELANGGAN dan konsol ini bukan.
 *
 * Lapisan ini tipis — empat kewajiban, nol logika kripto:
 *   1. penjaga bidang (`requireOperatorActionSession`: host + IP + cookie +
 *      MFA), sama seperti aksi tulis tenant #155;
 *   2. validasi ulang dengan SKEMA YANG SAMA yang dipakai form client
 *      (`lib/validations/operator.ts`);
 *   3. panggil inti `lib/mail-settings.ts` (enkripsi & aturan "kosong berarti
 *      pertahankan" hidup DI SANA, teruji tanpa basis data);
 *   4. catat jejak audit operator — TANPA kata sandi, dalam bentuk apa pun.
 *
 * KATA SANDI tidak pernah kembali ke client: jawaban aksi ini hanya kalimat
 * untuk manusia, dan `mailSettingsForOperator()` hanya mengirim `hasPassword`.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getT } from "@/lib/i18n/server";
import {
  recordMailTestResult,
  redactSecret,
  saveMailSettings,
  type MailSettingsClient,
} from "@/lib/mail-settings";
import { resolveMailConfig, sendMail } from "@/lib/mailer";
import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { requireOperatorActionSession } from "@/lib/operator/guard";
import { clientIpFrom } from "@/lib/operator/plane";
import { platformDb } from "@/lib/platform-db";
import { mailSettingsSchema, mailTestSchema } from "@/lib/validations/operator";

export interface OperatorMailActionResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa pengguna — untuk `root` form. */
  message: string;
}

type T = Awaited<ReturnType<typeof getT>>;

async function guardAndTranslate(): Promise<
  { ok: true; t: T; actorName: string; ip: string | null } | { ok: false; result: OperatorMailActionResult }
> {
  const t = await getT();
  const session = await requireOperatorActionSession();
  if (!session) {
    /* Jawaban seragam — tidak membedakan "host salah" dari "sesi habis". */
    return { ok: false, result: { ok: false, message: t("operator.actions.denied") } };
  }
  return { ok: true, t, actorName: session.operator.name, ip: clientIpFrom(await headers()) };
}

function platform(): { platform: MailSettingsClient } {
  return { platform: platformDb as unknown as MailSettingsClient };
}

/** Teks kosong → `null`: kolom yang tidak diisi adalah kolom yang TIDAK ADA,
 *  bukan string kosong yang kelak lolos sebagai host bernama "". */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/* ── 1. Simpan pengaturan ──────────────────────────────────────────────────── */

export async function operatorSaveMailSettings(input: unknown): Promise<OperatorMailActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName, ip } = gate;

  const parsed = mailSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const data = parsed.data;

  const port = typeof data.port === "number" ? data.port : null;

  let result;
  try {
    result = await saveMailSettings(platform(), {
      transport: data.transport,
      host: orNull(data.host),
      port,
      username: orNull(data.username),
      fromAddress: data.fromAddress,
      archiveAddress: orNull(data.archiveAddress),
      password: data.password,
      clearPassword: data.clearPassword === true,
      updatedBy: actorName,
    });
  } catch (error) {
    /* Platform mati: pengaturan tidak tersimpan, TETAPI surel tetap jalan
     * lewat environment — itu yang dikatakan kalimatnya, bukan "500". */
    console.error("[operator-mail] pengaturan surel gagal disimpan:", error);
    return { ok: false, message: t("operator.mail.errSave") };
  }

  if (result.outcome === "encryption_key_missing") {
    /* GAGAL-TERTUTUP: tidak ada yang ditulis sama sekali — bukan kata sandi
     * mentah, dan bukan pengaturan tanpa kata sandinya. */
    return { ok: false, message: t("operator.mail.errKey", { reason: result.reason }) };
  }

  await writeOperatorAuditLog({
    operator: actorName,
    action: "operator.mail.update",
    ipAddress: ip,
    details: {
      transport: data.transport,
      host: orNull(data.host),
      port,
      username: orNull(data.username),
      fromAddress: data.fromAddress,
      archiveAddress: orNull(data.archiveAddress),
      /* PENANDA, bukan nilainya — jejak audit tidak pernah memuat rahasia. */
      passwordChanged: result.passwordChanged,
      passwordCleared: data.clearPassword === true,
    },
  });

  revalidatePath("/operator/mail");
  return {
    ok: true,
    message: result.passwordChanged
      ? t("operator.mail.savedWithPassword")
      : t("operator.mail.saved"),
  };
}

/* ── 2. Uji kirim ──────────────────────────────────────────────────────────── */

export async function operatorSendTestMail(input: unknown): Promise<OperatorMailActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName, ip } = gate;

  const parsed = mailTestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const to = parsed.data.to;

  /* Yang diuji adalah konfigurasi EFEKTIF (basis data → env → file) — persis
   * yang akan dipakai pendaftaran pelanggan nanti malam, bukan salinan
   * terpisah yang bisa menyimpang. */
  const config = await resolveMailConfig();
  const secret = config.smtp?.pass ?? null;

  let message: string;
  let ok: boolean;
  try {
    const sent = await sendMail(
      {
        to,
        subject: t("operator.mail.testSubject"),
        text: t("operator.mail.testBody"),
      },
      config
    );
    ok = true;
    message = t("operator.mail.testOk", {
      to,
      transport:
        sent.transport === "smtp" ? t("operator.mail.transportSmtp") : t("operator.mail.transportFile"),
      detail: sent.detail,
    });
  } catch (error) {
    ok = false;
    const reason = error instanceof Error ? error.message : String(error);
    message = t("operator.mail.testFailed", { to, reason: redactSecret(reason, secret) });
  }

  /* Hasilnya dicatat DUA kali dengan sengaja: di baris pengaturan (supaya
   * terbaca lagi setelah halaman ditutup) dan di jejak audit operator. */
  await recordMailTestResult(platform(), {
    to,
    status: ok ? "ok" : "error",
    message: redactSecret(message, secret),
  });
  await writeOperatorAuditLog({
    operator: actorName,
    action: "operator.mail.test",
    ipAddress: ip,
    details: {
      to,
      ok,
      source: config.source,
      transport: config.transport,
      message: redactSecret(message, secret),
    },
  });

  revalidatePath("/operator/mail");
  return { ok, message };
}
