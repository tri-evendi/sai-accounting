/**
 * `efaktur.record` LINTAS BAHASA — muatan yang DITULIS Go = yang DIURAI Node.
 *
 * Fiksturnya dibangkitkan tes Go `TestMockUjungKeUjungLewatAntrean`
 * (`services/integrator/internal/integrationlane`): alur mock lengkap lewat
 * antrean tiruan — kirim, tolak, setujui, batalkan. Di sini setiap muatannya
 * diurai `parseEfakturEvent` dan diterapkan berurutan dengan
 * `applyEfakturEvent`, persis seperti pelari `interactive`
 * (`src/lib/efaktur-record.ts`). Bentuk yang menyimpang di satu sisi membuat
 * salah satu dari dua tes merah, bukan kiriman yang menggantung di produksi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyEfakturEvent,
  parseEfakturEvent,
  type EfakturSubmissionState,
} from "@sai/core/efaktur-submission";

const FIKSTUR = join(
  __dirname,
  "..",
  "services",
  "integrator",
  "internal",
  "integrationlane",
  "testdata",
  "efaktur_record_fixtures.json"
);
const muatan: unknown[] = JSON.parse(readFileSync(FIKSTUR, "utf8"));

describe("muatan efaktur.record dari Go", () => {
  it("fiksturnya ada isinya", () => {
    expect(muatan.length).toBeGreaterThanOrEqual(4);
  });

  it("setiap muatan Go terurai — tidak satu pun ditolak", () => {
    for (const m of muatan) expect(parseEfakturEvent(m), JSON.stringify(m)).not.toBeNull();
  });

  it("diterapkan berurutan, alur mock berakhir: #1 canceled (NSFP tercatat), #2 rejected", () => {
    const kiriman = new Map<number, EfakturSubmissionState & { nsfp?: string; ref?: string }>();
    for (const m of muatan) {
      const ev = parseEfakturEvent(m)!;
      const kini = kiriman.get(ev.submissionId) ?? { status: "queued", statusObservedAt: null, submittedAt: null };
      const patch = applyEfakturEvent(kini, ev);
      expect(patch, `transisi ${kini.status} → ${ev.outcome}`).not.toBeNull();
      kiriman.set(ev.submissionId, {
        status: patch!.status,
        statusObservedAt: patch!.statusObservedAt,
        submittedAt: patch!.submittedAt ?? kini.submittedAt,
        nsfp: patch!.taxInvoiceNumber ?? kini.nsfp,
        ref: patch!.providerRef ?? kini.ref,
      });
      // Pembatalan diminta pengguna di antara persetujuan dan jawaban PJAP.
      if (patch!.status === "approved") kiriman.get(ev.submissionId)!.status = "cancel_requested";
    }
    expect(kiriman.get(1)).toMatchObject({ status: "canceled", nsfp: expect.stringMatching(/^\d{17}$/) });
    expect(kiriman.get(2)!.status).toBe("rejected");
  });
});
