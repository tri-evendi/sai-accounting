/**
 * RETENSI UJI COBA BEKU — perencana MURNI (alur demo-first, keputusan pemilik
 * 24 Okt 2026).
 *
 * Uji coba yang habis beku hanya-baca (`trial_ended`). Sesudah N hari beku
 * (bawaan 90, konsol `/settings`) tenantnya BOLEH dihapus lewat mesin
 * penghapusan UU PDP yang sudah ada (`executeTenantDeletion`: tenant
 * `cancelled`, PT nonaktif, data pribadi dianonimkan; buku besar UTUH sampai
 * `retention_until` UU KUP). Sebelum itu pemilik menerima pemberitahuan H-14
 * dan H-3 berisi tautan ekspor (`docs/COMPLIANCE.md` §2).
 *
 * ══ PEMBERITAHUAN ADALAH SYARAT, BUKAN KEBIASAAN ═══════════════════════════
 * Sama dengan beku uji coba (`planTrialFreezes`): penghapusan hanya terjadi
 * bila pemberitahuan TERBUKTI terkirim — baris `reminder_logs` berkunci `D-14:`
 * / `D-3:` untuk TANGGAL BEKU yang berlaku. Akibatnya:
 *
 *   • tenant yang sudah beku lebih lama dari N hari pada saat sakelarnya
 *     dinyalakan TIDAK langsung dihapus — ia menerima D-14 dulu, dan tanggal
 *     hapusnya bergeser ke 14 hari sesudahnya;
 *   • penjadwal yang mati sepanjang jendela pemberitahuan hanya MENUNDA
 *     penghapusan (D-3 yang terlambat menggeser tanggalnya ≥ 3 hari);
 *   • uji coba yang dicairkan lalu beku lagi punya tanggal beku baru, jadi
 *     pemberitahuan lama tidak berlaku untuknya.
 *
 * Selama sakelar MATI, perencana yang sama dipakai hanya untuk MELAPORKAN —
 * tanpa surel, tanpa penghapusan (lihat pemanggilnya di penjadwal).
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Awalan `reminder_logs.due_key` untuk pemberitahuan penghapusan. */
export const RETENTION_NOTICE_PREFIX = "D";
/** `reminder_logs.kind` untuk pemberitahuan penghapusan. */
export const RETENTION_NOTICE_KIND = "trial_deletion";
/** Pemberitahuan pertama (dan jarak minimum sebelum hapus). */
export const RETENTION_FIRST_NOTICE_DAYS = 14;
/** Pemberitahuan terakhir. */
export const RETENTION_LAST_NOTICE_DAYS = 3;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Akhiran kunci untuk SATU tanggal beku — `:<YYYY-MM-DD>` (UTC). */
export function retentionSuffix(trialEndedAt: Date): string {
  return `:${dateKey(trialEndedAt)}`;
}

export interface RetentionCandidate {
  subscriptionId: number;
  tenantId: number;
  trialEndedAt: Date;
}

export interface RetentionLog {
  dueKey: string;
  sentAt: Date;
}

export interface RetentionPlanRow {
  subscriptionId: number;
  tenantId: number;
  /** Tanggal hapus yang berlaku; `null` = belum pernah diberi tahu. */
  deleteAt: Date | null;
}

export interface RetentionPlan {
  /** Pemberitahuan yang harus dikirim SEKARANG (catat dulu, kirim kemudian). */
  notices: (RetentionPlanRow & { sendKey: string; markKeys: string[]; daysLeft: number })[];
  /** Tenant yang syaratnya lengkap untuk dihapus sekarang. */
  deletions: RetentionPlanRow[];
  /** Semua kandidat beserta tanggal dasarnya — bahan laporan. */
  overview: (RetentionPlanRow & { baseDeleteAt: Date })[];
}

