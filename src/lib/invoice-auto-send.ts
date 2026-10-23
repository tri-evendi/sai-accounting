/**
 * KIRIM FAKTUR SAAT DIPOSTING — pemakai pertama outbox (09 §4).
 *
 *   peristiwa `invoice.posted` (outbox, transaksi posting)
 *     → relay → pekerjaan `document.invoice_send` (jalur `interactive`)
 *       → `autoSendPostedInvoice(invoiceId)` di sini.
 *
 * ══ BAWAANNYA MATI, DAN PERISTIWANYA TETAP MENGALIR ═══════════════════════
 * `src/lib/invoice-send.ts` menulis "TIDAK ADA YANG DIKIRIM OTOMATIS DI SINI",
 * dan kalimat itu tetap benar untuk berkas itu. Yang ini pengiriman otomatis
 * yang PERTAMA kali lahir dari posting, dan karena itu ia berdiri di belakang
 * sakelar per PT `company_settings.invoice_auto_send` — BAWAAN FALSE, alasan
 * yang sama dengan `reminder_enabled` (#467): surel ke orang luar yang
 * terlanjur keluar tidak bisa ditarik kembali.
 *
 * Peristiwanya tetap ditulis dan direlay walau sakelarnya mati, dan itu
 * disengaja: jalur yang tidak pernah dijalankan tidak bisa dibedakan dari
 * jalur yang rusak (09 §4, alasan outbox dulu ditahan). Dengan sakelar mati
 * pelaksananya berjalan sampai keputusan "mati" lalu selesai `done` — setiap
 * faktur yang diposting membuktikan relay & pelari hidup, tanpa satu surel pun.
 *
 * ══ IDEMPOTEN: CATAT DULU, KIRIM KEMUDIAN ═════════════════════════════════
 * Relay menjamin SATU pekerjaan per peristiwa, tapi pelaksanaannya
 * *at-least-once*: lease yang hilang membuat pekerjaan yang sama dikerjakan
 * lagi. Pemenangnya ditentukan kunci unik riwayat kirim
 * `(invoice_id, reminder_kind, reminder_due_key)` = `(id, "on_post", "posted")`
 * — ditulis LEBIH DULU, pola `sendReminder` (#467). Percobaan kedua menabrak
 * constraint sebelum `sendMail` dipanggil.
 *
 * Bedanya dari pengingat satu: bila `sendMail` MELEMPAR, baris klaim DIHAPUS
 * lalu galatnya dilempar ulang, supaya backoff antrean mencobanya lagi.
 * Pengingat boleh kehilangan satu titik (titik berikutnya menyusul); kiriman
 * saat posting tidak punya titik berikutnya — tanpa penghapusan ini satu SMTP
 * yang tersendat berarti faktur itu tak pernah terkirim, dan riwayatnya
 * BERBOHONG "terkirim". Harganya satu jendela sempit yang disebut: server surel
 * yang MENERIMA lalu galat sebelum menjawab membuat pelanggan menerima dua kali.
 *
 * Tanpa `server-only` di kepala: dimuat pelari `interactive` (Bun,
 * `--conditions=react-server`). Kamus dimuat langsung — `getT()` membaca
 * cookie permintaan HTTP, yang tidak ada di pekerja.
 */
