/**
 * PENERBIT `report.package` — satu-satunya tempat paket laporan diterbitkan
 * (rute `POST /api/reports/package`). Bagian murninya di `report-package.ts`.
 *
 * ══ OTORISASI: IZIN HALAMAN TIAP LAPORAN, DI PT YANG SEDANG DIBUKA ═════════
 * Paket tidak punya izin sendiri yang lebih longgar daripada laporannya: setiap
 * laporan diperiksa dengan `canEffective(user, report.permission)` — izin yang
 * SAMA dengan halaman laporan itu dan kartunya di Pusat Laporan (#355). Modul
 * diperiksa lebih dulu di dalamnya, jadi laporan milik modul yang tidak aktif
 * (mis. Stok) TIDAK disertakan dan tercatat di ringkasan dengan alasannya;
 * laporan yang perannya tidak boleh buka juga dikecualikan dengan alasan yang
 * berbeda (`isModuleActiveFor` memilih kalimatnya, bukan keputusannya). Paket
 * yang tidak menyisakan satu laporan pun DITOLAK — berkas berisi ringkasan
 * saja bukan paket.
 *
 * PT-nya PT aktif dari penjaga API (`authz.companyId`), tidak pernah dari
 * badan permintaan: laporan PT lain tidak terjangkau dari sini sama sekali.
 *
 * ══ DUA PEKERJAAN, SATU NIAT, IDEMPOTEN ════════════════════════════════════
 * Anak (`report.package_pdf`, Node) diterbitkan LEBIH DULU supaya induk
 * (`report.package`, Go) bisa menyebut id-nya — Go tidak menerbitkan apa pun.
 * Keduanya ber-`dedupe_key` turunan kunci niat (`packageDedupeKeys`): dua
 * permintaan serentak menabrak kunci yang sama, yang kalah membaca baris
 * pemenangnya, dan pengguna menerima id pekerjaan yang SAMA. Paket yang masih
 * berjalan atau selesai dalam jendela 10 menit dipakai ulang; yang MATI tidak
 * (kuncinya dilepas, permintaan baru menerbitkan ulang).
 *
 * ══ JEJAK AUDIT ════════════════════════════════════════════════════════════
 * `report.package` ditulis di buku PT saat MENERBITKAN (Go tidak menulis buku):
 * siapa, periode, laporan yang disertakan & dikecualikan, format, id pekerjaan.
 * Paket yang dipakai ulang tidak menulis baris kedua — itu bukan permintaan
 * baru.
 */
import "server-only";

import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { writeAuditLog } from "@/lib/audit";
import { jobStatus, publishJob, releaseFinishedDedupeKey } from "@sai/platform/job-queue";
import {
  buildPackagePayloads,
  packageDedupeKeys,
  packageableReports,
  type PackageFormat,
  type PackagePeriod,
  type PackagePlanEntry,
} from "@/lib/report-package";

/** Pengguna peminta — bentuk sesi dari penjaga API. */
export interface PemintaPaket {
  id: string;
  role: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Rencana paket: laporan yang diminta (dalam urutan kanonik paket), masing-
 * masing disertakan atau dikecualikan beserta alasannya. Id yang tidak dikenal
 * atau tidak boleh masuk paket → `unknown` (rute menjawab 400).
 */
export async function planReportPackage(
  user: PemintaPaket,
  reportIds: readonly string[]
): Promise<{ plan: PackagePlanEntry[]; unknown: string[] }> {
  const boleh = packageableReports();
  const diminta = new Set(reportIds);
  const unknown = [...diminta].filter((id) => !boleh.some((r) => r.id === id));
  const plan: PackagePlanEntry[] = [];
  for (const report of boleh) {
    if (!diminta.has(report.id)) continue;
    if (await canEffective(user, report.permission)) {
      plan.push({ report, excluded: null });
    } else {
      plan.push({ report, excluded: (await isModuleActiveFor(report.permission)) ? "role" : "module" });
    }
  }
  return { plan, unknown };
}

export type HasilTerbit =
  | { ok: true; jobId: number; reused: boolean; included: number; excluded: number }
  | { ok: false; reason: "nothing_permitted" | "publish_failed" };

/** Pekerjaan paket yang masih berlaku untuk kunci ini, atau null. */
async function paketBerlaku(dedupeKey: string): Promise<number | null> {
  const row = await jobStatus({ dedupeKey });
  if (!row) return null;
  if (row.status === "dead") return null;
  return row.id;
}

export async function publishReportPackage(
  input: {
    companyId: number;
    user: PemintaPaket;
    period: PackagePeriod;
    formats: readonly PackageFormat[];
    plan: PackagePlanEntry[];
    request?: Request;
  },
  now: Date = new Date()
): Promise<HasilTerbit> {
  const included = input.plan.filter((p) => p.excluded === null);
  if (included.length === 0) return { ok: false, reason: "nothing_permitted" };

  const keys = packageDedupeKeys(
    {
      companyId: input.companyId,
      userId: input.user.id,
      period: input.period,
      reportIds: input.plan.map((p) => p.report.id),
      formats: input.formats,
    },
    now
  );

  /* Pakai ulang yang masih berlaku — jendela sekarang lalu sebelumnya. */
  for (const key of [keys.current, keys.previous]) {
    const id = await paketBerlaku(key);
    if (id !== null) {
      return { ok: true, jobId: id, reused: true, included: included.length, excluded: input.plan.length - included.length };
    }
  }

  /* Kunci milik baris yang sudah MATI dilepas: kegagalan tidak boleh
     menahan permintaan ulang selama jendelanya. */
  await releaseFinishedDedupeKey(keys.current);
  await releaseFinishedDedupeKey(`${keys.current}:pdf`);

  const userName = (input.user.name || input.user.email || `#${input.user.id}`).slice(0, 120);
  const { parent, child } = buildPackagePayloads(
    {
      plan: input.plan,
      period: input.period,
      formats: input.formats,
      userId: input.user.id,
      userName,
      packageKey: keys.current,
    },
    now
  );

  const childKey = `${keys.current}:pdf`;
  let childId = (await publishJob({ kind: "report.package_pdf", companyId: input.companyId, payload: child, dedupeKey: childKey }))?.id;
  if (childId === undefined) childId = (await jobStatus({ dedupeKey: childKey }))?.id;
  if (childId === undefined) return { ok: false, reason: "publish_failed" };

  const row = await publishJob({
    kind: "report.package",
    companyId: input.companyId,
    payload: { ...parent, pdfJobId: childId },
    dedupeKey: keys.current,
  });
  if (!row) {
    /* Kalah balapan dengan permintaan kembar — pakai pemenangnya. */
    const pemenang = await jobStatus({ dedupeKey: keys.current });
    if (!pemenang) return { ok: false, reason: "publish_failed" };
    return { ok: true, jobId: pemenang.id, reused: true, included: included.length, excluded: input.plan.length - included.length };
  }

  await writeAuditLog({
    userId: input.user.id,
    username: input.user.email ?? userName,
    role: input.user.role,
    action: "report.package",
    entity: "report_package",
    entityId: row.id,
    details: {
      from: input.period.fromISO,
      to: input.period.toISO,
      formats: parent.formats,
      included: parent.reports.map((r) => r.reportId),
      excluded: input.plan
        .filter((p) => p.excluded !== null)
        .map((p) => ({ reportId: p.report.id, reason: p.excluded })),
      pdfJobId: childId,
    },
    request: input.request,
  });

  return { ok: true, jobId: row.id, reused: false, included: included.length, excluded: input.plan.length - included.length };
}
