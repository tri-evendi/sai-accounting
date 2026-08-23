/**
 * Kirim faktur ke PELANGGAN, dan catat bahwa itu terjadi (issue #465).
 *
 * ══ MASALAH YANG DIBERESKANNYA ══════════════════════════════════════════════
 * Faktur bisa dicetak sejak lama, tapi kertasnya berhenti di folder unduhan.
 * Menagih lalu menjadi pekerjaan di luar aplikasi — PDF dipindahkan sendiri ke
 * WhatsApp — dan tak ada satu tempat pun yang tahu faktur mana yang sudah
 * benar-benar dikirim. Piutang macet di buku ini hampir selalu dimulai dari
 * faktur yang tidak pernah sampai, bukan dari faktur yang ditolak.
 *
 * ══ SATU SUMBER KERTAS ══════════════════════════════════════════════════════
 * PDF-nya dirender DI SERVER dengan `generateInvoicePDF` yang SAMA PERSIS
 * dengan tombol unduh di halaman faktur, di atas objek yang dirakit
 * `buildInvoicePdfData` yang juga sama. jsPDF berjalan di Node, jadi ini tidak
 * menuntut satu dependensi baru pun. Yang dihindari bukan biaya pustaka,
 * melainkan dua tata letak faktur yang perlahan menyimpang untuk satu nomor
 * dokumen — cacat yang tidak pernah menerbitkan galat, hanya dua kertas.
 *
 * ══ DUA KANAL, DUA ARTI, DAN JANGAN DILEBUR ═════════════════════════════════
 *   • `email`    — kita benar-benar mengirimkannya (lampiran PDF lewat
 *                  `sendMail`). Yang tidak kita tahu: apakah ia dibaca.
 *   • `whatsapp` — kita hanya MENYIAPKAN pesannya; manusia yang menekan kirim
 *                  di aplikasi WhatsApp-nya. Karena itu tidak ada satu kalimat
 *                  pun di permukaan yang menyebutnya "terkirim".
 *
 * ══ TIDAK ADA YANG DIKIRIM OTOMATIS DI SINI ═════════════════════════════════
 * Setiap fungsi di modul ini berawal dari seseorang yang menekan tombol.
 * Pengingat otomatis adalah #467, dan digabung sekarang berarti satu bug di
 * sini mengirimkan surel ke pelanggan sungguhan tanpa ada yang memintanya.
 */
import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendMail, type MailAttachment } from "@/lib/mailer";
import { mailConfigForCompany } from "@/lib/tenant-mail-settings";
import { getCompanyContext } from "@/lib/company-context";
import { getCompanyIdentity } from "@/lib/company-identity";
import { buildInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { normalizeWhatsAppNumber, whatsAppShareUrl } from "@/lib/phone";
import { userNamesByIds } from "@/lib/users-directory";
import { getT } from "@/lib/i18n/server";
import { formatCurrency, formatDate } from "@/lib/utils";

export const INVOICE_SEND_CHANNELS = ["email", "whatsapp"] as const;
export type InvoiceSendChannel = (typeof INVOICE_SEND_CHANNELS)[number];

export const invoiceSendSchema = z.object({
  channel: z.enum(INVOICE_SEND_CHANNELS),
});

/** Baris faktur beserta segala yang dibutuhkan kertas dan kalimatnya. */
const invoiceInclude = {
  items: true,
  payments: true,
  customer: true,
} as const;

export class InvoiceSendProblem extends Error {
  constructor(
    readonly reason: "not_found" | "no_email" | "no_phone",
    message: string
  ) {
    super(message);
    this.name = "InvoiceSendProblem";
  }
}

async function loadInvoice(invoiceId: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: invoiceInclude,
  });
  if (!invoice) throw new InvoiceSendProblem("not_found", `Faktur ${invoiceId} tidak ada.`);
  return invoice;
}

type LoadedInvoice = Awaited<ReturnType<typeof loadInvoice>>;

/** Nilai faktur dalam mata uangnya sendiri — dihitung dari BARISNYA, aturan
 *  yang sama dengan `receivables.ts` (faktur tak punya kolom nilai). */
function invoiceValue(invoice: LoadedInvoice): number {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.price),
    0
  );
  return subtotal + Number(invoice.taxAmount ?? 0);
}

/**
 * PDF faktur sebagai byte, dirender di server.
 *
 * jsPDF diimpor DINAMIS: ia hanya dibutuhkan pada permintaan yang benar-benar
 * mengirim, dan jalur lain di modul ini (riwayat, tautan WhatsApp) tidak perlu
 * membayar pemuatannya.
 */
