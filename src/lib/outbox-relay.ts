/**
 * RELAY OUTBOX — memindahkan baris `outbox` buku PT ke `jobs` di KENDALI (09 §4).
 *
 * Satu putaran atas SATU buku (`relayBook`) dijalankan di dalam konteks
 * perusahaannya; pelarinya (`workers/outbox-relay.ts`, peran `outbox` di
 * `svc-worker`) yang mengitari setiap buku registry dengan *bounded
 * concurrency* dan memegang pagar instans tunggal.
 *
 * ══ URUTAN YANG MEMBUATNYA AMAN ═══════════════════════════════════════════
 * Dalam SATU transaksi buku:
 *
 *   1. `SELECT … FOR UPDATE SKIP LOCKED` atas baris yang belum terbit (indeks
 *      berpredikat `outbox_unpublished_idx`). Relay kedua yang lolos pagar —
 *      salah konfigurasi, atau peralihan pemimpin di profil HA — melompati
 *      baris yang sedang dipegang alih-alih menunggunya atau menerbitkannya
 *      bersamaan.
 *   2. `publishJob` per (baris, kind konsumen) ke KENDALI — autocommit, dengan
 *      `dedupe_key = outbox:<companyId>:<outboxId>:<kind>`.
 *   3. `published_at = now()` untuk baris itu, lalu COMMIT buku.
 *
 * Relay yang mati di antara 2 dan 3 meninggalkan pekerjaan yang SUDAH terbit
 * dan baris outbox yang BELUM bertanda. Putaran berikutnya menerbitkannya
 * lagi — dan `publishJob` menjawab `null` (kunci sudah ada), yang di sini
 * berarti "sudah terbit": barisnya ditandai, tidak ada pekerjaan kedua. Kunci
 * dedupe dari id outbox itulah yang membuat celah antara dua basis data aman
 * tanpa transaksi terdistribusi. Dibuktikan `tests/outbox.integration.test.ts`.
 *
 * ⚠ Batasnya satu, dan ia disebut: `archiveDoneJobs` membuang baris `done`
 * sesudah `DONE_RETENTION_DAYS`. Baris outbox yang tertahan LEBIH lama dari itu
 * di antara 2 dan 3 akan terbit kedua kali. Relay mengulang dalam detik; jendela
 * empat belas hari bukan celah yang bisa dicapai relay yang hidup.
 *
 * ══ PENERBITAN YANG GAGAL ═════════════════════════════════════════════════
 * Kendali yang menolak (tak terjangkau, kind tak dikenal sesudah rilis yang
 * mencabutnya) DICATAT di barisnya: `attempts + 1`, `last_error`, dan
 * `next_attempt_at` dengan backoff kontrak — bukan diulang tiap dua detik, dan
 * bukan dibuang. Baris itu tetap `published_at IS NULL`, jadi umurnya terus
 * tumbuh dan alarm lag (`@sai/core/outbox-health`) yang membuatnya terdengar.
 *
 * Jam: setiap jam SQL di berkas ini `now() AT TIME ZONE 'UTC'` — `outbox`
 * bukan `jobs` (DATABASE.md §4, `tests/sql-clock-utc.test.ts`).
 */
import { Prisma } from "@sai/db/client/company";

import { prisma } from "@/lib/prisma";
import {
  OUTBOX_EVENTS,
  OUTBOX_PUBLISHED_RETENTION_DAYS,
  OUTBOX_RELAY_BATCH_SIZE,
  type OutboxEventType,
} from "@sai/core/generated/job-numbers";
import type { JobKind } from "@sai/core/generated/job-kinds";
import { backoffMs } from "@sai/core/job-backoff";

/** Satu baris yang dipegang relay di transaksinya. */
interface BarisOutbox {
  id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: number;
  payload: unknown;
  attempts: number;
}

/** Bentuk `publishJob` yang dibutuhkan relay — disuntikkan supaya bisa diuji. */
export type PublishFn = (input: {
  kind: JobKind;
  payload: Record<string, unknown>;
  tenantId?: number | null;
  companyId?: number | null;
  dedupeKey?: string | null;
}) => Promise<{ id: number } | null>;

export interface RelayBookResult {
  /** Baris yang ditandai terbit putaran ini. */
  published: number;
  /** Di antaranya, yang pekerjaannya SUDAH ada (crash sebelumnya) — tanpa pekerjaan baru. */
  alreadyPublished: number;
  /** Baris yang penerbitannya gagal dan ditunda. */
  failed: number;
  /** `created_at` baris tertua yang belum terbit SESUDAH putaran ini; `null` = tidak ada. */
  oldestUnpublishedAt: Date | null;
  unpublishedCount: number;
}

