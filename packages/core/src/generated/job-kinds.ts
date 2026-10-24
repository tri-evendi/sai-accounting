/**
 * DIBANGKITKAN DARI `contract/kinds.yaml` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit hasilnya
 * bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila berkas ini
 * basi, dan penjaga `tests/contract-jobs.test.ts` memanggilnya.
 *
 * Kontrak versi 1.
 */

export type JobStatus =
  | "queued"
  | "claimed"
  | "done"
  | "failed"
  | "dead";

export const JOB_STATUSES: readonly JobStatus[] = [
  "queued",
  "claimed",
  "done",
  "failed",
  "dead",
];

export type JobKind =
  | "company.provision"
  | "document.generate"
  | "document.invoice_send"
  | "efaktur.record"
  | "import.process"
  | "integration.bank_feed"
  | "integration.efaktur_cancel"
  | "integration.efaktur_poll"
  | "integration.efaktur_submit"
  | "ledger.dunning"
  | "ledger.recurring"
  | "mail.batch"
  | "report.export"
  | "report.export_go"
  | "report.package"
  | "report.pdf"
  | "schedule.tick"
  | "schema.migrate"
  | "tenant.backup"
  | "tenant.conformance"
  | "tenant.data_export";

export type JobLane =
  | "bulk"
  | "integration"
  | "interactive"
  | "ledger"
  | "schedule"
  | "schema"
  | "tenant";

export interface JobKindSpec {
  lane: JobLane;
  maxAttempts: number;
  /** `true` HANYA pada jalur `ledger` — invarian I-2, pintu posting tunggal. */
  writesLedger: boolean;
}

export const JOB_KINDS: Readonly<Record<JobKind, JobKindSpec>> = {
  "company.provision": { lane: "interactive", maxAttempts: 1, writesLedger: false },
  "document.generate": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "document.invoice_send": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "efaktur.record": { lane: "interactive", maxAttempts: 5, writesLedger: false },
  "import.process": { lane: "bulk", maxAttempts: 1, writesLedger: false },
  "integration.bank_feed": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "integration.efaktur_cancel": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "integration.efaktur_poll": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "integration.efaktur_submit": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "ledger.dunning": { lane: "ledger", maxAttempts: 3, writesLedger: true },
  "ledger.recurring": { lane: "ledger", maxAttempts: 3, writesLedger: true },
  "mail.batch": { lane: "bulk", maxAttempts: 3, writesLedger: false },
  "report.export": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "report.export_go": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "report.package": { lane: "bulk", maxAttempts: 3, writesLedger: false },
  "report.pdf": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "schedule.tick": { lane: "schedule", maxAttempts: 1, writesLedger: false },
  "schema.migrate": { lane: "schema", maxAttempts: 1, writesLedger: false },
  "tenant.backup": { lane: "tenant", maxAttempts: 2, writesLedger: false },
  "tenant.conformance": { lane: "tenant", maxAttempts: 2, writesLedger: false },
  "tenant.data_export": { lane: "bulk", maxAttempts: 2, writesLedger: false },
};

/**
 * Ambang alarm satu jalur (09 §11). `measured: false` = bawaan
 * `numbers.queue_age_*` karena sampelnya belum cukup (< 200); ambang
 * durasinya kemudian `null` (tidak dinilai), bukan angka karangan.
 */
export interface JobLaneAlarm {
  queueAgeWarnSeconds: number;
  queueAgeLateSeconds: number;
  durationP95WarnMs: number | null;
  measured: boolean;
  /** Pekerjaan yang menopang ambang terukur; 0 untuk bawaan. */
  samples: number;
}

export interface JobLaneSpec {
  /** Lebih dari satu proses jalur ini adalah kesalahan konfigurasi. */
  singleInstance: boolean;
  /** Pagar memori per pekerjaan, MiB heap; 0 = tanpa pagar. */
  memoryFenceMiB: number;
  alarm: JobLaneAlarm;
}

export const JOB_LANES: Readonly<Record<JobLane, JobLaneSpec>> = {
  bulk: {
    singleInstance: false,
    memoryFenceMiB: 512,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
  integration: {
    singleInstance: false,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
  interactive: {
    singleInstance: false,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
  ledger: {
    singleInstance: true,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 120, queueAgeLateSeconds: 300, durationP95WarnMs: 10000, measured: true, samples: 992 },
  },
  schedule: {
    singleInstance: true,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
  schema: {
    singleInstance: true,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
  tenant: {
    singleInstance: true,
    memoryFenceMiB: 0,
    alarm: { queueAgeWarnSeconds: 420, queueAgeLateSeconds: 600, durationP95WarnMs: null, measured: false, samples: 0 },
  },
};

/** `kind` milik setiap jalur — klausa `WHERE kind IN (…)` pekerjanya. */
export const KINDS_BY_LANE: Readonly<Record<JobLane, readonly JobKind[]>> = {
  bulk: ["import.process", "mail.batch", "report.package", "tenant.data_export"],
  integration: ["integration.bank_feed", "integration.efaktur_cancel", "integration.efaktur_poll", "integration.efaktur_submit"],
  interactive: ["company.provision", "document.generate", "document.invoice_send", "efaktur.record", "report.export", "report.export_go", "report.pdf"],
  ledger: ["ledger.dunning", "ledger.recurring"],
  schedule: ["schedule.tick"],
  schema: ["schema.migrate"],
  tenant: ["tenant.backup", "tenant.conformance"],
};

export type ScheduledKind =
  | "ledger.recurring"
  | "tenant.backup";

/** Butir kunci idempotensi denyut — SELALU UTC (`contract/kinds.yaml`). */
export type ScheduleGrain = "hour" | "day";

/** Penerbit kind berjadwal — tepat SATU bahasa. */
export type SchedulePublisher = "node" | "go";

export interface ScheduleSpec {
  grain: ScheduleGrain;
  /** Satu baris per perusahaan aktif (`<kind>:<id>:<butir>`), atau satu untuk seluruh pemasangan. */
  perCompany: boolean;
  publisher: SchedulePublisher;
}

/** Kind yang diterbitkan DENYUT, beserta penerbitnya. Dibaca `@sai/core/schedule-due`. */
export const SCHEDULED_KINDS: Readonly<Record<ScheduledKind, ScheduleSpec>> = {
  "ledger.recurring": { grain: "hour", perCompany: true, publisher: "go" },
  "tenant.backup": { grain: "day", perCompany: false, publisher: "go" },
};

/** Pelaksana kind yang sedang beralih bahasa — tepat SATU. */
export type KindRunner = "node" | "go";

export type RunnerSwitchedKind =
  | "tenant.conformance"
  | "tenant.data_export";

/**
 * Kind ber-`runner:` beserta pelaksananya HARI INI. Sisi yang bukan
 * pelaksana melewati pekerjaannya (keluar 0 / selesai tanpa bekerja).
 */
export const KIND_RUNNERS: Readonly<Record<RunnerSwitchedKind, KindRunner>> = {
  "tenant.conformance": "go",
  "tenant.data_export": "go",
};

export const isJobKind = (v: string): v is JobKind =>
  Object.prototype.hasOwnProperty.call(JOB_KINDS, v);

export const isJobStatus = (v: string): v is JobStatus =>
  (JOB_STATUSES as readonly string[]).includes(v);
