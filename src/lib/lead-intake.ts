/**
 * PENERIMAAN PERMINTAAN PENAWARAN / DEMO (`lead_requests`, migration platform
 * 0016) — inti route `/api/leads`, dengan klien DISUNTIKKAN supaya teruji tanpa
 * basis data maupun SMTP (`tests/lead-intake.test.ts`).
 *
 * Tiga pekerjaan, dan urutannya keputusan:
 *   1. SIMPAN barisnya (dengan nomor rujukan unik) — ini yang tidak boleh
 *      gagal diam-diam: prospek melihat "terima kasih" hanya bila barisnya ada.
 *   2. Kabari tim lewat surel ke `site_settings.contactEmail` — SESUDAH
 *      jawaban dikirim (`after()` di route). Surel yang gagal, atau pemasangan
 *      tanpa SMTP, tidak pernah menggagalkan permintaan: barisnya sudah ada di
 *      konsol, dan itulah sumber kebenarannya.
 *   3. Sidik IP, bukan IP — `hashClientIp`.
 */

import { createHmac, randomBytes as nodeRandomBytes } from "node:crypto";

import { generateLeadReference } from "@sai/core/lead-request";
import { LEGAL_FORM_PRINT_LABELS, isLegalForm } from "@sai/core/legal-form";
import type { MailConfig, MailMessage, MailResult } from "@sai/platform/mailer-core";
import type { LeadRecordInput } from "@/lib/lead-record";

/** Percobaan ulang bila nomor rujukan bertabrakan (indeks UNIK). */
const PERCOBAAN_RUJUKAN = 5;

export interface LeadCreateClient {
  leadRequest: {
    create(args: {
      data: LeadRecordInput & {
        reference: string;
        consentAt: Date;
        locale: string | null;
        ipHash: string | null;
      };
      select: { id: true; reference: true };
    }): Promise<{ id: number; reference: string }>;
  };
}

export interface StoredLead extends LeadRecordInput {
  id: number;
  reference: string;
  createdAt: Date;
}

/**
 * Sidik alamat klien — HMAC-SHA256 berkunci `AUTH_SECRET`. Tanpa kunci, hash
 * polos alamat IPv4 bisa dibalik dengan menghitung keempat miliar
 * kemungkinannya; dengan kunci, sidik ini hanya berguna untuk membandingkan
 * dua permintaan dari sumber yang sama.
 */
export function hashClientIp(ip: string, secret: string | undefined = process.env.AUTH_SECRET): string {
  return createHmac("sha256", secret || "sai-lead-ip").update(`lead:${ip}`).digest("hex");
}

function isUniqueReferenceViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  /* Prisma menyebut kolom (array) atau nama indeks (string). Tabel ini hanya
     punya SATU indeks unik, jadi P2002 tanpa target pun berarti rujukan. */
  if (target === undefined) return true;
  return JSON.stringify(target).includes("reference");
}

/**
 * Simpan satu permintaan. Nomor rujukan dibangkitkan di sini dan dicoba ulang
 * bila menabrak indeks UNIK — tabrakan itu langka (30⁶), tapi permintaan yang
 * gagal karena kebetulan adalah prospek yang hilang.
 */
export async function createLeadRequest(
  client: LeadCreateClient,
  record: LeadRecordInput,
  meta: { ipHash: string | null; locale: string | null },
  options: { now?: Date; randomBytes?: (n: number) => Uint8Array } = {}
): Promise<StoredLead> {
  const now = options.now ?? new Date();
  const acak = options.randomBytes ?? ((n: number) => new Uint8Array(nodeRandomBytes(n)));
  let terakhir: unknown;
  for (let i = 0; i < PERCOBAAN_RUJUKAN; i++) {
    const reference = generateLeadReference(acak);
    try {
      const row = await client.leadRequest.create({
        data: {
          ...record,
          reference,
          consentAt: now,
          locale: meta.locale,
          ipHash: meta.ipHash,
        },
        select: { id: true, reference: true },
      });
      return { ...record, id: row.id, reference: row.reference, createdAt: now };
    } catch (error) {
      if (!isUniqueReferenceViolation(error)) throw error;
      terakhir = error;
    }
  }
  throw new Error(`nomor rujukan bertabrakan ${PERCOBAAN_RUJUKAN}× berturut-turut`, { cause: terakhir });
}

