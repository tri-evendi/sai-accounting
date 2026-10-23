/**
 * RELAY OUTBOX — peran `outbox` di `svc-worker` (09 §4).
 *
 *   bun --conditions=react-server workers/outbox-relay.ts   # = bun run outbox:relay
 *
 * Mengitari SETIAP buku di registry kendali, memindahkan baris `outbox` yang
 * belum terbit ke `jobs` (logika satu bukunya: `src/lib/outbox-relay.ts`),
 * lalu menulis jejak per buku ke `outbox_relay_books` — sumber `/api/health`
 * → `outbox`, `watch:health`, dan konsol `/scheduler`.
 *
 * ══ KENAPA PERAN SENDIRI, BUKAN LANGKAH DI PELARI `ledger` ════════════════
 * Pelari `ledger` adalah satu-satunya penulis buku besar di latar (I-2) dan
 * ia sibuk memposting; relay tidak menulis buku besar sama sekali — ia hanya
 * menandai baris `outbox`. Menumpangkannya ke sana membuat pagar `sai.lane.ledger`
 * memagari dua tanggung jawab, dan putaran relay yang menggantung menahan
 * posting dokumen berulang. Peran tersendiri juga berarti log berawalan
 * `outbox |` — dua kabar berbeda yang tidak bercampur.
 *
 * ══ EMPAT SIFAT ═══════════════════════════════════════════════════════════
 *  1. **Instans tunggal**: pagar `sai.outbox.relay`, mekanisme yang SAMA dengan
 *     pagar jalur (`ambilPagarBernama`). Seperti di sana, pagar tidak memikul
 *     kebenaran — `FOR UPDATE SKIP LOCKED` di buku dan `dedupe_key` di `jobs`
 *     sudah melakukannya — tapi ia mencegah dua relay yang bekerja sia-sia.
 *  2. **Setiap buku, *bounded concurrency* (I-1)**: `OUTBOX_RELAY_CONCURRENCY`
 *     (bawaan 3, plafon 8), alasan angka yang sama dengan
 *     `CONFORMANCE_CONCURRENCY`. Satu buku yang gagal TIDAK menghentikan yang
 *     lain; galatnya masuk jejak bukunya.
 *  3. **Konteks perusahaan dari registry**, tidak pernah ditebak:
 *     `runWithCompany(companyContextOf(row))` — URL dari penyelesai tunggal
 *     `@sai/db/company-url`. Buku yang skemanya tertinggal ditolak gerbang
 *     skema per perusahaan, dan itu dicatat sebagai galat bukunya, bukan
 *     ditangani di sini.
 *  4. **SIGTERM menyelesaikan putaran yang sedang jalan**, lalu berhenti —
 *     transaksi buku yang terpotong di tengah tetap aman (lihat kepala
 *     `src/lib/outbox-relay.ts`), tapi tidak ada alasan memotongnya.
 */
import "dotenv/config";

import { controlDb } from "@sai/core/control-db";
import { buildBanner } from "@sai/core/build-info";
import {
  OUTBOX_RELAY_POLL_MS,
  OUTBOX_RELAY_STALE_SECONDS,
} from "@sai/core/generated/job-numbers";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import type { SessionLock } from "@sai/db/session-lock";
import { publishJob } from "@sai/platform/job-queue";

import { ambilPagarBernama } from "./runner";
import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import {
  isMissingOutboxTable,
  pruneOutbox,
  relayBook,
  type RelayBookResult,
} from "../src/lib/outbox-relay";

const LAYANAN = "svc-worker";
const PAGAR = "sai.outbox.relay";

/** Daftar perusahaan dibaca ulang sejauh ini — PT baru masuk tanpa restart. */
const REGISTRY_REFRESH_MS = 60_000;
/** Retensi baris terbit dijalankan sejauh ini per pelari (bukan tiap putaran). */
const PRUNE_EVERY_MS = 10 * 60_000;
/**
 * Jejak buku yang TIDAK berubah ditulis paling sering sejauh ini. Satu upsert
 * per buku per dua detik adalah ~10 tulisan/detik ke kendali hanya untuk
 * berkata "tidak ada yang berubah"; jejak tiap 30 detik masih sepuluh kali
 * lebih rapat daripada ambang basinya (`OUTBOX_RELAY_STALE_SECONDS`).
 */
