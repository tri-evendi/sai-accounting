/**
 * APA YANG JATUH TEMPO DI SATU DENYUT — sisi TypeScript (09 §3.2, §4).
 *
 * Denyut penerbitan menerbitkan kind ber-`schedule:` di `contract/kinds.yaml`
 * (hari ini `ledger.recurring` per jam per perusahaan, `tenant.backup` per hari
 * untuk seluruh pemasangan). Penerbitnya TEPAT SATU bahasa per kind —
 * `SCHEDULED_KINDS[kind].publisher` — dan modul ini memuat seluruh aturan
 * penerbitan sisi Node: butir, kunci idempotensi, dan muatan.
 *
 * ══ KEMBARANNYA DI GO, DAN APA YANG MENJAGA KEDUANYA TETAP KEMBAR ══════════
 * `services/integrator/internal/schedulelane/due.go` menghitung hal yang sama
 * untuk jalur `schedule` Go. Dua implementasi ini HARUS menghasilkan kunci
 * yang identik sampai ke byte-nya: kunci yang sama itulah yang membuat
 * peralihan penerbit (Node → Go, dan jalan mundurnya) tidak pernah
 * menerbitkan dua kali — penerbit baru menabrak `dedupe_key` milik butir yang
 * sudah diterbitkan penerbit lama. Kunci yang berbeda satu karakter berarti
 * satu butir terbit DUA kali pada hari peralihan: dua cadangan penuh berebut
 * IO, atau dua pekerjaan dokumen berulang untuk satu jam.
 *
 * Yang membuktikannya bukan ulasan kode melainkan fikstur BERSAMA:
 * `services/integrator/internal/schedulelane/testdata/schedule_due_fixtures.json`
 * dibaca `tests/schedule-due.test.ts` DAN `due_test.go`. Kasus baru ditulis
 * sekali, di sana, dan berlaku untuk kedua bahasa.
 *
 * ══ UTC, BUKAN WIB ════════════════════════════════════════════════════════
 * Butirnya dibaca dari `toISOString()` — UTC — sama seperti sejak
 * `recurring:publish` lahir: mesin berulang menghitung batas hari di UTC
 * (`src/lib/recurring.ts`), dan kunci berbutir waktu lokal sementara
 * kejadiannya berbutir UTC menyimpang tepat di batas hari. Menukarnya ke
 * `Asia/Jakarta` sekarang juga MENGGESER setiap butir tujuh jam: pada hari
 * peralihan itu satu butir terbit di bawah dua kunci.
 *
 * MURNI: tanpa Prisma, tanpa IO — dipakai skrip penerbit dan tes.
 */
import { SCHEDULED_KINDS, type ScheduleGrain, type ScheduledKind } from "./generated/job-kinds";

/** Satu baris `jobs` yang akan diterbitkan. Bentuknya bentuk `publishJob`. */
export interface SchedulePublication {
  kind: ScheduledKind;
  companyId: number | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

/** Perusahaan yang DIPILIH penerbit (saringannya di penerbit — lihat skripnya). */
export interface ScheduleCompany {
  id: number;
}

/**
 * Butir kunci idempotensi, di UTC: `YYYY-MM-DDTHH` (jam) atau `YYYY-MM-DD` (hari).
 *
 * Jam, bukan hari, untuk dokumen berulang: kunci berbutir HARI membuat putaran
 * pertama hari itu satu-satunya yang pernah menerbitkan, dan templat yang
 * diaktifkan tengah hari menunggu sampai lewat tengah malam. Hari, bukan jam,
 * untuk cadangan: RPO satu hari, dan butir jam berarti 24 dump penuh sehari.
 */
export function scheduleBucket(grain: ScheduleGrain, at: Date): string {
  const iso = at.toISOString();
  return grain === "hour" ? iso.slice(0, 13) : iso.slice(0, 10);
}

/** `<kind>:<companyId>:<butir>` (per perusahaan) atau `<kind>:<butir>`. */
export function scheduledDedupeKey(kind: ScheduledKind, at: Date, companyId?: number): string {
  const spec = SCHEDULED_KINDS[kind];
  const butir = scheduleBucket(spec.grain, at);
  if (spec.perCompany) {
    if (typeof companyId !== "number") {
      throw new Error(`kind \`${kind}\` diterbitkan per perusahaan — kuncinya wajib memuat companyId`);
    }
    return `${kind}:${companyId}:${butir}`;
  }
  return `${kind}:${butir}`;
}

/**
 * Muatan per kind — bentuk yang dibaca PELAKSANANYA, bukan bentuk bebas.
 *
 *  • `ledger.recurring` → `{ companyId, today }`: `today` adalah instan denyut
 *    (ISO, milidetik). Tanggal diterima pelaksana dari PENERBIT, bukan dibaca
 *    saat bekerja — pekerjaan yang terbit tengah malam lalu dikerjakan sesudah
 *    antrean padat tidak boleh memposting dengan tanggal hari berikutnya
 *    (`workers/ledger.ts`).
 *  • `tenant.backup` → `{ butir }`: TANPA daftar basis data, dengan sengaja —
 *    pencacahan terjadi saat PELAKSANAAN (`internal/backup/daftar.go`).
 */
export function schedulePayload(
  kind: ScheduledKind,
  at: Date,
  companyId?: number
): Record<string, unknown> {
  switch (kind) {
    case "ledger.recurring":
      return { companyId, today: at.toISOString() };
    case "tenant.backup":
      return { butir: scheduleBucket(SCHEDULED_KINDS[kind].grain, at) };
  }
}

/**
 * Setiap baris yang jatuh tempo untuk `kind` pada instan `at`.
 *
 * SATU instan untuk seluruh putaran, bukan satu per perusahaan: dua perusahaan
 * di putaran yang sama harus menilai tanggal yang sama, dan putaran yang
 * melewati tengah malam di tengah daftar akan memberi separuh daftar tanggal
 * berikutnya. Urutan perusahaan dipertahankan apa adanya.
 */
export function duePublications(
  kind: ScheduledKind,
  at: Date,
  companies: readonly ScheduleCompany[]
): SchedulePublication[] {
  if (!SCHEDULED_KINDS[kind].perCompany) {
    return [
      { kind, companyId: null, payload: schedulePayload(kind, at), dedupeKey: scheduledDedupeKey(kind, at) },
    ];
  }
  return companies.map((c) => ({
    kind,
    companyId: c.id,
    payload: schedulePayload(kind, at, c.id),
    dedupeKey: scheduledDedupeKey(kind, at, c.id),
  }));
}

/**
 * Apakah NODE penerbit `kind` ini. Penerbit Node yang menerima `false`
 * MELEWATI langkahnya (keluar 0, dengan satu baris log) — penerbitnya kini
 * jalur `schedule` Go, dan dua penerbit untuk satu kind adalah persis yang
 * kontrak ini ada untuk mencegah.
 */
export function nodePublishes(kind: ScheduledKind): boolean {
  return SCHEDULED_KINDS[kind].publisher === "node";
}

/** Kalimat log yang sama untuk setiap penerbit Node yang melewati langkahnya. */
export function skippedPublisherNote(kind: ScheduledKind): string {
  return (
    `penerbit \`${kind}\` adalah ${SCHEDULED_KINDS[kind].publisher.toUpperCase()} ` +
    "(contract/kinds.yaml → schedule.publisher) — langkah Node ini dilewati. " +
    "Yang menerbitkan: jalur `schedule` di svc-integrator."
  );
}
