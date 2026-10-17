/**
 * KESEHATAN SATU TENANT — sinyal yang menjawab "apakah pelanggan ini baik-baik
 * saja?" tanpa membuka bukunya (doktrin konsol: metadata, bukan isi buku).
 *
 * MURNI: masukan dikumpulkan `store.ts#tenantHealthForOperator`, keputusan di
 * sini, supaya ambangnya teruji dan tidak tersebar di JSX.
 *
 * Yang SENGAJA tidak dihitung: angka keuangan pelanggan dalam bentuk apa pun.
 * "Aktivitas terakhir" adalah TANGGAL jurnal termuda — jangkar yang sama
 * dengan retensi UU KUP — bukan nilai atau isinya.
 */

export type HealthTone = "danger" | "warning" | "info";

export interface HealthSignal {
  key:
    | "quotaCompaniesOver"
    | "quotaCompaniesNear"
    | "quotaUsersOver"
    | "quotaUsersNear"
    | "bookIdle"
    | "bookNeverUsed"
    | "bookUnreadable"
    | "conformanceFindings"
    | "conformanceAmbiguous";
  tone: HealthTone;
  params: Record<string, string | number>;
}

export interface TenantHealthInput {
  usage: { companies: number; users: number };
  quota: { maxCompanies: number; maxUsers: number };
  /** Per PT AKTIF: tanggal jurnal termuda (`null` = buku tanpa jurnal; `"unreadable"` = tak terbaca). */
  books: { slug: string; latestJournal: Date | null | "unreadable" }[];
  /** Temuan sapuan kesesuaian terakhir yang berawalan slug PT tenant ini. */
  conformance: { findings: number; ambiguousSlugs: string[] } | null;
}

/** Pemakaian ≥ 80 % kuota = "hampir": waktunya bicara naik paket, bukan menunggu ditolak. */
export const QUOTA_NEAR_RATIO = 0.8;
/** Buku tanpa jurnal baru selama 30 hari = diam — tanda awal berhenti memakai. */
export const BOOK_IDLE_DAYS = 30;

export function tenantHealthSignals(input: TenantHealthInput, now: Date = new Date()): HealthSignal[] {
  const out: HealthSignal[] = [];

  const kuota = (used: number, max: number, over: HealthSignal["key"], near: HealthSignal["key"]) => {
    if (max <= 0) return;
    if (used > max) out.push({ key: over, tone: "danger", params: { used, max } });
    else if (used / max >= QUOTA_NEAR_RATIO) out.push({ key: near, tone: "info", params: { used, max } });
  };
  kuota(input.usage.companies, input.quota.maxCompanies, "quotaCompaniesOver", "quotaCompaniesNear");
  kuota(input.usage.users, input.quota.maxUsers, "quotaUsersOver", "quotaUsersNear");

  for (const b of input.books) {
    if (b.latestJournal === "unreadable") {
      out.push({ key: "bookUnreadable", tone: "danger", params: { book: b.slug } });
    } else if (b.latestJournal === null) {
      out.push({ key: "bookNeverUsed", tone: "warning", params: { book: b.slug } });
    } else {
      const hari = Math.floor((now.getTime() - b.latestJournal.getTime()) / (24 * 60 * 60 * 1000));
      if (hari >= BOOK_IDLE_DAYS) out.push({ key: "bookIdle", tone: "warning", params: { book: b.slug, days: hari } });
    }
  }

  if (input.conformance) {
    if (input.conformance.findings > 0) {
      out.push({ key: "conformanceFindings", tone: "warning", params: { count: input.conformance.findings } });
    }
    if (input.conformance.ambiguousSlugs.length > 0) {
      out.push({
        key: "conformanceAmbiguous",
        tone: "info",
        params: { books: input.conformance.ambiguousSlugs.join(", ") },
      });
    }
  }

  const urut: Record<HealthTone, number> = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => urut[a.tone] - urut[b.tone]);
}

/**
 * Temuan sapuan kesesuaian yang MILIK tenant ini. Barisnya berawalan
 * `<slug-PT> · …` — dan slug PT hanya unik PER TENANT (#153). Slug yang juga
 * dipakai tenant lain TIDAK diatribusikan (dilaporkan `ambiguousSlugs`):
 * menghitung temuan PT lain sebagai milik tenant ini lebih buruk daripada
 * berkata "tidak bisa dipastikan".
 */
export function attributeConformance(
  findings: string[],
  tenantSlugs: string[],
  slugsSharedWithOtherTenants: Set<string>
): { findings: number; ambiguousSlugs: string[] } {
  let count = 0;
  const ambiguous = new Set<string>();
  for (const line of findings) {
    const slug = line.split(" · ")[0]?.trim();
    if (!slug || !tenantSlugs.includes(slug)) continue;
    if (slugsSharedWithOtherTenants.has(slug)) ambiguous.add(slug);
    else count += 1;
  }
  return { findings: count, ambiguousSlugs: [...ambiguous] };
}
