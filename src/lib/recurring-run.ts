/**
 * Transaksi berulang — yang benar-benar menerbitkan dokumennya (issue #469,
 * tahap 2).
 *
 * Aturan tanggalnya murni dan tinggal di `lib/recurring.ts`; berkas ini
 * menyambungkannya ke basis data: templat mana yang dibaca, dokumen apa yang
 * disalin, dan apa yang terjadi ketika sebuah kejadian TIDAK BISA diterbitkan.
 *
 * ══ YANG LAHIR BUKAN JURNAL YANG SUDAH TERPOSTING ═══════════════════════════
 * Dokumennya dibuat lewat jalur yang SAMA PERSIS dengan yang dipakai manusia
 * (`createInvoiceInTx`), lalu selalu menerbitkan pengajuan persetujuan —
 * `force: true`, apa pun nilainya. Gerbang #25 kemudian menahan jurnalnya
 * sampai seseorang menyetujuinya di `/approvals`.
 *
 * Tidak ada cara baru menulis jurnal yang ditambahkan di sini, dan itu
 * disengaja: mesin posting adalah bagian paling sensitif di repo ini, dan
 * sebuah fitur kenyamanan tidak pantas menumbuhkan cabang di dalamnya.
 *
 * ══ TIGA HASIL, DAN DUA DI ANTARANYA ADALAH PENAHANAN ═══════════════════════
 *   • `created`     — dokumennya lahir, menunggu persetujuan;
 *   • `held_period` — jatuh di periode yang sudah DITUTUP;
 *   • `held_source` — dokumen sumbernya hilang atau dibatalkan.
 *
 * Keduanya DICATAT, bukan didiamkan dan bukan pula dipaksakan. Kejadian yang
 * ditahan tanpa jejak akan dicoba lagi setiap jam selama jendela susulan, dan
 * tak seorang pun tahu ia pernah gagal — persis kelas kegagalan senyap yang
 * membuat fitur ini dibuat.
 *
 * ══ TANPA `server-only` ════════════════════════════════════════════════════
 * Pemanggilnya penjadwal `tsx` di luar Next (preseden `mailer-core.ts`).
 */
import { prisma } from "@/lib/prisma";
import { createInvoiceInTx } from "@/lib/document-writes";
import { isPeriodClosed } from "@/lib/period";
import {
  occurrenceKey,
  planOccurrences,
  type PlannedOccurrence,
  type RecurrenceRule,
} from "@/lib/recurring";

export type OccurrenceStatus = "created" | "held_period" | "held_source";

export interface OccurrenceOutcome {
  templateId: number;
  templateName: string;
  date: Date;
  status: OccurrenceStatus;
  documentId: number | null;
  note: string | null;
}

/** Pengguna yang dicatat sebagai pengaju. 0 = penjadwal, bukan manusia. */
const SCHEDULER_USER_ID = 0;

/**
 * Terbitkan semua yang pantas terbit hari ini, untuk perusahaan yang sedang
 * aktif kontêksnya.
 *
 * Dijalankan DI DALAM `runWithCompany` — berkas ini tidak pernah memilih
 * perusahaan sendiri.
 */
export async function runRecurringForCompany(today: Date): Promise<OccurrenceOutcome[]> {
  const templates = await prisma.recurringTemplate.findMany({
    where: { isActive: true },
    include: { occurrences: { select: { occurrenceDate: true } } },
    orderBy: { id: "asc" },
  });

  const outcomes: OccurrenceOutcome[] = [];

  for (const template of templates) {
    const rule: RecurrenceRule = {
      frequency: template.frequency as RecurrenceRule["frequency"],
      startDate: template.startDate,
      endDate: template.endDate,
      maxOccurrences: template.maxOccurrences,
    };

    const planned = planOccurrences({
      rule,
      today,
      sudahTerbit: new Set(template.occurrences.map((o) => occurrenceKey(o.occurrenceDate))),
    });

    for (const occurrence of planned) {
      outcomes.push(await emit(template, occurrence));
    }
  }

  return outcomes;
}

type TemplateRow = Awaited<ReturnType<typeof prisma.recurringTemplate.findMany>>[number];

