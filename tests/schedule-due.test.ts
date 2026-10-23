/**
 * PARITAS PENERBIT DENYUT — sisi TypeScript dari fikstur BERSAMA.
 *
 * `@sai/core/schedule-due` (Node) dan `internal/schedulelane/due.go` (Go)
 * menghitung butir, kunci idempotensi, dan muatan kind berjadwal. Keduanya
 * dibaca terhadap SATU fikstur
 * (`services/integrator/internal/schedulelane/testdata/schedule_due_fixtures.json`),
 * dan `due_test.go` membaca berkas yang sama. Kunci yang identik sampai ke
 * byte-nya adalah satu-satunya hal yang membuat peralihan penerbit
 * (`contract/kinds.yaml` → `schedule.publisher`) tidak pernah menerbitkan dua
 * kali: penerbit baru menabrak `dedupe_key` milik butir yang sudah diterbitkan
 * penerbit lama.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SCHEDULED_KINDS, type ScheduledKind } from "@sai/core/generated/job-kinds";
import {
  duePublications,
  nodePublishes,
  scheduleBucket,
  scheduledDedupeKey,
} from "@sai/core/schedule-due";
import { AKAR_REPO } from "./akar-sumber";

interface Kasus {
  name: string;
  at: string;
  kind: ScheduledKind;
  companies: number[];
  expected: { kind: string; companyId: number | null; dedupeKey: string; payload: unknown }[];
}

const FIKSTUR = JSON.parse(
  readFileSync(
    join(
      AKAR_REPO,
      "services",
      "integrator",
      "internal",
      "schedulelane",
      "testdata",
      "schedule_due_fixtures.json"
    ),
    "utf8"
  )
) as { cases: Kasus[] };

describe("fikstur bersama: penjaganya memang sedang melihat sesuatu", () => {
  it("memuat kasus, dan setiap kind berjadwal punya kasusnya", () => {
    expect(FIKSTUR.cases.length).toBeGreaterThanOrEqual(5);
    const ada = new Set(FIKSTUR.cases.map((k) => k.kind));
    for (const kind of Object.keys(SCHEDULED_KINDS)) expect(ada, kind).toContain(kind);
  });
});

describe("Node menghitung persis yang fikstur nyatakan", () => {
  for (const k of FIKSTUR.cases) {
    it(k.name, () => {
      const got = duePublications(
        k.kind,
        new Date(k.at),
        k.companies.map((id) => ({ id }))
      );
      expect(got).toEqual(
        k.expected.map((e) => ({
          kind: e.kind,
          companyId: e.companyId,
          dedupeKey: e.dedupeKey,
          payload: e.payload,
        }))
      );
    });
  }
});

describe("aturan penerbitan", () => {
  it("butir dibaca di UTC, tidak di zona proses", () => {
    /* 00:30 WIB 24 Okt = 17:30 UTC 23 Okt. Butir yang ikut WIB akan menyebut
       tanggal 24 — dan pada hari peralihan ke penerbit Go satu butir terbit di
       bawah dua kunci. */
    const at = new Date("2026-10-24T00:30:00+07:00");
    expect(scheduleBucket("day", at)).toBe("2026-10-23");
    expect(scheduleBucket("hour", at)).toBe("2026-10-23T17");
  });

  it("kind per perusahaan tanpa companyId MELEMPAR, bukan menerbitkan kunci tanpa pemilik", () => {
    expect(() => scheduledDedupeKey("ledger.recurring", new Date())).toThrow(/companyId/);
  });

  it("penerbit setiap kind berjadwal TEPAT satu: node atau go", () => {
    for (const [kind, spec] of Object.entries(SCHEDULED_KINDS)) {
      expect(["node", "go"], kind).toContain(spec.publisher);
      expect(nodePublishes(kind as ScheduledKind)).toBe(spec.publisher === "node");
    }
  });
});