/** Kunci dedupe `jobs` untuk satu (baris outbox, kind) — dari id outbox, bukan dari isi. */
export function outboxJobDedupeKey(companyId: number, outboxId: number, kind: string): string {
  return `outbox:${companyId}:${outboxId}:${kind}`;
}

/**
 * Satu putaran relay atas buku yang SEDANG aktif di konteks.
 *
 * @param company id perusahaan (kunci dedupe & `jobs.company_id`) dan
 *   tenantnya. Konteks bukunya WAJIB sudah dimasuki pemanggil — proksi
 *   `prisma` melempar bila tidak (#104).
 */
export async function relayBook(
  company: { id: number; tenantId: number | null },
  publish: PublishFn,
  opts: { batchSize?: number } = {}
): Promise<RelayBookResult> {
  const batas = Math.max(1, opts.batchSize ?? OUTBOX_RELAY_BATCH_SIZE);
  let published = 0;
  let alreadyPublished = 0;
  let failed = 0;

  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<BarisOutbox[]>`
        SELECT id, event_type, aggregate_type, aggregate_id, payload, attempts
        FROM outbox
        WHERE published_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= now() AT TIME ZONE 'UTC')
        ORDER BY id
        LIMIT ${batas}
        FOR UPDATE SKIP LOCKED`;

      for (const row of rows) {
        try {
          const spec = OUTBOX_EVENTS[row.event_type as OutboxEventType];
          if (!spec) {
            throw new Error(
              `tipe peristiwa \`${row.event_type}\` tidak ada di contract/kinds.yaml → outbox.events`
            );
          }
          let baru = 0;
          for (const kind of spec.consumers) {
            const hasil = await publish({
              kind,
              tenantId: company.tenantId,
              companyId: company.id,
              /* Id & parameter saja — `jobs` hidup di KENDALI, yang tidak memuat
                 satu angka akuntansi pun (#104). Pelaksananya membaca ulang
                 bukunya. */
              payload: {
                ...(row.payload && typeof row.payload === "object" ? (row.payload as object) : {}),
                outboxId: row.id,
                eventType: row.event_type,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
              },
              dedupeKey: outboxJobDedupeKey(company.id, row.id, kind),
            });
            if (hasil) baru += 1;
          }
          await tx.$executeRaw`
            UPDATE outbox
            SET published_at = now() AT TIME ZONE 'UTC',
                attempts = attempts + 1,
                last_error = NULL,
                updated_at = now() AT TIME ZONE 'UTC'
            WHERE id = ${row.id}`;
          published += 1;
          if (baru === 0) alreadyPublished += 1;
        } catch (e) {
          failed += 1;
          const pesan = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 2000);
          const tunda = backoffMs(row.attempts + 1);
          await tx.$executeRaw`
            UPDATE outbox
            SET attempts = attempts + 1,
                last_error = ${pesan},
                next_attempt_at = (now() AT TIME ZONE 'UTC')
                  + ${tunda}::bigint * interval '1 millisecond',
                updated_at = now() AT TIME ZONE 'UTC'
            WHERE id = ${row.id}`;
        }
      }
    },
    /* Bawaan Prisma 5 detik terlalu sempit untuk satu batch yang tiap barisnya
       satu perjalanan ke kendali; terlalu longgar pun tidak ada gunanya —
       transaksi buku yang menggantung menahan kuncinya dari relay berikutnya. */
    { maxWait: 10_000, timeout: 60_000 }
  );

  const [stat] = await prisma.$queryRaw<{ oldest: Date | null; n: number }[]>`
    SELECT min(created_at) AS oldest, count(*)::int AS n
    FROM outbox WHERE published_at IS NULL`;

  return {
    published,
    alreadyPublished,
    failed,
    oldestUnpublishedAt: stat?.oldest ?? null,
    unpublishedCount: stat?.n ?? 0,
  };
}

/**
 * Buang baris yang SUDAH terbit lebih dari `OUTBOX_PUBLISHED_RETENTION_DAYS`.
 * Baris yang belum terbit TIDAK PERNAH dibuang — itulah peristiwa yang belum
 * sampai, dan membuangnya adalah persis kehilangan yang outbox ada untuk
 * mencegah.
 */
export async function pruneOutbox(
  retentionDays: number = OUTBOX_PUBLISHED_RETENTION_DAYS
): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM outbox
    WHERE published_at IS NOT NULL
      AND published_at < (now() AT TIME ZONE 'UTC')
        - ${Math.max(1, Math.round(retentionDays))}::int * interval '1 day'`;
}

/** Galat Prisma tabel tak ada — buku yang belum menerima migration 0005. */
export function isMissingOutboxTable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2010") {
    return /relation "outbox" does not exist/.test(e.message);
  }
  return e instanceof Error && /relation "outbox" does not exist/.test(e.message);
}
