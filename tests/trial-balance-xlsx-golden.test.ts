/**
 * PARITAS ISI LEMBAR SEBAR NERACA SALDO, TS ⇄ Go — di gerbang yang tak pernah
 * dilewati (`bun run verify`), tanpa toolchain Go.
 *
 * Neraca Saldo `engine: "go"` (`src/lib/report-engine.ts`): berkasnya dihasilkan
 * `services/integrator/internal/document`, bukan `src/lib/xlsx.ts`. Sisi Go
 * menulis berkas EMAS dari fixture bersama (`go test ./internal/document
 * -update`) dan menolak keluarannya sendiri yang menyimpang dari berkas itu;
 * sisi ini membangun lembar TS dari fixture YANG SAMA dan membandingkan ISI-nya
 * dengan berkas emas Go lewat `compareWorkbookContent` — definisi paritas yang
 * juga dipakai `bun run parity:trial-balance-xlsx` atas buku sungguhan.
 *
 * Jadi perubahan kalimat, kolom, format angka, atau rupa di sisi TS yang tidak
 * ikut sampai ke Go (lewat `bun run contract:gen` + `-update`) MERAH di sini.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { asOfPeriodLabel } from "@/lib/statement-layout";
import { resolveAsOf } from "@/lib/report-catalog";
import { compareWorkbookContent } from "@/lib/xlsx-content-parity";
import { formatDate } from "@sai/core/utils";
import { AKAR_REPO } from "./akar-sumber";

const DIR = join(AKAR_REPO, "services", "integrator", "internal", "document", "testdata");

interface Fixture {
  name: string;
  companyName: string;
  asOf: string;
  rows: { code: string; name: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

const FIXTURES = JSON.parse(
  readFileSync(join(DIR, "trial_balance_fixtures.json"), "utf8")
) as Fixture[];

async function lembarTs(f: Fixture): Promise<Uint8Array> {
  /* Payload persis seperti `buildReportPayload` menyusunnya. */
  const { asOf } = resolveAsOf(f.asOf);
  const sheet = buildReportSheet({
    kind: "trial-balance",
    period: asOfPeriodLabel(formatDate(asOf)),
    rows: f.rows.map((r) => ({
      code: r.code,
      name: r.name,
      debit: Number(r.debit),
      credit: Number(r.credit),
    })),
    totalDebit: Number(f.totalDebit),
    totalCredit: Number(f.totalCredit),
    balanced: f.balanced,
  });
  return new Uint8Array(await buildWorkbookBuffer([sheet], { name: f.companyName }));
}

describe("lembar sebar Neraca Saldo: isi TS = isi berkas emas Go", () => {
  it("fixture memuat buku bergerak, buku timpang, dan buku kosong", () => {
    expect(FIXTURES.map((f) => f.name).sort()).toEqual(
      ["buku-bergerak", "buku-kosong", "buku-timpang"].sort()
    );
    expect(FIXTURES.some((f) => f.rows.length === 0)).toBe(true);
    expect(FIXTURES.some((f) => !f.balanced)).toBe(true);
  });

  for (const f of FIXTURES) {
    it(`${f.name}: setara`, async () => {
      const go = new Uint8Array(readFileSync(join(DIR, `${f.name}.golden.xlsx`)));
      const beda = await compareWorkbookContent(await lembarTs(f), go);
      expect(beda, "selisih isi TS ⇄ Go").toEqual([]);
    });
  }

  it("pembanding MELIHAT selisih — bukan selalu hijau", async () => {
    /* Penjaga yang selalu hijau lebih buruk daripada tidak ada penjaga. */
    const f = FIXTURES.find((x) => x.name === "buku-bergerak")!;
    const go = new Uint8Array(readFileSync(join(DIR, `${f.name}.golden.xlsx`)));
    const ubah: Fixture = {
      ...f,
      rows: f.rows.map((r, i) => (i === 0 ? { ...r, debit: "1234567.88" } : r)),
    };
    const beda = await compareWorkbookContent(await lembarTs(ubah), go);
    expect(beda.length).toBeGreaterThan(0);
    expect(beda.join("\n")).toMatch(/C7/);
  });
});
