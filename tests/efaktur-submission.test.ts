/**
 * KIRIMAN e-FAKTUR — transisi status, muatan `efaktur.record`, dan kosakata
 * yang dibaca dua bahasa (`@sai/core/efaktur-submission`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EFAKTUR_OUTCOMES,
  EFAKTUR_PROVIDERS,
  EFAKTUR_SUBMISSION_STATUSES,
  applyEfakturEvent,
  canCancel,
  canSubmitAfter,
  efakturIdempotencyKey,
  parseEfakturEvent,
  type EfakturEvent,
  type EfakturSubmissionState,
} from "@sai/core/efaktur-submission";

const MIGRATION = readFileSync(
  join(__dirname, "..", "prisma", "postgresql", "company", "0004_efaktur_coretax", "migration.sql"),
  "utf8"
);

const T0 = new Date("2026-10-23T03:00:00Z");
const T1 = new Date("2026-10-23T03:05:00Z");

const ev = (over: Partial<EfakturEvent> = {}): EfakturEvent => ({
  submissionId: 7,
  outcome: "submitted",
  providerRef: "REF-1",
  taxInvoiceNumber: null,
  message: null,
  observedAt: T1,
  ...over,
});
const state = (over: Partial<EfakturSubmissionState> = {}): EfakturSubmissionState => ({
  status: "queued",
  statusObservedAt: null,
  submittedAt: null,
  ...over,
});

describe("kosakata: kontrak = CHECK di migration", () => {
  it("status kiriman", () => {
    const m = MIGRATION.match(/"efaktur_submissions_status_check"\s+CHECK \("status" IN \(([^)]+)\)\)/);
    expect(m).not.toBeNull();
    const db = m![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(db).toEqual([...EFAKTUR_SUBMISSION_STATUSES]);
  });

  it("penyedia", () => {
    const m = MIGRATION.match(/"efaktur_provider" IN \(([^)]+)\)/);
    expect(m).not.toBeNull();
    const db = m![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(db).toEqual([...EFAKTUR_PROVIDERS]);
  });

  it("hasil yang dilaporkan Go adalah status yang dikenal kolomnya", () => {
    for (const o of EFAKTUR_OUTCOMES) expect(EFAKTUR_SUBMISSION_STATUSES).toContain(o);
  });
});

describe("kunci idempotensi", () => {
  it("per perusahaan + faktur + revisi, muat di kolom 80", () => {
    expect(efakturIdempotencyKey(3, 41, 1)).toBe("sai-3-inv41-r1");
    expect(efakturIdempotencyKey(3, 41, 2)).not.toBe(efakturIdempotencyKey(3, 41, 1));
    expect(efakturIdempotencyKey(4, 41, 1)).not.toBe(efakturIdempotencyKey(3, 41, 1));
    expect(efakturIdempotencyKey(2_147_483_647, 2_147_483_647, 2_147_483_647).length).toBeLessThanOrEqual(80);
  });
});

describe("boleh kirim / batalkan", () => {
  it("kirim lagi hanya sesudah upaya berakhir tanpa faktur pajak", () => {
    expect(canSubmitAfter(null)).toBe(true);
    for (const s of ["rejected", "failed", "canceled"] as const) expect(canSubmitAfter(s)).toBe(true);
    for (const s of ["queued", "submitted", "approved", "cancel_requested"] as const) {
      expect(canSubmitAfter(s), s).toBe(false);
    }
  });

  it("batalkan hanya yang disetujui", () => {
    expect(canCancel("approved")).toBe(true);
    expect(canCancel("submitted")).toBe(false);
  });
});

describe("muatan efaktur.record", () => {
  it("bentuk yang sah diurai; teks dipangkas", () => {
    expect(
      parseEfakturEvent({
        submissionId: 7,
        outcome: "approved",
        providerRef: " REF ",
        taxInvoiceNumber: "04002500000000001",
        message: "",
        observedAt: T1.toISOString(),
      })
    ).toEqual(ev({ outcome: "approved", providerRef: "REF", taxInvoiceNumber: "04002500000000001" }));
  });

  it("hasil di luar kosakata, id tidak sah, atau instan rusak → null", () => {
    expect(parseEfakturEvent({ submissionId: 7, outcome: "queued", observedAt: T1.toISOString() })).toBeNull();
    expect(parseEfakturEvent({ submissionId: 0, outcome: "approved", observedAt: T1.toISOString() })).toBeNull();
    expect(parseEfakturEvent({ submissionId: 7, outcome: "approved", observedAt: "kemarin" })).toBeNull();
    expect(parseEfakturEvent(null)).toBeNull();
  });
});

describe("transisi", () => {
  it("antre → diterima PJAP → disetujui (NSFP terbit)", () => {
    const a = applyEfakturEvent(state(), ev());
    expect(a).toMatchObject({ status: "submitted", providerRef: "REF-1", submittedAt: T1 });
    const b = applyEfakturEvent(
      state({ status: "submitted", statusObservedAt: T1, submittedAt: T1 }),
      ev({ outcome: "approved", taxInvoiceNumber: "04002500000000001", observedAt: new Date(T1.getTime() + 1) })
    );
    expect(b).toMatchObject({ status: "approved", taxInvoiceNumber: "04002500000000001" });
    expect(b!.submittedAt).toBeUndefined();
    expect(b!.approvedAt).toBeDefined();
  });

  it("kejadian yang lebih TUA tidak menimpa yang lebih baru", () => {
    expect(applyEfakturEvent(state({ status: "submitted", statusObservedAt: T1 }), ev({ observedAt: T0 }))).toBeNull();
  });

  it("disetujui tidak turun kembali oleh `submitted` yang terlambat", () => {
    expect(applyEfakturEvent(state({ status: "approved", statusObservedAt: T0 }), ev())).toBeNull();
  });

  it("pembatalan: berhasil → canceled; ditolak PJAP → tetap approved", () => {
    const s = state({ status: "cancel_requested", statusObservedAt: T0, submittedAt: T0 });
    expect(applyEfakturEvent(s, ev({ outcome: "canceled" }))).toMatchObject({ status: "canceled", canceledAt: T1 });
    const kembali = applyEfakturEvent(s, ev({ outcome: "approved", message: "masa pajak sudah dilaporkan" }));
    expect(kembali).toMatchObject({ status: "approved", statusMessage: "masa pajak sudah dilaporkan" });
    expect(kembali!.approvedAt).toBeUndefined();
  });

  it("status akhir tidak berubah lagi", () => {
    for (const s of ["rejected", "failed", "canceled"] as const) {
      for (const o of EFAKTUR_OUTCOMES) expect(applyEfakturEvent(state({ status: s }), ev({ outcome: o }))).toBeNull();
    }
  });
});
