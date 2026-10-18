/**
 * PENGUMUMAN STATUS (migration platform 0004) — kosakata dan aturan tampil,
 * MURNI. Pembaca & penulisnya (`status-notices-store.ts`) menyuntik klien.
 *
 * Tanpa teks bebas: setiap pengumuman dirakit dari kamus
 * `statusNotice.<kind>.<phase>` dengan parameter komponen & waktu. Lihat
 * komentar model `StatusNotice`.
 */
import type { ComponentId } from "@/lib/public-status";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";

export const STATUS_NOTICE_KINDS = ["maintenance", "incident"] as const;
export type StatusNoticeKind = (typeof STATUS_NOTICE_KINDS)[number];

export const STATUS_NOTICE_COMPONENTS = ["application", "billing", "email"] as const satisfies readonly ComponentId[];

export const STATUS_NOTICE_PHASES = ["scheduled", "investigating", "identified", "monitoring", "resolved"] as const;
export type StatusNoticePhase = (typeof STATUS_NOTICE_PHASES)[number];

/** Fase yang sah per jenis — pemeliharaan tidak "diselidiki", insiden tidak "dijadwalkan". */
export const PHASES_FOR: Record<StatusNoticeKind, readonly StatusNoticePhase[]> = {
  maintenance: ["scheduled", "monitoring", "resolved"],
  incident: ["investigating", "identified", "monitoring", "resolved"],
};

export interface StatusNoticeRecord {
  id: number;
  kind: string;
  component: string;
  phase: string;
  startsAt: Date;
  endsAt: Date | null;
  resolvedAt: Date | null;
  showInApp: boolean;
}

/** Bentuk yang menyeberang ke peramban/halaman publik — tanpa `createdBy`. */
export interface PublicStatusNotice {
  id: number;
  kind: StatusNoticeKind;
  component: (typeof STATUS_NOTICE_COMPONENTS)[number];
  phase: StatusNoticePhase;
  startsAt: string;
  endsAt: string | null;
  resolvedAt: string | null;
  showInApp: boolean;
}

/** Berapa lama pengumuman yang SELESAI masih tampil di `/status` — "sudah pulih" juga kabar. */
export const RESOLVED_VISIBLE_MS = 24 * 60 * 60 * 1000;
/** Berapa lama sebelum mulai pemeliharaan diumumkan sebagai banner di aplikasi. */
export const BANNER_LEAD_MS = 72 * 60 * 60 * 1000;

function sah(r: StatusNoticeRecord): r is StatusNoticeRecord & PublicStatusNotice {
  return (
    (STATUS_NOTICE_KINDS as readonly string[]).includes(r.kind) &&
    (STATUS_NOTICE_COMPONENTS as readonly string[]).includes(r.component) &&
    (PHASES_FOR[r.kind as StatusNoticeKind] as readonly string[]).includes(r.phase)
  );
}

function keluarkan(r: StatusNoticeRecord): PublicStatusNotice {
  return {
    id: r.id,
    kind: r.kind as StatusNoticeKind,
    component: r.component as PublicStatusNotice["component"],
    phase: r.phase as StatusNoticePhase,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    showInApp: r.showInApp,
  };
}

/**
 * Pengumuman yang TAMPIL di `/status` sekarang:
 *   - belum selesai: selalu (pemeliharaan terjadwal tampil sejak dibuat);
 *   - selesai: selama 24 jam sesudahnya, lalu hilang sendiri.
 * Baris dengan kosakata asing DIBUANG — ia tidak punya kalimat.
 */
export function visibleOnStatusPage(rows: StatusNoticeRecord[], now: Date): PublicStatusNotice[] {
  return rows
    .filter(sah)
    .filter((r) => r.resolvedAt === null || now.getTime() - r.resolvedAt.getTime() < RESOLVED_VISIBLE_MS)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .map(keluarkan);
}

/**
 * Banner DI DALAM aplikasi — lebih sempit dari halaman status, sebab ia
 * menyela pekerjaan orang: hanya yang `showInApp`, belum selesai, dan (untuk
 * pemeliharaan) dimulai dalam 72 jam ke depan atau sedang berjalan.
 */
export function visibleAsBanner(rows: StatusNoticeRecord[], now: Date): PublicStatusNotice[] {
  return visibleOnStatusPage(rows, now).filter((n) => {
    if (!n.showInApp || n.resolvedAt !== null) return false;
    if (n.kind === "maintenance") {
      const mulai = new Date(n.startsAt).getTime();
      const akhir = n.endsAt ? new Date(n.endsAt).getTime() : Number.POSITIVE_INFINITY;
      return mulai - now.getTime() <= BANNER_LEAD_MS && now.getTime() < akhir;
    }
    return true;
  });
}

/** Kunci kamus kalimat pengumuman — peta STATIS (penjaga kunci yatim membaca teks). */
export const NOTICE_SENTENCE: Record<StatusNoticeKind, Partial<Record<StatusNoticePhase, DictionaryKey>>> = {
  maintenance: {
    scheduled: "statusNotice.maintenance.scheduled",
    monitoring: "statusNotice.maintenance.monitoring",
    resolved: "statusNotice.maintenance.resolved",
  },
  incident: {
    investigating: "statusNotice.incident.investigating",
    identified: "statusNotice.incident.identified",
    monitoring: "statusNotice.incident.monitoring",
    resolved: "statusNotice.incident.resolved",
  },
};

export const COMPONENT_LABEL: Record<PublicStatusNotice["component"], DictionaryKey> = {
  application: "statusNotice.component.application",
  billing: "statusNotice.component.billing",
  email: "statusNotice.component.email",
};