const HEARTBEAT_EVERY_MS = 30_000;

/** Berapa buku direlay bersamaan; nilai salah tulis diabaikan dengan BUNYI. */
export function relayConcurrency(raw: string | undefined = process.env.OUTBOX_RELAY_CONCURRENCY): number {
  if (raw === undefined || raw.trim() === "") return 3;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(`⚠ OUTBOX_RELAY_CONCURRENCY=${JSON.stringify(raw)} bukan bilangan bulat ≥ 1 — memakai 3.`);
    return 3;
  }
  if (n > 8) {
    console.warn(`⚠ OUTBOX_RELAY_CONCURRENCY=${n} di atas plafon 8 — memakai 8.`);
    return 8;
  }
  return n;
}

type Buku = Awaited<ReturnType<typeof bacaRegistry>>[number];

async function bacaRegistry() {
  /* SEMUA perusahaan, termasuk nonaktif & contoh: peristiwa yang sudah tertulis
     di buku yang kemudian dinonaktifkan tetap harus sampai (pelaksananya yang
     memutuskan), dan buku tanpa peristiwa hanya berharga satu SELECT. */
  return controlDb.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, tenantId: true, ...COMPANY_DATABASE_TARGET_SELECT },
  });
}

interface JejakTerakhir {
  at: number;
  kunci: string;
}

