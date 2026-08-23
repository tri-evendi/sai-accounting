/**
 * Pengingat jatuh tempo — lapisan yang menyentuh basis data & surel (issue #467).
 *
 * ══ TANPA `server-only`, DAN ITU KEPUTUSAN ══════════════════════════════════
 * Alasan yang sama persis dengan `mailer-core.ts` dan `payment-gateway.ts`:
 * pengirimnya penjadwal `tsx` DI LUAR Next, dan `import "server-only"` membuat
 * modulnya tidak bisa dimuat sama sekali di sana. Konsekuensinya dipikul
 * disiplin, bukan tipe: modul ini tidak boleh diimpor komponen client mana pun,
 * dan ia memang tidak diekspor lewat satu pun `"use client"`.
 *
 * Sebab itu juga ia memakai `mailer-core` (bukan `mailer`), dan menerima
 * KAMUS sebagai argumen alih-alih memanggil `getT()` — yang membaca cookie
 * permintaan HTTP yang tidak ada di penjadwal.
 *
 * ══ TIGA PENJAGA SEBELUM SATU SUREL PUN KELUAR ══════════════════════════════
 *   1. `reminderEnabled` — bawaannya FALSE; menyalakannya tindakan sadar.
 *   2. `reminderTestedAt` — seseorang HARUS pernah menerima sendiri kalimatnya
 *      lebih dulu. Tanpa itu penjadwal menolak, dan mengatakan alasannya.
 *   3. Kunci unik `(invoice_id, reminder_kind, reminder_due_key)` — putaran
 *      kedua menabrak constraint alih-alih mengirim surel kembar.
 *
 * Penjaga ke-4 hidup di modul murni: jendela toleransi yang membuat
 * "aktifkan" tidak pernah menjadi tombol yang mengirim ratusan surel sekaligus.
 */
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer-core";
import { loadDictionary } from "@/lib/i18n/load";
import { translate } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  buildReminderMessage,
  dueKeyOf,
  parseReminderPoints,
  planInvoiceReminders,
  reminderKey,
  type PlannedReminder,
  type ReminderCandidate,
  type ReminderPointKey,
} from "@/lib/invoice-reminder";
import { getReceivables } from "@/lib/receivables";

/** Kenapa sebuah perusahaan tidak mengirim apa pun — dikatakan, bukan didiamkan. */
export type ReminderSkip = "disabled" | "untested" | "no_settings";

/**
 * Rencana + NOMINAL yang akan disebut suratnya.
 *
 * Nominalnya ikut dari sini, bukan dihitung ulang saat mengirim: yang benar
 * adalah SISA tagihan, dan sisa tagihan bukan nilai faktur — ia nilai faktur
 * dikurangi pembayaran, kompensasi uang muka, dan retur. `getReceivables`
 * sudah menghitung ketiganya; mengulangnya di pengirim berarti tempat kedua
 * yang bisa menyimpang, dan menagih pelanggan sebesar nilai penuh atas faktur
 * yang sudah dicicil adalah surel yang salah di depan orang luar.
 */
export interface PlannedReminderMail extends PlannedReminder {
  /** Sisa di mata uang dokumennya; `null` bila pembayarannya campur mata uang. */
  outstanding: number | null;
  /** Nilai penuh faktur — cadangan ketika sisa tak punya jawaban tunggal. */
  total: number;
  currency: string;
}

export interface ReminderPlanResult {
  skip: ReminderSkip | null;
  planned: PlannedReminderMail[];
}

/** Baris faktur yang dibutuhkan sebuah surel pengingat. */
interface ReminderInvoice {
  id: number;
  invoiceNo: string;
  dueDate: Date | null;
  currency: string;
  email: string;
  customerName: string | null;
}

/**
 * Apa yang pantas dikirim perusahaan ini hari ini.
 *
 * Dijalankan DI DALAM konteks perusahaan (`runWithCompany`) — modul ini tidak
 * pernah memilih perusahaan sendiri, dan konteks yang hilang MELEMPAR lewat
 * `prisma` seperti pembaca lain (docs/MULTI-COMPANY.md).
 */