import { prisma } from "@/lib/prisma";
import { sendMail, type MailAttachment } from "@sai/platform/mailer-core";
import { mailConfigForCompany } from "@/lib/tenant-mail-settings";
import { getCompanyContext } from "@/lib/company-context";
import { getCompanyIdentity } from "@/lib/company-identity";
import { serverPdfCompany } from "@/lib/pdf-company";
import { buildInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { loadDictionary } from "@sai/core/i18n/load";
import { translate } from "@sai/core/i18n/dictionary";
import { DEFAULT_LOCALE } from "@sai/core/i18n/config";
import { formatCurrency, formatDate } from "@sai/core/utils";

/** `invoice_sends.reminder_kind` untuk kiriman saat posting. */
export const ON_POST_KIND = "on_post";
/** `invoice_sends.reminder_due_key` — konstan: sekali per faktur seumur hidupnya. */
export const ON_POST_DUE_KEY = "posted";

/**
 * Hasil satu pelaksanaan — DIKATAKAN, bukan didiamkan. Hanya `sent` yang
 * mengirim; sisanya selesai tanpa surel dengan sebab yang tercatat di log.
 */
export type AutoSendOutcome =
  | "sent"
  | "disabled"
  | "no_settings"
  | "not_found"
  | "canceled"
  | "no_email"
  | "already_sent";

const invoiceInclude = { items: true, payments: true, customer: true } as const;

/** `true` bila galat Prisma adalah tabrakan kunci unik. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Kirim faktur `invoiceId` ke surel pelanggannya, bila PT ini menyalakannya.
 *
 * Dijalankan DI DALAM konteks perusahaan (`dalamKonteksPerusahaan`) — modul
 * ini tidak pernah memilih perusahaan sendiri.
 */
export async function autoSendPostedInvoice(invoiceId: number): Promise<AutoSendOutcome> {
  const settings = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { invoiceAutoSend: true },
  });
  if (!settings) return "no_settings";
  if (!settings.invoiceAutoSend) return "disabled";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: invoiceInclude,
  });
  /* Faktur yang dihapus di antara posting dan pelaksanaan: tidak ada yang
     dikirim, dan itu jawaban yang benar — bukan galat yang perlu diulang. */
  if (!invoice) return "not_found";
  if (invoice.status === "canceled") return "canceled";

  const to = invoice.customer?.email?.trim();
  if (!to) return "no_email";

  try {
    await prisma.invoiceSend.create({
      data: {
        invoiceId: invoice.id,
        channel: "email",
        recipient: to,
        /* 0 = bukan manusia (pola pengingat #467); layar menyebutnya otomatis. */
        sentByUserId: 0,
        reminderKind: ON_POST_KIND,
        reminderDueKey: ON_POST_DUE_KEY,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return "already_sent";
    throw e;
  }

  try {
    const [dictionary, company, pdfCompany, { generateInvoicePDF }] = await Promise.all([
      loadDictionary(DEFAULT_LOCALE),
      getCompanyIdentity(),
      serverPdfCompany("invoice-auto-send"),
      import("@/lib/pdf/invoice-pdf"),
    ]);

    /* Kertas yang SAMA dengan tombol unduh & kirim manual: generator dan
       perakit data yang sama (`invoice-send.ts` → `renderInvoicePdf`). */
    const doc = generateInvoicePDF(buildInvoicePdfData(invoice), pdfCompany);
    const attachment: MailAttachment = {
      filename: `Invoice_${invoice.invoiceNo.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`,
      content: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
      contentType: "application/pdf",
    };

    const currency = invoice.currency || "IDR";
    const amount =
      invoice.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0) +
      Number(invoice.taxAmount ?? 0);
    const t = (key: string, values?: Record<string, string>) => translate(dictionary, key, values);

    /* Kalimatnya kalimat kirim MANUAL (`invoiceSend.*`), bukan kalimat baru:
       pelanggan yang menerima faktur lewat tombol dan lewat posting tidak
       boleh mendapat dua nada untuk satu jenis surel. Bahasanya bawaan
       aplikasi — tidak ada pengirim manusia yang bahasa antarmukanya bisa
       dipinjam. */
    const subject = t("invoiceSend.subject", { no: invoice.invoiceNo, company: company.name });
    const text = [
      t("invoiceSend.greeting", { name: invoice.customer?.name ?? "" }).trim(),
      "",
      t("invoiceSend.body", { no: invoice.invoiceNo, amount: formatCurrency(amount, currency) }),
      invoice.dueDate ? t("invoiceSend.due", { date: formatDate(invoice.dueDate) }) : null,
      "",
      t("invoiceSend.closing"),
      company.name,
    ]
      .filter((line) => line !== null)
      .join("\n");

    const companyId = getCompanyContext()?.companyId;
    await sendMail(
      { to, subject, text, attachments: [attachment] },
      (companyId ? await mailConfigForCompany(companyId) : null) ?? undefined
    );
  } catch (e) {
    /* Lihat kepala berkas: klaim dilepas supaya percobaan berikutnya mengirim. */
    await prisma.invoiceSend
      .deleteMany({
        where: { invoiceId: invoice.id, reminderKind: ON_POST_KIND, reminderDueKey: ON_POST_DUE_KEY },
      })
      .catch(() => {});
    throw e;
  }
  return "sent";
}