async function catatJejak(
  companyId: number,
  hasil: RelayBookResult | null,
  galat: string | null,
  terakhir: Map<number, JejakTerakhir>
): Promise<void> {
  /* Kunci perubahan: jejak yang sama ditulis paling sering HEARTBEAT_EVERY_MS. */
  const kunci = JSON.stringify([
    hasil?.oldestUnpublishedAt?.getTime() ?? null,
    hasil?.unpublishedCount ?? null,
    hasil?.published ?? 0,
    galat,
  ]);
  const lalu = terakhir.get(companyId);
  const sekarang = Date.now();
  if (lalu && lalu.kunci === kunci && sekarang - lalu.at < HEARTBEAT_EVERY_MS) return;

  const lastPassAt = new Date();
  /* Galat: umur & jumlah TERAKHIR yang diketahui dibiarkan apa adanya — buku
     yang tak terjangkau tidak sedang "kosong", dan umur yang tidak diperbarui
     tetap tumbuh terhadap jam pembacanya. */
  const data =
    hasil === null
      ? { lastPassAt, lastError: galat }
      : {
          lastPassAt,
          oldestUnpublishedAt: hasil.oldestUnpublishedAt,
          unpublishedCount: hasil.unpublishedCount,
          publishedLastPass: hasil.published,
          lastError: hasil.failed > 0 ? `${hasil.failed} baris gagal terbit — lihat outbox.last_error` : null,
        };
  try {
    await controlDb.outboxRelayBook.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
    terakhir.set(companyId, { at: sekarang, kunci });
  } catch (e) {
    /* Jejak yang gagal ditulis tidak boleh menghentikan relay — peristiwanya
       lebih penting daripada laporannya. Ia akan basi, dan basi = `late`. */
    console.error(`[outbox] #${companyId}: gagal menulis jejak:`, e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  const pagar: SessionLock | "pooled" | null = await ambilPagarBernama(PAGAR);
  if (!pagar) {
    console.log(
      "[outbox] relay lain sudah memegang pagar — keluar tanpa bekerja.\n" +
        "  Relay outbox tunggal-instans. Ini bukan galat."
    );
    await controlDb.$disconnect().catch(() => {});
    return;
  }

  let berhenti = false;
  const minta = (sebab: string) => {
    if (berhenti) return;
    berhenti = true;
    console.log(`[outbox] ${sebab} — menyelesaikan putaran yang sedang jalan, lalu berhenti.`);
  };
  process.on("SIGTERM", () => minta("SIGTERM"));
  process.on("SIGINT", () => minta("SIGINT"));
  if (pagar !== "pooled") {
    void pagar.lost.then((e) => {
      console.error(`[outbox] ⚠ pagar HILANG (${e.message}).`);
      minta("pagar hilang");
    });
  }

  const serentak = relayConcurrency();
  console.log(`[outbox] ${buildBanner(LAYANAN)}`);
  console.log(
    `[outbox] mulai — putaran ${OUTBOX_RELAY_POLL_MS} ms, ${serentak} buku bersamaan, ` +
      `jejak basi sesudah ${OUTBOX_RELAY_STALE_SECONDS} s`
  );

  let buku: Buku[] = [];
  let registryDibaca = 0;
  let pruneTerakhir = 0;
  const jejak = new Map<number, JejakTerakhir>();
  /* Galat per buku yang SAMA tidak dicetak tiap dua detik. */
  const galatTercetak = new Map<number, string>();

  while (!berhenti) {
    const mulai = Date.now();
    if (mulai - registryDibaca >= REGISTRY_REFRESH_MS || buku.length === 0) {
      try {
        buku = await bacaRegistry();
        registryDibaca = mulai;
      } catch (e) {
        console.error("[outbox] registry kendali tak terbaca:", e instanceof Error ? e.message : e);
      }
    }
    const pangkas = mulai - pruneTerakhir >= PRUNE_EVERY_MS;
    if (pangkas) pruneTerakhir = mulai;

    let dipindah = 0;
    let berikut = 0;
    const pelaksana = async () => {
      for (;;) {
        const i = berikut++;
        if (i >= buku.length) return;
        const b = buku[i]!;
        try {
          const hasil = await runWithCompany(companyContextOf(b), async () => {
            const r = await relayBook({ id: b.id, tenantId: b.tenantId }, publishJob);
            if (pangkas) {
              const dibuang = await pruneOutbox();
              if (dibuang > 0) console.log(`[outbox] ${b.slug}: ${dibuang} baris terbit lewat retensi dibuang`);
            }
            return r;
          });
          dipindah += hasil.published;
          if (hasil.published > 0 || hasil.failed > 0) {
            console.log(
              `[outbox] ${b.slug}: ${hasil.published} terbit` +
                (hasil.alreadyPublished > 0 ? ` (${hasil.alreadyPublished} sudah ada di jobs)` : "") +
                (hasil.failed > 0 ? `, ${hasil.failed} GAGAL (ditunda)` : "")
            );
          }
          galatTercetak.delete(b.id);
          await catatJejak(b.id, hasil, null, jejak);
        } catch (e) {
          const pesan = isMissingOutboxTable(e)
            ? "tabel outbox belum ada — buku belum menerima migration 0005"
            : e instanceof Error
              ? `${e.name}: ${e.message}`
              : String(e);
          if (galatTercetak.get(b.id) !== pesan) {
            console.error(`[outbox] ${b.slug}: ${pesan}`);
            galatTercetak.set(b.id, pesan);
          }
          await catatJejak(b.id, null, pesan.slice(0, 2000), jejak);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(serentak, buku.length)) }, () => pelaksana())
    );

    /* Ada yang dipindah = mungkin masih ada lagi (batch penuh): putaran
       berikutnya SEGERA. Tidak ada = tidur satu interval polling. */
    if (dipindah === 0 && !berhenti) await tidur(OUTBOX_RELAY_POLL_MS);
  }

  if (pagar !== "pooled") await pagar.release();
  await controlDb.$disconnect().catch(() => {});
  console.log("[outbox] berhenti.");
}

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* Diimpor tes (vitest) tanpa menjalankan apa pun — pola `scripts/run-workers.ts`. */
if ((import.meta as unknown as { main?: boolean }).main) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error("[outbox] galat:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
  );
}