export async function renderInvoicePdf(
  invoice: LoadedInvoice
): Promise<{ filename: string; content: Uint8Array }> {
  const [{ generateInvoicePDF }, company] = await Promise.all([
    import("@/lib/pdf/invoice-pdf"),
    getCompanyIdentity(),
  ]);

  const doc = generateInvoicePDF(buildInvoicePdfData(invoice), company);
  return {
    /* Nama berkas sama dengan yang diunduh dari halaman faktur — pelanggan yang
       menerima dua kali tidak mendapat dua nama berbeda untuk kertas yang
       sama. Karakter di luar pola aman dibuang: nomor faktur boleh memuat `/`,
       dan itu memecah nama berkas di sebagian klien surel. */
    filename: `Invoice_${invoice.invoiceNo.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`,
    content: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
  };
}

/**
 * Kalimat pengantar surel/WhatsApp.
 *
 * ⚠ BAHASA: dipakai bahasa ANTARMUKA PENGIRIM, bukan bahasa pelanggan — kita
 * memang tidak tahu bahasa pelanggan, dan menebaknya dari nama atau mata uang
 * adalah tebakan yang salahnya terbaca sebagai tidak sopan. Yang menekan tombol
 * melihat persis kalimat yang akan diterima.
 *
 * Surelnya sengaja PENDEK dan tidak menyalin isi faktur: rinciannya ada di
 * lampiran, dan badan surel yang mengulanginya adalah tempat kedua yang bisa
 * menyimpang dari kertasnya.
 */
export async function invoiceMessage(invoice: LoadedInvoice): Promise<{
  subject: string;
  text: string;
}> {
  const [t, company] = await Promise.all([getT(), getCompanyIdentity()]);
  const currency = invoice.currency || "IDR";
  const amount = formatCurrency(invoiceValue(invoice), currency);

  const subject = t("invoiceSend.subject", {
    no: invoice.invoiceNo,
    company: company.name,
  });

  const lines = [
    t("invoiceSend.greeting", { name: invoice.customer?.name ?? "" }).trim(),
    "",
    t("invoiceSend.body", { no: invoice.invoiceNo, amount }),
    invoice.dueDate ? t("invoiceSend.due", { date: formatDate(invoice.dueDate) }) : null,
    "",
    t("invoiceSend.closing"),
    company.name,
  ].filter((line) => line !== null);

  return { subject, text: lines.join("\n") };
}

/** Baris riwayat, ditulis SETELAH kirimannya berhasil — bukan sebelum. */
async function recordSend(input: {
  invoiceId: number;
  channel: InvoiceSendChannel;
  recipient: string;
  userId: number;
}) {
  return prisma.invoiceSend.create({
    data: {
      invoiceId: input.invoiceId,
      channel: input.channel,
      recipient: input.recipient,
      sentByUserId: input.userId,
    },
  });
}

/**
 * Kirim faktur sebagai lampiran PDF ke alamat surel pelanggan.
 *
 * Pelanggan tanpa alamat surel adalah MASALAH YANG DIKATAKAN, bukan kiriman
 * yang diam-diam tidak terjadi — dan alamatnya tidak pernah ditebak dari mana
 * pun (bukan dari nama, bukan dari kontak lain).
 */
export async function sendInvoiceByEmail(invoiceId: number, userId: number) {
  const invoice = await loadInvoice(invoiceId);
  const to = invoice.customer?.email?.trim();
  if (!to) {
    const t = await getT();
    throw new InvoiceSendProblem("no_email", t("invoiceSend.errNoEmail"));
  }

  const [{ subject, text }, pdf] = await Promise.all([
    invoiceMessage(invoice),
    renderInvoicePdf(invoice),
  ]);

  const attachment: MailAttachment = {
    filename: pdf.filename,
    content: pdf.content,
    contentType: "application/pdf",
  };

  /* `sensitive` TIDAK diset: faktur memang layak diarsipkan, dan ia tidak
     membawa satu pun token yang membuka akun (aturan di `mailer-core.ts`). */
  await sendMail(
    { to, subject, text, attachments: [attachment] },
    /* Surel ini berangkat ATAS NAMA PELANGGAN, jadi ia memakai server surel
       tenant itu sendiri bila ada — `undefined` berarti jalur penyedia, yang
       memang cadangannya. Surel yang membawa token akses TIDAK PERNAH lewat
       sini (lihat kepala `lib/tenant-mail-settings.ts`). */
    (await tenantMailConfig()) ?? undefined
  );

  return recordSend({ invoiceId, channel: "email", recipient: to, userId });
}

