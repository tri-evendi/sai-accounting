/**
 * Siklus penghapusan akun (issue #142) — sifat yang dikunci:
 *   • eksekusi menuntut permintaan `pending` DAN masa tenggang lewat;
 *   • penghancuran buku menuntut eksekusi yang sudah terjadi DAN retensi
 *     UU KUP (10 tahun) lewat — dua gerbang terpisah;
 *   • retensi dihitung konservatif (yang lebih lambat yang menang);
 *   • anonimisasi menghapus identitas tapi mempertahankan id (jejak audit
 *     tidak boleh menunjuk kekosongan).
 */
import { describe, expect, it } from "vitest";

import {
  DELETION_GRACE_DAYS,
  RETENTION_YEARS,
  anonymizedUserFields,
  executionVerdict,
  graceEndsAtFrom,
  ledgerDropVerdict,
  retentionUntilFrom,
} from "@/lib/tenant-deletion";

const now = new Date("2026-08-01T10:00:00Z");
const past = new Date("2026-07-01T10:00:00Z");
const future = new Date("2026-09-01T10:00:00Z");

describe("masa tenggang", () => {
  it("30 hari dari permintaan", () => {
    expect(DELETION_GRACE_DAYS).toBe(30);
    expect(graceEndsAtFrom(now).getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("eksekusi DITOLAK selama tenggang berjalan; boleh setelah lewat", () => {
    expect(executionVerdict({ status: "pending", graceEndsAt: future }, now)).toBe("grace_active");
    expect(executionVerdict({ status: "pending", graceEndsAt: past }, now)).toBe("executable");
  });

  it("hanya permintaan pending yang bisa dieksekusi — cancelled/executed ditolak", () => {
    for (const status of ["cancelled", "executed", "apapun"]) {
      expect(executionVerdict({ status, graceEndsAt: past }, now)).toBe("not_pending");
    }
  });
});

describe("retensi UU KUP", () => {
  it("10 tahun sejak entri jurnal termuda ATAU sejak eksekusi — yang lebih lambat", () => {
    expect(RETENTION_YEARS).toBe(10);
    // buku berhenti di masa lalu → jangkarnya eksekusi (konservatif)
    expect(retentionUntilFrom(past, now).getUTCFullYear()).toBe(2036);
    expect(retentionUntilFrom(past, now).getTime()).toBe(
      new Date("2036-08-01T10:00:00Z").getTime()
    );
    // ada entri berjangka maju (jarang, tapi sah) → jangkarnya entri itu
    expect(retentionUntilFrom(future, now).getTime()).toBe(
      new Date("2036-09-01T10:00:00Z").getTime()
    );
    // buku kosong / tak terbaca → sekarang + 10 tahun, bukan dilewati
    expect(retentionUntilFrom(null, now).getUTCFullYear()).toBe(2036);
  });

  it("penghancuran buku: menolak sebelum eksekusi, menolak selama retensi, baru boleh sesudahnya", () => {
    expect(
      ledgerDropVerdict({ status: "pending", executedAt: null, retentionUntil: null }, now)
    ).toBe("not_executed");
    expect(
      ledgerDropVerdict({ status: "executed", executedAt: past, retentionUntil: future }, now)
    ).toBe("retention_active");
    expect(
      ledgerDropVerdict({ status: "executed", executedAt: past, retentionUntil: past }, now)
    ).toBe("droppable");
  });

  it("baris executed tanpa retention_until TIDAK bisa dihancurkan — data cacat berarti tidak", () => {
    expect(
      ledgerDropVerdict({ status: "executed", executedAt: past, retentionUntil: null }, now)
    ).toBe("not_executed");
  });
});

describe("anonimisasi (UU PDP)", () => {
  it("identitas hilang, id tetap — dan hasilnya deterministik", () => {
    const fields = anonymizedUserFields(42);
    expect(fields.email).toBe("dihapus-42@anonim.invalid");
    expect(fields.username).toBe("dihapus-42");
    expect(fields.name).toBeNull();
    expect(anonymizedUserFields(42)).toEqual(fields);
  });

  it("email anonim memakai TLD .invalid — tidak pernah bisa menerima surel", () => {
    expect(anonymizedUserFields(1).email.endsWith(".invalid")).toBe(true);
  });
});