/**
 * Rencana retensi untuk satu putaran.
 *
 *   baseDeleteAt = trialEndedAt + `days`
 *   deleteAt     = max(baseDeleteAt, D-14 pertama + 14 hari)   (null bila belum ada D-14)
 *
 * D-14 dikirim begitu `now ≥ baseDeleteAt − 14 hari` dan belum ada D- untuk
 * tanggal beku itu. D-3 dikirim begitu `now ≥ deleteAt − 3 hari`. Hapus bila
 * `now ≥ max(deleteAt, D-3 + 3 hari)` — D-3 yang terlambat tetap memberi tiga
 * hari penuh.
 */
export function planTrialRetention(
  candidates: readonly RetentionCandidate[],
  logsBySubscription: ReadonlyMap<number, readonly RetentionLog[]>,
  now: Date,
  days: number
): RetentionPlan {
  const plan: RetentionPlan = { notices: [], deletions: [], overview: [] };
  for (const c of candidates) {
    const suffix = retentionSuffix(c.trialEndedAt);
    const logs = (logsBySubscription.get(c.subscriptionId) ?? []).filter(
      (l) => l.dueKey.startsWith(`${RETENTION_NOTICE_PREFIX}-`) && l.dueKey.endsWith(suffix)
    );
    const first = logs.find((l) => l.dueKey.startsWith(`${RETENTION_NOTICE_PREFIX}-${RETENTION_FIRST_NOTICE_DAYS}:`));
    const last = logs.find((l) => l.dueKey.startsWith(`${RETENTION_NOTICE_PREFIX}-${RETENTION_LAST_NOTICE_DAYS}:`));
    const baseDeleteAt = new Date(c.trialEndedAt.getTime() + days * DAY_MS);
    const row = { subscriptionId: c.subscriptionId, tenantId: c.tenantId };

    if (!first) {
      const due = now.getTime() >= baseDeleteAt.getTime() - RETENTION_FIRST_NOTICE_DAYS * DAY_MS;
      const deleteAt = new Date(
        Math.max(baseDeleteAt.getTime(), now.getTime() + RETENTION_FIRST_NOTICE_DAYS * DAY_MS)
      );
      plan.overview.push({ ...row, deleteAt: null, baseDeleteAt });
      if (due) {
        const key = `${RETENTION_NOTICE_PREFIX}-${RETENTION_FIRST_NOTICE_DAYS}${suffix}`;
        plan.notices.push({
          ...row,
          deleteAt,
          sendKey: key,
          markKeys: [key],
          daysLeft: Math.ceil((deleteAt.getTime() - now.getTime()) / DAY_MS),
        });
      }
      continue;
    }

    const deleteAt = new Date(
      Math.max(baseDeleteAt.getTime(), first.sentAt.getTime() + RETENTION_FIRST_NOTICE_DAYS * DAY_MS)
    );
    plan.overview.push({ ...row, deleteAt, baseDeleteAt });

    if (!last) {
      if (now.getTime() >= deleteAt.getTime() - RETENTION_LAST_NOTICE_DAYS * DAY_MS) {
        const key = `${RETENTION_NOTICE_PREFIX}-${RETENTION_LAST_NOTICE_DAYS}${suffix}`;
        /* D-3 yang terlambat menggeser tanggal hapus: tiga hari penuh sejak
           surel terakhir, apa pun yang terjadi pada penjadwal sebelumnya. */
        const effective = new Date(
          Math.max(deleteAt.getTime(), now.getTime() + RETENTION_LAST_NOTICE_DAYS * DAY_MS)
        );
        plan.notices.push({
          ...row,
          deleteAt: effective,
          sendKey: key,
          markKeys: [key],
          daysLeft: Math.ceil((effective.getTime() - now.getTime()) / DAY_MS),
        });
      }
      continue;
    }

    const executeAt = Math.max(
      deleteAt.getTime(),
      last.sentAt.getTime() + RETENTION_LAST_NOTICE_DAYS * DAY_MS
    );
    if (now.getTime() >= executeAt) plan.deletions.push({ ...row, deleteAt: new Date(executeAt) });
  }
  return plan;
}
