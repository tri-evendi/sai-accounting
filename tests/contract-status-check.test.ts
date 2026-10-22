/**
 * CHECK constraint `contracts.status` (migration perusahaan 0003): daftar di
 * SQL wajib SAMA dengan `CONTRACT_STATUSES` (dibangkitkan dari
 * `contract/accounting.yaml`). Constraint yang tertinggal satu nilai menolak
 * tulisan sah dengan galat basis data, bukan galat formulir — dan migration-nya
 * tidak boleh pernah gagal karena DATA di buku yang belum diperiksa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTRACT_STATUSES } from "@sai/core/constants";

const ROOT = join(__dirname, "..");

describe("CHECK constraint contracts.status (migration perusahaan 0003)", () => {
  const sql = readFileSync(
    join(ROOT, "prisma/postgresql/company/0003_contracts_status_check/migration.sql"),
    "utf8"
  ).replace(/--.*$/gm, "");
  const lists = [...sql.matchAll(/"status"\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/g)].map((m) =>
    [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
  );

  it("setiap daftar di SQL = CONTRACT_STATUSES (dibangkitkan dari contract/accounting.yaml)", () => {
    expect(lists.length).toBeGreaterThanOrEqual(2);
    for (const l of lists) expect(l).toEqual([...CONTRACT_STATUSES]);
  });

  it("dipasang NOT VALID lalu di-VALIDATE hanya bila bersih — migration tidak pernah gagal karena data", () => {
    expect(sql).toMatch(/ADD CONSTRAINT "contracts_status_check"[\s\S]*NOT VALID;/);
    expect(sql).toMatch(/IF liar = 0 THEN\s+ALTER TABLE "contracts" VALIDATE CONSTRAINT "contracts_status_check"/);
    expect(sql).toMatch(/RAISE WARNING/);
    expect(sql).not.toMatch(/RAISE EXCEPTION/);
  });
});
