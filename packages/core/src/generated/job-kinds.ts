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
  | "document.generate"
  | "import.process"
  | "integration.bank_feed"
  | "integration.efaktur"
  | "ledger.dunning"
  | "ledger.recurring"
  | "mail.batch"
  | "report.export"
  | "report.package"
  | "schedule.tick"
  | "schema.migrate"
  | "tenant.backup"
  | "tenant.conformance";

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
  "document.generate": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "import.process": { lane: "bulk", maxAttempts: 1, writesLedger: false },
  "integration.bank_feed": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "integration.efaktur": { lane: "integration", maxAttempts: 5, writesLedger: false },
  "ledger.dunning": { lane: "ledger", maxAttempts: 3, writesLedger: true },
  "ledger.recurring": { lane: "ledger", maxAttempts: 3, writesLedger: true },
  "mail.batch": { lane: "bulk", maxAttempts: 3, writesLedger: false },
  "report.export": { lane: "interactive", maxAttempts: 3, writesLedger: false },
  "report.package": { lane: "bulk", maxAttempts: 3, writesLedger: false },
  "schedule.tick": { lane: "schedule", maxAttempts: 1, writesLedger: false },
  "schema.migrate": { lane: "schema", maxAttempts: 1, writesLedger: false },
  "tenant.backup": { lane: "tenant", maxAttempts: 2, writesLedger: false },
  "tenant.conformance": { lane: "tenant", maxAttempts: 2, writesLedger: false },
};

export interface JobLaneSpec {
  /** Lebih dari satu proses jalur ini adalah kesalahan konfigurasi. */
  singleInstance: boolean;
}

export const JOB_LANES: Readonly<Record<JobLane, JobLaneSpec>> = {
  bulk: { singleInstance: false },
  integration: { singleInstance: false },
  interactive: { singleInstance: false },
  ledger: { singleInstance: true },
  schedule: { singleInstance: true },
  schema: { singleInstance: true },
  tenant: { singleInstance: true },
};

/** `kind` milik setiap jalur — klausa `WHERE kind IN (…)` pekerjanya. */
export const KINDS_BY_LANE: Readonly<Record<JobLane, readonly JobKind[]>> = {
  bulk: ["import.process", "mail.batch", "report.package"],
  integration: ["integration.bank_feed", "integration.efaktur"],
  interactive: ["document.generate", "report.export"],
  ledger: ["ledger.dunning", "ledger.recurring"],
  schedule: ["schedule.tick"],
  schema: ["schema.migrate"],
  tenant: ["tenant.backup", "tenant.conformance"],
};

export const isJobKind = (v: string): v is JobKind =>
  Object.prototype.hasOwnProperty.call(JOB_KINDS, v);

export const isJobStatus = (v: string): v is JobStatus =>
  (JOB_STATUSES as readonly string[]).includes(v);