export async function planRemindersForCompany(today: Date): Promise<ReminderPlanResult> {
  const settings = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { reminderEnabled: true, reminderPoints: true, reminderTestedAt: true },
  });

  if (!settings) return { skip: "no_settings", planned: [] };
  if (!settings.reminderEnabled) return { skip: "disabled", planned: [] };
  if (!settings.reminderTestedAt) return { skip: "untested", planned: [] };

  /* Sumber "masih tertunggak" adalah PERHITUNGAN piutang, bukan kolom
     `status`: pembayaran, kompensasi uang muka, dan retur semuanya
     mengurangi tagihan tanpa selalu menyentuh kolom itu. Menagih tagihan yang
     sudah lunas merusak hubungan lebih cepat daripada tidak menagih. */
  const { rows } = await getReceivables({ asOf: today });
  const invoiceRows = rows.filter((r) => r.kind === "invoice");
  if (invoiceRows.length === 0) return { skip: null, planned: [] };

  const emails = await customerEmails(invoiceRows.map((r) => r.id));

  const candidates: ReminderCandidate[] = invoiceRows.map((r) => ({
    invoiceId: r.id,
    dueDate: r.dueDate,
    email: emails.get(r.id) ?? null,
  }));

  const sudahTerkirim = await sentKeys(invoiceRows.map((r) => r.id));

  const planned = planInvoiceReminders({
    candidates,
    today,
    points: parseReminderPoints(settings.reminderPoints),
    sudahTerkirim,
  });

  const byId = new Map(invoiceRows.map((r) => [r.id, r]));
  return {
    skip: null,
    planned: planned.map((p) => {
      const row = byId.get(p.invoiceId);
      return {
        ...p,
        outstanding: row?.outstanding ?? null,
        total: row?.total ?? 0,
        currency: row?.currency ?? "IDR",
      };
    }),
  };
}

async function customerEmails(invoiceIds: number[]): Promise<Map<number, string>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: { id: true, customer: { select: { email: true } } },
  });
  const out = new Map<number, string>();
  for (const r of rows) {
    const email = r.customer?.email?.trim();
    if (email) out.set(r.id, email);
  }
  return out;
}

/** Pengingat yang SUDAH pernah terkirim untuk faktur-faktur ini. */
async function sentKeys(invoiceIds: number[]): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set();
  const rows = await prisma.invoiceSend.findMany({
    where: { invoiceId: { in: invoiceIds }, reminderKind: { not: null } },
    select: { invoiceId: true, reminderKind: true, reminderDueKey: true },
  });
  return new Set(
    rows.map((r) => reminderKey(r.invoiceId, r.reminderKind ?? "", r.reminderDueKey ?? ""))
  );
}

/** Identitas & alamat satu faktur. Nominalnya datang dari rencana, bukan sini. */
async function loadReminderInvoice(invoiceId: number): Promise<ReminderInvoice | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNo: true,
      dueDate: true,
      currency: true,
      customer: { select: { name: true, email: true } },
    },
  });
  const email = invoice?.customer?.email?.trim();
  if (!invoice || !email) return null;

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    dueDate: invoice.dueDate,
    currency: invoice.currency || "IDR",
    email,
    customerName: invoice.customer?.name ?? null,
  };
}

/**
 * Kirim satu pengingat, lalu catat.
 *
 * ⚠ URUTANNYA DISENGAJA: baris riwayat ditulis LEBIH DULU, dan surelnya
 * menyusul. Kebalikannya — kirim dulu, catat kemudian — berarti kegagalan
 * menulis (basis data putus sedetik) meninggalkan surel yang sudah sampai ke
 * pelanggan tanpa jejak, dan putaran penjadwal berikutnya akan mengirimkannya
 * lagi. Dengan urutan ini, kegagalan yang mungkin terjadi adalah baris yang
 * tercatat padahal surelnya gagal: pelanggan kehilangan SATU pengingat, dan
 * itu jauh lebih murah daripada menerimanya berkali-kali.
 *
 * Pemenang lomba dua putaran yang berjalan bersamaan juga ditentukan di sini:
 * yang kalah menabrak kunci unik SEBELUM memanggil `sendMail`.
 */