/**
 * Nomor + tautan WhatsApp berisi pesan siap kirim. TIDAK menulis apa pun.
 *
 * ══ KENAPA DIHITUNG SAAT HALAMAN DIRENDER, BUKAN SAAT TOMBOL DITEKAN ════════
 * Tautannya menjadi `href` sebuah tombol sungguhan, bukan hasil `window.open()`
 * sesudah menunggu jawaban server. Bedanya bukan gaya: jendela yang dibuka
 * skrip SESUDAH sebuah `await` diblokir peramban sebagai popup, dan yang
 * dialami pengguna adalah tombol yang ditekan lalu tidak terjadi apa-apa —
 * kegagalan yang paling sulit dilaporkan karena tak meninggalkan pesan apa pun.
 *
 * `null` bila nomornya tidak bisa dipahami; permukaannya lalu menjelaskan
 * kenapa, alih-alih menawarkan tombol yang akan gagal.
 */
export async function invoiceWhatsAppTarget(
  invoice: LoadedInvoice
): Promise<{ number: string; url: string } | null> {
  const number = normalizeWhatsAppNumber(invoice.customer?.phone);
  if (!number) return null;
  const { text } = await invoiceMessage(invoice);
  return { number, url: whatsAppShareUrl(number, text) };
}

/**
 * Catat bahwa pesan WhatsApp DISIAPKAN untuk faktur ini.
 *
 * Dicatat saat tombolnya ditekan — sedekat mungkin dengan yang benar-benar
 * kita ketahui. Yang TIDAK kita ketahui, dan karena itu tidak pernah diklaim
 * di mana pun: apakah orangnya menekan kirim di WhatsApp.
 */
export async function recordWhatsAppSend(invoiceId: number, userId: number) {
  const invoice = await loadInvoice(invoiceId);
  const number = normalizeWhatsAppNumber(invoice.customer?.phone);
  if (!number) {
    const t = await getT();
    throw new InvoiceSendProblem("no_phone", t("invoiceSend.errNoPhone"));
  }
  return recordSend({ invoiceId, channel: "whatsapp", recipient: number, userId });
}

export interface InvoiceSendRow {
  id: number;
  channel: InvoiceSendChannel;
  recipient: string;
  sentAt: Date;
  sentBy: string;
  /**
   * Titik pengingat yang melahirkannya (issue #467), atau `null` untuk kiriman
   * MANUAL. Dibedakan di layar, bukan dilebur: "saya yang menagih" dan "mesin
   * yang menagih" adalah dua jawaban berbeda atas pertanyaan yang sama, dan
   * yang kedua tidak punya nama manusia untuk disebut.
   */
  reminderKind: string | null;
}

/** Riwayat kirim satu faktur, terbaru dulu, dengan nama pengirim sudah dicari. */
export async function listInvoiceSends(invoiceId: number): Promise<InvoiceSendRow[]> {
  const rows = await prisma.invoiceSend.findMany({
    where: { invoiceId },
    orderBy: { sentAt: "desc" },
  });
  if (rows.length === 0) return [];

  /* Baris OTOMATIS menyimpan `sent_by_user_id = 0` — bukan pengguna mana pun,
     dan sengaja tidak dicarikan namanya: penjadwal bukan orang. Layarnya
     menyebutnya "otomatis". */
  const names = await userNamesByIds(
    rows.filter((r) => r.reminderKind == null).map((r) => r.sentByUserId)
  );
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel as InvoiceSendChannel,
    recipient: r.recipient,
    sentAt: r.sentAt,
    sentBy: names.get(r.sentByUserId) ?? "",
    reminderKind: r.reminderKind,
  }));
}

/**
 * Kapan tiap faktur terakhir dikirim — untuk PENANDA di daftar faktur.
 *
 * Satu query beragregat untuk seluruh halaman, bukan satu per baris: daftar
 * faktur sudah membaca banyak, dan N+1 di sini akan terasa persis pada buku
 * yang paling ramai menagih.
 */
export async function lastSentByInvoice(invoiceIds: number[]): Promise<Map<number, Date>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await prisma.invoiceSend.groupBy({
    by: ["invoiceId"],
    where: { invoiceId: { in: invoiceIds } },
    _max: { sentAt: true },
  });
  return new Map(
    rows.flatMap((r) => (r._max.sentAt ? [[r.invoiceId, r._max.sentAt] as const] : []))
  );
}

/**
 * Konfigurasi surel tenant untuk perusahaan yang sedang aktif.
 *
 * Konteks perusahaan yang hilang menjawab `null` — bukan melempar. Aturan
 * "konteks hilang harus MELEMPAR" berlaku untuk yang MENULIS ke buku
 * (docs/MULTI-COMPANY.md); di sini yang hilang hanyalah pilihan server surel,
 * dan jatuh ke jalur penyedia adalah cadangan yang benar, bukan kebocoran.
 */
async function tenantMailConfig() {
  const companyId = getCompanyContext()?.companyId;
  return companyId ? mailConfigForCompany(companyId) : null;
}
