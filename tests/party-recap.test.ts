/**
 * Rekap per pihak (laporan Penjualan per Pelanggan / Pembelian per Pemasok) —
 * matematika pengelompokan murni di `summarizeParties`:
 * - jumlah IDR base per pihak, retur dikurangkan di kolomnya sendiri;
 * - dokumen tanpa kurs DIKECUALIKAN dari jumlah dan DIHITUNG di `unratedCount`
 *   (aturan file header `lib/receivables.ts`), bukan dilipat 1:1;
 * - dokumen tanpa pihak berkumpul di satu ember `partyId: null`.
 */
import { describe, expect, it } from "vitest";
import { summarizeParties } from "@/lib/party-recap";

describe("summarizeParties", () => {
  it("groups by party, nets returns in their own column, sorts by net desc", () => {
    const { rows, totals } = summarizeParties(
      [
        { partyId: 1, partyName: "PT A", grossBase: 100 },
        { partyId: 1, partyName: "PT A", grossBase: 50.5 },
        { partyId: 2, partyName: "PT B", grossBase: 400 },
      ],
      [{ partyId: 1, partyName: "PT A", grossBase: 30 }]
    );

    expect(rows.map((r) => r.partyName)).toEqual(["PT B", "PT A"]);
    const a = rows.find((r) => r.partyId === 1)!;
    expect(a.docCount).toBe(2);
    expect(a.grossBase).toBe(150.5);
    expect(a.returnCount).toBe(1);
    expect(a.returnBase).toBe(30);
    expect(a.netBase).toBe(120.5);

    expect(totals.docCount).toBe(3);
    expect(totals.grossBase).toBe(550.5);
    expect(totals.returnBase).toBe(30);
    expect(totals.netBase).toBe(520.5);
    expect(totals.unratedCount).toBe(0);
  });

  it("excludes unrated documents from sums and counts them instead", () => {
    const { rows, totals } = summarizeParties(
      [
        { partyId: 1, partyName: "PT A", grossBase: 100 },
        { partyId: 1, partyName: "PT A", grossBase: null },
      ],
      [{ partyId: 1, partyName: "PT A", grossBase: null }]
    );

    const a = rows[0];
    expect(a.docCount).toBe(2);
    expect(a.grossBase).toBe(100);
    expect(a.returnCount).toBe(1);
    expect(a.returnBase).toBe(0);
    expect(a.netBase).toBe(100);
    expect(a.unratedCount).toBe(2);
    expect(totals.unratedCount).toBe(2);
  });

  it("buckets legacy documents without a party together and backfills a late name", () => {
    const { rows } = summarizeParties(
      [
        { partyId: null, partyName: null, grossBase: 10 },
        { partyId: null, partyName: null, grossBase: 5 },
        { partyId: 3, partyName: null, grossBase: 7 },
        { partyId: 3, partyName: "PT C", grossBase: 8 },
      ],
      []
    );

    const none = rows.find((r) => r.partyId === null)!;
    expect(none.docCount).toBe(2);
    expect(none.grossBase).toBe(15);
    const c = rows.find((r) => r.partyId === 3)!;
    expect(c.partyName).toBe("PT C");
    expect(c.grossBase).toBe(15);
  });

  it("a return from a party with no documents still produces a row (negative net)", () => {
    const { rows, totals } = summarizeParties(
      [],
      [{ partyId: 9, partyName: "PT R", grossBase: 25 }]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].docCount).toBe(0);
    expect(rows[0].netBase).toBe(-25);
    expect(totals.netBase).toBe(-25);
  });
});