async function emit(
  template: TemplateRow,
  occurrence: PlannedOccurrence
): Promise<OccurrenceOutcome> {
  const base = {
    templateId: template.id,
    templateName: template.name,
    date: occurrence.date,
  };

  /*
   * ── PERIODE TERTUTUP: DITAHAN, TIDAK DISELUNDUPKAN ────────────────────────
   *
   * Menerbitkan dokumen bertanggal di periode yang sudah ditutup berarti
   * menggeser angka yang sudah dilaporkan — dan tutup buku ada justru untuk
   * mencegah itu. Menggesernya ke tanggal hari ini juga bukan jawaban: sewa
   * bulan Juli yang tercatat di bulan Agustus adalah beban di bulan yang salah.
   *
   * Jadi yang benar adalah berhenti dan MENGATAKANNYA. Yang memutuskan
   * berikutnya manusia: membuka kembali periodenya, atau membuat dokumennya
   * bertanggal lain dengan sadar.
   */
  if (await isPeriodClosed(occurrence.date)) {
    return record({
      ...base,
      status: "held_period",
      documentId: null,
      note: "Periode untuk tanggal ini sudah ditutup. Dokumen tidak diterbitkan.",
    });
  }

  if (template.kind === "invoice") return emitInvoice(template, occurrence, base);

  return record({
    ...base,
    status: "held_source",
    note: `Jenis templat "${template.kind}" belum didukung penjadwal.`,
    documentId: null,
  });
}

async function emitInvoice(
  template: TemplateRow,
  occurrence: PlannedOccurrence,
  base: { templateId: number; templateName: string; date: Date }
): Promise<OccurrenceOutcome> {
  const source = await prisma.invoice.findUnique({
    where: { id: template.sourceId },
    include: { items: true },
  });

  /* Sumber yang hilang atau dibatalkan tidak punya isi untuk disalin, dan
     menebaknya jauh lebih buruk daripada diam. */
  if (!source || source.status === "canceled") {
    return record({
      ...base,
      status: "held_source",
      documentId: null,
      note: source
        ? `Faktur sumber ${source.invoiceNo} sudah dibatalkan.`
        : `Faktur sumber #${template.sourceId} tidak ditemukan.`,
    });
  }

  /*
   * Jarak jatuh tempo DIPERTAHANKAN, bukan tanggalnya. Faktur sumber yang
   * jatuh tempo 30 hari sesudah tanggalnya harus tetap begitu bulan depan —
   * menyalin tanggal jatuh temponya apa adanya akan menerbitkan faktur yang
   * lahir sudah lewat jatuh tempo, lalu ditagih pengingat #467 keesokan harinya.
   */
  const dueOffsetMs =
    source.dueDate != null ? source.dueDate.getTime() - source.date.getTime() : null;
  const dueDate =
    dueOffsetMs != null ? new Date(occurrence.date.getTime() + dueOffsetMs) : null;

  const invoiceNo = `${source.invoiceNo}/R${occurrence.key}`;

  try {
    const created = await prisma.$transaction(async (tx) =>
      createInvoiceInTx(
        tx,
        {
          invoiceNo,
          date: occurrence.key,
          dueDate: dueDate ? occurrenceKey(dueDate) : undefined,
          status: "pending",
          customerId: source.customerId ?? undefined,
          costCenterId: source.costCenterId ?? undefined,
          currency: source.currency,
          rate: source.rate != null ? Number(source.rate) : undefined,
          taxable: source.taxable,
          taxRate: source.taxRate != null ? Number(source.taxRate) : undefined,
          items: source.items.map((i) => ({
            itemName: i.itemName,
            quantity: Number(i.quantity),
            price: Number(i.price),
            unit: i.unit ?? undefined,
          })),
          /* Kontrak sumber TIDAK diwariskan: faktur berulang bukan tarikan dari
             kontrak, dan mewariskannya akan menggerus sisa kontrak setiap bulan
             atas kesepakatan yang tidak pernah menyebut pengulangan. */
        } as Parameters<typeof createInvoiceInTx>[1],
        { requestedById: SCHEDULER_USER_ID, forceApproval: true }
      )
    );

    return record({
      ...base,
      status: "created",
      documentId: created.invoice.id,
      note: null,
    });
  } catch (error) {
    /* Nomor faktur kembar adalah satu-satunya kegagalan yang diharapkan di sini
       (dua putaran yang berlomba), dan kunci unik kejadian di bawah sudah
       menjadikannya tak berbahaya. Sisanya dilaporkan apa adanya. */
    return record({
      ...base,
      status: "held_source",
      documentId: null,
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Tulis barisnya, lalu pulangkan hasilnya.
 *
 * Kunci unik `(templateId, occurrenceDate)` yang menjaga idempotensi: putaran
 * kedua di hari yang sama menabrak constraint. Tabrakan itu BUKAN galat — ia
 * bukti penjaganya bekerja — jadi ia ditelan dan hasilnya tetap dilaporkan.
 */
async function record(outcome: OccurrenceOutcome): Promise<OccurrenceOutcome> {
  try {
    await prisma.recurringOccurrence.create({
      data: {
        templateId: outcome.templateId,
        occurrenceDate: outcome.date,
        status: outcome.status,
        documentId: outcome.documentId,
        note: outcome.note,
      },
    });
  } catch {
    // Sudah tercatat oleh putaran lain.
  }
  return outcome;
}
