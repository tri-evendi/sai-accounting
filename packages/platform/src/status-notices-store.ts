/**
 * Baca & tulis PENGUMUMAN STATUS (migration platform 0004).
 *
 * Pembaca BANNER di-cache 60 detik di tingkat modul: ia dipanggil setiap kali
 * sebuah halaman aplikasi dimuat, dan pengumuman berubah beberapa kali setahun.
 * Cache ini GLOBAL, bukan per perusahaan — isinya milik platform, bukan milik
 * satu PT (aturan cache per `companyId` di AGENTS.md tidak berlaku di sini).
 *
 * GAGAL-LUNAK: `sai_platform` yang mati berarti tidak ada banner, bukan
 * aplikasi yang mati — doktrin #137: penagihan/platform yang tumbang tidak
 * boleh menjatuhkan pembukuan pelanggan.
 *
 * Tanpa `server-only`, klien disuntik untuk tulisan (pola `writes.ts`).
 */
import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import {
  PHASES_FOR,
  STATUS_NOTICE_COMPONENTS,
  STATUS_NOTICE_KINDS,
  type StatusNoticeKind,
  type StatusNoticePhase,
  type StatusNoticeRecord,
} from "@sai/core/status-notices";

type Deps = { platform: PlatformClient };

const SELECT = {
  id: true,
  kind: true,
  component: true,
  phase: true,
  startsAt: true,
  endsAt: true,
  resolvedAt: true,
  showInApp: true,
} as const;

/** Yang belum selesai + yang selesai dalam 7 hari — cukup untuk kedua permukaan. */
export async function readStatusNoticeRecords(deps: Deps, now: Date = new Date()): Promise<StatusNoticeRecord[]> {
  return deps.platform.statusNotice.findMany({
    where: {
      OR: [{ resolvedAt: null }, { resolvedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }],
    },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: SELECT,
  });
}

const TTL_MS = 60 * 1000;
let cache: { at: number; rows: StatusNoticeRecord[] } | null = null;

/** Pembaca BANNER: ber-cache, gagal-lunak (`[]`). */
export async function cachedStatusNoticeRecords(deps: Deps, now: Date = new Date()): Promise<StatusNoticeRecord[]> {
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.rows;
  try {
    const rows = await readStatusNoticeRecords(deps, now);
    cache = { at: now.getTime(), rows };
    return rows;
  } catch (error) {
    console.error("[status-notices] pengumuman tak terbaca — tanpa banner:", error);
    /* Yang terakhir diketahui lebih jujur daripada "tidak ada apa-apa" saat
       platform tersendat sebentar; tanpa itu, kosong. */
    return cache?.rows ?? [];
  }
}

/** Dipanggil sesudah operator menulis, supaya banner tidak menunggu 60 detik. */
export function invalidateStatusNoticeCache(): void {
  cache = null;
}

export type NoticeWriteResult =
  | { outcome: "ok"; id: number }
  | { outcome: "invalid" }
  | { outcome: "not_found" };

export async function createStatusNotice(
  deps: Deps,
  input: {
    kind: StatusNoticeKind;
    component: string;
    phase: StatusNoticePhase;
    startsAt: Date;
    endsAt: Date | null;
    showInApp: boolean;
    actor: string;
  }
): Promise<NoticeWriteResult> {
  if (
    !STATUS_NOTICE_KINDS.includes(input.kind) ||
    !(STATUS_NOTICE_COMPONENTS as readonly string[]).includes(input.component) ||
    !PHASES_FOR[input.kind].includes(input.phase) ||
    input.phase === "resolved" ||
    (input.endsAt !== null && input.endsAt.getTime() <= input.startsAt.getTime())
  ) {
    return { outcome: "invalid" };
  }
  const row = await deps.platform.statusNotice.create({
    data: {
      kind: input.kind,
      component: input.component,
      phase: input.phase,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      showInApp: input.showInApp,
      createdBy: input.actor.slice(0, 100),
    },
    select: { id: true },
  });
  invalidateStatusNoticeCache();
  return { outcome: "ok", id: row.id };
}

/** Pindah fase. `resolved` juga menstempel `resolvedAt` — dan tidak bisa dibuka lagi. */
export async function setStatusNoticePhase(
  deps: Deps,
  input: { id: number; phase: StatusNoticePhase },
  now: Date = new Date()
): Promise<NoticeWriteResult> {
  const row = await deps.platform.statusNotice.findUnique({
    where: { id: input.id },
    select: { id: true, kind: true, resolvedAt: true },
  });
  if (!row) return { outcome: "not_found" };
  if (row.resolvedAt !== null) return { outcome: "invalid" };
  if (!(PHASES_FOR[row.kind as StatusNoticeKind] ?? []).includes(input.phase)) return { outcome: "invalid" };
  await deps.platform.statusNotice.update({
    where: { id: row.id },
    data: { phase: input.phase, ...(input.phase === "resolved" ? { resolvedAt: now } : {}) },
  });
  invalidateStatusNoticeCache();
  return { outcome: "ok", id: row.id };
}
