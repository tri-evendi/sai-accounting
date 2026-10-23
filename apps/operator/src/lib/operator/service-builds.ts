/**
 * VERSI LAYANAN — build mana yang dijalankan setiap layanan (permintaan
 * pemilik 22 Okt 2026: "versi untuk setiap service").
 *
 * Nomor rilis tetap satu. Yang dijawab di sini: apakah ada layanan yang
 * TERTINGGAL di image lama. Layanan latar tidak melayani satu halaman pun,
 * jadi satu yang tertinggal tidak merusak apa pun yang terlihat — sampai
 * kodenya yang basi menulis sesuatu.
 *
 * ══ DARI MANA BUILD SETIAP LAYANAN DIBACA — TANPA JARINGAN KE CONTAINER LAIN
 * Konsol tidak pernah memanggil container lain, dan tidak mulai di sini. Setiap
 * layanan SUDAH meninggalkan jejak di basis data kendali; stempelnya
 * (`@sai/core/build-info`) dititipkan di jejak itu:
 *
 *   • `runtime_samples.instance` — ditulis tiap 5 menit oleh SETIAP proses
 *     `app-customer` dan pelari jalur Node (`svc-worker`). Jejak `app-customer`
 *     satu-satunya, dan itu cukup: `/api/health`-nya juga memuat build, tapi
 *     konsol tidak punya jalan jaringan ke sana (dan pada replika, satu
 *     panggilan hanya menjawab satu replika — baris sampel menjawab semuanya).
 *   • `jobs.claimed_by` — ditulis setiap klaim oleh pelari Node DAN Go. Satu-
 *     satunya jejak `svc-integrator`: pohon Go hanya boleh menulis `jobs` dan
 *     `backup_runs` (AGENTS.md, aturan Go 1), dan tidak ada tabel baru untuk ini.
 *   • `details` di `scheduler_runs` / `conformance_runs` — peran `scheduler`
 *     dan `conformance` di `svc-worker`, yang bukan pelari jalur.
 *
 * Build konsol sendiri dibaca langsung dan menjadi ACUAN pembanding.
 *
 * Doktrin #137: setiap sumber fail-soft sendiri-sendiri. `null` hanya bila
 * SEMUANYA tak terbaca.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import {
  buildInfo,
  serviceBuildRows,
  sightingFromIdentity,
  sightingFromRunDetails,
  type BuildInfo,
  type BuildSighting,
  type ServiceBuildRow,
} from "@sai/core/build-info";
import { APP_CUSTOMER_SOURCE } from "@sai/core/runtime-trigger";

type ControlClient = typeof controlDb;

/**
 * Jendela pengamatan: 26 jam, bukan 24. Jalur `tenant` (cadangan) dan
 * sapuan kesesuaian berjalan SEHARI SEKALI; jendela tepat 24 jam membuat
 * putaran kemarin keluar dari jendela beberapa menit sebelum putaran hari ini
 * masuk — dan layanan yang sehat berkedip "tidak terlihat" setiap hari.
 */
export const SERVICE_BUILD_WINDOW_HOURS = 26;

/** Peran `app-customer` di tabel — ia satu peran saja. */
export const APP_CUSTOMER_ROLE = "web";

/**
 * Pasangan layanan+peran yang SEHARUSNYA terlihat (compose produksi). Yang
 * tidak terlihat sama sekali tetap tampil — sebagai keadaan netral, bukan
 * peringatan: jalur `interactive` Go hanya mengklaim saat ada yang mengekspor
 * laporan, dan sepi bukan rusak.
 *
 * Peran `conformance` TIDAK disebut: sapuannya mingguan (02 §2), jadi enam
 * hari dari tujuh ia memang di luar jendela. Barisnya tetap tampil pada hari
 * sesudah sapuan, dari `conformance_runs.details`.
 */
export const EXPECTED_SERVICE_ROLES: readonly { service: string; role: string }[] = [
  { service: APP_CUSTOMER_SOURCE, role: APP_CUSTOMER_ROLE },
  { service: "svc-worker", role: "ledger" },
  { service: "svc-worker", role: "interactive" },
  { service: "svc-worker", role: "scheduler" },
  { service: "svc-integrator", role: "tenant" },
  { service: "svc-integrator", role: "interactive" },
];