export async function sendReminder(input: {
  invoiceId: number;
  point: ReminderPointKey;
  dueKey: string;
  /** Sisa tagihan; `null` → `total` yang disebut (lihat `PlannedReminderMail`). */
  outstanding: number | null;
  total: number;
  currency: string;
  companyName: string;
  locale?: Locale;
  /** Pengirimnya bukan manusia; 0 = penjadwal (lihat `sent_by_user_id`). */
  userId?: number;
}): Promise<"sent" | "skipped" | "no_email"> {
  const invoice = await loadReminderInvoice(input.invoiceId);
  if (!invoice) return "no_email";

  try {
    await prisma.invoiceSend.create({
      data: {
        invoiceId: invoice.id,
        channel: "email",
        recipient: invoice.email,
        sentByUserId: input.userId ?? 0,
        reminderKind: input.point,
        reminderDueKey: input.dueKey,
      },
    });
  } catch {
    /* Tabrakan kunci unik = pengingat ini sudah pernah terkirim. Itu justru
       bukti penjaganya bekerja, bukan galat yang perlu dilaporkan. */
    return "skipped";
  }

  const dictionary = await loadDictionary(input.locale ?? DEFAULT_LOCALE);
  const { subject, text } = buildReminderMessage({
    dictionary,
    point: input.point,
    invoiceNo: invoice.invoiceNo,
    customerName: invoice.customerName,
    amountText: formatCurrency(input.outstanding ?? input.total, input.currency),
    dueDateText: invoice.dueDate ? formatDate(invoice.dueDate) : "",
    companyName: input.companyName,
  });

  await sendMail({ to: invoice.email, subject, text });
  return "sent";
}

/**
 * Kirim-uji: kalimat yang SAMA, ke alamat orang yang menekan tombolnya.
 *
 * Tidak menyentuh riwayat faktur mana pun — ini bukan penagihan, dan sebuah
 * faktur yang tercatat "sudah diingatkan" padahal pelanggannya tidak menerima
 * apa-apa adalah catatan yang berbohong. Yang dicatat hanya `reminderTestedAt`
 * pada perusahaan, sebab itulah yang membuka pintu penjadwal.
 *
 * Kalau tidak ada faktur berjatuh-tempo untuk dicontohkan, kalimatnya tetap
 * dikirim dengan nomor contoh — yang ingin dilihat orang adalah NADA dan
 * bentuknya, dan menolak mengirim karena bukunya masih kosong justru mengunci
 * pintu bagi perusahaan yang baru mulai.
 */
export async function sendReminderTest(input: {
  to: string;
  companyName: string;
  locale?: Locale;
  today: Date;
}): Promise<void> {
  const sample = await prisma.invoice.findFirst({
    where: { dueDate: { not: null } },
    orderBy: { dueDate: "desc" },
    include: { items: true, customer: true },
  });

  const dictionary = await loadDictionary(input.locale ?? DEFAULT_LOCALE);
  const total = sample
    ? sample.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0) +
      Number(sample.taxAmount ?? 0)
    : 1_000_000;
  const dueDate = sample?.dueDate ?? input.today;

  const { subject, text } = buildReminderMessage({
    dictionary,
    point: "after_1",
    invoiceNo: sample?.invoiceNo ?? "INV/CONTOH/1",
    customerName: sample?.customer?.name ?? null,
    amountText: formatCurrency(total, sample?.currency || "IDR"),
    dueDateText: formatDate(dueDate),
    companyName: input.companyName,
  });

  await sendMail({
    to: input.to,
    subject: `[UJI] ${subject}`,
    /* Lewat `translate`, bukan `dictionary.invoiceReminder.testFooter`: akses
       properti tidak terlihat oleh penjaga kunci yatim, dan kunci yang tak
       terlihat akan tercabut pada pembersihan kamus berikutnya. */
    text: `${text}\n\n---\n${translate(dictionary, "invoiceReminder.testFooter")}`,
  });

  await prisma.companySetting.updateMany({ data: { reminderTestedAt: new Date() } });
}

/** Dipakai penjadwal untuk melaporkan apa yang akan/sudah terjadi. */
export { dueKeyOf };
