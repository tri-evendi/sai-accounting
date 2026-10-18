import { describe, expect, it } from "vitest";

import { attributeConformance, tenantHealthSignals, BOOK_IDLE_DAYS } from "@op/lib/operator/tenant-health";

const NOW = new Date("2026-10-17T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const base = {
  usage: { companies: 1, users: 1 },
  quota: { maxCompanies: 3, maxUsers: 10 },
  books: [],
  conformance: null,
};

describe("sinyal kesehatan tenant", () => {
  it("sehat = tanpa sinyal", () => {
    expect(tenantHealthSignals(base, NOW)).toEqual([]);
  });

  it("kuota: lewat = tindakan; ≥80% = catatan", () => {
    const keys = tenantHealthSignals(
      { ...base, usage: { companies: 4, users: 8 }, quota: { maxCompanies: 3, maxUsers: 10 } },
      NOW
    ).map((s) => [s.key, s.tone]);
    expect(keys).toEqual([
      ["quotaCompaniesOver", "danger"],
      ["quotaUsersNear", "info"],
    ]);
  });

  it("buku diam ≥30 hari, tanpa jurnal, dan tak terbaca dibedakan", () => {
    const s = tenantHealthSignals(
      {
        ...base,
        books: [
          { slug: "a", latestJournal: new Date(NOW.getTime() - BOOK_IDLE_DAYS * DAY) },
          { slug: "b", latestJournal: new Date(NOW.getTime() - 2 * DAY) },
          { slug: "c", latestJournal: null },
          { slug: "d", latestJournal: "unreadable" },
        ],
      },
      NOW
    );
    expect(s.map((x) => [x.key, x.params.book])).toEqual([
      ["bookUnreadable", "d"],
      ["bookIdle", "a"],
      ["bookNeverUsed", "c"],
    ]);
  });
});

describe("atribusi temuan kesesuaian", () => {
  it("slug PT yang juga dipakai tenant lain TIDAK dihitung sebagai milik tenant ini", () => {
    const r = attributeConformance(
      ["pusat · Faktur kelebihan bayar: INV-1", "pusat · Jurnal timpang: J-2", "cabang · X: Y", "orang-lain · Z: W"],
      ["pusat", "cabang"],
      new Set(["cabang"])
    );
    expect(r).toEqual({ findings: 2, ambiguousSlugs: ["cabang"] });
  });
});