/* ───────────────────────────── Surel ke tim ─────────────────────────────── */

const LABEL_JENIS: Record<LeadRecordInput["kind"], string> = {
  demo: "Demo",
  quote: "Penawaran harga",
  question: "Pertanyaan lain",
};

/**
 * Isi surel pemberitahuan ke TIM SAI (bahasa Indonesia — pembacanya tim).
 * Memuat data yang dikirim prospek sendiri; tidak memuat sidik IP. Pesan
 * bebasnya disertakan apa adanya sebagai TEKS — tidak pernah sebagai HTML.
 */
export function leadNotificationMail(lead: StoredLead): Pick<MailMessage, "subject" | "text"> {
  const bentuk =
    lead.legalForm && isLegalForm(lead.legalForm) ? LEGAL_FORM_PRINT_LABELS[lead.legalForm] : "—";
  const baris = [
    `Permintaan baru dari halaman publik — ${lead.reference}`,
    "",
    `Jenis kebutuhan : ${LABEL_JENIS[lead.kind]}`,
    `Nama            : ${lead.name}`,
    `Perusahaan      : ${lead.company}`,
    `WhatsApp/telepon: +${lead.phone}`,
    `Surel           : ${lead.email ?? "—"}`,
    `Bentuk usaha    : ${bentuk}`,
    `Jumlah perusahaan: ${lead.companyCount ?? "—"}`,
    `Sumber          : ${lead.source}`,
    "",
    "Pesan:",
    lead.message ?? "—",
    "",
    "Tindak lanjuti di konsol operator → Penawaran masuk, lalu ubah statusnya",
    "(dihubungi / selesai / spam) supaya tim lain tahu sudah ditangani.",
  ];
  return {
    subject: `[SAI] ${LABEL_JENIS[lead.kind]}: ${lead.company} (${lead.reference})`,
    text: baris.join("\n"),
  };
}

export type LeadNotifyOutcome = "sent" | "skipped_no_recipient" | "skipped_mail_not_configured" | "failed";

export interface LeadNotifyDeps {
  /** Alamat tim (`site_settings.contactEmail` di atas env); `undefined` = tidak ada. */
  recipient: () => Promise<string | undefined>;
  resolveMailConfig: () => Promise<MailConfig>;
  sendMail: (message: MailMessage, config?: MailConfig) => Promise<MailResult>;
}

/**
 * Kabari tim. TIDAK PERNAH melempar: pemanggilnya berjalan sesudah jawaban
 * terkirim, dan barisnya sudah tersimpan.
 *
 * "Surel belum disetel" = transport bukan SMTP. Pada keadaan itu pesannya
 * TIDAK ditulis ke berkas keluar (`transport: file`): berkas itu menumpuk data
 * pribadi prospek di cakram tanpa pernah dibaca siapa pun, sementara barisnya
 * sudah ada di konsol.
 */
export async function notifyTeamOfLead(deps: LeadNotifyDeps, lead: StoredLead): Promise<LeadNotifyOutcome> {
  try {
    const to = (await deps.recipient())?.trim();
    if (!to) return "skipped_no_recipient";
    const config = await deps.resolveMailConfig();
    if (config.transport !== "smtp") return "skipped_mail_not_configured";
    await deps.sendMail({ to, ...leadNotificationMail(lead) }, config);
    return "sent";
  } catch (error) {
    console.error(`[leads] surel pemberitahuan ${lead.reference} gagal:`, error);
    return "failed";
  }
}