export interface ServiceBuilds {
  /** Build konsol yang sedang dibuka — acuan pembanding. */
  self: BuildInfo;
  rows: ServiceBuildRow[];
  unseen: { service: string; role: string }[];
}

interface BarisInstans {
  source: string;
  instance: string;
  lastSeen: Date;
}

interface BarisPengklaim {
  claimedBy: string;
  lastSeen: Date;
}

export async function serviceBuildsForOperator(
  deps: { control: ControlClient; now: Date; self: BuildInfo } = {
    control: controlDb,
    now: new Date(),
    self: buildInfo(),
  }
): Promise<ServiceBuilds | null> {
  const { control, now, self } = deps;
  const sejak = new Date(now.getTime() - SERVICE_BUILD_WINDOW_HOURS * 3_600_000);

  const [sampel, pengklaim, penjadwal, kesesuaian] = await Promise.allSettled([
    /* Dikelompokkan per INSTANS (host:pid + stempel): replika yang tertinggal
       harus tetap muncul sebagai barisnya sendiri. */
    control.$queryRaw<BarisInstans[]>`
      SELECT source, instance, MAX(created_at) AS "lastSeen"
        FROM runtime_samples
       WHERE created_at > ${sejak}
       GROUP BY source, instance`,
    /* `claimed_by` bertahan pada baris `done`/`dead` (hanya dikosongkan saat
       dipulangkan ke antrean), jadi pengklaim kemarin masih terbaca. */
    /* Jam `jobs` adalah jam `now()` sesi, bukan UTC (lihat "JAM KOLOM `jobs`"
       di `@sai/platform/job-queue`): jendelanya dihitung server, dan
       `lastSeen` dikonversi ke instan sejati sebelum sampai ke JS. */
    control.$queryRaw<BarisPengklaim[]>`
      SELECT claimed_by AS "claimedBy",
             (MAX(updated_at) AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC' AS "lastSeen"
        FROM jobs
       WHERE claimed_by IS NOT NULL
         AND updated_at > LOCALTIMESTAMP - ${SERVICE_BUILD_WINDOW_HOURS}::int * interval '1 hour'
       GROUP BY claimed_by`,
    control.schedulerRun.findFirst({
      where: { finishedAt: { gt: sejak } },
      orderBy: { id: "desc" },
      select: { finishedAt: true, details: true },
    }),
    control.conformanceRun.findFirst({
      where: { finishedAt: { gt: sejak } },
      orderBy: { id: "desc" },
      select: { finishedAt: true, details: true },
    }),
  ]);

  const semua = [sampel, pengklaim, penjadwal, kesesuaian];
  for (const r of semua) {
    if (r.status === "rejected") {
      console.error("[operator-store] satu sumber versi layanan tak terbaca:", r.reason);
    }
  }
  if (semua.every((r) => r.status === "rejected")) return null;

  const sightings: BuildSighting[] = [];
  if (sampel.status === "fulfilled") {
    for (const b of sampel.value) {
      const appCustomer = b.source === APP_CUSTOMER_SOURCE;
      sightings.push(
        sightingFromIdentity(b.instance, new Date(b.lastSeen), {
          role: appCustomer ? APP_CUSTOMER_ROLE : b.source,
          fallbackService: appCustomer ? APP_CUSTOMER_SOURCE : "svc-worker",
        })
      );
    }
  }
  if (pengklaim.status === "fulfilled") {
    for (const b of pengklaim.value) {
      sightings.push(sightingFromIdentity(b.claimedBy, new Date(b.lastSeen)));
    }
  }
  if (penjadwal.status === "fulfilled" && penjadwal.value) {
    const r = penjadwal.value;
    sightings.push(sightingFromRunDetails(r.details, r.finishedAt, "svc-worker", "scheduler"));
  }
  if (kesesuaian.status === "fulfilled" && kesesuaian.value) {
    const r = kesesuaian.value;
    sightings.push(sightingFromRunDetails(r.details, r.finishedAt, "svc-worker", "conformance"));
  }

  const { rows, unseen } = serviceBuildRows(self, sightings, EXPECTED_SERVICE_ROLES);
  return { self, rows, unseen };
}
