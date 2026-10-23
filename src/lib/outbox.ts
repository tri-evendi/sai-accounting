/**
 * PINTU TULIS OUTBOX — satu-satunya tempat sebuah baris `outbox` lahir (09 §4).
 *
 * ══ MASALAH YANG DITUTUPNYA ════════════════════════════════════════════════
 * `jobs` hidup di basis data KENDALI, tulisan domain di basis data PT. Tanpa
 * outbox, "faktur diposting" lalu `publishJob(...)` adalah dua commit di dua
 * basis data — *dual-write*: yang pertama bisa berhasil dan yang kedua hilang
 * (proses mati di antaranya, kendali tersendat sedetik), dan tidak ada putaran
 * berikutnya yang akan menyadarinya. Rekonsiliasi menyusul sendiri untuk yang
 * BERJADWAL; untuk yang lahir dari SATU tulisan, tidak ada yang bisa disusul.
 *
 * Di sini peristiwanya ditulis ke buku PT yang SAMA, di TRANSAKSI yang sama
 * dengan tulisan domainnya: jurnal dan peristiwanya commit bersama atau
 * rollback bersama. Relay (`src/lib/outbox-relay.ts`, peran `outbox` di
 * `svc-worker`) yang kemudian memindahkannya ke `jobs`.
 *
 * ══ KENAPA MELEMPAR DI LUAR TRANSAKSI ═════════════════════════════════════
 * Peristiwa yang ditulis dengan klien biasa commit SENDIRI — dan itu persis
 * *dual-write* yang hendak ditutup, hanya dipindah satu langkah: tulisan domain
 * gagal sesudahnya, peristiwanya tetap terbit, dan surel berangkat untuk faktur
 * yang tidak pernah ada. Jadi pintunya menolak klien yang bukan klien
 * transaksi. Ujinya `$transaction`: klien transaksi interaktif Prisma TIDAK
 * memilikinya (ia ada di daftar-tolak klien transaksi), klien biasa — termasuk
 * proksi `prisma` per perusahaan — memilikinya. Tipe saja tidak cukup:
 * `PrismaClient` secara struktural memenuhi `Prisma.TransactionClient`, jadi
 * `tsc` meloloskan `emitOutboxEvent(prisma, …)` tanpa satu keluhan.
 *
 * Penjaga statisnya `tests/outbox-write-door.test.ts`: tulisan ke model
 * `outbox` di luar berkas ini (dan relay yang menandainya terbit) ditolak.
 *
 * ══ IDEMPOTENSI DUA LAPIS ═════════════════════════════════════════════════
 *   1. PENULISAN: `dedupe_key` unik — peristiwa yang sama ditulis dua kali
 *      (posting yang diulang) tidak melahirkan dua baris. `createMany` +
 *      `skipDuplicates` = `ON CONFLICT DO NOTHING`, jadi tabrakannya tidak
 *      membatalkan transaksi domain (galat unik biasa di PostgreSQL MEMBATALKAN
 *      seluruh transaksi — tulisan domain ikut hilang).
 *   2. PENERBITAN: relay memakai `outbox:<companyId>:<outboxId>:<kind>` sebagai
 *      `jobs.dedupe_key`, jadi relay yang mati di antara terbit dan tandai
 *      tidak pernah menerbitkan dua kali.
 *
 * Pengiriman tetap *at-least-once* di sisi PELAKSANA (pekerjaan bisa diulang
 * sesudah lease hilang), jadi setiap konsumen WAJIB idempoten — kontraknya di
 * `contract/kinds.yaml` → `outbox`.
 *
 * Tanpa `server-only`: dipanggil dari pintu posting, yang juga dijalankan
 * pekerja `ledger` dan skrip di luar Next.
 */
import { z } from "zod";

import type { Prisma } from "@sai/db/client/company";
import {
  OUTBOX_EVENTS,
  OUTBOX_EVENT_TYPES,
  type OutboxEventType,
} from "@sai/core/generated/job-numbers";

export { OUTBOX_EVENT_TYPES, type OutboxEventType };

/** Bentuk satu peristiwa — dicerminkan dari kolom `outbox` (DATABASE.md §9). */
export const outboxEventSchema = z.object({
  type: z.enum(OUTBOX_EVENT_TYPES),
  aggregateId: z.number().int().positive(),
  /** Id & parameter, bukan isi: ia menyeberang ke `jobs.payload` di KENDALI. */
  payload: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().min(1).max(160),
});

export type OutboxEventInput = z.input<typeof outboxEventSchema>;

/** Dilempar bila pemanggil tidak berada di dalam transaksi tulisan domainnya. */
export class OutboxOutsideTransactionError extends Error {
  constructor() {
    super(
      "emitOutboxEvent dipanggil di LUAR transaksi — peristiwa outbox wajib " +
        "ditulis di transaksi yang sama dengan tulisan domainnya (09 §4). " +
        "Panggil dari dalam prisma.$transaction(async (tx) => …) dengan `tx`."
    );
    this.name = "OutboxOutsideTransactionError";
  }
}

/** `true` bila `client` adalah klien transaksi interaktif (tanpa `$transaction`). */
export function isTransactionClient(client: unknown): boolean {
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as { $transaction?: unknown }).$transaction !== "function"
  );
}

/**
 * Tulis satu peristiwa di transaksi `tx`.
 *
 * @returns `true` bila baris lahir, `false` bila `dedupeKey`-nya sudah ada —
 *   bukan kegagalan, melainkan jawaban yang benar untuk "sudah ditulis".
 */
export async function emitOutboxEvent(
  tx: Prisma.TransactionClient,
  input: OutboxEventInput
): Promise<boolean> {
  if (!isTransactionClient(tx)) throw new OutboxOutsideTransactionError();
  const ev = outboxEventSchema.parse(input);
  const hasil = await tx.outbox.createMany({
    data: [
      {
        eventType: ev.type,
        aggregateType: OUTBOX_EVENTS[ev.type].aggregate,
        aggregateId: ev.aggregateId,
        payload: ev.payload as Prisma.InputJsonValue,
        dedupeKey: ev.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  return hasil.count === 1;
}

/** Kunci dedupe PENULISAN `invoice.posted` — sekali per faktur seumur hidupnya. */
export function invoicePostedDedupeKey(invoiceId: number): string {
  return `invoice.posted:${invoiceId}`;
}
